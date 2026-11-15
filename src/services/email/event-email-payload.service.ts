import 'server-only';

import { createHash } from 'node:crypto';

import {
  Timestamp,
} from 'firebase-admin/firestore';

import {
  getFirebaseAdmin,
} from '@/firebase/admin';

import {
  EVENT_COLLECTIONS,
} from '@/lib/event-types';

import type {
  EventEmailOutboxRecord,
} from '@/lib/event-email-types';

import {
  buildEventEmailTemplate,
} from './event-email-template.service';

import {
  EVENT_EMAIL_RETRY_WINDOW_MS,
} from './event-email-claim.service';

import {
  isEventEmailEnabled,
  type TransactionalEmailInput,
} from './resend-email.service';

export type EventEmailPayloadResult =
  | {
      status: 'ready';
      payload: TransactionalEmailInput;
    }
  | {
      status:
        | 'disabled'
        | 'lease_lost'
        | 'requires_review';
    };

const MINIMUM_LEASE_REMAINING_MS =
  20 * 1000;

/**
 * Bind the exact delivery payload to the
 * current processing lease.
 *
 * Never store API credentials in Firestore.
 * Never perform provider calls here.
 */
export async function prepareClaimedEmailPayload(
  job: EventEmailOutboxRecord,
  leaseToken: string
): Promise<EventEmailPayloadResult> {
  if (!isEventEmailEnabled()) {
    return { status: 'disabled' };
  }

  const rendered =
    buildEventEmailTemplate(job.templateInput);

  const payload: TransactionalEmailInput = {
    to: job.recipientEmail,

    subject: rendered.subject,

    html: rendered.html,

    text: rendered.text,

    idempotencyKey: job.idempotencyKey,
  };

  const payloadHash = createHash('sha256')
    .update(
      JSON.stringify([
        'tabstartup-email-payload-v1',

        process.env.EVENT_EMAIL_FROM?.trim() || '',

        process.env.EVENT_EMAIL_REPLY_TO?.trim() || '',

        payload.to,

        payload.subject,

        payload.html,

        payload.text,

        payload.idempotencyKey,
      ]),
      'utf8'
    )
    .digest('hex');

  const { adminDb } = getFirebaseAdmin();

  const ref = adminDb
    .collection(EVENT_COLLECTIONS.emailOutbox)
    .doc(job.emailId);

  return adminDb.runTransaction(
    async (tx): Promise<EventEmailPayloadResult> => {
      const snap = await tx.get(ref);

      if (!snap.exists) {
        return { status: 'lease_lost' };
      }

      const current = snap.data()!;

      const now = Timestamp.now();
      const nowMs = now.toMillis();

      if (
        current.status !== 'processing' ||
        current.emailId !== job.emailId ||
        current.leaseToken !== leaseToken ||
        current.attemptCount !== job.attemptCount ||
        !(current.leaseExpiresAt instanceof Timestamp) ||
        current.leaseExpiresAt.toMillis() <=
          nowMs + MINIMUM_LEASE_REMAINING_MS
      ) {
        return { status: 'lease_lost' };
      }

      function requireReview(
        code: string
      ): EventEmailPayloadResult {
        tx.update(ref, {
          status: 'requires_review',

          lastErrorCode: code,

          nextAttemptAt: null,

          leaseToken: null,

          leaseExpiresAt: null,

          updatedAt: now,
        });

        return { status: 'requires_review' };
      }

      if (
        !(current.firstAttemptAt instanceof Timestamp) ||
        nowMs - current.firstAttemptAt.toMillis() >=
          EVENT_EMAIL_RETRY_WINDOW_MS
      ) {
        return requireReview(
          'EMAIL_RETRY_WINDOW_EXPIRED'
        );
      }

      if (
        current.recipientEmail !== job.recipientEmail ||
        current.idempotencyKey !== job.idempotencyKey ||
        JSON.stringify(current.templateInput) !==
          JSON.stringify(job.templateInput)
      ) {
        return requireReview(
          'EMAIL_JOB_PAYLOAD_CHANGED'
        );
      }

      const previousHash =
        current.deliveryPayloadHash;

      if (
        previousHash !== undefined &&
        previousHash !== payloadHash
      ) {
        return requireReview(
          'EMAIL_DELIVERY_PAYLOAD_CHANGED'
        );
      }

      if (previousHash === undefined) {
        tx.update(ref, {
          deliveryPayloadHash: payloadHash,

          updatedAt: now,
        });
      }

      return {
        status: 'ready',

        payload,
      };
    }
  );
}
