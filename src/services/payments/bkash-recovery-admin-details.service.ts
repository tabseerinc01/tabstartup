import 'server-only';

import {
  getFirebaseAdmin,
} from '@/firebase/admin';

import {
  requireEventAdmin,
} from '@/services/event-authorization.service';

import {
  assertCurrentEventAdmin,
} from '@/services/event-management.service';

import {
  BkashAdminReviewError,
  isValidReviewDocumentId,
} from '@/services/payments/bkash-admin-review.service';

import type {
  BkashRecoveryPaymentSummary,
} from '@/services/payments/bkash-recovery-projection.service';

import {
  readRecoveryBkashReviewTransaction,
} from '@/services/payments/bkash-recovery-review-transaction.service';

export interface BkashAdminRecoveryDetails
  extends BkashRecoveryPaymentSummary {
  eventId: string;

  eventTitle: string;

  eventStatus: string;

  eventOrderId: string;

  purchaserEmail: string;

  ticketTypeId: string;

  ticketName: string;

  attendanceMode: 'online' | 'offline';

  quantity: number;

  unitAmountMinor: number;

  participants: Array<{
    registrationId: string;
    fullName: string;
    email: string;
  }>;

  paymentWindowExpiresAtMs: number;

  reviewDeadlineAtMs: number | null;

  recoveryType:
    | 'late_submission'
    | 'review_timeout';

  releasedAtMs: number;

  availableQuantity: number;

  approvalBlockers: string[];

  canApprove: boolean;
}

function invalid(): never {
  throw new BkashAdminReviewError(
    'INVALID_PAYMENT_SUBMISSION'
  );
}

function requiredText(
  value: unknown,
  maxLength: number
): string {
  if (
    typeof value !== 'string' ||
    value.trim().length === 0 ||
    value.length > maxLength ||
    /[\u0000-\u001f\u007f]/.test(value)
  ) {
    return invalid();
  }

  return value;
}

/**
 * Administrative details for one recovery
 * bKash payment submission.
 *
 * Explicit projection only.
 * No raw financial documents are returned.
 * No payment or inventory mutation.
 */
export async function getAdminBkashRecoveryDetails(
  idToken: string,
  submissionId: string
): Promise<BkashAdminRecoveryDetails> {
  const context =
    await requireEventAdmin(
      idToken,
      'event:manage_payments'
    );

  if (
    !isValidReviewDocumentId(
      submissionId
    )
  ) {
    return invalid();
  }

  const { adminDb } =
    getFirebaseAdmin();

  return adminDb.runTransaction(
    async tx => {
      await assertCurrentEventAdmin(
        tx,
        context,
        idToken
      );

      const review =
        await readRecoveryBkashReviewTransaction(
          tx,
          adminDb,
          submissionId
        );

      const {
        summary,
        event,
        order,
        item,
        registrations,
        expiresAtMs,
        reviewDeadlineAtMs,
        recoveryType,
        releasedAtMs,
        availableQuantity,
        approvalBlockers,
      } = review;

      return {
        ...summary,

        eventId: event.eventId,

        eventTitle: requiredText(
          event.title,
          160
        ),

        eventStatus: event.status,

        eventOrderId: order.orderId,

        purchaserEmail: requiredText(
          order.purchaserEmail,
          254
        ),

        ticketTypeId: item.ticketTypeId,

        ticketName: requiredText(
          item.ticketName,
          120
        ),

        attendanceMode:
          item.attendanceMode,

        quantity: item.quantity,

        unitAmountMinor:
          item.unitAmountMinor,

        participants: registrations.map(
          registration => ({
            registrationId:
              registration.registrationId,

            fullName: requiredText(
              registration.participant?.fullName,
              150
            ),

            email: requiredText(
              registration.participant?.email,
              254
            ),
          })
        ),

        paymentWindowExpiresAtMs:
          expiresAtMs,

        reviewDeadlineAtMs,

        recoveryType,

        releasedAtMs,

        availableQuantity,

        approvalBlockers,

        canApprove:
          approvalBlockers.length === 0,
      };
    },
    {
      readOnly: true,
    }
  );
}
