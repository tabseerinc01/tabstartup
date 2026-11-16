import 'server-only';

import { randomUUID } from 'node:crypto';

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

import {
  isEventInvitationEmailJob,
  type AnyEventEmailOutboxRecord,
} from '@/lib/event-invitation-email-types';

import {
  checkEventInvitationEmailEligibility,
} from './event-invitation-email-eligibility.service';

import {
  checkEventEmailEligibility,
} from './event-email-eligibility.service';

import {
  isEventEmailEnabled,
} from './resend-email.service';

export const EVENT_EMAIL_LEASE_MS =
  120 * 1000;

export const EVENT_EMAIL_MAX_ATTEMPTS =
  5;

export const EVENT_EMAIL_RETRY_WINDOW_MS =
  23 * 60 * 60 * 1000;

export type EventEmailClaimResult =
  | {
      status: 'claimed';
      job: AnyEventEmailOutboxRecord;
      leaseToken: string;
    }
  | {
      status:
        | 'disabled'
        | 'missing'
        | 'not_due'
        | 'not_claimable'
        | 'skipped'
        | 'requires_review';
    };

function validTimestamp(
  value: unknown
): value is Timestamp {
  return (
    value instanceof Timestamp &&
    Number.isSafeInteger(value.toMillis()) &&
    value.toMillis() > 0
  );
}

/**
 * Atomically claim a due email job.
 *
 * No external provider calls inside
 * the Firestore transaction.
 */
export async function claimEventEmailJob(
  emailId: string
): Promise<EventEmailClaimResult> {
  if (!isEventEmailEnabled()) {
    return { status: 'disabled' };
  }

  if (
    typeof emailId !== 'string' ||
    !/^email_[a-f0-9]{64}$/.test(emailId)
  ) {
    return { status: 'not_claimable' };
  }

  const { adminDb } = getFirebaseAdmin();

  const ref = adminDb
    .collection(EVENT_COLLECTIONS.emailOutbox)
    .doc(emailId);

  const leaseToken = randomUUID();

  return adminDb.runTransaction(
    async (tx): Promise<EventEmailClaimResult> => {
      const snap = await tx.get(ref);

      if (!snap.exists) {
        return { status: 'missing' };
      }

      const job =
        snap.data() as AnyEventEmailOutboxRecord;

      const now = Timestamp.now();
      const nowMs = now.toMillis();

      if (
        job.status !== 'pending' &&
        job.status !== 'retry_pending' &&
        job.status !== 'processing'
      ) {
        return { status: 'not_claimable' };
      }

      function requireReview(
        code: string
      ): EventEmailClaimResult {
        tx.update(ref, {
          status: 'requires_review',
          nextAttemptAt: null,
          leaseToken: null,
          leaseExpiresAt: null,
          lastErrorCode: code,
          updatedAt: now,
        });

        return { status: 'requires_review' };
      }

      if (
        job.schemaVersion !==
          EVENT_EMAIL_SCHEMA_VERSION ||
        job.emailId !== emailId ||
        job.idempotencyKey !==
          (isEventInvitationEmailJob(job)
            ? emailId
            : 'tabstartup-event-email/' + emailId) ||
        job.provider !== 'resend' ||
        !Number.isSafeInteger(job.attemptCount) ||
        job.attemptCount < 0 ||
        !validTimestamp(job.scheduledAt) ||
        job.providerEmailId !== null ||
        job.acceptedAt !== null
      ) {
        return requireReview(
          'INVALID_EMAIL_JOB_STATE'
        );
      }

      if (job.status === 'processing') {
        if (
          !validTimestamp(job.leaseExpiresAt) ||
          typeof job.leaseToken !== 'string' ||
          !job.leaseToken ||
          job.attemptCount === 0
        ) {
          return requireReview(
            'INVALID_EMAIL_LEASE'
          );
        }

        if (
          job.leaseExpiresAt.toMillis() > nowMs
        ) {
          return { status: 'not_due' };
        }
      } else {
        if (
          !validTimestamp(job.nextAttemptAt) ||
          job.leaseToken !== null ||
          job.leaseExpiresAt !== null
        ) {
          return requireReview(
            'INVALID_EMAIL_SCHEDULE'
          );
        }

        if (
          job.nextAttemptAt.toMillis() > nowMs ||
          job.scheduledAt.toMillis() > nowMs
        ) {
          return { status: 'not_due' };
        }
      }

      if (job.attemptCount === 0) {
        if (
          job.firstAttemptAt !== null ||
          job.lastAttemptAt !== null ||
          job.status !== 'pending'
        ) {
          return requireReview(
            'INVALID_EMAIL_ATTEMPT_HISTORY'
          );
        }
      } else {
        if (
          !validTimestamp(job.firstAttemptAt) ||
          !validTimestamp(job.lastAttemptAt) ||
          job.firstAttemptAt.toMillis() >
            job.lastAttemptAt.toMillis() ||
          job.lastAttemptAt.toMillis() > nowMs
        ) {
          return requireReview(
            'INVALID_EMAIL_ATTEMPT_HISTORY'
          );
        }
      }

      if (
        job.attemptCount >=
          EVENT_EMAIL_MAX_ATTEMPTS
      ) {
        return requireReview(
          'EMAIL_ATTEMPT_LIMIT_REACHED'
        );
      }

      if (
        job.firstAttemptAt !== null &&
        nowMs - job.firstAttemptAt.toMillis() >=
          EVENT_EMAIL_RETRY_WINDOW_MS
      ) {
        return requireReview(
          'EMAIL_RETRY_WINDOW_EXPIRED'
        );
      }

      const eligibility =
        isEventInvitationEmailJob(job)
          ? await checkEventInvitationEmailEligibility(
              tx,
              adminDb,
              job,
              now
            )
          : await checkEventEmailEligibility(
              tx,
              adminDb,
              job,
              now
            );

      // All transaction reads complete.

      if (!eligibility.eligible) {
        if (job.attemptCount > 0) {
          return requireReview(
            'EMAIL_ELIGIBILITY_CHANGED_AFTER_ATTEMPT'
          );
        }

        tx.update(ref, {
          status: 'skipped',
          skipReason: eligibility.reason,
          nextAttemptAt: null,
          leaseToken: null,
          leaseExpiresAt: null,
          updatedAt: now,
        });

        return { status: 'skipped' };
      }

      const claimedJob: AnyEventEmailOutboxRecord = {
        ...job,

        status: 'processing',

        attemptCount: job.attemptCount + 1,

        firstAttemptAt:
          job.firstAttemptAt ?? now,

        lastAttemptAt: now,

        nextAttemptAt: null,

        leaseToken,

        leaseExpiresAt:
          Timestamp.fromMillis(
            nowMs + EVENT_EMAIL_LEASE_MS
          ),

        updatedAt: now,
      };

      tx.update(ref, {
        status: claimedJob.status,
        attemptCount: claimedJob.attemptCount,
        firstAttemptAt: claimedJob.firstAttemptAt,
        lastAttemptAt: claimedJob.lastAttemptAt,
        nextAttemptAt: null,
        leaseToken: claimedJob.leaseToken,
        leaseExpiresAt: claimedJob.leaseExpiresAt,
        updatedAt: now,
      });

      return {
        status: 'claimed',
        job: claimedJob,
        leaseToken,
      };
    }
  );
}
