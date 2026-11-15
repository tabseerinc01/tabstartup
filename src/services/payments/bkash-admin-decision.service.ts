import 'server-only';

import {
  Timestamp,
} from 'firebase-admin/firestore';

import {
  getFirebaseAdmin,
} from '@/firebase/admin';

import {
  EVENT_COLLECTIONS,
  EVENT_SCHEMA_VERSION,
  PLATFORM_EVENT_ORGANIZER_ID,
  type EventTicketType,
  type EventTicketInventory,
  type EventAuditLog,
} from '@/lib/event-types';

import {
  PAYMENT_COLLECTIONS,
  PAYMENT_SCHEMA_VERSION,
} from '@/lib/payment-types';

import {
  canTransitionPaymentStatus,
  canTransitionPaymentOrderStatus,
} from '@/lib/payment-lifecycle';

import {
  isValidInventoryCounters,
} from '@/lib/event-validation';

import {
  buildPublicTicketProjection,
} from '@/lib/event-public-projection';

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

import {
  readPendingBkashReviewTransaction,
} from '@/services/payments/bkash-review-transaction.service';

import {
  prepareEventInventoryRelease,
  applyEventInventoryRelease,
} from '@/services/event-inventory-release.service';

export type BkashAdminDecisionInput =
  | {
      decision: 'approve';

      confirmedFundsReceived: true;

      verifiedAmountMinor: number;

      verifiedTransactionId: string;

      verifiedSenderNumber: string;

      verifiedReceivingNumber: string;

      reason: string;
    }
  | {
      decision: 'reject';

      confirmedNoFundsReceived: true;

      reason: string;
    };

export type BkashAdminDecisionResult = {
  submissionId: string;

  paymentId: string;

  paymentOrderId: string;

  eventOrderId: string;

  status: 'approved' | 'rejected';

  reviewedAtMs: number;
};

interface BkashDecisionAuditRecord {
  auditId: string;

  action:
    | 'bkash_payment_approved'
    | 'bkash_payment_rejected';

  provider: 'bkash_manual';

  currency: 'BDT';

  paymentId: string;

  paymentOrderId: string;

  productOrderId: string;

  resourceId: string;

  submissionId: string;

  transactionClaimId: string;

  amountMinor: number;

  verificationEvidence:
    | {
        decision: 'approve';
        confirmedFundsReceived: true;
        verifiedAmountMinor: number;
        verifiedTransactionId: string;
        verifiedSenderNumber: string;
        verifiedReceivingNumber: string;
      }
    | {
        decision: 'reject';
        confirmedNoFundsReceived: true;
      };

  previousStatus: 'pending_verification';

  nextStatus: 'succeeded' | 'rejected';

  actorType: 'admin';

  actorUid: string;

  reason: string;

  schemaVersion:
    typeof PAYMENT_SCHEMA_VERSION;

  createdAt: Timestamp;
}

function invalid(): never {
  throw new BkashAdminReviewError(
    'INVALID_PAYMENT_SUBMISSION'
  );
}

function conflict(): never {
  throw new BkashAdminReviewError(
    'PAYMENT_REVIEW_CONFLICT'
  );
}

function parseInput(
  value: unknown
): BkashAdminDecisionInput {
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value)
  ) {
    return invalid();
  }

  const input =
    value as Record<string, unknown>;

  if (
    typeof input.reason !== 'string' ||
    input.reason.trim().length < 3 ||
    input.reason.length > 500 ||
    /[\u0000-\u001f\u007f]/.test(
      input.reason
    )
  ) {
    return invalid();
  }

  const reason =
    input.reason.trim();

  if (input.decision === 'reject') {
    if (
      Object.keys(input).length !== 3 ||
      input.confirmedNoFundsReceived !== true
    ) {
      return invalid();
    }

    return {
      decision: 'reject',
      confirmedNoFundsReceived: true,
      reason,
    };
  }

  if (
    input.decision !== 'approve' ||
    Object.keys(input).length !== 7 ||
    input.confirmedFundsReceived !== true ||
    typeof input.verifiedAmountMinor !==
      'number' ||
    !Number.isSafeInteger(
      input.verifiedAmountMinor
    ) ||
    input.verifiedAmountMinor <= 0 ||
    typeof input.verifiedTransactionId !==
      'string' ||
    !/^[A-Z0-9]{6,32}$/.test(
      input.verifiedTransactionId
    ) ||
    typeof input.verifiedSenderNumber !==
      'string' ||
    !/^01[3-9][0-9]{8}$/.test(
      input.verifiedSenderNumber
    ) ||
    typeof input.verifiedReceivingNumber !==
      'string' ||
    !/^01[3-9][0-9]{8}$/.test(
      input.verifiedReceivingNumber
    )
  ) {
    return invalid();
  }

  return {
    decision: 'approve',

    confirmedFundsReceived: true,

    verifiedAmountMinor:
      input.verifiedAmountMinor,

    verifiedTransactionId:
      input.verifiedTransactionId,

    verifiedSenderNumber:
      input.verifiedSenderNumber,

    verifiedReceivingNumber:
      input.verifiedReceivingNumber,

    reason,
  };
}

/**
 * Admin-only manual payment decision.
 *
 * All financial and inventory mutations
 * occur in one Firestore transaction.
 *
 * Never approves released reservations.
 * Never creates refunds or tickets.
 */
export async function decideAdminBkashPayment(
  idToken: string,
  submissionId: string,
  rawInput: unknown
): Promise<BkashAdminDecisionResult> {
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

  const input =
    parseInput(rawInput);

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
        await readPendingBkashReviewTransaction(
          tx,
          adminDb,
          submissionId
        );

      const {
        summary,
        payment,
        paymentOrder,
        order,
        event,
        item,
        reservation,
        inventory,
        refs,
      } = review;

      const approving =
        input.decision === 'approve';

      const paymentStatus =
        approving
          ? 'succeeded' as const
          : 'rejected' as const;

      const orderStatus =
        approving
          ? 'paid' as const
          : 'cancelled' as const;

      if (
        !canTransitionPaymentStatus(
          payment,
          paymentStatus,
          'admin'
        ) ||
        !canTransitionPaymentOrderStatus(
          paymentOrder.status,
          orderStatus
        ) ||
        !canTransitionPaymentOrderStatus(
          order.status,
          orderStatus
        )
      ) {
        return conflict();
      }

      const now =
        Timestamp.now();

      const nowMs =
        now.toMillis();

      const actorUid =
        context.uid;

      if (approving) {
        if (
          review.approvalBlockers.length > 0 ||
          review.reviewDeadlineAtMs === null ||
          review.reviewDeadlineAtMs <= nowMs ||
          event.endsAt.toMillis() <= nowMs ||
          input.verifiedAmountMinor !==
            payment.amountMinor ||
          input.verifiedTransactionId !==
            summary.transactionId ||
          input.verifiedSenderNumber !==
            summary.senderNumber ||
          input.verifiedReceivingNumber !==
            summary.receivingNumber
        ) {
          return conflict();
        }

        const ticketRef = adminDb
          .collection(
            EVENT_COLLECTIONS.ticketTypes
          )
          .doc(item.ticketTypeId);

        const publicTicketRef = adminDb
          .collection(
            EVENT_COLLECTIONS.publicTicketTypes
          )
          .doc(item.ticketTypeId);

        const publicEventRef = adminDb
          .collection(
            EVENT_COLLECTIONS.publicEvents
          )
          .doc(order.eventId);

        const [
          ticketSnap,
          publicTicketSnap,
          publicEventSnap,
        ] = await tx.getAll(
          ticketRef,
          publicTicketRef,
          publicEventRef
        );

        if (!ticketSnap.exists) {
          return invalid();
        }

        const ticket =
          ticketSnap.data() as
            EventTicketType;

        if (
          ticket.schemaVersion !==
            EVENT_SCHEMA_VERSION ||
          ticket.ticketTypeId !==
            item.ticketTypeId ||
          ticket.eventId !==
            order.eventId ||
          ticket.attendanceMode !==
            item.attendanceMode ||
          event.organizerType !==
            'platform' ||
          event.organizerId !==
            PLATFORM_EVENT_ORGANIZER_ID ||
          reservation.status !==
            'pending_verification' ||
          reservation.consumedAt !== null ||
          reservation.releasedAt !== null ||
          !isValidInventoryCounters(
            inventory
          ) ||
          inventory.reservedQuantity <
            item.quantity
        ) {
          return conflict();
        }

        if (
          publicTicketSnap.exists &&
          (
            publicTicketSnap.data()?.eventId !==
              order.eventId ||
            publicTicketSnap.data()?.ticketTypeId !==
              item.ticketTypeId
          )
        ) {
          return invalid();
        }

        if (
          publicEventSnap.exists &&
          publicEventSnap.data()?.eventId !==
            order.eventId
        ) {
          return invalid();
        }

        const nextInventory:
          EventTicketInventory = {
            eventId: inventory.eventId,

            ticketTypeId:
              inventory.ticketTypeId,

            capacity:
              inventory.capacity,

            reservedQuantity:
              inventory.reservedQuantity -
              item.quantity,

            issuedQuantity:
              inventory.issuedQuantity +
              item.quantity,

            updatedAt: now,
          };

        if (
          !isValidInventoryCounters(
            nextInventory
          )
        ) {
          return conflict();
        }

        const nextProjection =
          buildPublicTicketProjection(
            event,
            ticket,
            nextInventory,
            nowMs
          );

        // Recheck the review deadline after
        // all approval-specific reads.
        const finalNowMs = Date.now();

        if (
          review.reviewDeadlineAtMs <=
            finalNowMs ||
          event.endsAt.toMillis() <=
            finalNowMs
        ) {
          return conflict();
        }

        // Approval reads complete.

        tx.set(
          refs.inventory,
          nextInventory
        );

        if (
          nextProjection !== null &&
          publicTicketSnap.exists &&
          publicEventSnap.exists
        ) {
          tx.set(
            publicTicketRef,
            nextProjection
          );
        } else if (
          publicTicketSnap.exists &&
          (
            nextProjection === null ||
            !publicEventSnap.exists
          )
        ) {
          tx.delete(publicTicketRef);
        }

        tx.update(refs.reservation, {
          status: 'consumed',

          consumedAt: now,

          updatedAt: now,
        });

        tx.update(refs.payment, {
          status: 'succeeded',

          providerPaymentId:
            summary.transactionId,

          verifiedByUid: actorUid,

          verifiedAt: now,

          updatedAt: now,
        });

        tx.update(refs.paymentOrder, {
          status: 'paid',

          successfulPaymentId:
            payment.paymentId,

          paidAt: now,

          updatedAt: now,
        });

        tx.update(refs.order, {
          status: 'paid',

          successfulPaymentId:
            payment.paymentId,

          paidAt: now,

          updatedAt: now,
        });

        for (
          const ref of refs.registrations
        ) {
          tx.update(ref, {
            status: 'confirmed',

            confirmedAt: now,

            updatedAt: now,
          });
        }
      } else {
        const releasePlan =
          await prepareEventInventoryRelease(
            tx,
            adminDb,
            {
              reservationId:
                reservation.reservationId,

              eventId: order.eventId,

              orderId: order.orderId,

              ticketTypeId:
                item.ticketTypeId,

              quantity: item.quantity,

              expectedStatus:
                'pending_verification',

              releaseStatus: 'released',

              reason: 'payment_rejected',

              actor: {
                actorType: 'admin',

                actorUid,
              },

              now,
            }
          );

        // Rejection reads complete.

        applyEventInventoryRelease(
          tx,
          releasePlan
        );

        tx.update(refs.payment, {
          status: 'rejected',

          updatedAt: now,
        });

        tx.update(refs.paymentOrder, {
          status: 'cancelled',

          updatedAt: now,
        });

        tx.update(refs.order, {
          status: 'cancelled',

          updatedAt: now,
        });

        for (
          const ref of refs.registrations
        ) {
          tx.update(ref, {
            status: 'cancelled',

            updatedAt: now,
          });
        }
      }

      const submissionStatus =
        approving
          ? 'approved' as const
          : 'rejected' as const;

      tx.update(refs.submission, {
        status: submissionStatus,

        reviewedByUid: actorUid,

        reviewedAt: now,

        reviewReason: input.reason,
      });

      const paymentAuditRef = adminDb
        .collection(
          PAYMENT_COLLECTIONS.auditLogs
        )
        .doc();

      const paymentAudit:
        BkashDecisionAuditRecord = {
          auditId: paymentAuditRef.id,

          action: approving
            ? 'bkash_payment_approved'
            : 'bkash_payment_rejected',

          provider: 'bkash_manual',

          currency: 'BDT',

          paymentId: payment.paymentId,

          paymentOrderId:
            paymentOrder.orderId,

          productOrderId: order.orderId,

          resourceId: order.eventId,

          submissionId,

          transactionClaimId:
            review.claim.claimId,

          verificationEvidence:
            input.decision === 'approve'
              ? {
                  decision: 'approve',
                  confirmedFundsReceived:
                    input.confirmedFundsReceived,
                  verifiedAmountMinor:
                    input.verifiedAmountMinor,
                  verifiedTransactionId:
                    input.verifiedTransactionId,
                  verifiedSenderNumber:
                    input.verifiedSenderNumber,
                  verifiedReceivingNumber:
                    input.verifiedReceivingNumber,
                }
              : {
                  decision: 'reject',
                  confirmedNoFundsReceived:
                    input.confirmedNoFundsReceived,
                },

          amountMinor:
            payment.amountMinor,

          previousStatus:
            'pending_verification',

          nextStatus: paymentStatus,

          actorType: 'admin',

          actorUid,

          reason: input.reason,

          schemaVersion:
            PAYMENT_SCHEMA_VERSION,

          createdAt: now,
        };

      tx.create(
        paymentAuditRef,
        paymentAudit
      );

      const eventAuditRef = adminDb
        .collection(
          EVENT_COLLECTIONS.auditLogs
        )
        .doc();

      const eventAudit: EventAuditLog = {
        auditId: eventAuditRef.id,

        eventId: order.eventId,

        action: approving
          ? 'payment_verified'
          : 'payment_rejected',

        actorType: 'admin',

        actorUid,

        resourceType: 'payment',

        resourceId: payment.paymentId,

        reason: input.reason,

        createdAt: now,
      };

      tx.create(
        eventAuditRef,
        eventAudit
      );

      return {
        submissionId,

        paymentId: payment.paymentId,

        paymentOrderId:
          paymentOrder.orderId,

        eventOrderId: order.orderId,

        status: submissionStatus,

        reviewedAtMs: nowMs,
      };
    }
  );
}
