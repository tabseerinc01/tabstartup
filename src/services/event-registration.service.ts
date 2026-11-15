import 'server-only';

import {
  createHash,
  timingSafeEqual,
} from 'node:crypto';

import {
  Timestamp,
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
  authenticateAccount,
} from '@/services/account-authorization.service';

import {
  EVENT_COLLECTIONS,
  EVENT_SCHEMA_VERSION,
  PLATFORM_EVENT_ORGANIZER_ID,
  type EventRecord,
  type EventTicketType,
  type EventTicketInventory,
  type EventRegistration,
  type EventRegistrationRequest,
  type EventReservation,
  type PersistedEventOrder,
  type EventAuditLog,
  type EventAuditAction,
} from '@/lib/event-types';

import {
  PAYMENT_COLLECTIONS,
  PAYMENT_SCHEMA_VERSION,
  type PaymentOrder,
  type PaymentRecord,
} from '@/lib/payment-types';

import {
  validateEventRegistrationInput,
} from '@/lib/event-registration-input';

import {
  buildEventRegistrationPlan,
  EventRegistrationError,
  type EventRegistrationErrorCode,
} from '@/lib/event-registration-policy';

import {
  isValidEventDocumentId,
  isValidInventoryCounters,
} from '@/lib/event-validation';

import {
  buildPublicTicketProjection,
} from '@/lib/event-public-projection';

import {
  requirePaymentProviderEnabled,
} from '@/services/payments/payment-provider.service';

import {
  getBkashManualConfiguration,
} from '@/services/payments/bkash-manual-provider.service';

import {
  issueConfirmedEventTickets,
} from '@/services/event-ticket-issuance.service';

import {
  buildRegistrationEmailJobs,
} from '@/services/email/event-email-scheduling.service';

import {
  queueEventEmailsSafely,
} from '@/services/email/event-email-outbox.service';

export interface RegistrationAccessContext {
  idToken: string | null;

  /**
   * Server-managed guest session secret.
   * Never accept an arbitrary body field as this secret.
   */
  guestSessionSecret: string | null;
}

export interface EventRegistrationResult {
  orderId: string;

  eventId: string;

  status:
    | 'confirmed'
    | 'awaiting_payment'
    | 'pending_verification'
    | 'paid'
    | 'fulfilled'
    | 'requires_review'
    | 'expired'
    | 'cancelled'
    | 'partially_refunded'
    | 'refunded';

  quantity: number;

  paymentRequired: boolean;

  currency: 'USD' | 'BDT' | null;

  provider:
    | 'tabedge'
    | 'bkash_manual'
    | null;

  totalAmountMinor: number;

  expiresAtMs: number | null;

  replayed: boolean;
}

function sha256(value: string): string {
  return createHash('sha256')
    .update(value, 'utf8')
    .digest('hex');
}

function sameHash(
  first: unknown,
  second: string
): boolean {
  if (
    typeof first !== 'string' ||
    !/^[a-f0-9]{64}$/.test(first) ||
    !/^[a-f0-9]{64}$/.test(second)
  ) {
    return false;
  }

  return timingSafeEqual(
    Buffer.from(first, 'hex'),
    Buffer.from(second, 'hex')
  );
}

function ensure(
  condition: unknown,
  code: EventRegistrationErrorCode
): asserts condition {
  if (!condition) {
    throw new EventRegistrationError(code);
  }
}

function resultFromOrder(
  order: PersistedEventOrder,
  replayed: boolean
): EventRegistrationResult {
  const validStatuses = [
    'awaiting_payment',
    'pending_verification',
    'paid',
    'fulfilled',
    'requires_review',
    'expired',
    'cancelled',
    'partially_refunded',
    'refunded',
  ] as const;

  ensure(
    validStatuses.some(
      status => status === order.status
    ),
    'REGISTRATION_DATA_INVALID'
  );

  ensure(
    typeof order.paymentRequired === 'boolean' &&
    Array.isArray(order.items) &&
    order.items.length === 1 &&
    Number.isSafeInteger(
      order.totalAmountMinor
    ) &&
    order.totalAmountMinor >= 0,
    'REGISTRATION_DATA_INVALID'
  );

  ensure(
    order.paymentRequired ||
    [
      'fulfilled',
      'paid',
      'cancelled',
      'requires_review',
    ].includes(order.status),
    'REGISTRATION_DATA_INVALID'
  );

  const status =
    !order.paymentRequired &&
    (
      order.status === 'fulfilled' ||
      order.status === 'paid'
    )
      ? 'confirmed'
      : order.status;

  ensure(
    status !== 'created',
    'REGISTRATION_DATA_INVALID'
  );

  return {
    orderId: order.orderId,

    eventId: order.eventId,

    status,

    quantity: order.items.reduce(
      (total, item) => total + item.quantity,
      0
    ),

    paymentRequired: order.paymentRequired,

    currency: order.currency,

    provider: order.provider,

    totalAmountMinor: order.totalAmountMinor,

    expiresAtMs:
      order.expiresAt?.toMillis() ?? null,

    replayed,
  };
}

export async function createEventRegistration(
  rawInput: unknown,
  access: RegistrationAccessContext
): Promise<EventRegistrationResult> {
  const input =
    validateEventRegistrationInput(rawInput);

  const { adminDb, adminAuth } =
    getFirebaseAdmin();

  let purchaserUid: string | null = null;

  let actorScope: string;

  if (access.idToken !== null) {
    const account = await authenticateAccount(
      access.idToken
    );

    ensure(
      account.identity.status === 'active',
      'ACCOUNT_ACCESS_DENIED'
    );

    purchaserUid = account.uid;

    actorScope = `account:${purchaserUid}`;
  } else {
    ensure(
      typeof access.guestSessionSecret === 'string' &&
      /^[a-f0-9]{64}$/.test(
        access.guestSessionSecret
      ),
      'UNAUTHENTICATED'
    );

    actorScope =
      `guest:${sha256(access.guestSessionSecret)}`;
  }

  const requestId = sha256(
    JSON.stringify([
      'event-registration-v1',
      actorScope,
      input.eventSlug,
      input.idempotencyKey,
    ])
  );

  const requestHash = sha256(
    JSON.stringify(input)
  );

  const requestRef = adminDb
    .collection(EVENT_COLLECTIONS.registrationRequests)
    .doc(requestId);

  const slugRef = adminDb
    .collection(EVENT_COLLECTIONS.slugs)
    .doc(input.eventSlug);

  const orderRef = adminDb
    .collection(EVENT_COLLECTIONS.orders)
    .doc();

  const reservationRef = adminDb
    .collection(EVENT_COLLECTIONS.reservations)
    .doc();

  const paymentOrderRef = adminDb
    .collection(PAYMENT_COLLECTIONS.orders)
    .doc();

  const paymentRef = adminDb
    .collection(PAYMENT_COLLECTIONS.payments)
    .doc();

  const registrationRefs = input.participants.map(
    () => adminDb
      .collection(EVENT_COLLECTIONS.registrations)
      .doc()
  );

  return adminDb.runTransaction(async tx => {
    // Recheck authenticated identity inside transaction.

    let verifiedEmail: string | null = null;

    if (purchaserUid !== null) {
      const decoded = await adminAuth
        .verifyIdToken(access.idToken!, true)
        .catch(() => {
          throw new EventRegistrationError(
            'UNAUTHENTICATED'
          );
        });

      ensure(
        decoded.uid === purchaserUid,
        'UNAUTHENTICATED'
      );

      const identityRef = adminDb
        .collection(ACCOUNT_IDENTITIES_COLLECTION)
        .doc(purchaserUid);

      const userRef = adminDb
        .collection('users')
        .doc(purchaserUid);

      const [identitySnap, userSnap] =
        await tx.getAll(identityRef, userRef);

      try {
        assertGlobalAccountNotSuspended(
          purchaserUid,
          identitySnap
        );
      } catch {
        throw new EventRegistrationError(
          'ACCOUNT_ACCESS_DENIED'
        );
      }

      const user = userSnap.data();

      ensure(
        identitySnap.exists || userSnap.exists,
        'ACCOUNT_ACCESS_DENIED'
      );

      ensure(
        !userSnap.exists ||
        (
          user &&
          (
            user.uid === undefined ||
            user.uid === purchaserUid
          ) &&
          (
            user.status === undefined ||
            user.status === 'active'
          )
        ),
        'ACCOUNT_ACCESS_DENIED'
      );

      ensure(
        decoded.email_verified === true &&
        typeof decoded.email === 'string',
        'ACCOUNT_ACCESS_DENIED'
      );

      verifiedEmail =
        decoded.email.trim().toLowerCase();

      ensure(
        input.purchaserEmail === verifiedEmail,
        'ACCOUNT_ACCESS_DENIED'
      );
    }

    // Idempotent request replay.

    const requestSnap = await tx.get(requestRef);

    if (requestSnap.exists) {
      const existing =
        requestSnap.data() as EventRegistrationRequest;

      ensure(
        existing.schemaVersion === EVENT_SCHEMA_VERSION &&
        existing.requestId === requestId &&
        existing.purchaserUid === purchaserUid &&
        sameHash(
          existing.requestHash,
          requestHash
        ) &&
        isValidEventDocumentId(existing.orderId),
        'REGISTRATION_REQUEST_CONFLICT'
      );

      const existingOrderSnap = await tx.get(
        adminDb
          .collection(EVENT_COLLECTIONS.orders)
          .doc(existing.orderId)
      );

      ensure(
        existingOrderSnap.exists,
        'REGISTRATION_DATA_INVALID'
      );

      const existingOrder =
        existingOrderSnap.data() as PersistedEventOrder;

      ensure(
        existingOrder.orderId === existing.orderId &&
        existingOrder.eventId === existing.eventId &&
        existingOrder.registrationRequestId === requestId &&
        existingOrder.purchaserUid === purchaserUid &&
        (
          purchaserUid !== null
            ? existingOrder.guestSessionHash === null
            : sameHash(
                existingOrder.guestSessionHash,
                sha256(
                  'event-order-guest-v1:' +
                  access.guestSessionSecret!
                )
              )
        ) &&
        existingOrder.purchaserEmail === input.purchaserEmail,
        'REGISTRATION_DATA_INVALID'
      );

      return resultFromOrder(
        existingOrder,
        true
      );
    }

    // Resolve canonical event identity.

    const slugSnap = await tx.get(slugRef);

    ensure(
      slugSnap.exists,
      'EVENT_NOT_FOUND'
    );

    const slugClaim = slugSnap.data();

    ensure(
      slugClaim &&
      slugClaim.schemaVersion === EVENT_SCHEMA_VERSION &&
      slugClaim.slug === input.eventSlug &&
      slugClaim.organizerType === 'platform' &&
      slugClaim.organizerId === PLATFORM_EVENT_ORGANIZER_ID &&
      isValidEventDocumentId(slugClaim.eventId) &&
      !/^__.*__$/.test(slugClaim.eventId),
      'EVENT_DATA_INVALID'
    );

    const eventId: string = slugClaim.eventId;

    const eventRef = adminDb
      .collection(EVENT_COLLECTIONS.events)
      .doc(eventId);

    const ticketRef = adminDb
      .collection(EVENT_COLLECTIONS.ticketTypes)
      .doc(input.ticketTypeId);

    const inventoryRef = adminDb
      .collection(EVENT_COLLECTIONS.inventory)
      .doc(input.ticketTypeId);

    const publicEventRef = adminDb
      .collection(EVENT_COLLECTIONS.publicEvents)
      .doc(eventId);

    const publicTicketRef = adminDb
      .collection(EVENT_COLLECTIONS.publicTicketTypes)
      .doc(input.ticketTypeId);

    const [
      eventSnap,
      ticketSnap,
      inventorySnap,
      publicEventSnap,
      publicTicketSnap,
    ] = await tx.getAll(
      eventRef,
      ticketRef,
      inventoryRef,
      publicEventRef,
      publicTicketRef
    );

    ensure(
      eventSnap.exists,
      'EVENT_NOT_FOUND'
    );

    ensure(
      ticketSnap.exists,
      'TICKET_NOT_FOUND'
    );

    ensure(
      inventorySnap.exists,
      'INVALID_EVENT_INVENTORY'
    );

    const event =
      eventSnap.data() as EventRecord;

    const ticket =
      ticketSnap.data() as EventTicketType;

    const inventory =
      inventorySnap.data() as EventTicketInventory;

    ensure(
      event.eventId === eventId,
      'EVENT_DATA_INVALID'
    );

    ensure(
      publicEventSnap.exists &&
      publicEventSnap.data()?.eventId === eventId &&
      publicEventSnap.data()?.slug === event.slug &&
      publicEventSnap.data()?.visibility === 'public' &&
      publicEventSnap.data()?.registrationStatus === 'open',
      'REGISTRATION_NOT_OPEN'
    );

    ensure(
      publicTicketSnap.exists &&
      publicTicketSnap.data()?.eventId === eventId &&
      publicTicketSnap.data()?.ticketTypeId === ticket.ticketTypeId,
      'TICKET_UNAVAILABLE'
    );

    const now = Timestamp.now();

    const plan = buildEventRegistrationPlan(
      event,
      ticket,
      inventory,
      input,
      purchaserUid,
      now
    );

    /**
     * Validate payment availability before
     * reserving inventory or creating orders.
     *
     * Free registration does not require
     * an enabled payment provider.
     */
    if (plan.payment.paymentRequired) {
      requirePaymentProviderEnabled(
        plan.payment.provider
      );

      if (
        plan.payment.provider === 'bkash_manual'
      ) {
        await getBkashManualConfiguration(
          tx,
          adminDb
        );
      }
    }

    const paid = plan.payment.paymentRequired;

    const nextInventory: EventTicketInventory = {
      eventId,

      ticketTypeId: ticket.ticketTypeId,

      capacity: inventory.capacity,

      reservedQuantity:
        inventory.reservedQuantity +
        (paid ? input.quantity : 0),

      issuedQuantity:
        inventory.issuedQuantity +
        (paid ? 0 : input.quantity),

      updatedAt: now,
    };

    ensure(
      isValidInventoryCounters(nextInventory),
      'INVALID_EVENT_INVENTORY'
    );

    const nextProjection =
      buildPublicTicketProjection(
        event,
        ticket,
        nextInventory,
        now.toMillis()
      );

    ensure(
      nextProjection !== null,
      'EVENT_DATA_INVALID'
    );

    const commonOrder = {
      orderId: orderRef.id,

      eventId,

      organizerType: 'platform' as const,

      organizerId: PLATFORM_EVENT_ORGANIZER_ID,

      purchaserUid,

      purchaserEmail: input.purchaserEmail,

      guestSessionHash:
        purchaserUid === null
          ? sha256(
              'event-order-guest-v1:' +
              access.guestSessionSecret!
            )
          : null,

      registrationRequestId: requestId,

      termsAcceptance: {
        acceptedAt: now,

        termsHash: sha256(event.terms),

        refundPolicyHash:
          sha256(event.refundPolicy),
      },

      items: [plan.item],

      reservationId: reservationRef.id,

      successfulPaymentId: null,

      expiresAt: plan.orderExpiresAt,

      paidAt: null,

      schemaVersion: EVENT_SCHEMA_VERSION,

      createdAt: now,

      updatedAt: now,
    };

    const order: PersistedEventOrder =
      plan.payment.paymentRequired
        ? {
            ...commonOrder,
            ...plan.payment,

            paymentOrderId: paymentOrderRef.id,

            status: 'awaiting_payment',

            fulfilledAt: null,
          }
        : {
            ...commonOrder,
            ...plan.payment,

            paymentOrderId: null,

            status: 'fulfilled',

            fulfilledAt: now,
          };

    const reservation: EventReservation = {
      reservationId: reservationRef.id,

      eventId,

      orderId: orderRef.id,

      items: [{
        ticketTypeId: ticket.ticketTypeId,
        quantity: input.quantity,
      }],

      status: paid
        ? 'active'
        : 'consumed',

      expiresAt: plan.reservationExpiresAt,

      consumedAt: paid ? null : now,

      releasedAt: null,

      createdAt: now,

      updatedAt: now,
    };

    const registrations: EventRegistration[] =
      input.participants.map(
        (participant, index) => ({
          registrationId:
            registrationRefs[index].id,

          eventId,

          orderId: orderRef.id,

          ticketTypeId: ticket.ticketTypeId,

          attendanceMode: ticket.attendanceMode,

          participant: {
            ...participant,

            uid:
              verifiedEmail !== null &&
              participant.email === verifiedEmail
                ? purchaserUid
                : null,
          },

          status: paid
            ? 'pending_payment'
            : 'confirmed',

          confirmedAt: paid ? null : now,

          createdAt: now,

          updatedAt: now,
        })
      );

    const requestRecord: EventRegistrationRequest = {
      requestId,

      eventId,

      orderId: orderRef.id,

      purchaserUid,

      requestHash,

      registrationIds:
        registrationRefs.map(ref => ref.id),

      schemaVersion: EVENT_SCHEMA_VERSION,

      createdAt: now,
    };

    // All reads are complete before writes begin.

    queueEventEmailsSafely(
      tx,
      adminDb,
      {
        eventId: order.eventId,
        orderId: order.orderId,
        trigger: 'registration',
      },
      () => buildRegistrationEmailJobs({
        event,
        order,
        now,
      })
    );

    if (!paid) {
      issueConfirmedEventTickets(
        tx,
        adminDb,
        {
          eventId,

          orderId: orderRef.id,

          ticketTypeId: ticket.ticketTypeId,

          expectedQuantity: input.quantity,

          registrations,

          actor: {
            type: 'participant',
            uid: purchaserUid,
          },

          now,
        }
      );
    }

    tx.create(orderRef, order);

    tx.create(reservationRef, reservation);

    tx.create(requestRef, requestRecord);

    tx.set(inventoryRef, nextInventory);

    tx.set(publicTicketRef, nextProjection);

    function writeAudit(
      action: EventAuditAction,
      resourceType: string,
      resourceId: string
    ): void {
      const ref = adminDb
        .collection(EVENT_COLLECTIONS.auditLogs)
        .doc();

      const audit: EventAuditLog = {
        auditId: ref.id,

        eventId,

        action,

        actorType: 'participant',

        actorUid: purchaserUid,

        resourceType,

        resourceId,

        reason: null,

        createdAt: now,
      };

      tx.create(ref, audit);
    }

    for (let index = 0;
      index < registrations.length;
      index++
    ) {
      const registration = registrations[index];

      tx.create(
        registrationRefs[index],
        registration
      );

      writeAudit(
        'registration_created',
        'registration',
        registration.registrationId
      );

      if (!paid) {
        writeAudit(
          'registration_confirmed',
          'registration',
          registration.registrationId
        );
      }
    }

    if (plan.payment.paymentRequired) {
      const method = {
        currency: plan.payment.currency,
        provider: plan.payment.provider,
        verificationMode:
          plan.payment.verificationMode,
      } as const;

      const owner = {
        ownerType: 'platform' as const,
        ownerId: PLATFORM_EVENT_ORGANIZER_ID,
      };

      const paymentOrder = {
        ...method,

        orderId: paymentOrderRef.id,

        purpose: 'event_ticket',

        resourceId: eventId,

        productOrderId: orderRef.id,

        payerUid: purchaserUid,

        payerEmail: input.purchaserEmail,

        owner,

        amountMinor:
          plan.payment.totalAmountMinor,

        refundedAmountMinor: 0,

        status: 'awaiting_payment',

        activePaymentId: paymentRef.id,

        successfulPaymentId: null,

        expiresAt: plan.orderExpiresAt,

        paidAt: null,

        fulfilledAt: null,

        schemaVersion: PAYMENT_SCHEMA_VERSION,

        createdAt: now,

        updatedAt: now,
      } as PaymentOrder;

      const payment = {
        ...method,

        paymentId: paymentRef.id,

        orderId: paymentOrderRef.id,

        purpose: 'event_ticket',

        resourceId: eventId,

        payerUid: purchaserUid,

        owner,

        amountMinor:
          plan.payment.totalAmountMinor,

        refundedAmountMinor: 0,

        status: 'pending_payment',

        providerPaymentId: null,

        providerReference: null,

        verifiedAt: null,

        verifiedByUid: null,

        schemaVersion: PAYMENT_SCHEMA_VERSION,

        createdAt: now,

        updatedAt: now,
      } as PaymentRecord;

      tx.create(paymentOrderRef, paymentOrder);

      tx.create(paymentRef, payment);

      writeAudit(
        'inventory_reserved',
        'reservation',
        reservationRef.id
      );
    }

    return resultFromOrder(
      order,
      false
    );
  });
}
