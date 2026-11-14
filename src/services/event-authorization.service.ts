/**
 * TabStartup Centralized Event Authorization.
 *
 * Release A:
 * - Official TabStartup events only.
 * - Admin-managed event operations.
 * - External Event Organizer access disabled.
 *
 * All authenticated identities are resolved
 * through the existing account authorization service.
 */

import 'server-only';

import {
  authenticateAccount,
} from '@/services/account-authorization.service';

import type {
  AuthenticatedAccountAuthorization,
} from '@/lib/account-authorization';

import {
  PLATFORM_EVENT_ORGANIZER_ID,
  type EventOwnership,
  type EventRecord,
  type EventStatus,
} from '@/lib/event-types';

import {
  isValidEventDocumentId,
  isValidEventOwnership,
} from '@/lib/event-validation';

import {
  EXTERNAL_EVENT_ORGANIZER_ENABLED,
  canTransitionEventStatus,
} from '@/lib/event-lifecycle';

export type EventManagementPermission =
  | 'event:create'
  | 'event:read'
  | 'event:update'
  | 'event:publish'
  | 'event:cancel'
  | 'event:archive'
  | 'event:manage_tickets'
  | 'event:manage_inventory'
  | 'event:manage_participants'
  | 'event:manage_checkins'
  | 'event:manage_private_details'
  | 'event:manage_payments'
  | 'event:manage_refunds'
  | 'event:view_analytics'
  | 'event:view_audit_logs';

const EVENT_MANAGEMENT_PERMISSIONS:
  ReadonlySet<EventManagementPermission> =
    new Set<EventManagementPermission>([
      'event:create',
      'event:read',
      'event:update',
      'event:publish',
      'event:cancel',
      'event:archive',
      'event:manage_tickets',
      'event:manage_inventory',
      'event:manage_participants',
      'event:manage_checkins',
      'event:manage_private_details',
      'event:manage_payments',
      'event:manage_refunds',
      'event:view_analytics',
      'event:view_audit_logs',
    ]);

export type EventAuthorizationDenialReason =
  | 'INVALID_ACCOUNT'
  | 'ACCOUNT_SUSPENDED'
  | 'INVALID_PERMISSION'
  | 'ADMIN_ACCESS_REQUIRED'
  | 'INVALID_EVENT_OWNERSHIP'
  | 'EXTERNAL_EVENT_ORGANIZER_DISABLED'
  | 'EXTERNAL_EVENT_MANAGEMENT_NOT_IMPLEMENTED'
  | 'EVENT_STATUS_TRANSITION_DENIED';

export type EventAuthorizationDecision =
  | {
      allowed: true;
      reason: null;
    }
  | {
      allowed: false;
      reason: EventAuthorizationDenialReason;
    };

export interface EventAdminContext {
  uid: string;
  actorType: 'admin';
  account: AuthenticatedAccountAuthorization;
}

export class EventAuthorizationError extends Error {
  readonly code: EventAuthorizationDenialReason;

  constructor(
    code: EventAuthorizationDenialReason
  ) {
    super(code);

    this.name = 'EventAuthorizationError';
    this.code = code;
  }
}

function allow(): EventAuthorizationDecision {
  return {
    allowed: true,
    reason: null,
  };
}

function deny(
  reason: EventAuthorizationDenialReason
): EventAuthorizationDecision {
  return {
    allowed: false,
    reason,
  };
}

/**
 * Pure authorization policy.
 *
 * The account argument must originate from
 * trusted server-side account resolution.
 *
 * Never accept this object from request JSON.
 */
export function evaluateEventManagementAccess(
  account: AuthenticatedAccountAuthorization,
  permission: EventManagementPermission,
  ownership: EventOwnership
): EventAuthorizationDecision {
  if (
    !account ||
    !isValidEventDocumentId(account.uid) ||
    !account.identity ||
    account.identity.uid !== account.uid
  ) {
    return deny('INVALID_ACCOUNT');
  }

  if (
    account.identity.status === 'suspended'
  ) {
    return deny('ACCOUNT_SUSPENDED');
  }

  if (
    account.identity.status !== 'active' &&
    account.identity.status !== 'unprovisioned'
  ) {
    return deny('INVALID_ACCOUNT');
  }

  if (
    !EVENT_MANAGEMENT_PERMISSIONS.has(permission)
  ) {
    return deny('INVALID_PERMISSION');
  }

  if (!isValidEventOwnership(ownership)) {
    return deny('INVALID_EVENT_OWNERSHIP');
  }

  if (
    ownership.organizerType ===
      'verified_organizer'
  ) {
    if (!EXTERNAL_EVENT_ORGANIZER_ENABLED) {
      return deny(
        'EXTERNAL_EVENT_ORGANIZER_DISABLED'
      );
    }

    // Future Release B must explicitly implement
    // external ownership and membership permissions.
    // Enabling a feature flag alone grants no access.

    return deny(
      'EXTERNAL_EVENT_MANAGEMENT_NOT_IMPLEMENTED'
    );
  }

  if (account.isAdmin !== true) {
    return deny('ADMIN_ACCESS_REQUIRED');
  }

  return allow();
}

/**
 * Authenticate and authorize official
 * TabStartup event management.
 *
 * Supports the existing protected Admin
 * account behavior without requiring a
 * separate Event Organizer profile.
 */
export async function requireEventAdmin(
  idToken: string,
  permission: EventManagementPermission
): Promise<EventAdminContext> {
  const account =
    await authenticateAccount(idToken);

  const decision =
    evaluateEventManagementAccess(
      account,
      permission,
      {
        organizerType: 'platform',
        organizerId:
          PLATFORM_EVENT_ORGANIZER_ID,
      }
    );

  if (!decision.allowed) {
    throw new EventAuthorizationError(
      decision.reason
    );
  }

  return {
    uid: account.uid,
    actorType: 'admin',
    account,
  };
}

/**
 * Authorize an existing event.
 *
 * The event must be loaded from the canonical
 * server-side event document.
 *
 * Never use client-supplied ownership data.
 */
export async function requireEventManagementAccess(
  idToken: string,
  permission: EventManagementPermission,
  event: EventOwnership
): Promise<EventAdminContext> {
  const account =
    await authenticateAccount(idToken);

  const decision =
    evaluateEventManagementAccess(
      account,
      permission,
      event
    );

  if (!decision.allowed) {
    throw new EventAuthorizationError(
      decision.reason
    );
  }

  return {
    uid: account.uid,
    actorType: 'admin',
    account,
  };
}

/**
 * Return the only ownership permitted for
 * newly created official events in Release A.
 *
 * The creation service must use this value
 * rather than accepting organizer ownership
 * from a client request.
 */
export function getOfficialEventOwnership():
  EventOwnership {
  return {
    organizerType: 'platform',
    organizerId:
      PLATFORM_EVENT_ORGANIZER_ID,
  };
}

/**
 * Enforce the immutable ownership boundary.
 */
export function assertEventOwnershipUnchanged(
  current: EventOwnership,
  proposed: EventOwnership
): void {
  if (
    !isValidEventOwnership(current) ||
    !isValidEventOwnership(proposed) ||
    current.organizerType !==
      proposed.organizerType ||
    current.organizerId !==
      proposed.organizerId
  ) {
    throw new EventAuthorizationError(
      'INVALID_EVENT_OWNERSHIP'
    );
  }
}

/**
 * Determine the permission required for
 * an event lifecycle transition.
 */
function getTransitionPermission(
  nextStatus: EventStatus
): EventManagementPermission {
  switch (nextStatus) {
    case 'published':
      return 'event:publish';

    case 'cancelled':
      return 'event:cancel';

    case 'archived':
      return 'event:archive';

    default:
      return 'event:update';
  }
}

/**
 * Validate an authenticated Admin lifecycle action.
 *
 * This is a policy check, not a database write.
 *
 * Publishing additionally requires publication
 * readiness validation.
 *
 * Cancellation additionally requires registration,
 * payment and refund reconciliation.
 *
 * The mutation service must re-read the event
 * and enforce the policy inside its transaction.
 */
export function assertAdminEventTransition(
  context: EventAdminContext,
  event: Pick<
    EventRecord,
    'organizerType' |
    'organizerId' |
    'status'
  >,
  nextStatus: EventStatus
): void {
  if (
    !context ||
    context.actorType !== 'admin' ||
    !context.account ||
    context.uid !== context.account.uid
  ) {
    throw new EventAuthorizationError(
      'INVALID_ACCOUNT'
    );
  }

  const ownership: EventOwnership =
    event.organizerType === 'platform'
      ? {
          organizerType: 'platform',
          organizerId:
            PLATFORM_EVENT_ORGANIZER_ID,
        }
      : {
          organizerType: 'verified_organizer',
          organizerId: event.organizerId,
        };

  if (
    event.organizerType !==
      ownership.organizerType ||
    event.organizerId !==
      ownership.organizerId
  ) {
    throw new EventAuthorizationError(
      'INVALID_EVENT_OWNERSHIP'
    );
  }

  const access =
    evaluateEventManagementAccess(
      context.account,
      getTransitionPermission(nextStatus),
      ownership
    );

  if (!access.allowed) {
    throw new EventAuthorizationError(
      access.reason
    );
  }

  const transition =
    canTransitionEventStatus(
      event,
      nextStatus,
      {
        actorType: 'admin',
        uid: context.uid,
      }
    );

  if (!transition.allowed) {
    throw new EventAuthorizationError(
      'EVENT_STATUS_TRANSITION_DENIED'
    );
  }
}

/**
 * Extract a bounded Firebase bearer token.
 *
 * API routes should map UNAUTHENTICATED to
 * HTTP 401 and authorization denial to HTTP 403.
 */
export function getEventBearerToken(
  request: Request
): string {
  const header =
    request.headers.get('authorization');

  if (
    !header ||
    header.length > 16384 ||
    !header.startsWith('Bearer ')
  ) {
    throw new Error('UNAUTHENTICATED');
  }

  const token = header.slice(7).trim();

  if (
    !token ||
    /\s/.test(token)
  ) {
    throw new Error('UNAUTHENTICATED');
  }

  return token;
}
