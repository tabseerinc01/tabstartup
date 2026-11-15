import 'server-only';

import {
  Timestamp,
} from 'firebase-admin/firestore';

import {
  getFirebaseAdmin,
} from '@/firebase/admin';

import {
  authenticateAccount,
} from '@/services/account-authorization.service';

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
  type EventRecord,
  type EventTicketType,
  type EventTicketInventory,
} from '@/lib/event-types';

import {
  EVENT_INVITATION_SCHEMA_VERSION,
  type EventInvitation,
} from '@/lib/event-invitation-types';

import {
  isValidEventInvitationId,
  isValidEventInvitationToken,
  verifyEventInvitationToken,
} from '@/lib/event-invitation-token';

import {
  hashEventPolicy,
} from '@/lib/event-registration-policy';

import {
  isEventRegistrationOpen,
} from '@/lib/event-lifecycle';

import {
  isValidEventDocumentId,
  isValidInventoryCounters,
  isAttendanceModeAllowed,
} from '@/lib/event-validation';

export class EventInvitationAccessError
  extends Error {
  constructor(
    public readonly code:
      | 'INVITATION_ACCESS_DENIED'
      | 'INVITATION_SERVICE_DISABLED'
  ) {
    super(code);
    this.name = 'EventInvitationAccessError';
  }
}

function ensure(
  condition: unknown
): asserts condition {
  if (!condition) {
    throw new EventInvitationAccessError(
      'INVITATION_ACCESS_DENIED'
    );
  }
}

export async function getAuthorizedInvitationDetails(
  idToken: string,
  invitationId: string,
  token: string
) {
  if (
    process.env.EVENT_REGISTRATION_ENABLED !== 'true'
  ) {
    throw new EventInvitationAccessError(
      'INVITATION_SERVICE_DISABLED'
    );
  }

  ensure(
    isValidEventInvitationId(invitationId) &&
      isValidEventInvitationToken(token)
  );

  const account =
    await authenticateAccount(idToken);

  ensure(
    account.identity.status === 'active'
  );

  const { adminDb, adminAuth } =
    getFirebaseAdmin();

  const invitationRef = adminDb
    .collection(EVENT_COLLECTIONS.invitations)
    .doc(invitationId);

  const identityRef = adminDb
    .collection(ACCOUNT_IDENTITIES_COLLECTION)
    .doc(account.uid);

  const userRef = adminDb
    .collection('users')
    .doc(account.uid);

  return adminDb.runTransaction(
    async tx => {
      const decoded = await adminAuth
        .verifyIdToken(idToken, true)
        .catch(() => {
          throw new EventInvitationAccessError(
            'INVITATION_ACCESS_DENIED'
          );
        });

      ensure(
        decoded.uid === account.uid &&
          decoded.email_verified === true &&
          typeof decoded.email === 'string'
      );

      const email =
        decoded.email.trim().toLowerCase();

      const [
        identitySnap,
        userSnap,
        invitationSnap,
      ] = await tx.getAll(
        identityRef,
        userRef,
        invitationRef
      );

      try {
        assertGlobalAccountNotSuspended(
          account.uid,
          identitySnap
        );
      } catch {
        throw new EventInvitationAccessError(
          'INVITATION_ACCESS_DENIED'
        );
      }

      const user = userSnap.data();

      ensure(
        (identitySnap.exists || userSnap.exists) &&
          (
            !userSnap.exists ||
            (
              user &&
              (
                user.uid === undefined ||
                user.uid === account.uid
              ) &&
              (
                user.status === undefined ||
                user.status === 'active'
              )
            )
          )
      );

      ensure(invitationSnap.exists);

      const invitation =
        invitationSnap.data() as EventInvitation;

      ensure(
        invitation.schemaVersion ===
          EVENT_INVITATION_SCHEMA_VERSION &&
          invitation.invitationId === invitationId &&
          invitation.organizerType === 'platform' &&
          invitation.organizerId ===
            PLATFORM_EVENT_ORGANIZER_ID &&
          invitation.pricingType === 'complimentary' &&
          invitation.guestEmail === email &&
          verifyEventInvitationToken(
            token,
            invitation.tokenHash
          ) &&
          isValidEventDocumentId(invitation.eventId) &&
          isValidEventDocumentId(invitation.ticketTypeId) &&
          !/^__.*__$/.test(invitation.eventId) &&
          !/^__.*__$/.test(invitation.ticketTypeId) &&
          invitation.expiresAt instanceof Timestamp
      );

      const eventRef = adminDb
        .collection(EVENT_COLLECTIONS.events)
        .doc(invitation.eventId);

      const ticketRef = adminDb
        .collection(EVENT_COLLECTIONS.ticketTypes)
        .doc(invitation.ticketTypeId);

      const inventoryRef = adminDb
        .collection(EVENT_COLLECTIONS.inventory)
        .doc(invitation.ticketTypeId);

      const [
        eventSnap,
        ticketSnap,
        inventorySnap,
      ] = await tx.getAll(
        eventRef,
        ticketRef,
        inventoryRef
      );

      ensure(
        eventSnap.exists &&
          ticketSnap.exists &&
          inventorySnap.exists
      );

      const event =
        eventSnap.data() as EventRecord;

      const ticket =
        ticketSnap.data() as EventTicketType;

      const inventory =
        inventorySnap.data() as EventTicketInventory;

      ensure(
        event.schemaVersion === EVENT_SCHEMA_VERSION &&
          event.eventId === invitation.eventId &&
          event.organizerType === 'platform' &&
          event.organizerId ===
            PLATFORM_EVENT_ORGANIZER_ID &&
          event.visibility === 'public' &&
          ticket.schemaVersion === EVENT_SCHEMA_VERSION &&
          ticket.eventId === event.eventId &&
          ticket.ticketTypeId === invitation.ticketTypeId &&
          ticket.attendanceMode === invitation.attendanceMode &&
          ticket.access === 'invite_only' &&
          ticket.pricingType === 'free' &&
          ticket.price.usdAmountMinor === 0 &&
          ticket.price.bdtAmountMinor === 0 &&
          inventory.eventId === event.eventId &&
          inventory.ticketTypeId === ticket.ticketTypeId &&
          isValidInventoryCounters(inventory)
      );

      const nowMs = Date.now();

      const expiresAtMs =
        invitation.expiresAt.toMillis();

      const status =
        invitation.status === 'pending' &&
        expiresAtMs <= nowMs
          ? 'expired'
          : invitation.status;

      ensure(
        status === 'pending' ||
          status === 'accepted' ||
          status === 'revoked' ||
          status === 'expired'
      );

      if (status === 'accepted') {
        ensure(
          invitation.acceptedByUid === account.uid &&
            isValidEventDocumentId(invitation.orderId) &&
            !/^__.*__$/.test(invitation.orderId)
        );
      }

      const settings =
        event.invitationSettings;

      const canAccept =
        status === 'pending' &&
        event.cancelledAt === null &&
        (
          event.registrationAccess === 'invite_only' ||
          event.registrationAccess ===
            'public_and_invitation'
        ) &&
        settings?.enabled === true &&
        settings.allowComplimentary === true &&
        Number.isSafeInteger(
          settings.maxAcceptedInvitations
        ) &&
        Number.isSafeInteger(
          settings.acceptedInvitationCount
        ) &&
        settings.acceptedInvitationCount >= 0 &&
        settings.acceptedInvitationCount <
          settings.maxAcceptedInvitations &&
        isEventRegistrationOpen(event, nowMs) &&
        ticket.status === 'active' &&
        ticket.maxPerOrder === 1 &&
        isAttendanceModeAllowed(
          event.mode,
          ticket.attendanceMode
        ) &&
        (
          ticket.salesStartAt === null ||
          ticket.salesStartAt.toMillis() <= nowMs
        ) &&
        (
          ticket.salesEndAt === null ||
          ticket.salesEndAt.toMillis() > nowMs
        ) &&
        inventory.reservedQuantity +
          inventory.issuedQuantity <
          inventory.capacity;

      return {
        invitationId,
        status,
        canAccept,
        expiresAtMs,

        guestName: invitation.guestName,
        guestEmail: invitation.guestEmail,
        category: invitation.category,

        event: {
          eventId: event.eventId,
          slug: event.slug,
          title: event.title,
          mode: event.mode,
          timezone: event.timezone,
          startsAtMs: event.startsAt.toMillis(),
          endsAtMs: event.endsAt.toMillis(),
          venue: event.venue,
          terms: event.terms,
          refundPolicy: event.refundPolicy,
          termsHash: hashEventPolicy(event.terms),
          refundPolicyHash:
            hashEventPolicy(event.refundPolicy),
        },

        ticket: {
          ticketTypeId: ticket.ticketTypeId,
          name: ticket.name,
          attendanceMode: ticket.attendanceMode,
          pricingType: 'complimentary' as const,
          quantity: 1 as const,
          amountMinor: 0 as const,
        },

        orderId:
          status === 'accepted'
            ? invitation.orderId
            : null,
      };
    },
    { readOnly: true }
  );
}
