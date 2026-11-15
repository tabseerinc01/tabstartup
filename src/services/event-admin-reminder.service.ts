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
  type EventRecord,
  type EventOrder,
  type EventAuditLog,
} from '@/lib/event-types';

import {
  requireEventAdmin,
} from './event-authorization.service';

import {
  assertCurrentEventAdmin,
} from './event-management.service';

import {
  buildAdminPaymentReminderJob,
} from './email/event-email-scheduling.service';

import {
  buildEventEmailOutboxRecord,
} from './email/event-email-outbox.service';

import {
  checkEventEmailEligibility,
} from './email/event-email-eligibility.service';

export type EventAdminReminderErrorCode =
  | 'INVALID_REMINDER_REQUEST'
  | 'EVENT_ORDER_NOT_FOUND'
  | 'ORDER_NOT_ELIGIBLE_FOR_REMINDER'
  | 'EVENT_EMAIL_DISABLED'
  | 'REMINDER_RECORD_CONFLICT';

export class EventAdminReminderError
  extends Error {
  constructor(
    public readonly code:
      EventAdminReminderErrorCode
  ) {
    super(code);

    this.name = 'EventAdminReminderError';
  }
}

export interface EventAdminReminderResult {
  eventId: string;

  orderId: string;

  emailId: string;

  status:
    | 'queued'
    | 'already_requested';
}

function validId(
  value: unknown
): value is string {
  return (
    typeof value === 'string' &&
    /^[A-Za-z0-9_-]{1,200}$/.test(value) &&
    !/^__.*__$/.test(value)
  );
}

export async function queueAdminPaymentReminder(
  idToken: string,
  eventId: string,
  orderId: string
): Promise<EventAdminReminderResult> {
  const context =
    await requireEventAdmin(
      idToken,
      'event:manage_participants'
    );

  if (
    !validId(eventId) ||
    !validId(orderId)
  ) {
    throw new EventAdminReminderError(
      'INVALID_REMINDER_REQUEST'
    );
  }

  if (
    process.env.EVENT_EMAIL_ENABLED !== 'true'
  ) {
    throw new EventAdminReminderError(
      'EVENT_EMAIL_DISABLED'
    );
  }

  const { adminDb } =
    getFirebaseAdmin();

  const eventRef = adminDb
    .collection(EVENT_COLLECTIONS.events)
    .doc(eventId);

  const orderRef = adminDb
    .collection(EVENT_COLLECTIONS.orders)
    .doc(orderId);

  return adminDb.runTransaction(
    async tx => {
      await assertCurrentEventAdmin(
        tx,
        context,
        idToken
      );

      const [eventSnap, orderSnap] =
        await tx.getAll(
          eventRef,
          orderRef
        );

      if (
        !eventSnap.exists ||
        !orderSnap.exists
      ) {
        throw new EventAdminReminderError(
          'EVENT_ORDER_NOT_FOUND'
        );
      }

      const event =
        eventSnap.data() as EventRecord;

      const order =
        orderSnap.data() as EventOrder;

      if (
        event.schemaVersion !==
          EVENT_SCHEMA_VERSION ||
        order.schemaVersion !==
          EVENT_SCHEMA_VERSION ||
        event.eventId !== eventId ||
        order.eventId !== eventId ||
        order.orderId !== orderId ||
        event.organizerType !== 'platform' ||
        order.organizerType !== 'platform' ||
        event.organizerId !==
          PLATFORM_EVENT_ORGANIZER_ID ||
        order.organizerId !==
          PLATFORM_EVENT_ORGANIZER_ID
      ) {
        throw new EventAdminReminderError(
          'EVENT_ORDER_NOT_FOUND'
        );
      }

      const now = Timestamp.now();

      if (
        order.paymentRequired !== true ||
        order.status !== 'awaiting_payment' ||
        order.paidAt !== null ||
        order.successfulPaymentId !== null ||
        !(order.expiresAt instanceof Timestamp) ||
        order.expiresAt.toMillis() <=
          now.toMillis()
      ) {
        throw new EventAdminReminderError(
          'ORDER_NOT_ELIGIBLE_FOR_REMINDER'
        );
      }

      const record = (() => {
        try {
          return buildEventEmailOutboxRecord(
            buildAdminPaymentReminderJob({
              event,
              order,
              now,
            })
          );
        } catch {
          throw new EventAdminReminderError(
            'ORDER_NOT_ELIGIBLE_FOR_REMINDER'
          );
        }
      })();

      const eligibility =
        await checkEventEmailEligibility(
          tx,
          adminDb,
          record,
          now
        );

      if (!eligibility.eligible) {
        throw new EventAdminReminderError(
          'ORDER_NOT_ELIGIBLE_FOR_REMINDER'
        );
      }

      const emailRef = adminDb
        .collection(
          EVENT_COLLECTIONS.emailOutbox
        )
        .doc(record.emailId);

      const existing =
        await tx.get(emailRef);

      if (existing.exists) {
        const previous = existing.data();

        if (
          !previous ||
          previous.emailId !== record.emailId ||
          previous.eventId !== eventId ||
          previous.orderId !== orderId ||
          previous.type !== 'payment_reminder' ||
          previous.trigger !== 'admin_reminder' ||
          previous.recipientEmail !==
            order.purchaserEmail ||
          previous.idempotencyKey !==
            record.idempotencyKey
        ) {
          throw new EventAdminReminderError(
            'REMINDER_RECORD_CONFLICT'
          );
        }

        return {
          eventId,

          orderId,

          emailId: record.emailId,

          status: 'already_requested',
        };
      }

      // Final deadline check before writing.
      if (
        order.expiresAt.toMillis() <=
          Timestamp.now().toMillis()
      ) {
        throw new EventAdminReminderError(
          'ORDER_NOT_ELIGIBLE_FOR_REMINDER'
        );
      }

      if (
        process.env.EVENT_EMAIL_ENABLED !== 'true'
      ) {
        throw new EventAdminReminderError(
          'EVENT_EMAIL_DISABLED'
        );
      }

      // All transaction reads are complete.
      // Create only; never overwrite an email job.
      tx.create(
        emailRef,
        record
      );

      const auditId =
        'reminder_' + record.emailId;

      const audit: EventAuditLog = {
        auditId,

        eventId,

        action: 'payment_reminder_requested',

        actorType: 'admin',

        actorUid: context.uid,

        resourceType: 'event_order',

        resourceId: orderId,

        reason: 'manual_payment_reminder',

        createdAt: now,
      };

      tx.create(
        adminDb
          .collection(EVENT_COLLECTIONS.auditLogs)
          .doc(auditId),
        audit
      );

      return {
        eventId,

        orderId,

        emailId: record.emailId,

        status: 'queued',
      };
    }
  );
}
