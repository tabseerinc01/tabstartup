import 'server-only';

import { Timestamp } from 'firebase-admin/firestore';

import type {
  ManualPaymentSubmission,
} from '@/lib/payment-types';

import {
  normalizeBkashSenderNumber,
} from '@/lib/payment-lifecycle';

import {
  BkashAdminReviewError,
  isValidReviewDocumentId,
  type BkashPendingPaymentSummary,
} from '@/services/payments/bkash-admin-review.service';

import {
  validateBkashAccountSnapshot,
} from '@/services/payments/bkash-manual-provider.service';

export type BkashRecoveryPaymentSummary =
  Omit<BkashPendingPaymentSummary, 'status'> & {
    status: 'requires_review';
  };

function invalid(): never {
  throw new BkashAdminReviewError(
    'INVALID_PAYMENT_SUBMISSION'
  );
}

export function projectRecoveryBkashSubmission(
  documentId: string,
  value: unknown
): BkashRecoveryPaymentSummary {
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
    submission.status !== 'requires_review' ||
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

    status: 'requires_review',

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
