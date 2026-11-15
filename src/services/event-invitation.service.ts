import 'server-only';

import {
  queueEventInvitationEmail,
  buildEventInvitationEmailId,
} from '@/services/email/event-invitation-email-outbox.service';

import type {
  AdminInvitationEmailStatus,
} from '@/lib/event-invitation-types';

import type {
  EventInvitationEmailOutboxRecord,
} from '@/lib/event-invitation-email-types';

import {
  EVENT_EMAIL_SCHEMA_VERSION,
} from '@/lib/event-email-types';

import {
  createHash,
} from 'node:crypto';

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
  type EventTicketType,
  type EventTicketInventory,
  type EventAuditLog,
} from '@/lib/event-types';

import {
  EVENT_INVITATION_SCHEMA_VERSION,
  EVENT_INVITATION_CATEGORIES,
  type EventInvitation,
  type EventInvitationCategory,
  type AdminEventInvitation,
} from '@/lib/event-invitation-types';

import {
  deriveEventInvitationToken,
  hashEventInvitationToken,
  isValidEventInvitationId,
} from '@/lib/event-invitation-token';

import {
  isValidInventoryCounters,
  isAttendanceModeAllowed,
} from '@/lib/event-validation';

import {
  requireEventAdmin,
} from './event-authorization.service';

import {
  assertCurrentEventAdmin,
} from './event-management.service';

export type EventInvitationErrorCode =
  | 'INVALID_INVITATION_REQUEST'
  | 'INVITATION_NOT_AVAILABLE'
  | 'INVITATION_ALREADY_EXISTS'
  | 'INVITATION_CAPACITY_EXHAUSTED'
  | 'INVITATION_TICKET_UNAVAILABLE'
  | 'INVITATION_EXPIRY_INVALID'
  | 'INVITATION_NOT_FOUND'
  | 'INVITATION_STATUS_CONFLICT';

export class EventInvitationError extends Error {
  constructor(
    public readonly code: EventInvitationErrorCode
  ) {
    super(code);
    this.name = 'EventInvitationError';
  }
}

interface CreateInvitationInput {
  ticketTypeId: string;
  category: EventInvitationCategory;
  guestName: string;
  guestEmail: string;
  expiresAtMs: number;
}

export interface CreateInvitationResult {
  invitation: AdminEventInvitation;
  invitationUrl: string;
}

function ensure(
  condition: unknown,
  code: EventInvitationErrorCode
): asserts condition {
  if (!condition) {
    throw new EventInvitationError(code);
  }
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

function parseInput(
  input: unknown
): CreateInvitationInput {
  ensure(
    input !== null &&
      typeof input === 'object' &&
      !Array.isArray(input),
    'INVALID_INVITATION_REQUEST'
  );

  const data =
    input as Record<string, unknown>;

  const allowedKeys = [
    'ticketTypeId',
    'category',
    'guestName',
    'guestEmail',
    'expiresAtMs',
  ];

  ensure(
    Object.keys(data).length ===
      allowedKeys.length &&
      Object.keys(data).every(
        key => allowedKeys.includes(key)
      ),
    'INVALID_INVITATION_REQUEST'
  );

  ensure(
    validId(data.ticketTypeId),
    'INVALID_INVITATION_REQUEST'
  );

  ensure(
    typeof data.category === 'string' &&
      EVENT_INVITATION_CATEGORIES.includes(
        data.category as EventInvitationCategory
      ),
    'INVALID_INVITATION_REQUEST'
  );

  ensure(
    typeof data.guestName === 'string' &&
      typeof data.guestEmail === 'string',
    'INVALID_INVITATION_REQUEST'
  );

  const guestName =
    data.guestName.trim();

  const guestEmail =
    data.guestEmail.trim().toLowerCase();

  ensure(
    guestName.length >= 1 &&
      guestName.length <= 150 &&
      !/[\u0000-\u001f\u007f]/.test(guestName),
    'INVALID_INVITATION_REQUEST'
  );

  ensure(
    guestEmail.length <= 254 &&
      /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(
        guestEmail
      ) &&
      !/[\u0000-\u001f\u007f]/.test(guestEmail),
    'INVALID_INVITATION_REQUEST'
  );

  ensure(
    typeof data.expiresAtMs === 'number' &&
      Number.isSafeInteger(data.expiresAtMs) &&
      data.expiresAtMs > 0 &&
      data.expiresAtMs <= 253402300799999,
    'INVALID_INVITATION_REQUEST'
  );

  return {
    ticketTypeId: data.ticketTypeId,
    category:
      data.category as EventInvitationCategory,
    guestName,
    guestEmail,
    expiresAtMs: data.expiresAtMs,
  };
}

/**
 * Deterministic event/email identity prevents
 * duplicate invitations, including concurrent
 * creation requests.
 */
function buildInvitationId(
  eventId: string,
  guestEmail: string
): string {
  return 'inv_' +
    createHash('sha256')
      .update(
        JSON.stringify([
          'tabstartup-event-invitation-id-v1',
          eventId,
          guestEmail,
        ])
      )
      .digest('hex')
      .slice(0, 48);
}

export function projectAdminInvitation(
  invitation: EventInvitation
): AdminEventInvitation {
  return {
    invitationId: invitation.invitationId,
    eventId: invitation.eventId,
    ticketTypeId: invitation.ticketTypeId,
    attendanceMode: invitation.attendanceMode,
    category: invitation.category,
    guestName: invitation.guestName,
    guestEmail: invitation.guestEmail,
    pricingType: invitation.pricingType,
    status: invitation.status,

    expiresAtMs:
      invitation.expiresAt.toMillis(),

    createdAtMs:
      invitation.createdAt.toMillis(),

    acceptedAtMs:
      invitation.acceptedAt?.toMillis() ?? null,

    revokedAtMs:
      invitation.revokedAt?.toMillis() ?? null,

    orderId: invitation.orderId,
    registrationId: invitation.registrationId,
    ticketId: invitation.ticketId,
  };
}

export async function createAdminEventInvitation(
  idToken: string,
  eventId: string,
  rawInput: unknown
): Promise<CreateInvitationResult> {
  const context = await requireEventAdmin(
    idToken,
    'event:manage_participants'
  );

  ensure(
    validId(eventId),
    'INVALID_INVITATION_REQUEST'
  );

  const input = parseInput(rawInput);

  const invitationId = buildInvitationId(
    eventId,
    input.guestEmail
  );

  const tokenVersion = 1;

  const token = deriveEventInvitationToken(
    invitationId,
    tokenVersion
  );

  const tokenHash =
    hashEventInvitationToken(token);

  const { adminDb } = getFirebaseAdmin();

  const eventRef = adminDb
    .collection(EVENT_COLLECTIONS.events)
    .doc(eventId);

  const ticketRef = adminDb
    .collection(EVENT_COLLECTIONS.ticketTypes)
    .doc(input.ticketTypeId);

  const inventoryRef = adminDb
    .collection(EVENT_COLLECTIONS.inventory)
    .doc(input.ticketTypeId);

  const invitationRef = adminDb
    .collection(EVENT_COLLECTIONS.invitations)
    .doc(invitationId);

  const auditRef = adminDb
    .collection(EVENT_COLLECTIONS.auditLogs)
    .doc();

  return adminDb.runTransaction(
    async tx => {
      await assertCurrentEventAdmin(
        tx,
        context,
        idToken
      );

      const [
        eventSnap,
        ticketSnap,
        inventorySnap,
        invitationSnap,
      ] = await tx.getAll(
        eventRef,
        ticketRef,
        inventoryRef,
        invitationRef
      );

      ensure(
        eventSnap.exists,
        'INVITATION_NOT_AVAILABLE'
      );

      ensure(
        ticketSnap.exists &&
          inventorySnap.exists,
        'INVITATION_TICKET_UNAVAILABLE'
      );

      ensure(
        !invitationSnap.exists,
        'INVITATION_ALREADY_EXISTS'
      );

      const event =
        eventSnap.data() as EventRecord;

      const ticket =
        ticketSnap.data() as EventTicketType;

      const inventory =
        inventorySnap.data() as EventTicketInventory;

      const now = Timestamp.now();
      const nowMs = now.toMillis();

      ensure(
        event.schemaVersion === EVENT_SCHEMA_VERSION &&
          event.eventId === eventId &&
          event.organizerType === 'platform' &&
          event.organizerId ===
            PLATFORM_EVENT_ORGANIZER_ID &&
          (
            event.status === 'published' ||
            event.status === 'ongoing'
          ) &&
          event.cancelledAt === null &&
          (
            event.registrationAccess === 'invite_only' ||
            event.registrationAccess ===
              'public_and_invitation'
          ) &&
          event.endsAt instanceof Timestamp &&
          event.endsAt.toMillis() > nowMs,
        'INVITATION_NOT_AVAILABLE'
      );

      const settings =
        event.invitationSettings;

      ensure(
        settings?.enabled === true &&
          settings.allowComplimentary === true &&
          Number.isSafeInteger(
            settings.maxAcceptedInvitations
          ) &&
          settings.maxAcceptedInvitations > 0 &&
          Number.isSafeInteger(
            settings.acceptedInvitationCount
          ) &&
          settings.acceptedInvitationCount >= 0 &&
          settings.acceptedInvitationCount <=
            settings.maxAcceptedInvitations,
        'INVITATION_NOT_AVAILABLE'
      );

      ensure(
        settings.acceptedInvitationCount <
          settings.maxAcceptedInvitations,
        'INVITATION_CAPACITY_EXHAUSTED'
      );

      ensure(
        ticket.schemaVersion === EVENT_SCHEMA_VERSION &&
          ticket.eventId === eventId &&
          ticket.ticketTypeId === input.ticketTypeId &&
          ticket.status === 'active' &&
          ticket.access === 'invite_only' &&
          ticket.pricingType === 'free' &&
          ticket.price.usdAmountMinor === 0 &&
          ticket.price.bdtAmountMinor === 0 &&
          ticket.maxPerOrder === 1 &&
          isAttendanceModeAllowed(
            event.mode,
            ticket.attendanceMode
          ) &&
          inventory.eventId === eventId &&
          inventory.ticketTypeId === input.ticketTypeId &&
          isValidInventoryCounters(inventory) &&
          inventory.reservedQuantity +
            inventory.issuedQuantity <
            inventory.capacity,
        'INVITATION_TICKET_UNAVAILABLE'
      );

      const expiryLimit = Math.min(
        event.endsAt.toMillis(),

        event.registrationClosesAt?.toMillis() ??
          Number.MAX_SAFE_INTEGER,

        ticket.salesEndAt?.toMillis() ??
          Number.MAX_SAFE_INTEGER
      );

      const earliestAcceptance = Math.max(
        nowMs,

        event.registrationOpensAt?.toMillis() ??
          nowMs,

        ticket.salesStartAt?.toMillis() ??
          nowMs
      );

      ensure(
        input.expiresAtMs > earliestAcceptance &&
          input.expiresAtMs <= expiryLimit,
        'INVITATION_EXPIRY_INVALID'
      );

      const invitation: EventInvitation = {
        invitationId,
        eventId,
        ticketTypeId: ticket.ticketTypeId,

        organizerType: 'platform',
        organizerId: PLATFORM_EVENT_ORGANIZER_ID,

        attendanceMode: ticket.attendanceMode,

        category: input.category,
        guestName: input.guestName,
        guestEmail: input.guestEmail,

        pricingType: 'complimentary',
        status: 'pending',

        tokenHash,
        tokenVersion,

        expiresAt:
          Timestamp.fromMillis(input.expiresAtMs),

        createdByUid: context.uid,

        acceptedByUid: null,
        acceptedAt: null,

        orderId: null,
        registrationId: null,
        ticketId: null,

        revokedByUid: null,
        revokedAt: null,
        revocationReason: null,

        schemaVersion:
          EVENT_INVITATION_SCHEMA_VERSION,

        createdAt: now,
        updatedAt: now,
      };

      const audit: EventAuditLog = {
        auditId: auditRef.id,
        eventId,
        action: 'invitation_created',
        actorType: 'admin',
        actorUid: context.uid,
        resourceType: 'event_invitation',
        resourceId: invitationId,
        reason: null,
        createdAt: now,
      };

      // Queue invitation email atomically.
      // Never persist the raw invitation token.

      queueEventInvitationEmail(
        tx,
        invitationRef.firestore,
        {
          event,
          ticket,
          invitation,
          trigger: 'invitation_created',
          now,
        }
      );

      tx.create(invitationRef, invitation);
      tx.create(auditRef, audit);

      return {
        invitation:
          projectAdminInvitation(invitation),

        invitationUrl:
          'https://tabstartup.com/events/invitations/' +
          invitationId +
          '#token=' +
          token,
      };
    }
  );
}

/**
 * Validate canonical invitation ownership.
 */
function assertManagedInvitation(
  invitation: EventInvitation,
  eventId: string,
  invitationId: string
): void {
  ensure(
    invitation.schemaVersion ===
      EVENT_INVITATION_SCHEMA_VERSION &&
      invitation.invitationId === invitationId &&
      invitation.eventId === eventId &&
      invitation.organizerType === 'platform' &&
      invitation.organizerId ===
        PLATFORM_EVENT_ORGANIZER_ID &&
      invitation.pricingType === 'complimentary',
    'INVITATION_NOT_FOUND'
  );
}

function assertInvitationEventOwnership(
  event: EventRecord,
  eventId: string
): void {
  ensure(
    event.schemaVersion === EVENT_SCHEMA_VERSION &&
      event.eventId === eventId &&
      event.organizerType === 'platform' &&
      event.organizerId ===
        PLATFORM_EVENT_ORGANIZER_ID,
    'INVITATION_NOT_AVAILABLE'
  );
}

/**
 * Expiry is effective immediately, even before
 * any background status cleanup.
 */
function projectEffectiveInvitation(
  invitation: EventInvitation,
  nowMs: number
): AdminEventInvitation {
  const result =
    projectAdminInvitation(invitation);

  if (
    result.status === 'pending' &&
    result.expiresAtMs <= nowMs
  ) {
    return {
      ...result,
      status: 'expired',
    };
  }

  return result;
}

export interface AdminInvitationListResult {
  eventId: string;
  items: AdminEventInvitation[];
  hasMore: boolean;
  nextCursor: string | null;
}

export async function listAdminEventInvitations(
  idToken: string,
  eventId: string,
  cursor: string | null = null,
  limit = 100
): Promise<AdminInvitationListResult> {
  const context = await requireEventAdmin(
    idToken,
    'event:manage_participants'
  );

  ensure(
    validId(eventId) &&
      Number.isSafeInteger(limit) &&
      limit >= 1 &&
      limit <= 100 &&
      (
        cursor === null ||
        isValidEventInvitationId(cursor)
      ),
    'INVALID_INVITATION_REQUEST'
  );

  const { adminDb } = getFirebaseAdmin();

  const eventRef = adminDb
    .collection(EVENT_COLLECTIONS.events)
    .doc(eventId);

  return adminDb.runTransaction(
    async tx => {
      await assertCurrentEventAdmin(
        tx,
        context,
        idToken
      );

      const eventSnap = await tx.get(eventRef);

      ensure(
        eventSnap.exists,
        'INVITATION_NOT_AVAILABLE'
      );

      const event =
        eventSnap.data() as EventRecord;

      assertInvitationEventOwnership(
        event,
        eventId
      );

      let query = adminDb
        .collection(EVENT_COLLECTIONS.invitations)
        .where('eventId', '==', eventId)
        .orderBy('__name__', 'asc')
        .limit(limit + 1);

      if (cursor !== null) {
        query = query.startAfter(cursor);
      }

      const snapshot = await tx.get(query);

      const nowMs = Date.now();

      const documents =
        snapshot.docs.slice(0, limit);

      const invitations = documents.map(doc => {
        const invitation =
          doc.data() as EventInvitation;

        assertManagedInvitation(
          invitation,
          eventId,
          doc.id
        );

        return invitation;
      });

      const emailRefs = invitations.map(invitation =>
        adminDb
          .collection(EVENT_COLLECTIONS.emailOutbox)
          .doc(
            buildEventInvitationEmailId(
              eventId,
              invitation.invitationId,
              invitation.tokenVersion
            )
          )
      );

      const emailSnapshots =
        emailRefs.length > 0
          ? await tx.getAll(...emailRefs)
          : [];

      const emailSnapshotsById = new Map(
        emailSnapshots.map(snap => [snap.id, snap])
      );

      const validEmailStatuses = new Set<string>([
        'pending',
        'processing',
        'retry_pending',
        'accepted',
        'failed',
        'skipped',
        'requires_review',
      ]);

      const items = invitations.map(
        (invitation, index): AdminEventInvitation => {
          const projected =
            projectEffectiveInvitation(
              invitation,
              nowMs
            );

          const expectedEmailId =
            emailRefs[index].id;

          const emailSnap =
            emailSnapshotsById.get(expectedEmailId);

          if (!emailSnap?.exists) {
            return {
              ...projected,
              emailDeliveryStatus: 'not_queued',
              emailAcceptedAtMs: null,
            };
          }

          const job =
            emailSnap.data() as
              EventInvitationEmailOutboxRecord;

          if (
            job.schemaVersion !==
              EVENT_EMAIL_SCHEMA_VERSION ||
            job.emailId !== expectedEmailId ||
            job.idempotencyKey !== expectedEmailId ||
            job.type !== 'event_invitation' ||
            job.provider !== 'resend' ||
            job.orderId !== null ||
            job.eventId !== eventId ||
            job.invitationId !==
              invitation.invitationId ||
            job.tokenVersion !==
              invitation.tokenVersion ||
            job.recipientEmail !==
              invitation.guestEmail ||
            !validEmailStatuses.has(job.status)
          ) {
            return {
              ...projected,
              emailDeliveryStatus: 'requires_review',
              emailAcceptedAtMs: null,
            };
          }

          if (
            job.status === 'accepted' &&
            (
              !(job.acceptedAt instanceof Timestamp) ||
              !Number.isSafeInteger(
                job.acceptedAt.toMillis()
              ) ||
              job.acceptedAt.toMillis() <= 0 ||
              job.acceptedAt.toMillis() > nowMs ||
              typeof job.providerEmailId !== 'string' ||
              !job.providerEmailId
            )
          ) {
            return {
              ...projected,
              emailDeliveryStatus: 'requires_review',
              emailAcceptedAtMs: null,
            };
          }

          return {
            ...projected,

            emailDeliveryStatus:
              job.status as AdminInvitationEmailStatus,

            emailAcceptedAtMs:
              job.status === 'accepted' &&
              job.acceptedAt instanceof Timestamp
                ? job.acceptedAt.toMillis()
                : null,
          };
        }
      );

      const hasMore =
        snapshot.size > limit;

      return {
        eventId,
        items,
        hasMore,

        nextCursor:
          hasMore && documents.length > 0
            ? documents[documents.length - 1].id
            : null,
      };
    }
  );
}

export async function revokeAdminEventInvitation(
  idToken: string,
  eventId: string,
  invitationId: string,
  rawReason: unknown
): Promise<AdminEventInvitation> {
  const context = await requireEventAdmin(
    idToken,
    'event:manage_participants'
  );

  ensure(
    validId(eventId) &&
      isValidEventInvitationId(invitationId) &&
      typeof rawReason === 'string',
    'INVALID_INVITATION_REQUEST'
  );

  const reason = rawReason.trim();

  ensure(
    reason.length >= 3 &&
      reason.length <= 500 &&
      !/[\u0000-\u001f\u007f]/.test(reason),
    'INVALID_INVITATION_REQUEST'
  );

  const { adminDb } = getFirebaseAdmin();

  const eventRef = adminDb
    .collection(EVENT_COLLECTIONS.events)
    .doc(eventId);

  const invitationRef = adminDb
    .collection(EVENT_COLLECTIONS.invitations)
    .doc(invitationId);

  const auditRef = adminDb
    .collection(EVENT_COLLECTIONS.auditLogs)
    .doc();

  return adminDb.runTransaction(
    async tx => {
      await assertCurrentEventAdmin(
        tx,
        context,
        idToken
      );

      const [eventSnap, invitationSnap] =
        await tx.getAll(
          eventRef,
          invitationRef
        );

      ensure(
        eventSnap.exists &&
          invitationSnap.exists,
        'INVITATION_NOT_FOUND'
      );

      const event =
        eventSnap.data() as EventRecord;

      const invitation =
        invitationSnap.data() as EventInvitation;

      assertInvitationEventOwnership(
        event,
        eventId
      );

      assertManagedInvitation(
        invitation,
        eventId,
        invitationId
      );

      if (invitation.status === 'revoked') {
        return projectAdminInvitation(invitation);
      }

      ensure(
        (
          invitation.status === 'pending' ||
          invitation.status === 'expired'
        ) &&
          invitation.acceptedAt === null &&
          invitation.acceptedByUid === null &&
          invitation.orderId === null &&
          invitation.registrationId === null &&
          invitation.ticketId === null,
        'INVITATION_STATUS_CONFLICT'
      );

      const now = Timestamp.now();

      const updated: EventInvitation = {
        ...invitation,

        status: 'revoked',

        revokedByUid: context.uid,
        revokedAt: now,
        revocationReason: reason,

        updatedAt: now,
      };

      const audit: EventAuditLog = {
        auditId: auditRef.id,
        eventId,
        action: 'invitation_revoked',
        actorType: 'admin',
        actorUid: context.uid,
        resourceType: 'event_invitation',
        resourceId: invitationId,
        reason,
        createdAt: now,
      };

      tx.set(invitationRef, updated);
      tx.create(auditRef, audit);

      return projectAdminInvitation(updated);
    }
  );
}

export async function renewAdminEventInvitation(
  idToken: string,
  eventId: string,
  invitationId: string,
  expiresAtMs: unknown
): Promise<CreateInvitationResult> {
  const context = await requireEventAdmin(
    idToken,
    'event:manage_participants'
  );

  ensure(
    validId(eventId) &&
      isValidEventInvitationId(invitationId) &&
      typeof expiresAtMs === 'number' &&
      Number.isSafeInteger(expiresAtMs) &&
      expiresAtMs > 0 &&
      expiresAtMs <= 253402300799999,
    'INVALID_INVITATION_REQUEST'
  );

  const { adminDb } = getFirebaseAdmin();

  const eventRef = adminDb
    .collection(EVENT_COLLECTIONS.events)
    .doc(eventId);

  const invitationRef = adminDb
    .collection(EVENT_COLLECTIONS.invitations)
    .doc(invitationId);

  const auditRef = adminDb
    .collection(EVENT_COLLECTIONS.auditLogs)
    .doc();

  return adminDb.runTransaction(
    async tx => {
      await assertCurrentEventAdmin(
        tx,
        context,
        idToken
      );

      const [eventSnap, invitationSnap] =
        await tx.getAll(
          eventRef,
          invitationRef
        );

      ensure(
        eventSnap.exists &&
          invitationSnap.exists,
        'INVITATION_NOT_FOUND'
      );

      const event =
        eventSnap.data() as EventRecord;

      const invitation =
        invitationSnap.data() as EventInvitation;

      assertInvitationEventOwnership(
        event,
        eventId
      );

      assertManagedInvitation(
        invitation,
        eventId,
        invitationId
      );

      const now = Timestamp.now();
      const nowMs = now.toMillis();

      ensure(
        (
          invitation.status === 'revoked' ||
          invitation.status === 'expired' ||
          (
            invitation.status === 'pending' &&
            invitation.expiresAt.toMillis() <= nowMs
          )
        ) &&
          invitation.acceptedAt === null &&
          invitation.acceptedByUid === null &&
          invitation.orderId === null &&
          invitation.registrationId === null &&
          invitation.ticketId === null,
        'INVITATION_STATUS_CONFLICT'
      );

      ensure(
        (
          event.status === 'published' ||
          event.status === 'ongoing'
        ) &&
          event.cancelledAt === null &&
          event.endsAt.toMillis() > nowMs &&
          (
            event.registrationAccess === 'invite_only' ||
            event.registrationAccess ===
              'public_and_invitation'
          ),
        'INVITATION_NOT_AVAILABLE'
      );

      const settings =
        event.invitationSettings;

      ensure(
        settings?.enabled === true &&
          settings.allowComplimentary === true &&
          Number.isSafeInteger(
            settings.maxAcceptedInvitations
          ) &&
          settings.maxAcceptedInvitations > 0 &&
          Number.isSafeInteger(
            settings.acceptedInvitationCount
          ) &&
          settings.acceptedInvitationCount >= 0 &&
          settings.acceptedInvitationCount <
            settings.maxAcceptedInvitations,
        'INVITATION_CAPACITY_EXHAUSTED'
      );

      ensure(
        validId(invitation.ticketTypeId),
        'INVITATION_TICKET_UNAVAILABLE'
      );

      const ticketRef = adminDb
        .collection(EVENT_COLLECTIONS.ticketTypes)
        .doc(invitation.ticketTypeId);

      const inventoryRef = adminDb
        .collection(EVENT_COLLECTIONS.inventory)
        .doc(invitation.ticketTypeId);

      const [ticketSnap, inventorySnap] =
        await tx.getAll(
          ticketRef,
          inventoryRef
        );

      ensure(
        ticketSnap.exists &&
          inventorySnap.exists,
        'INVITATION_TICKET_UNAVAILABLE'
      );

      const ticket =
        ticketSnap.data() as EventTicketType;

      const inventory =
        inventorySnap.data() as EventTicketInventory;

      ensure(
        ticket.schemaVersion === EVENT_SCHEMA_VERSION &&
          ticket.eventId === eventId &&
          ticket.ticketTypeId === invitation.ticketTypeId &&
          ticket.attendanceMode === invitation.attendanceMode &&
          ticket.status === 'active' &&
          ticket.access === 'invite_only' &&
          ticket.pricingType === 'free' &&
          ticket.price.usdAmountMinor === 0 &&
          ticket.price.bdtAmountMinor === 0 &&
          ticket.maxPerOrder === 1 &&
          isAttendanceModeAllowed(
            event.mode,
            ticket.attendanceMode
          ) &&
          inventory.eventId === eventId &&
          inventory.ticketTypeId === ticket.ticketTypeId &&
          isValidInventoryCounters(inventory) &&
          inventory.reservedQuantity +
            inventory.issuedQuantity <
            inventory.capacity,
        'INVITATION_TICKET_UNAVAILABLE'
      );

      const expiryLimit = Math.min(
        event.endsAt.toMillis(),

        event.registrationClosesAt?.toMillis() ??
          Number.MAX_SAFE_INTEGER,

        ticket.salesEndAt?.toMillis() ??
          Number.MAX_SAFE_INTEGER
      );

      const earliestAcceptance = Math.max(
        Date.now(),

        event.registrationOpensAt?.toMillis() ??
          nowMs,

        ticket.salesStartAt?.toMillis() ??
          nowMs
      );

      ensure(
        expiresAtMs > earliestAcceptance &&
          expiresAtMs <= expiryLimit,
        'INVITATION_EXPIRY_INVALID'
      );

      ensure(
        Number.isSafeInteger(invitation.tokenVersion) &&
          invitation.tokenVersion >= 1 &&
          invitation.tokenVersion <
            Number.MAX_SAFE_INTEGER,
        'INVITATION_STATUS_CONFLICT'
      );

      const tokenVersion =
        invitation.tokenVersion + 1;

      const token = deriveEventInvitationToken(
        invitationId,
        tokenVersion
      );

      const updated: EventInvitation = {
        ...invitation,

        status: 'pending',

        tokenVersion,

        tokenHash:
          hashEventInvitationToken(token),

        expiresAt:
          Timestamp.fromMillis(expiresAtMs),

        revokedByUid: null,
        revokedAt: null,
        revocationReason: null,

        updatedAt: now,
      };

      const audit: EventAuditLog = {
        auditId: auditRef.id,
        eventId,
        action: 'invitation_renewed',
        actorType: 'admin',
        actorUid: context.uid,
        resourceType: 'event_invitation',
        resourceId: invitationId,
        reason: null,
        createdAt: now,
      };

      // Renewed invitations receive a new
      // token version and deterministic email job.

      queueEventInvitationEmail(
        tx,
        invitationRef.firestore,
        {
          event,
          ticket,
          invitation: updated,
          trigger: 'invitation_renewed',
          now,
        }
      );

      tx.set(invitationRef, updated);
      tx.create(auditRef, audit);

      return {
        invitation:
          projectAdminInvitation(updated),

        invitationUrl:
          'https://tabstartup.com/events/invitations/' +
          invitationId +
          '#token=' +
          token,
      };
    }
  );
}
