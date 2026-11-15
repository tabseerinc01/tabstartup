import 'server-only';

import {
  createHash,
  timingSafeEqual,
} from 'node:crypto';

import {
  Timestamp,
  type Transaction,
  type Firestore,
} from 'firebase-admin/firestore';

import {
  getFirebaseAdmin,
} from '@/firebase/admin';

import {
  ACCOUNT_IDENTITIES_COLLECTION,
} from '@/lib/account-identity';

import {
  assertGlobalAccountNotSuspended,
} from '@/services/account-suspension-guard.service';

import {
  EVENT_COLLECTIONS,
  EVENT_SCHEMA_VERSION,
  PLATFORM_EVENT_ORGANIZER_ID,
  type PersistedEventOrder,
  type EventRecord,
  type EventRegistration,
  type EventRegistrationRequest,
  type EventIssuedTicket,
} from '@/lib/event-types';

import {
  buildEventTicketId,
} from '@/services/event-ticket-issuance.service';

import {
  isValidEventDocumentId,
  calculateTicketTotalMinor,
} from '@/lib/event-validation';

import {
  EventRegistrationError,
} from '@/lib/event-registration-policy';

import {
  RegistrationApiError,
} from '@/lib/event-registration-api';

import type {
  RegistrationAccessContext,
} from '@/services/event-registration.service';

const ORDER_STATUSES = new Set([
  'created',
  'awaiting_payment',
  'pending_verification',
  'paid',
  'fulfilled',
  'requires_review',
  'expired',
  'cancelled',
  'partially_refunded',
  'refunded',
]);

function notFound(): never {
  throw new RegistrationApiError(
    404,
    'EVENT_ORDER_NOT_FOUND'
  );
}

function invalidOrder(): never {
  throw new EventRegistrationError(
    'REGISTRATION_DATA_INVALID'
  );
}

function matchesGuestSession(
  storedHash: unknown,
  secret: string | null
): boolean {
  if (
    typeof storedHash !== 'string' ||
    !/^[a-f0-9]{64}$/.test(storedHash) ||
    typeof secret !== 'string' ||
    !/^[a-f0-9]{64}$/.test(secret)
  ) {
    return false;
  }

  const expected = createHash('sha256')
    .update('event-order-guest-v1:' + secret)
    .digest('hex');

  return timingSafeEqual(
    Buffer.from(storedHash, 'hex'),
    Buffer.from(expected, 'hex')
  );
}

function optionalMillis(
  value: unknown
): number | null {
  if (value === null) {
    return null;
  }

  if (!(value instanceof Timestamp)) {
    return invalidOrder();
  }

  const millis = value.toMillis();

  if (
    !Number.isSafeInteger(millis) ||
    millis <= 0 ||
    millis > 253402300799999
  ) {
    return invalidOrder();
  }

  return millis;
}


/**
 * Resolve the authenticated purchaser before
 * entering a Firestore transaction.
 */
export async function resolveEventOrderAccessUid(
  access: RegistrationAccessContext
): Promise<string | null> {
  if (access.idToken === null) {
    return null;
  }

  const { adminAuth } = getFirebaseAdmin();

  const decoded = await adminAuth
    .verifyIdToken(access.idToken, true)
    .catch(() => {
      throw new EventRegistrationError(
        'UNAUTHENTICATED'
      );
    });

  return decoded.uid;
}

/**
 * Internal server-side authorization helper.
 *
 * The caller must resolve uid using the verified
 * access context, never from customer input.
 *
 * All ownership and suspension reads occur in
 * the caller's Firestore transaction.
 */
export async function readAuthorizedEventOrder(
  tx: Transaction,
  adminDb: Firestore,
  orderId: string,
  access: RegistrationAccessContext,
  uid: string | null
): Promise<PersistedEventOrder> {
  if (
    !isValidEventDocumentId(orderId) ||
    /^__.*__$/.test(orderId)
  ) {
    return notFound();
  }

  if (
    (access.idToken === null) !== (uid === null)
  ) {
    throw new EventRegistrationError(
      'UNAUTHENTICATED'
    );
  }

  const orderRef = adminDb
    .collection(EVENT_COLLECTIONS.orders)
    .doc(orderId);

  if (uid !== null) {
    const [identitySnap, userSnap] =
      await tx.getAll(
        adminDb
          .collection(ACCOUNT_IDENTITIES_COLLECTION)
          .doc(uid),

        adminDb
          .collection('users')
          .doc(uid)
      );

    try {
      assertGlobalAccountNotSuspended(
        uid,
        identitySnap
      );
    } catch {
      throw new EventRegistrationError(
        'ACCOUNT_ACCESS_DENIED'
      );
    }

    const user = userSnap.data();

    if (
      (!identitySnap.exists &&
        !userSnap.exists) ||
      (
        userSnap.exists &&
        (
          !user ||
          (
            user.uid !== undefined &&
            user.uid !== uid
          ) ||
          (
            user.status !== undefined &&
            user.status !== 'active'
          )
        )
      )
    ) {
      throw new EventRegistrationError(
        'ACCOUNT_ACCESS_DENIED'
      );
    }
  }

  const snapshot = await tx.get(orderRef);

  if (!snapshot.exists) {
    return notFound();
  }

  const order =
    snapshot.data() as PersistedEventOrder;

  // Unauthorized and missing orders return
  // the same response to prevent enumeration.

  if (uid !== null) {
    if (
      order.purchaserUid !== uid ||
      order.guestSessionHash !== null
    ) {
      return notFound();
    }
  } else {
    if (
      order.purchaserUid !== null ||
      !matchesGuestSession(
        order.guestSessionHash,
        access.guestSessionSecret
      )
    ) {
      return notFound();
    }
  }


  return order;
}

export async function getAuthorizedEventOrder(
  orderId: string,
  access: RegistrationAccessContext,
  options: { includeTicketEvent?: boolean } = {}
) {
  if (
    !isValidEventDocumentId(orderId) ||
    /^__.*__$/.test(orderId)
  ) {
    return notFound();
  }

  const { adminDb } = getFirebaseAdmin();

  const uid =
    await resolveEventOrderAccessUid(access);

  return adminDb.runTransaction(
    async tx => {
      const order =
        await readAuthorizedEventOrder(
          tx,
          adminDb,
          orderId,
          access,
          uid
        );

      if (
        order.schemaVersion !== EVENT_SCHEMA_VERSION ||
        order.orderId !== orderId ||
        !isValidEventDocumentId(order.eventId) ||
        order.organizerType !== 'platform' ||
        order.organizerId !==
          PLATFORM_EVENT_ORGANIZER_ID ||
        !ORDER_STATUSES.has(order.status) ||
        !Array.isArray(order.items) ||
        order.items.length !== 1 ||
        !Number.isSafeInteger(order.totalAmountMinor) ||
        order.totalAmountMinor < 0
      ) {
        return invalidOrder();
      }

      if (order.paymentRequired === true) {
        if (
          order.totalAmountMinor <= 0 ||
          !isValidEventDocumentId(
            order.paymentOrderId
          ) ||
          !(
            (
              order.currency === 'USD' &&
              order.provider === 'tabedge' &&
              order.verificationMode === 'automatic'
            ) ||
            (
              order.currency === 'BDT' &&
              order.provider === 'bkash_manual' &&
              order.verificationMode === 'manual'
            )
          )
        ) {
          return invalidOrder();
        }
      } else if (
        order.paymentRequired !== false ||
        order.paymentOrderId !== null ||
        order.currency !== null ||
        order.provider !== null ||
        order.verificationMode !== null ||
        order.totalAmountMinor !== 0
      ) {
        return invalidOrder();
      }

      const item = order.items[0];

      if (
        !item ||
        !isValidEventDocumentId(
          item.ticketTypeId
        ) ||
        typeof item.ticketName !== 'string' ||
        !item.ticketName.trim() ||
        (
          item.attendanceMode !== 'online' &&
          item.attendanceMode !== 'offline'
        ) ||
        !Number.isSafeInteger(item.quantity) ||
        item.quantity < 1 ||
        item.quantity > 20 ||
        !Number.isSafeInteger(item.unitAmountMinor) ||
        item.unitAmountMinor < 0 ||
        calculateTicketTotalMinor(
          item.unitAmountMinor,
          item.quantity
        ) !== item.totalAmountMinor ||
        item.totalAmountMinor !==
          order.totalAmountMinor
      ) {
        return invalidOrder();
      }

      const expiresAtMs =
        optionalMillis(order.expiresAt);

      const paidAtMs =
        optionalMillis(order.paidAt);

      const fulfilledAtMs =
        optionalMillis(order.fulfilledAt);

      const tickets: Array<{
        ticketId: string;
        ticketNumber: string;
        participantName: string;
        ticketName: string;
        attendanceMode: 'online' | 'offline';
        status: 'issued' | 'checked_in';
        issuedAtMs: number;
      }> = [];

      if (order.status === 'fulfilled') {
        if (
          fulfilledAtMs === null ||
          !isValidEventDocumentId(
            order.registrationRequestId
          ) ||
          (
            order.paymentRequired &&
            (
              paidAtMs === null ||
              !isValidEventDocumentId(
                order.successfulPaymentId
              )
            )
          )
        ) {
          return invalidOrder();
        }

        const requestRef = adminDb
          .collection(
            EVENT_COLLECTIONS.registrationRequests
          )
          .doc(order.registrationRequestId);

        const requestSnap =
          await tx.get(requestRef);

        if (!requestSnap.exists) {
          return invalidOrder();
        }

        const registrationRequest =
          requestSnap.data() as
            EventRegistrationRequest;

        if (
          registrationRequest.schemaVersion !==
            EVENT_SCHEMA_VERSION ||
          registrationRequest.requestId !==
            requestRef.id ||
          registrationRequest.eventId !==
            order.eventId ||
          registrationRequest.orderId !==
            order.orderId ||
          registrationRequest.purchaserUid !==
            order.purchaserUid ||
          !Array.isArray(
            registrationRequest.registrationIds
          ) ||
          registrationRequest.registrationIds.length !==
            item.quantity ||
          new Set(
            registrationRequest.registrationIds
          ).size !== item.quantity ||
          !registrationRequest.registrationIds.every(
            id => isValidEventDocumentId(id)
          )
        ) {
          return invalidOrder();
        }

        const registrationRefs =
          registrationRequest.registrationIds.map(
            id => adminDb
              .collection(
                EVENT_COLLECTIONS.registrations
              )
              .doc(id)
          );

        const ticketRefs =
          registrationRequest.registrationIds.map(
            id => adminDb
              .collection(
                EVENT_COLLECTIONS.tickets
              )
              .doc(buildEventTicketId(id))
          );

        const snapshots = await tx.getAll(
          ...registrationRefs,
          ...ticketRefs
        );

        for (
          let index = 0;
          index < item.quantity;
          index++
        ) {
          const registrationSnap =
            snapshots[index];

          const ticketSnap =
            snapshots[item.quantity + index];

          if (
            !registrationSnap.exists ||
            !ticketSnap.exists
          ) {
            return invalidOrder();
          }

          const registration =
            registrationSnap.data() as
              EventRegistration;

          const ticket =
            ticketSnap.data() as
              EventIssuedTicket;

          if (
            registration.registrationId !==
              registrationRefs[index].id ||
            registration.eventId !==
              order.eventId ||
            registration.orderId !==
              order.orderId ||
            registration.ticketTypeId !==
              item.ticketTypeId ||
            registration.attendanceMode !==
              item.attendanceMode ||
            registration.status !==
              'confirmed' ||
            !registration.participant ||
            typeof registration.participant.fullName !==
              'string' ||
            !registration.participant.fullName.trim() ||
            ticket.ticketId !==
              ticketRefs[index].id ||
            ticket.registrationId !==
              registration.registrationId ||
            ticket.eventId !== order.eventId ||
            ticket.orderId !== order.orderId ||
            ticket.ticketTypeId !==
              item.ticketTypeId ||
            ticket.attendeeUid !==
              registration.participant.uid ||
            ticket.attendanceMode !==
              item.attendanceMode ||
            (
              ticket.status !== 'issued' &&
              ticket.status !== 'checked_in'
            ) ||
            ticket.ticketNumber !==
              'TS-' + ticket.ticketId
                .slice('ticket_'.length)
                .toUpperCase()
          ) {
            return invalidOrder();
          }

          const issuedAtMs =
            optionalMillis(ticket.issuedAt);

          const confirmedAtMs =
            optionalMillis(
              registration.confirmedAt
            );

          if (
            issuedAtMs === null ||
            confirmedAtMs === null ||
            issuedAtMs !== confirmedAtMs ||
            issuedAtMs !== fulfilledAtMs
          ) {
            return invalidOrder();
          }

          tickets.push({
            ticketId: ticket.ticketId,

            ticketNumber: ticket.ticketNumber,

            participantName:
              registration.participant.fullName,

            ticketName: item.ticketName,

            attendanceMode:
              ticket.attendanceMode,

            status: ticket.status,

            issuedAtMs,
          });
        }
      }

      let ticketEvent: {
        title: string;
        startsAtMs: number;
        endsAtMs: number;
        timezone: string;
        venue: string | null;
      } | null = null;

      if (
        options.includeTicketEvent === true &&
        order.status === 'fulfilled'
      ) {
        const eventSnap = await tx.get(
          adminDb
            .collection(EVENT_COLLECTIONS.events)
            .doc(order.eventId)
        );

        if (!eventSnap.exists) {
          return notFound();
        }

        const event =
          eventSnap.data() as EventRecord;

        if (
          event.schemaVersion !==
            EVENT_SCHEMA_VERSION ||
          event.eventId !== order.eventId ||
          event.organizerType !== 'platform' ||
          event.organizerId !==
            PLATFORM_EVENT_ORGANIZER_ID ||
          !['published', 'ongoing', 'completed']
            .includes(event.status) ||
          event.cancelledAt !== null
        ) {
          throw new RegistrationApiError(
            409,
            'TICKET_UNAVAILABLE'
          );
        }

        const startsAtMs =
          optionalMillis(event.startsAt);

        const endsAtMs =
          optionalMillis(event.endsAt);

        if (
          startsAtMs === null ||
          endsAtMs === null ||
          endsAtMs <= startsAtMs ||
          typeof event.title !== 'string' ||
          !event.title.trim() ||
          typeof event.timezone !== 'string' ||
          !event.timezone.trim()
        ) {
          return invalidOrder();
        }

        let venue: string | null = null;

        if (item.attendanceMode === 'offline') {
          if (!event.venue) {
            return invalidOrder();
          }

          const parts = [
            event.venue.name,
            event.venue.address,
            event.venue.city,
            event.venue.countryCode,
          ];

          if (!parts.every(
            value =>
              typeof value === 'string' &&
              value.trim().length > 0
          )) {
            return invalidOrder();
          }

          venue = parts.join(', ');
        }

        ticketEvent = {
          title: event.title,
          startsAtMs,
          endsAtMs,
          timezone: event.timezone,
          venue,
        };
      }

      // Explicit response allowlist.
      // Never serialize the full private order.

      return {
        orderId: order.orderId,

        eventId: order.eventId,

        status: order.status,

        paymentRequired:
          order.paymentRequired,

        currency: order.currency,

        provider: order.provider,

        totalAmountMinor:
          order.totalAmountMinor,

        items: [{
          ticketTypeId: item.ticketTypeId,

          ticketName: item.ticketName,

          attendanceMode: item.attendanceMode,

          quantity: item.quantity,

          unitAmountMinor: item.unitAmountMinor,

          totalAmountMinor: item.totalAmountMinor,
        }],

        expiresAtMs,

        paidAtMs,

        fulfilledAtMs,

        tickets,

        ...(options.includeTicketEvent === true
          ? { ticketEvent }
          : {}),

        paymentWindowElapsed:
          expiresAtMs !== null &&
          expiresAtMs <= Date.now() &&
          order.status === 'awaiting_payment',
      };
    },
    { readOnly: true }
  );
}
