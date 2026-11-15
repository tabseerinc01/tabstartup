import 'server-only';

import type { EventRecord, EventOrder } from '@/lib/event-types';

import {
  buildExpiredRegistrationEmailJobs,
} from '@/services/email/event-email-scheduling.service';

import {
  queueEventEmailsSafely,
} from '@/services/email/event-email-outbox.service';

import {
  Timestamp,
} from 'firebase-admin/firestore';

import {
  getFirebaseAdmin,
} from '@/firebase/admin';

import {
  PAYMENT_COLLECTIONS,
} from '@/lib/payment-types';

import {
  EVENT_COLLECTIONS,
  type EventAuditLog,
} from '@/lib/event-types';

import {
  BkashAdminReviewError,
  isValidReviewDocumentId,
} from '@/services/payments/bkash-admin-review.service';

import {
  readPendingBkashReviewTransaction,
} from '@/services/payments/bkash-review-transaction.service';

import {
  prepareEventInventoryRelease,
  applyEventInventoryRelease,
} from '@/services/event-inventory-release.service';

export type BkashReviewExpiryResult = {
  submissionId: string;

  status:
    | 'expired'
    | 'not_due'
    | 'not_pending'
    | 'missing'
    | 'deadline_missing';

  inventoryReleased: boolean;
};

/**
 * Internal system operation.
 *
 * No public or customer-facing access.
 *
 * Caller must be an authorized
 * maintenance worker.
 *
 * Financial evidence and transaction
 * claims are preserved.
 */
export async function expireBkashPaymentReview(
  submissionId: string
): Promise<BkashReviewExpiryResult> {
  if (
    !isValidReviewDocumentId(
      submissionId
    )
  ) {
    throw new BkashAdminReviewError(
      'INVALID_PAYMENT_SUBMISSION'
    );
  }

  const { adminDb } =
    getFirebaseAdmin();

  const submissionRef = adminDb
    .collection(
      PAYMENT_COLLECTIONS.manualSubmissions
    )
    .doc(submissionId);

  return adminDb.runTransaction(
    async tx => {
      const submissionSnap =
        await tx.get(submissionRef);

      if (!submissionSnap.exists) {
        return {
          submissionId,

          status: 'missing',

          inventoryReleased: false,
        };
      }

      if (
        submissionSnap.data()?.status !==
          'pending_verification'
      ) {
        return {
          submissionId,

          status: 'not_pending',

          inventoryReleased: false,
        };
      }

      const review =
        await readPendingBkashReviewTransaction(
          tx,
          adminDb,
          submissionId
        );

      const now = Timestamp.now();

      if (
        review.reviewDeadlineAtMs === null
      ) {
        return {
          submissionId,

          status: 'deadline_missing',

          inventoryReleased: false,
        };
      }

      if (
        review.reviewDeadlineAtMs >
          now.toMillis()
      ) {
        return {
          submissionId,

          status: 'not_due',

          inventoryReleased: false,
        };
      }

      const releasePlan =
        await prepareEventInventoryRelease(
          tx,
          adminDb,
          {
            reservationId:
              review.reservation.reservationId,

            eventId:
              review.event.eventId,

            orderId:
              review.order.orderId,

            ticketTypeId:
              review.item.ticketTypeId,

            quantity:
              review.item.quantity,

            expectedStatus:
              'pending_verification',

            releaseStatus: 'expired',

            reason:
              'payment_review_expired',

            actor: {
              actorType: 'system',

              actorUid: null,
            },

            now,
          }
        );

      const auditRef = adminDb
        .collection(
          EVENT_COLLECTIONS.auditLogs
        )
        .doc();

      const audit: EventAuditLog = {
        auditId: auditRef.id,

        eventId:
          review.event.eventId,

        action: 'inventory_released',

        actorType: 'system',

        actorUid: null,

        resourceType: 'payment',

        resourceId:
          review.payment.paymentId,

        reason:
          'bkash_review_deadline_elapsed',

        createdAt: now,
      };

      // All reads are complete.
      //
      // Do not delete the transaction claim.
      // Do not mark the payment refunded.
      // Do not issue tickets.

      queueEventEmailsSafely(
        tx,
        adminDb,
        {
          eventId: review.event.eventId,
          orderId: review.order.orderId,
          trigger: 'payment_expiry',
        },
        () => buildExpiredRegistrationEmailJobs({
          event: review.event,
          order: {
            ...(review.order as EventOrder),
            status: 'requires_review',
            updatedAt: now,
          },
          now,
        })
      );

      tx.update(
        review.refs.submission,
        {
          status: 'requires_review',
        }
      );

      tx.update(
        review.refs.payment,
        {
          status: 'requires_review',

          updatedAt: now,
        }
      );

      tx.update(
        review.refs.paymentOrder,
        {
          status: 'requires_review',

          updatedAt: now,
        }
      );

      tx.update(
        review.refs.order,
        {
          status: 'requires_review',

          updatedAt: now,
        }
      );

      for (
        const ref of
        review.refs.registrations
      ) {
        tx.update(ref, {
          status: 'requires_review',

          updatedAt: now,
        });
      }

      applyEventInventoryRelease(
        tx,
        releasePlan
      );

      tx.create(
        auditRef,
        audit
      );

      return {
        submissionId,

        status: 'expired',

        inventoryReleased: true,
      };
    }
  );
}
