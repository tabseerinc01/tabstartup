import 'server-only';

import {
  claimEventEmailJob,
  type EventEmailClaimResult,
} from './event-email-claim.service';

import {
  prepareClaimedEmailPayload,
} from './event-email-payload.service';

import {
  finalizeEventEmailAttempt,
  type EventEmailDeliveryOutcome,
  type EventEmailFinalizationResult,
} from './event-email-finalization.service';

import {
  EmailDeliveryError,
  isEventEmailEnabled,
  sendTransactionalEmail,
} from './resend-email.service';

export type EventEmailProcessingResult = {
  emailId: string;

  status:
    | Exclude<
        EventEmailClaimResult['status'],
        'claimed'
      >
    | EventEmailFinalizationResult['status'];
};

function classifyDeliveryError(
  error: unknown
): EventEmailDeliveryOutcome {
  if (!(error instanceof EmailDeliveryError)) {
    return {
      type: 'requires_review',
      errorCode: 'UNKNOWN_EMAIL_DELIVERY_ERROR',
    };
  }

  if (error.providerStatus === 409) {
    return {
      type: 'requires_review',
      errorCode: 'EMAIL_IDEMPOTENCY_CONFLICT',
    };
  }

  if (
    error.code === 'EMAIL_DISABLED' ||
    error.code === 'EMAIL_CONFIGURATION_INVALID'
  ) {
    return {
      type: 'requires_review',
      errorCode: error.code,
    };
  }

  if (
    error.retryable ||
    error.code === 'EMAIL_DELIVERY_UNCERTAIN'
  ) {
    return {
      type: 'retryable',
      errorCode: error.code,
    };
  }

  if (
    error.code === 'EMAIL_INPUT_INVALID' ||
    error.code === 'EMAIL_PROVIDER_REJECTED'
  ) {
    return {
      type: 'failed',
      errorCode: error.code,
    };
  }

  return {
    type: 'requires_review',
    errorCode: error.code,
  };
}

/**
 * Process one email outbox job.
 *
 * Provider delivery happens outside
 * all Firestore transactions.
 *
 * Never modifies financial records.
 */
export async function processEventEmailJob(
  emailId: string
): Promise<EventEmailProcessingResult> {
  if (!isEventEmailEnabled()) {
    return {
      emailId,
      status: 'disabled',
    };
  }

  const claim =
    await claimEventEmailJob(emailId);

  if (claim.status !== 'claimed') {
    return {
      emailId,
      status: claim.status,
    };
  }

  const { job, leaseToken } = claim;

  async function finalize(
    outcome: EventEmailDeliveryOutcome
  ): Promise<EventEmailProcessingResult> {
    const result =
      await finalizeEventEmailAttempt(
        emailId,
        leaseToken,
        outcome
      );

    return {
      emailId,
      status: result.status,
    };
  }

  // Preparation errors must never be
  // mistaken for provider acceptance.

  const prepared =
    await prepareClaimedEmailPayload(
      job,
      leaseToken
    );

  if (prepared.status === 'disabled') {
    return finalize({
      type: 'retryable',
      errorCode: 'EMAIL_DISABLED',
    });
  }

  if (prepared.status !== 'ready') {
    return {
      emailId,
      status: prepared.status,
    };
  }

  if (!isEventEmailEnabled()) {
    return finalize({
      type: 'retryable',
      errorCode: 'EMAIL_DISABLED',
    });
  }

  let outcome: EventEmailDeliveryOutcome;

  try {
    const delivery =
      await sendTransactionalEmail(
        prepared.payload
      );

    outcome = {
      type: 'accepted',
      providerEmailId:
        delivery.providerEmailId,
    };
  } catch (error) {
    outcome = classifyDeliveryError(error);
  }

  // Keep finalization outside the
  // provider try/catch block.
  //
  // A database failure after acceptance
  // must not be classified as a failed send.

  return finalize(outcome);
}
