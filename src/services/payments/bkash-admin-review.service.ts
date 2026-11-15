import 'server-only';

import {
  Timestamp,
} from 'firebase-admin/firestore';

import {
  getFirebaseAdmin,
} from '@/firebase/admin';

import {
  PAYMENT_COLLECTIONS,
  type ManualPaymentSubmission,
} from '@/lib/payment-types';

import {
  normalizeBkashSenderNumber,
} from '@/lib/payment-lifecycle';

import {
  requireEventAdmin,
} from '@/services/event-authorization.service';

import {
  assertCurrentEventAdmin,
} from '@/services/event-management.service';

import {
  validateBkashAccountSnapshot,
} from '@/services/payments/bkash-manual-provider.service';

export const BKASH_PENDING_LIST_LIMIT = 100;

export type BkashAdminReviewErrorCode =
  | 'INVALID_PAYMENT_SUBMISSION'
  | 'PAYMENT_SUBMISSION_NOT_FOUND'
  | 'PAYMENT_REVIEW_CONFLICT';

export class BkashAdminReviewError extends Error {
  constructor(
    public readonly code: BkashAdminReviewErrorCode
  ) {
    super(code);

    this.name = 'BkashAdminReviewError';
  }
}

export interface BkashPendingPaymentSummary {
  submissionId: string;

  paymentId: string;

  paymentOrderId: string;

  provider: 'bkash_manual';

  currency: 'BDT';

  status: 'pending_verification';

  senderNumber: string;

  transactionId: string;

  amountMinor: number;

  receivingNumber: string;

  accountType: 'personal' | 'merchant';

  paymentMethod: 'send_money' | 'payment';

  configVersion: number;

  submittedAtMs: number;
}

export interface BkashPendingPaymentList {
  items: BkashPendingPaymentSummary[];

  limit: number;

  hasMore: boolean;
}

export function isValidReviewDocumentId(
  value: unknown
): value is string {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    value.length <= 128 &&
    value === value.trim() &&
    value !== '.' &&
    value !== '..' &&
    !/^__.*__$/.test(value) &&
    !/[/\u0000-\u001f\u007f]/.test(value)
  );
}

function invalid(): never {
  throw new BkashAdminReviewError(
    'INVALID_PAYMENT_SUBMISSION'
  );
}

/**
 * Validate and project a pending submission.
 *
 * This is a read-only administrative view.
 * It is not proof of received payment.
 */
export function projectPendingBkashSubmission(
  documentId: string,
  value: unknown
): BkashPendingPaymentSummary {
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value)
  ) {
    return invalid();
  }

  const submission =
    value as ManualPaymentSubmission;

  if (
    !isValidReviewDocumentId(documentId) ||
    submission.submissionId !== documentId ||
    submission.paymentId !== documentId ||
    !isValidReviewDocumentId(
      submission.orderId
    ) ||
    submission.provider !== 'bkash_manual' ||
    submission.currency !== 'BDT' ||
    submission.status !== 'pending_verification' ||
    typeof submission.senderNumber !== 'string' ||
    normalizeBkashSenderNumber(
      submission.senderNumber
    ) !== submission.senderNumber ||
    typeof submission.transactionId !== 'string' ||
    !/^[A-Z0-9]{6,32}$/.test(
      submission.transactionId
    ) ||
    typeof submission.transactionClaimId !== 'string' ||
    !/^[a-f0-9]{64}$/.test(
      submission.transactionClaimId
    ) ||
    !Number.isSafeInteger(
      submission.claimedAmountMinor
    ) ||
    submission.claimedAmountMinor <= 0 ||
    !(submission.submittedAt instanceof Timestamp) ||
    submission.submittedAt.toMillis() <= 0 ||
    submission.reviewedByUid !== null ||
    submission.reviewedAt !== null ||
    submission.reviewReason !== null
  ) {
    return invalid();
  }

  const snapshot =
    validateBkashAccountSnapshot(
      submission.bkashAccountSnapshot
    );

  if (
    snapshot.capturedAt.toMillis() >
      submission.submittedAt.toMillis()
  ) {
    return invalid();
  }

  return {
    submissionId:
      submission.submissionId,

    paymentId:
      submission.paymentId,

    paymentOrderId:
      submission.orderId,

    provider: 'bkash_manual',

    currency: 'BDT',

    status: 'pending_verification',

    senderNumber:
      submission.senderNumber,

    transactionId:
      submission.transactionId,

    amountMinor:
      submission.claimedAmountMinor,

    receivingNumber:
      snapshot.receivingNumber,

    accountType:
      snapshot.accountType,

    paymentMethod:
      snapshot.paymentMethod,

    configVersion:
      snapshot.configVersion,

    submittedAtMs:
      submission.submittedAt.toMillis(),
  };
}

/**
 * List pending manual bKash submissions.
 *
 * No payment or inventory mutation.
 * No dependency on payment creation flags.
 */
export async function listAdminPendingBkashPayments(
  idToken: string
): Promise<BkashPendingPaymentList> {
  const context =
    await requireEventAdmin(
      idToken,
      'event:manage_payments'
    );

  const { adminDb } =
    getFirebaseAdmin();

  const query = adminDb
    .collection(
      PAYMENT_COLLECTIONS.manualSubmissions
    )
    .where(
      'status',
      '==',
      'pending_verification'
    )
    .limit(
      BKASH_PENDING_LIST_LIMIT + 1
    );

  return adminDb.runTransaction(
    async tx => {
      await assertCurrentEventAdmin(
        tx,
        context,
        idToken
      );

      const result =
        await tx.get(query);

      const items = result.docs
        .slice(0, BKASH_PENDING_LIST_LIMIT)
        .map(doc =>
          projectPendingBkashSubmission(
            doc.id,
            doc.data()
          )
        );

      items.sort(
        (a, b) =>
          a.submittedAtMs - b.submittedAtMs ||
          a.submissionId.localeCompare(
            b.submissionId
          )
      );

      return {
        items,

        limit:
          BKASH_PENDING_LIST_LIMIT,

        hasMore:
          result.size >
            BKASH_PENDING_LIST_LIMIT,
      };
    },
    {
      readOnly: true,
    }
  );
}
