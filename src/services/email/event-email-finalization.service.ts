import 'server-only';

import {
  Timestamp,
} from 'firebase-admin/firestore';

import {
  getFirebaseAdmin,
} from '@/firebase/admin';

import {
  EVENT_COLLECTIONS,
} from '@/lib/event-types';

import {
  EVENT_EMAIL_SCHEMA_VERSION,
} from '@/lib/event-email-types';

import type {
  AnyEventEmailOutboxRecord,
} from '@/lib/event-invitation-email-types';

import {
  EVENT_EMAIL_MAX_ATTEMPTS,
  EVENT_EMAIL_RETRY_WINDOW_MS,
} from './event-email-claim.service';

export type EventEmailDeliveryOutcome =
  | {
      type: 'accepted';
      providerEmailId: string;
    }
  | {
      type: 'retryable';
      errorCode: string;
    }
  | {
      type: 'failed';
      errorCode: string;
    }
  | {
      type: 'requires_review';
      errorCode: string;
    };

export type EventEmailFinalizationResult = {
  status:
    | 'accepted'
    | 'retry_pending'
    | 'failed'
    | 'requires_review'
    | 'lease_lost';
};

const RETRY_DELAYS_MS = [
  60 * 1000,
  5 * 60 * 1000,
  15 * 60 * 1000,
  60 * 60 * 1000,
];

function validErrorCode(
  value: unknown
): value is string {
  return (
    typeof value === 'string' &&
    /^[A-Z0-9_]{1,100}$/.test(value)
  );
}

function validProviderEmailId(
  value: unknown
): value is string {
  return (
    typeof value === 'string' &&
    /^[A-Za-z0-9_-]{1,200}$/.test(value)
  );
}

/**
 * Finalize a delivery attempt only while
 * the caller owns the processing lease.
 *
 * No provider calls inside the transaction.
 * No financial or registration writes.
 */
export async function finalizeEventEmailAttempt(
  emailId: string,
  leaseToken: string,
  outcome: EventEmailDeliveryOutcome
): Promise<EventEmailFinalizationResult> {
  if (
    !/^email_[a-f0-9]{64}$/.test(emailId) ||
    typeof leaseToken !== 'string' ||
    !leaseToken
  ) {
    return { status: 'lease_lost' };
  }

  const { adminDb } = getFirebaseAdmin();

  const ref = adminDb
    .collection(EVENT_COLLECTIONS.emailOutbox)
    .doc(emailId);

  return adminDb.runTransaction(
    async (tx): Promise<EventEmailFinalizationResult> => {
      const snap = await tx.get(ref);

      if (!snap.exists) {
        return { status: 'lease_lost' };
      }

      const job =
        snap.data() as AnyEventEmailOutboxRecord;

      const now = Timestamp.now();
      const nowMs = now.toMillis();

      if (
        job.schemaVersion !==
          EVENT_EMAIL_SCHEMA_VERSION ||
        job.emailId !== emailId ||
        job.status !== 'processing' ||
        job.leaseToken !== leaseToken ||
        !(job.leaseExpiresAt instanceof Timestamp) ||
        job.leaseExpiresAt.toMillis() <= nowMs
      ) {
        return { status: 'lease_lost' };
      }

      const baseUpdate = {
        leaseToken: null,
        leaseExpiresAt: null,
        nextAttemptAt: null,
        updatedAt: now,
      };

      function requireReview(
        code: string
      ): EventEmailFinalizationResult {
        tx.update(ref, {
          ...baseUpdate,
          status: 'requires_review',
          lastErrorCode: code,
        });

        return { status: 'requires_review' };
      }

      if (
        job.providerEmailId !== null ||
        job.acceptedAt !== null ||
        !Number.isSafeInteger(job.attemptCount) ||
        job.attemptCount < 1 ||
        !(job.firstAttemptAt instanceof Timestamp) ||
        !(job.lastAttemptAt instanceof Timestamp) ||
        job.firstAttemptAt.toMillis() >
          job.lastAttemptAt.toMillis() ||
        job.lastAttemptAt.toMillis() > nowMs
      ) {
        return requireReview(
          'INVALID_EMAIL_FINALIZATION_STATE'
        );
      }

      if (outcome.type === 'accepted') {
        if (
          !validProviderEmailId(
            outcome.providerEmailId
          ) ||
          typeof job.deliveryPayloadHash !== 'string' ||
          !/^[a-f0-9]{64}$/.test(
            job.deliveryPayloadHash
          )
        ) {
          return requireReview(
            'INVALID_EMAIL_ACCEPTANCE_RESULT'
          );
        }

        tx.update(ref, {
          ...baseUpdate,

          status: 'accepted',

          providerEmailId:
            outcome.providerEmailId,

          acceptedAt: now,

          lastErrorCode: null,

          skipReason: null,
        });

        return { status: 'accepted' };
      }

      const errorCode =
        validErrorCode(outcome.errorCode)
          ? outcome.errorCode
          : 'UNKNOWN_EMAIL_DELIVERY_ERROR';

      if (outcome.type === 'requires_review') {
        return requireReview(errorCode);
      }

      if (outcome.type === 'failed') {
        // Earlier attempts may have been accepted
        // without a persisted provider response.
        if (job.attemptCount > 1) {
          return requireReview(errorCode);
        }

        tx.update(ref, {
          ...baseUpdate,

          status: 'failed',

          lastErrorCode: errorCode,
        });

        return { status: 'failed' };
      }

      if (outcome.type !== 'retryable') {
        return requireReview(
          'INVALID_EMAIL_DELIVERY_OUTCOME'
        );
      }

      if (
        job.attemptCount >=
          EVENT_EMAIL_MAX_ATTEMPTS
      ) {
        return requireReview(
          'EMAIL_ATTEMPT_LIMIT_REACHED'
        );
      }

      const retryDelay =
        RETRY_DELAYS_MS[
          Math.min(
            job.attemptCount - 1,
            RETRY_DELAYS_MS.length - 1
          )
        ];

      const nextAttemptAtMs =
        nowMs + retryDelay;

      const retryDeadlineMs =
        job.firstAttemptAt.toMillis() +
        EVENT_EMAIL_RETRY_WINDOW_MS;

      if (
        nextAttemptAtMs >= retryDeadlineMs
      ) {
        return requireReview(
          'EMAIL_RETRY_WINDOW_EXPIRED'
        );
      }

      tx.update(ref, {
        ...baseUpdate,

        status: 'retry_pending',

        nextAttemptAt:
          Timestamp.fromMillis(
            nextAttemptAtMs
          ),

        lastErrorCode: errorCode,
      });

      return { status: 'retry_pending' };
    }
  );
}
