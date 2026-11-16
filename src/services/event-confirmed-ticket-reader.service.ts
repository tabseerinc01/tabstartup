import 'server-only';

import {
  Timestamp,
  type Transaction,
  type Firestore,
} from 'firebase-admin/firestore';

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

function invalidOrder(): never {
  throw new EventRegistrationError(
    'REGISTRATION_DATA_INVALID'
  );
}

function notFound(): never {
  throw new RegistrationApiError(
    404,
    'EVENT_ORDER_NOT_FOUND'
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
 * Internal canonical ticket reader.
 *
 * This function does not authorize customer access.
 * Callers must verify order ownership or email
 * eligibility before calling it.
 *
 * All reads occur in the caller's transaction.
 */
export async function readConfirmedEventTickets(
  tx: Transaction,
  adminDb: Firestore,
  order: PersistedEventOrder,
  options: { includeTicketEvent?: boolean } = {}
) {
  if (order.status !== 'fulfilled') {
    return invalidOrder();
  }

  const orderId = order.orderId;
  const ORDER_STATUSES = new Set(['fulfilled']);

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



  return {
    tickets,
    ticketEvent,
    currency: order.currency,
    unitAmountMinor: item.unitAmountMinor,
  };
}
