import 'server-only';

import {
  isEventRegistrationEnabled,
} from '@/lib/event-registration-access';

import {
  isValidInventoryCounters,
} from '@/lib/event-validation';

import {
  Timestamp,
  type Transaction,
} from 'firebase-admin/firestore';

import {
  buildTicketConfiguration,
  assertTicketAllocation,
  type ManagedTicketConfiguration,
} from '@/lib/event-ticket-management-input';

import {
  validateEventPublication,
} from '@/lib/event-lifecycle';

import {
  buildPublicEventProjection,
  buildPublicTicketProjection,
} from '@/lib/event-public-projection';

import {
  assertAdminEventTransition,
} from '@/services/event-authorization.service';

import {
  type EventTicketType,
  type EventTicketInventory,
} from '@/lib/event-types';

import { getFirebaseAdmin } from '@/firebase/admin';

import {
  EVENT_COLLECTIONS,
  EVENT_SCHEMA_VERSION,
  type EventRecord,
  type EventPrivateDetails,
  type EventAuditLog,
} from '@/lib/event-types';

import {
  isValidEventDocumentId,
} from '@/lib/event-validation';

import {
  requireEventAdmin,
  evaluateEventManagementAccess,
  type EventAdminContext,
  type EventManagementPermission,
} from '@/services/event-authorization.service';

import {
  buildEventDraft,
} from '@/lib/event-management-input';

export type EventManagementErrorCode =
  | 'EVENT_NOT_FOUND'
  | 'INVALID_EVENT_ID'
  | 'EVENT_ACCESS_DENIED'
  | 'EVENT_SLUG_ALREADY_EXISTS'
  | 'EVENT_DATA_INVALID'
  | 'EVENT_PRIVATE_DETAILS_MISSING'
  | 'EVENT_STATUS_CONFLICT'
  | 'INVALID_REGISTRATION_STATUS'
  | 'REGISTRATION_CONTROL_DISABLED'
  | 'REGISTRATION_WINDOW_UNAVAILABLE'
  | 'EVENT_ACCOUNT_CHANGED'
  | 'EVENT_PUBLICATION_NOT_READY'
  | 'EVENT_TICKET_DATA_INVALID'
  | 'EVENT_VISIBILITY_NOT_SUPPORTED';

export class EventManagementError extends Error {
  constructor(
    public readonly code: EventManagementErrorCode
  ) {
    super(code);
    this.name = 'EventManagementError';
  }
}

export interface ManagedEvent {
  event: EventRecord;
  privateDetails: EventPrivateDetails;
}

function validateEventId(eventId: string): void {
  if (
    !isValidEventDocumentId(eventId) ||
    /^__.*__$/.test(eventId)
  ) {
    throw new EventManagementError(
      'INVALID_EVENT_ID'
    );
  }
}

function assertManagedEvent(
  context: EventAdminContext,
  eventId: string,
  event: EventRecord,
  permission: EventManagementPermission
): void {
  if (
    !event ||
    event.eventId !== eventId ||
    event.schemaVersion !== EVENT_SCHEMA_VERSION
  ) {
    throw new EventManagementError(
      'EVENT_DATA_INVALID'
    );
  }

  const decision = evaluateEventManagementAccess(
    context.account,
    permission,
    event
  );

  if (!decision.allowed) {
    throw new EventManagementError(
      'EVENT_ACCESS_DENIED'
    );
  }
}

/**
 * Creates an official TabStartup event draft.
 *
 * The caller cannot choose the owner, event status,
 * audit actor, event ID or creation timestamps.
 *
 * Canonical event, slug claim, private details
 * and audit log are committed atomically.
 */
export async function createOfficialEvent(
  idToken: string,
  input: unknown
): Promise<ManagedEvent> {
  const context = await requireEventAdmin(
    idToken,
    'event:create'
  );

  const eventRef = getFirebaseAdmin().adminDb
    .collection(EVENT_COLLECTIONS.events)
    .doc();

  const eventId = eventRef.id;

  const {
    event,
    privateDetails,
  } = buildEventDraft(
    input,
    eventId,
    context.uid,
    Date.now()
  );

  assertManagedEvent(
    context,
    eventId,
    event,
    'event:create'
  );

  const slugRef = getFirebaseAdmin().adminDb
    .collection(EVENT_COLLECTIONS.slugs)
    .doc(event.slug);

  const privateRef = getFirebaseAdmin().adminDb
    .collection(EVENT_COLLECTIONS.privateDetails)
    .doc(eventId);

  const auditRef = getFirebaseAdmin().adminDb
    .collection(EVENT_COLLECTIONS.auditLogs)
    .doc();

  await getFirebaseAdmin().adminDb.runTransaction(async tx => {
    const slugSnapshot = await tx.get(slugRef);

    await assertCurrentEventAdmin(tx, context, idToken);

    if (slugSnapshot.exists) {
      throw new EventManagementError(
        'EVENT_SLUG_ALREADY_EXISTS'
      );
    }

    const audit: EventAuditLog = {
      auditId: auditRef.id,
      eventId,
      action: 'event_created',
      actorType: 'admin',
      actorUid: context.uid,
      resourceType: 'event',
      resourceId: eventId,
      reason: null,
      createdAt: Timestamp.now(),
    };

    tx.create(eventRef, event);

    tx.create(privateRef, privateDetails);

    tx.create(slugRef, {
      slug: event.slug,
      eventId,
      organizerType: event.organizerType,
      organizerId: event.organizerId,
      schemaVersion: EVENT_SCHEMA_VERSION,
      createdAt: event.createdAt,
      updatedAt: event.updatedAt,
    });

    tx.create(auditRef, audit);
  });

  return {
    event,
    privateDetails,
  };
}

/**
 * Returns canonical event data only after
 * server-side administrative authorization.
 */
export async function getManagedEvent(
  idToken: string,
  eventId: string
): Promise<ManagedEvent> {
  validateEventId(eventId);

  const context = await requireEventAdmin(
    idToken,
    'event:read'
  );

  const eventRef = getFirebaseAdmin().adminDb
    .collection(EVENT_COLLECTIONS.events)
    .doc(eventId);

  const privateRef = getFirebaseAdmin().adminDb
    .collection(EVENT_COLLECTIONS.privateDetails)
    .doc(eventId);

  return getFirebaseAdmin().adminDb.runTransaction(async tx => {
    await assertCurrentEventAdmin(tx, context, idToken);

    const [
      eventSnapshot,
      privateSnapshot,
    ] = await tx.getAll(
      eventRef,
      privateRef
    );

    if (!eventSnapshot.exists) {
      throw new EventManagementError(
        'EVENT_NOT_FOUND'
      );
    }

    const event =
      eventSnapshot.data() as EventRecord;

    assertManagedEvent(
      context,
      eventId,
      event,
      'event:read'
    );

    if (!privateSnapshot.exists) {
      throw new EventManagementError(
        'EVENT_PRIVATE_DETAILS_MISSING'
      );
    }

    const privateDetails =
      privateSnapshot.data() as EventPrivateDetails;

    if (privateDetails.eventId !== eventId) {
      throw new EventManagementError(
        'EVENT_DATA_INVALID'
      );
    }

    return {
      event,
      privateDetails,
    };
  });
}

/**
 * Lists official TabStartup events.
 *
 * Private meeting information is never included
 * in the event listing.
 */
export async function listOfficialEvents(
  idToken: string,
  requestedLimit = 50
): Promise<EventRecord[]> {
  const context = await requireEventAdmin(
    idToken,
    'event:read'
  );

  const limit =
    Number.isSafeInteger(requestedLimit)
      ? Math.max(
          1,
          Math.min(requestedLimit, 100)
        )
      : 50;

  const query = getFirebaseAdmin().adminDb
    .collection(EVENT_COLLECTIONS.events)
    .where('organizerType', '==', 'platform')
    .where('organizerId', '==', 'tabstartup')
    .limit(limit);

  const snapshot =
    await getFirebaseAdmin().adminDb.runTransaction(async tx => {
      await assertCurrentEventAdmin(tx, context, idToken);

      return tx.get(query);
    }, { readOnly: true });

  const events = snapshot.docs.map(item => {
    const event = item.data() as EventRecord;

    assertManagedEvent(
      context,
      item.id,
      event,
      'event:read'
    );

    return event;
  });

  return events.sort(
    (a, b) =>
      b.createdAt.toMillis() -
      a.createdAt.toMillis()
  );
}


/**
 * Updates an official event while it is a draft.
 *
 * Published event modifications require a separate
 * registration-aware workflow.
 */

/**
 * Require the exact event revision reviewed
 * by the administrator before a mutation.
 */
function assertExpectedEventVersion(
  event: EventRecord,
  expectedUpdatedAtMs: number
): void {
  if (
    !Number.isSafeInteger(expectedUpdatedAtMs) ||
    expectedUpdatedAtMs <= 0 ||
    event.updatedAt.toMillis() !== expectedUpdatedAtMs
  ) {
    throw new EventManagementError(
      'EVENT_STATUS_CONFLICT'
    );
  }
}

/**
 * Ensure every successful draft mutation
 * advances the event revision.
 */
function nextEventRevision(
  event: EventRecord
): Timestamp {
  const previous =
    event.updatedAt.toMillis();

  if (
    !Number.isSafeInteger(previous) ||
    previous <= 0 ||
    previous >= 253402300799999
  ) {
    throw new EventManagementError(
      'EVENT_DATA_INVALID'
    );
  }

  return Timestamp.fromMillis(
    Math.max(
      Date.now(),
      previous + 1
    )
  );
}

export async function updateOfficialEvent(
  idToken: string,
  eventId: string,
  input: unknown,
  expectedUpdatedAtMs: number
): Promise<ManagedEvent> {
  validateEventId(eventId);

  const context = await requireEventAdmin(
    idToken,
    'event:update'
  );

  const eventRef = getFirebaseAdmin().adminDb
    .collection(EVENT_COLLECTIONS.events)
    .doc(eventId);

  const privateRef = getFirebaseAdmin().adminDb
    .collection(EVENT_COLLECTIONS.privateDetails)
    .doc(eventId);

  const auditRef = getFirebaseAdmin().adminDb
    .collection(EVENT_COLLECTIONS.auditLogs)
    .doc();

  return getFirebaseAdmin().adminDb.runTransaction(async tx => {
    const [
      eventSnapshot,
      privateSnapshot,
    ] = await tx.getAll(
      eventRef,
      privateRef
    );

    if (!eventSnapshot.exists) {
      throw new EventManagementError(
        'EVENT_NOT_FOUND'
      );
    }

    const current =
      eventSnapshot.data() as EventRecord;

    assertManagedEvent(
      context,
      eventId,
      current,
      'event:update'
    );

    assertExpectedEventVersion(
      current,
      expectedUpdatedAtMs
    );

    if (current.status !== 'draft') {
      throw new EventManagementError(
        'EVENT_STATUS_CONFLICT'
      );
    }

    if (!privateSnapshot.exists) {
      throw new EventManagementError(
        'EVENT_PRIVATE_DETAILS_MISSING'
      );
    }

    const currentPrivate =
      privateSnapshot.data() as EventPrivateDetails;

    if (currentPrivate.eventId !== eventId) {
      throw new EventManagementError(
        'EVENT_DATA_INVALID'
      );
    }

    await assertCurrentEventAdmin(tx, context, idToken);

    const draft = buildEventDraft(
      input,
      eventId,
      context.uid,
      Date.now()
    );

    // Keep the slug stable after initial creation.
    if (draft.event.slug !== current.slug) {
      throw new EventManagementError(
        'EVENT_STATUS_CONFLICT'
      );
    }

    const slugRef = getFirebaseAdmin().adminDb
      .collection(EVENT_COLLECTIONS.slugs)
      .doc(current.slug);

    const slugSnapshot = await tx.get(slugRef);

    if (
      !slugSnapshot.exists ||
      slugSnapshot.data()?.eventId !== eventId ||
      slugSnapshot.data()?.slug !== current.slug
    ) {
      throw new EventManagementError(
        'EVENT_DATA_INVALID'
      );
    }

    const event: EventRecord = {
      ...draft.event,

      organizerType: 'platform',
      organizerId: 'tabstartup',

      organizerName: current.organizerName,
      organizerLogoUrl: current.organizerLogoUrl,

      speakers: current.speakers,
      sponsors: current.sponsors,
      agenda: current.agenda,

      createdByUid: current.createdByUid,
      createdAt: current.createdAt,

      updatedByUid: context.uid,
      updatedAt: nextEventRevision(current),
    };

    const configurations =
      await loadTicketConfigurations(tx, eventId);

    assertTicketAllocation(
      event,
      configurations
    );

    assertTicketSchedules(
      event,
      configurations
    );

    const privateDetails: EventPrivateDetails = {
      ...draft.privateDetails,
      createdAt: currentPrivate.createdAt,
      updatedAt: event.updatedAt,
    };

    const audit: EventAuditLog = {
      auditId: auditRef.id,
      eventId,
      action: 'event_updated',
      actorType: 'admin',
      actorUid: context.uid,
      resourceType: 'event',
      resourceId: eventId,
      reason: null,
      createdAt: event.updatedAt,
    };

    tx.set(eventRef, event);
    tx.set(privateRef, privateDetails);

    tx.update(slugRef, {
      updatedAt: event.updatedAt,
    });

    tx.create(auditRef, audit);

    return {
      event,
      privateDetails,
    };
  });
}


/**
 * Load all ticket and inventory records inside
 * the same transaction as the canonical event.
 */

function assertTicketSchedules(
  event: EventRecord,
  configurations: readonly ManagedTicketConfiguration[]
): void {
  const eventEndMs = event.endsAt.toMillis();

  for (const { ticketType } of configurations) {
    const startMs =
      ticketType.salesStartAt?.toMillis() ?? null;

    const endMs =
      ticketType.salesEndAt?.toMillis() ?? null;

    if (
      (
        startMs !== null &&
        (
          !Number.isFinite(startMs) ||
          startMs >= eventEndMs
        )
      ) ||
      (
        endMs !== null &&
        (
          !Number.isFinite(endMs) ||
          endMs > eventEndMs
        )
      ) ||
      (
        startMs !== null &&
        endMs !== null &&
        startMs >= endMs
      )
    ) {
      throw new EventManagementError(
        'EVENT_TICKET_DATA_INVALID'
      );
    }
  }
}

async function loadTicketConfigurations(
  tx: Transaction,
  eventId: string
): Promise<ManagedTicketConfiguration[]> {
  const ticketQuery = getFirebaseAdmin().adminDb
    .collection(EVENT_COLLECTIONS.ticketTypes)
    .where('eventId', '==', eventId)
    .limit(51);

  const inventoryQuery = getFirebaseAdmin().adminDb
    .collection(EVENT_COLLECTIONS.inventory)
    .where('eventId', '==', eventId)
    .limit(51);

  const ticketSnapshot = await tx.get(ticketQuery);
  const inventorySnapshot = await tx.get(inventoryQuery);

  if (
    ticketSnapshot.size > 50 ||
    inventorySnapshot.size > 50 ||
    ticketSnapshot.size !== inventorySnapshot.size
  ) {
    throw new EventManagementError(
      'EVENT_TICKET_DATA_INVALID'
    );
  }

  const inventoryMap = new Map(
    inventorySnapshot.docs.map(doc => [
      doc.id,
      doc.data() as EventTicketInventory,
    ])
  );

  return ticketSnapshot.docs.map(doc => {
    const ticketType =
      doc.data() as EventTicketType;

    const inventory = inventoryMap.get(doc.id);

    if (
      !inventory ||
      ticketType.ticketTypeId !== doc.id ||
      ticketType.eventId !== eventId ||
      ticketType.schemaVersion !== EVENT_SCHEMA_VERSION ||
      inventory.eventId !== eventId ||
      inventory.ticketTypeId !== doc.id
    ) {
      throw new EventManagementError(
        'EVENT_TICKET_DATA_INVALID'
      );
    }

    return {
      ticketType,
      inventory,
    };
  });
}

/**
 * Recheck administrative account state before
 * committing a privileged event mutation.
 *
 * Protected UID access follows existing
 * TabStartup account authorization policy.
 */
export async function assertCurrentEventAdmin(
  tx: Transaction,
  context: EventAdminContext,
  idToken: string
): Promise<void> {
  const decoded = await getFirebaseAdmin()
    .adminAuth
    .verifyIdToken(idToken.trim(), true)
    .catch(() => {
      throw new EventManagementError(
        'EVENT_ACCOUNT_CHANGED'
      );
    });

  if (decoded.uid !== context.uid) {
    throw new EventManagementError(
      'EVENT_ACCOUNT_CHANGED'
    );
  }

  const identityRef = getFirebaseAdmin().adminDb
    .collection('accountIdentities')
    .doc(context.uid);

  const userRef = getFirebaseAdmin().adminDb
    .collection('users')
    .doc(context.uid);

  const [identitySnap, userSnap] =
    await tx.getAll(identityRef, userRef);

  const identity = identitySnap.data();
  const user = userSnap.data();

  if (
    identitySnap.exists &&
    (
      !identity ||
      identity.uid !== context.uid ||
      identity.schemaVersion !== 1 ||
      identity.status !== 'active'
    )
  ) {
    throw new EventManagementError(
      'EVENT_ACCOUNT_CHANGED'
    );
  }

  if (
    userSnap.exists &&
    (
      !user ||
      (
        user.uid !== undefined &&
        user.uid !== context.uid
      ) ||
      (
        user.status !== undefined &&
        user.status !== 'active'
      )
    )
  ) {
    throw new EventManagementError(
      'EVENT_ACCOUNT_CHANGED'
    );
  }

  const roles: unknown[] =
    Array.isArray(user?.roles)
      ? user.roles
      : [];

  const adminRoles = ['admin', 'super_admin'];

  const hasAdminRole =
    adminRoles.includes(user?.role) ||
    roles.some(
      role =>
        typeof role === 'string' &&
        adminRoles.includes(role)
    );

  const protectedAdmin =
    context.uid === 'T2JnkPYdsoZGO8krUqcP3T5bvg62' ||
    (
      decoded.email_verified === true &&
      decoded.email === 'shahmubaruk05@gmail.com'
    );

  if (
    !protectedAdmin &&
    !(userSnap.exists && hasAdminRole)
  ) {
    throw new EventManagementError(
      'EVENT_ACCOUNT_CHANGED'
    );
  }
}

/**
 * Admin-only ticket configuration read.
 */
export async function listManagedEventTickets(
  idToken: string,
  eventId: string
): Promise<ManagedTicketConfiguration[]> {
  validateEventId(eventId);

  const context = await requireEventAdmin(
    idToken,
    'event:manage_tickets'
  );

  const eventRef = getFirebaseAdmin().adminDb
    .collection(EVENT_COLLECTIONS.events)
    .doc(eventId);

  return getFirebaseAdmin().adminDb.runTransaction(async tx => {
    await assertCurrentEventAdmin(tx, context, idToken);

    const snapshot = await tx.get(eventRef);

    if (!snapshot.exists) {
      throw new EventManagementError(
        'EVENT_NOT_FOUND'
      );
    }

    const event = snapshot.data() as EventRecord;

    assertManagedEvent(
      context,
      eventId,
      event,
      'event:manage_tickets'
    );

    const configurations =
      await loadTicketConfigurations(tx, eventId);

    return configurations.sort(
      (a, b) =>
        a.ticketType.sortOrder -
        b.ticketType.sortOrder
    );
  });
}

/**
 * Replace the complete ticket configuration
 * of a draft event.
 *
 * Existing ticket activity must be zero.
 * No published ticket or payment can be changed.
 */
export async function replaceDraftEventTickets(
  idToken: string,
  eventId: string,
  input: unknown,
  expectedUpdatedAtMs: number
): Promise<ManagedTicketConfiguration[]> {
  validateEventId(eventId);

  const context = await requireEventAdmin(
    idToken,
    'event:manage_tickets'
  );

  if (
    !Array.isArray(input) ||
    input.length > 50
  ) {
    throw new EventManagementError(
      'EVENT_TICKET_DATA_INVALID'
    );
  }

  const eventRef = getFirebaseAdmin().adminDb
    .collection(EVENT_COLLECTIONS.events)
    .doc(eventId);

  const ticketCollection = getFirebaseAdmin().adminDb
    .collection(EVENT_COLLECTIONS.ticketTypes);

  const inventoryCollection = getFirebaseAdmin().adminDb
    .collection(EVENT_COLLECTIONS.inventory);

  const auditRef = getFirebaseAdmin().adminDb
    .collection(EVENT_COLLECTIONS.auditLogs)
    .doc();

  const newTicketRefs = input.map(
    () => ticketCollection.doc()
  );

  return getFirebaseAdmin().adminDb.runTransaction(async tx => {
    await assertCurrentEventAdmin(tx, context, idToken);

    const eventSnapshot = await tx.get(eventRef);

    if (!eventSnapshot.exists) {
      throw new EventManagementError(
        'EVENT_NOT_FOUND'
      );
    }

    const event =
      eventSnapshot.data() as EventRecord;

    assertManagedEvent(
      context,
      eventId,
      event,
      'event:manage_tickets'
    );

    assertExpectedEventVersion(
      event,
      expectedUpdatedAtMs
    );

    if (event.status !== 'draft') {
      throw new EventManagementError(
        'EVENT_STATUS_CONFLICT'
      );
    }

    const existing =
      await loadTicketConfigurations(tx, eventId);

    assertTicketAllocation(event, existing);

    const now = Timestamp.now();

    const configurations = input.map(
      (value, index) =>
        buildTicketConfiguration(
          event,
          newTicketRefs[index].id,
          value,
          now.toMillis()
        )
    );

    assertTicketAllocation(event, configurations);
    assertTicketSchedules(event, configurations);

    for (const item of existing) {
      const id = item.ticketType.ticketTypeId;

      tx.delete(ticketCollection.doc(id));
      tx.delete(inventoryCollection.doc(id));
    }

    for (const item of configurations) {
      const id = item.ticketType.ticketTypeId;

      tx.create(
        ticketCollection.doc(id),
        item.ticketType
      );

      tx.create(
        inventoryCollection.doc(id),
        item.inventory
      );
    }

    // Every ticket mutation also writes the parent
    // event, serializing edits and publishing.
    tx.update(eventRef, {
      updatedAt: nextEventRevision(event),
      updatedByUid: context.uid,
    });

    const audit: EventAuditLog = {
      auditId: auditRef.id,
      eventId,
      action: 'ticket_type_updated',
      actorType: 'admin',
      actorUid: context.uid,
      resourceType: 'ticket_configuration',
      resourceId: eventId,
      reason: null,
      createdAt: now,
    };

    tx.create(auditRef, audit);

    return configurations;
  });
}

/**
 * Atomically publish an official public event
 * and all eligible public ticket projections.
 */
export async function publishOfficialEvent(
  idToken: string,
  eventId: string,
  expectedUpdatedAtMs: number
): Promise<EventRecord> {
  validateEventId(eventId);

  const context = await requireEventAdmin(
    idToken,
    'event:publish'
  );

  const eventRef = getFirebaseAdmin().adminDb
    .collection(EVENT_COLLECTIONS.events)
    .doc(eventId);

  const publicRef = getFirebaseAdmin().adminDb
    .collection(EVENT_COLLECTIONS.publicEvents)
    .doc(eventId);

  const privateRef = getFirebaseAdmin().adminDb
    .collection(EVENT_COLLECTIONS.privateDetails)
    .doc(eventId);

  const auditRef = getFirebaseAdmin().adminDb
    .collection(EVENT_COLLECTIONS.auditLogs)
    .doc();

  return getFirebaseAdmin().adminDb.runTransaction(async tx => {
    await assertCurrentEventAdmin(tx, context, idToken);

    const [
      eventSnapshot,
      privateSnapshot,
      publicSnapshot,
    ] = await tx.getAll(
      eventRef,
      privateRef,
      publicRef
    );

    if (!eventSnapshot.exists) {
      throw new EventManagementError(
        'EVENT_NOT_FOUND'
      );
    }

    const current =
      eventSnapshot.data() as EventRecord;

    assertManagedEvent(
      context,
      eventId,
      current,
      'event:publish'
    );

    assertExpectedEventVersion(
      current,
      expectedUpdatedAtMs
    );

    if (
      current.status !== 'draft' ||
      publicSnapshot.exists
    ) {
      throw new EventManagementError(
        'EVENT_STATUS_CONFLICT'
      );
    }

    if (current.visibility !== 'public') {
      throw new EventManagementError(
        'EVENT_VISIBILITY_NOT_SUPPORTED'
      );
    }

    if (
      !privateSnapshot.exists ||
      privateSnapshot.data()?.eventId !== eventId
    ) {
      throw new EventManagementError(
        'EVENT_PRIVATE_DETAILS_MISSING'
      );
    }

    const slugSnapshot = await tx.get(
      getFirebaseAdmin().adminDb
        .collection(EVENT_COLLECTIONS.slugs)
        .doc(current.slug)
    );

    if (
      !slugSnapshot.exists ||
      slugSnapshot.data()?.eventId !== eventId ||
      slugSnapshot.data()?.slug !== current.slug
    ) {
      throw new EventManagementError(
        'EVENT_DATA_INVALID'
      );
    }

    const configurations =
      await loadTicketConfigurations(tx, eventId);

    const publicTicketCollection = getFirebaseAdmin().adminDb
      .collection(EVENT_COLLECTIONS.publicTicketTypes);

    const existingPublicTickets = await tx.get(
      publicTicketCollection
        .where('eventId', '==', eventId)
        .limit(51)
    );

    if (!existingPublicTickets.empty) {
      throw new EventManagementError(
        'EVENT_DATA_INVALID'
      );
    }

    assertTicketAllocation(
      current,
      configurations
    );

    assertTicketSchedules(
      current,
      configurations
    );

    assertAdminEventTransition(
      context,
      current,
      'published'
    );

    const now = Timestamp.now();
    const nowMs = now.toMillis();

    const readiness = validateEventPublication(
      current,
      configurations,
      nowMs
    );

    if (!readiness.ready) {
      throw new EventManagementError(
        'EVENT_PUBLICATION_NOT_READY'
      );
    }

    const published: EventRecord = {
      ...current,
      status: 'published',
      registrationStatus: 'not_open',
      approvedByUid: context.uid,
      approvedAt: now,
      publishedByUid: context.uid,
      publishedAt: now,
      updatedByUid: context.uid,
      updatedAt: nextEventRevision(current),
    };

    const publicEvent =
      buildPublicEventProjection(
        published,
        nowMs
      );

    if (!publicEvent) {
      throw new EventManagementError(
        'EVENT_PUBLICATION_NOT_READY'
      );
    }

    const publicTickets = configurations
      .map(item =>
        buildPublicTicketProjection(
          published,
          item.ticketType,
          item.inventory,
          nowMs
        )
      )
      .filter(
        (item): item is NonNullable<typeof item> =>
          item !== null
      );

    if (publicTickets.length === 0) {
      throw new EventManagementError(
        'EVENT_PUBLICATION_NOT_READY'
      );
    }

    tx.set(eventRef, published);
    tx.create(publicRef, publicEvent);

    for (const ticket of publicTickets) {
      tx.create(
        publicTicketCollection.doc(
          ticket.ticketTypeId
        ),
        ticket
      );
    }

    const audit: EventAuditLog = {
      auditId: auditRef.id,
      eventId,
      action: 'event_published',
      actorType: 'admin',
      actorUid: context.uid,
      resourceType: 'event',
      resourceId: eventId,
      reason: null,
      createdAt: now,
    };

    tx.create(auditRef, audit);

    return published;
  });
}


/**
 * Manage registration for a published official event.
 *
 * Canonical status, public event, public tickets and
 * audit log are updated in one transaction.
 *
 * Existing orders, payments, registrations and
 * inventory counters are never modified here.
 */
export async function updateOfficialEventRegistration(
  idToken: string,
  eventId: string,
  input: unknown,
  expectedUpdatedAtMs: number
): Promise<EventRecord> {
  validateEventId(eventId);

  const context = await requireEventAdmin(
    idToken,
    'event:manage_tickets'
  );

  if (
    !input ||
    typeof input !== 'object' ||
    Array.isArray(input)
  ) {
    throw new EventManagementError(
      'INVALID_REGISTRATION_STATUS'
    );
  }

  const body =
    input as Record<string, unknown>;

  const target = body.registrationStatus;

  if (
    Object.keys(body).length !== 1 ||
    (
      target !== 'open' &&
      target !== 'paused' &&
      target !== 'closed'
    )
  ) {
    throw new EventManagementError(
      'INVALID_REGISTRATION_STATUS'
    );
  }

  const { adminDb } = getFirebaseAdmin();

  const eventRef = adminDb
    .collection(EVENT_COLLECTIONS.events)
    .doc(eventId);

  const publicRef = adminDb
    .collection(EVENT_COLLECTIONS.publicEvents)
    .doc(eventId);

  const auditRef = adminDb
    .collection(EVENT_COLLECTIONS.auditLogs)
    .doc();

  const publicTicketCollection = adminDb
    .collection(EVENT_COLLECTIONS.publicTicketTypes);

  return adminDb.runTransaction(async tx => {
    await assertCurrentEventAdmin(
      tx,
      context,
      idToken
    );

    const [
      eventSnapshot,
      publicSnapshot,
    ] = await tx.getAll(
      eventRef,
      publicRef
    );

    if (!eventSnapshot.exists) {
      throw new EventManagementError(
        'EVENT_NOT_FOUND'
      );
    }

    const current =
      eventSnapshot.data() as EventRecord;

    assertManagedEvent(
      context,
      eventId,
      current,
      'event:manage_tickets'
    );

    assertExpectedEventVersion(
      current,
      expectedUpdatedAtMs
    );

    if (
      current.status !== 'published' &&
      current.status !== 'ongoing'
    ) {
      throw new EventManagementError(
        'EVENT_STATUS_CONFLICT'
      );
    }

    if (current.visibility !== 'public') {
      throw new EventManagementError(
        'EVENT_VISIBILITY_NOT_SUPPORTED'
      );
    }

    if (
      !publicSnapshot.exists ||
      publicSnapshot.data()?.eventId !== eventId ||
      publicSnapshot.data()?.slug !== current.slug
    ) {
      throw new EventManagementError(
        'EVENT_DATA_INVALID'
      );
    }

    const previous =
      current.registrationStatus;

    const allowed =
      (
        previous === 'not_open' &&
        (
          target === 'open' ||
          target === 'closed'
        )
      ) ||
      (
        previous === 'open' &&
        (
          target === 'paused' ||
          target === 'closed'
        )
      ) ||
      (
        previous === 'paused' &&
        (
          target === 'open' ||
          target === 'closed'
        )
      );

    if (!allowed) {
      throw new EventManagementError(
        'EVENT_STATUS_CONFLICT'
      );
    }

    const nowMs = Date.now();

    if (target === 'open') {
      if (!isEventRegistrationEnabled()) {
        throw new EventManagementError(
          'REGISTRATION_CONTROL_DISABLED'
        );
      }

      const eventEnd =
        current.endsAt?.toMillis();

      const registrationStart =
        current.registrationOpensAt?.toMillis()
          ?? null;

      const registrationEnd =
        current.registrationClosesAt?.toMillis()
          ?? null;

      if (
        !Number.isFinite(eventEnd) ||
        eventEnd <= nowMs ||
        (
          registrationStart !== null &&
          (
            !Number.isFinite(registrationStart) ||
            registrationStart >= eventEnd
          )
        ) ||
        (
          registrationEnd !== null &&
          (
            !Number.isFinite(registrationEnd) ||
            registrationEnd <= nowMs ||
            registrationEnd > eventEnd
          )
        ) ||
        (
          registrationStart !== null &&
          registrationEnd !== null &&
          registrationStart >= registrationEnd
        )
      ) {
        throw new EventManagementError(
          'REGISTRATION_WINDOW_UNAVAILABLE'
        );
      }
    }

    const configurations =
      await loadTicketConfigurations(
        tx,
        eventId
      );

    if (configurations.length === 0) {
      throw new EventManagementError(
        'EVENT_TICKET_DATA_INVALID'
      );
    }

    assertTicketSchedules(
      current,
      configurations
    );

    for (const { inventory } of configurations) {
      if (
        !isValidInventoryCounters(inventory)
      ) {
        throw new EventManagementError(
          'EVENT_TICKET_DATA_INVALID'
        );
      }
    }

    if (
      target === 'open' &&
      !configurations.some(
        item => item.ticketType.status === 'active'
      )
    ) {
      throw new EventManagementError(
        'EVENT_PUBLICATION_NOT_READY'
      );
    }

    const existingPublicTickets = await tx.get(
      publicTicketCollection
        .where('eventId', '==', eventId)
        .limit(51)
    );

    if (existingPublicTickets.size > 50) {
      throw new EventManagementError(
        'EVENT_TICKET_DATA_INVALID'
      );
    }

    const updated: EventRecord = {
      ...current,
      registrationStatus: target,
      updatedByUid: context.uid,
      updatedAt: nextEventRevision(current),
    };

    const publicEvent =
      buildPublicEventProjection(
        updated,
        nowMs
      );

    if (!publicEvent) {
      throw new EventManagementError(
        'EVENT_DATA_INVALID'
      );
    }

    const publicTickets = configurations
      .map(item =>
        buildPublicTicketProjection(
          updated,
          item.ticketType,
          item.inventory,
          nowMs
        )
      )
      .filter(
        (item): item is NonNullable<typeof item> =>
          item !== null
      );

    const existingById = new Map(
      existingPublicTickets.docs.map(doc => [
        doc.id,
        doc,
      ])
    );

    // Fail closed if projections are inconsistent.
    // Never overwrite another event's ticket document.

    if (
      publicTickets.length === 0 ||
      publicTickets.length !==
        existingPublicTickets.size
    ) {
      throw new EventManagementError(
        'EVENT_TICKET_DATA_INVALID'
      );
    }

    for (const ticket of publicTickets) {
      const existing =
        existingById.get(ticket.ticketTypeId);

      if (
        !existing ||
        existing.data().eventId !== eventId ||
        existing.data().ticketTypeId !==
          ticket.ticketTypeId
      ) {
        throw new EventManagementError(
          'EVENT_TICKET_DATA_INVALID'
        );
      }
    }

    const action: EventAuditLog['action'] =
      target === 'closed'
        ? 'event_registration_closed'
        : target === 'paused'
          ? 'event_registration_paused'
          : previous === 'paused'
            ? 'event_registration_resumed'
            : 'event_registration_opened';

    const audit: EventAuditLog = {
      auditId: auditRef.id,
      eventId,
      action,
      actorType: 'admin',
      actorUid: context.uid,
      resourceType: 'event',
      resourceId: eventId,
      reason: previous + ' -> ' + target,
      createdAt: updated.updatedAt,
    };

    // All transaction reads are complete.

    tx.set(eventRef, updated);

    tx.set(publicRef, publicEvent);

    for (const ticket of publicTickets) {
      tx.set(
        publicTicketCollection.doc(
          ticket.ticketTypeId
        ),
        ticket
      );
    }

    tx.create(auditRef, audit);

    return updated;
  });
}
