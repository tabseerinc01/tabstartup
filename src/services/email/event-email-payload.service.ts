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

import {
  isEventInvitationEmailJob,
  type AnyEventEmailOutboxRecord,
  type EventInvitationEmailOutboxRecord,
} from '@/lib/event-invitation-email-types';

import {
  buildEventInvitationEmailTemplate,
} from './event-invitation-email-template.service';

import {
  checkEventInvitationEmailEligibility,
} from './event-invitation-email-eligibility.service';

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
  job: AnyEventEmailOutboxRecord,
  leaseToken: string
): Promise<EventEmailPayloadResult> {
  if (!isEventEmailEnabled()) {
    return { status: 'disabled' };
  }

  const rendered =
    isEventInvitationEmailJob(job)
      ? buildEventInvitationEmailTemplate(
          job.templateInput
        )
      : buildEventEmailTemplate(
          job.templateInput
        );

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
        current.eventId !== job.eventId ||
        current.type !== job.type ||
        current.trigger !== job.trigger ||
        current.orderId !== job.orderId ||
        JSON.stringify(current.templateInput) !==
          JSON.stringify(job.templateInput)
      ) {
        return requireReview(
          'EMAIL_JOB_PAYLOAD_CHANGED'
        );
      }

      if (isEventInvitationEmailJob(job)) {
        if (
          current.invitationId !== job.invitationId ||
          current.tokenVersion !== job.tokenVersion
        ) {
          return requireReview(
            'INVITATION_EMAIL_JOB_CHANGED'
          );
        }

        // Recheck canonical invitation state
        // immediately before delivery.
        //
        // All reads must finish before writes.

        const eligibility =
          await checkEventInvitationEmailEligibility(
            tx,
            adminDb,
            current as EventInvitationEmailOutboxRecord,
            now
          );

        if (!eligibility.eligible) {
          return requireReview(
            'INVITATION_EMAIL_ELIGIBILITY_CHANGED'
          );
        }

        if (
          current.leaseExpiresAt.toMillis() <=
            Date.now() + MINIMUM_LEASE_REMAINING_MS
        ) {
          return { status: 'lease_lost' };
        }

        if (
          job.templateInput.expiresAtMs <= Date.now()
        ) {
          return requireReview(
            'INVITATION_EMAIL_EXPIRED_BEFORE_DELIVERY'
          );
        }
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
