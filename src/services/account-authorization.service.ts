import 'server-only';

import {
  resolveLegacyStartupStatus,
  resolveStartupProfessionalRoles,
} from '@/lib/legacy-startup-profile';

import { getFirebaseAdmin } from '@/firebase/admin';

import {
  ACCOUNT_IDENTITIES_COLLECTION,
  ACCOUNT_IDENTITY_SCHEMA_VERSION,
  type AccountPortal,
  type ResolvedAccountIdentity,
} from '@/lib/account-identity';

import {
  EVENT_ORGANIZER_PROFILES_COLLECTION,
  EVENT_ORGANIZER_PROFILE_SCHEMA_VERSION,
  type EventOrganizerVerificationStatus,
} from '@/lib/event-organizer-profile';

import {
  type AccountAuthorization,
  type AuthenticatedAccountAuthorization,
  type PortalAccessDecision,
  type AccountAccessDenialReason,
} from '@/lib/account-authorization';

import {
  assertValidAccountUid,
} from '@/services/account-identity.service';

function allow(): PortalAccessDecision {
  return {
    allowed: true,
    reason: null,
  };
}

function deny(
  reason: AccountAccessDenialReason
): PortalAccessDecision {
  return {
    allowed: false,
    reason,
  };
}

/**
 * Internal authorization resolution.
 *
 * The caller must authenticate the UID.
 * All profile and identity reads use one transaction.
 * This function never creates or modifies documents.
 */
export async function resolveAccountAuthorization(
  uid: string,
  verifiedIdentity?: {
    email?: string;
    emailVerified: boolean;
  }
): Promise<AccountAuthorization> {
  assertValidAccountUid(uid);

  const { adminDb } = getFirebaseAdmin();

  const identityRef = adminDb
    .collection(ACCOUNT_IDENTITIES_COLLECTION)
    .doc(uid);

  const startupRef = adminDb
    .collection('users')
    .doc(uid);

  const eventOrganizerRef = adminDb
    .collection(EVENT_ORGANIZER_PROFILES_COLLECTION)
    .doc(uid);

  return adminDb.runTransaction(async transaction => {
    const identitySnap = await transaction.get(identityRef);
    const startupSnap = await transaction.get(startupRef);
    const eventOrganizerSnap =
      await transaction.get(eventOrganizerRef);

    const globalIdentity = identitySnap.data();
    const startup = startupSnap.data();
    const eventOrganizer = eventOrganizerSnap.data();

    const legacyStatus =
      resolveLegacyStartupStatus(uid, startup);

    const profiles = {
      hasStartupProfile: startupSnap.exists,
      hasEventOrganizerProfile: eventOrganizerSnap.exists,
    };

    let identity: ResolvedAccountIdentity = {
      uid,
      status: 'unprovisioned',
      source: 'unprovisioned',
      profiles,
    };

    if (identitySnap.exists) {
      if (
        !globalIdentity ||
        globalIdentity.uid !== uid ||
        globalIdentity.schemaVersion !==
          ACCOUNT_IDENTITY_SCHEMA_VERSION ||
        (
          globalIdentity.status !== 'active' &&
          globalIdentity.status !== 'suspended'
        )
      ) {
        throw new Error('INVALID_ACCOUNT_IDENTITY');
      }

      identity = {
        uid,
        status:
          globalIdentity.status === 'suspended' ||
          startup?.status === 'suspended'
            ? 'suspended'
            : 'active',
        source: 'global_identity',
        profiles,
      };
    } else if (
      startupSnap.exists &&
      legacyStatus !== null
    ) {
      identity = {
        uid,
        status: legacyStatus,
        source: 'legacy_startup',
        profiles,
      };
    }

    const rawRoles: unknown[] =
      Array.isArray(startup?.roles)
        ? startup.roles
        : startup?.roles === undefined &&
          typeof startup?.role === 'string'
          ? [startup.role]
          : [];

    const adminRoles = ['admin', 'super_admin'];

    const hasAdminRole =
      adminRoles.includes(startup?.role) ||
      rawRoles.some(role =>
        typeof role === 'string' &&
        adminRoles.includes(role)
      );

    const isProtectedAdmin =
      uid === 'T2JnkPYdsoZGO8krUqcP3T5bvg62' ||
      (
        verifiedIdentity?.emailVerified === true &&
        verifiedIdentity.email === 'shahmubaruk05@gmail.com'
      );

    const validAdminProfile =
      startupSnap.exists &&
      (startup?.uid === undefined || startup.uid === uid) &&
      (
        startup?.status === undefined ||
        startup.status === 'active'
      );

    const isAdmin =
      identity.status !== 'suspended' &&
      (
        !startupSnap.exists ||
        validAdminProfile
      ) &&
      (
        isProtectedAdmin ||
        (validAdminProfile && hasAdminRole)
      );

    const startupRoles =
      resolveStartupProfessionalRoles(startup);

    let startupAccess: PortalAccessDecision;

    if (!startupSnap.exists) {
      startupAccess = deny('STARTUP_PROFILE_REQUIRED');
    } else if (
      legacyStatus !== 'active' ||
      startupRoles.length === 0
    ) {
      startupAccess = deny('INVALID_STARTUP_PROFILE');
    } else {
      startupAccess = allow();
    }

    let eventOrganizerAccess: PortalAccessDecision;

    let eventOrganizerVerificationStatus:
      EventOrganizerVerificationStatus | null = null;

    if (!eventOrganizerSnap.exists) {
      eventOrganizerAccess = deny(
        'EVENT_ORGANIZER_PROFILE_REQUIRED'
      );
    } else if (
      !eventOrganizer ||
      eventOrganizer.uid !== uid ||
      eventOrganizer.schemaVersion !==
        EVENT_ORGANIZER_PROFILE_SCHEMA_VERSION ||
      !['individual', 'organization'].includes(
        eventOrganizer.organizerType
      ) ||
      !['active', 'suspended'].includes(
        eventOrganizer.status
      ) ||
      ![
        'not_started',
        'pending',
        'approved',
        'rejected',
      ].includes(eventOrganizer.verificationStatus)
    ) {
      eventOrganizerAccess = deny(
        'INVALID_EVENT_ORGANIZER_PROFILE'
      );
    } else {
      eventOrganizerVerificationStatus =
        eventOrganizer.verificationStatus;

      if (eventOrganizer.status === 'suspended') {
        eventOrganizerAccess = deny(
          'EVENT_ORGANIZER_PROFILE_SUSPENDED'
        );
      } else if (
        startupSnap.exists &&
        legacyStatus === null
      ) {
        eventOrganizerAccess = deny(
          'INVALID_STARTUP_PROFILE'
        );
      } else if (identity.source !== 'global_identity') {
        eventOrganizerAccess = deny(
          'ACCOUNT_UNPROVISIONED'
        );
      } else {
        eventOrganizerAccess = allow();
      }
    }

    if (identity.status !== 'active') {
      const reason: AccountAccessDenialReason =
        identity.status === 'suspended'
          ? 'ACCOUNT_SUSPENDED'
          : 'ACCOUNT_UNPROVISIONED';

      startupAccess = deny(reason);
      eventOrganizerAccess = deny(reason);
    }

    return {
      uid,
      identity,
      startupRoles,
      isAdmin,
      eventOrganizerVerificationStatus,
      portals: {
        startup: startupAccess,
        event_organizer: eventOrganizerAccess,
      },
    };
  }, { readOnly: true });
}

/**
 * Authenticate a Firebase ID token with revocation checking
 * before resolving account permissions.
 */
export async function authenticateAccount(
  idToken: string
): Promise<AuthenticatedAccountAuthorization> {
  if (
    typeof idToken !== 'string' ||
    !idToken.trim()
  ) {
    throw new Error('UNAUTHENTICATED');
  }

  const { adminAuth } = getFirebaseAdmin();

  const decoded = await adminAuth
    .verifyIdToken(idToken.trim(), true)
    .catch(() => {
      throw new Error('UNAUTHENTICATED');
    });

  const authorization =
    await resolveAccountAuthorization(decoded.uid, {
      email: decoded.email,
      emailVerified: decoded.email_verified === true,
    });

  return {
    ...authorization,
    emailVerified: decoded.email_verified === true,
  };
}

/**
 * Enforce portal access for an authenticated request.
 * Never accept a client-supplied UID as authentication.
 */
export async function requirePortalAccess(
  idToken: string,
  portal: AccountPortal
): Promise<AuthenticatedAccountAuthorization> {
  if (
    portal !== 'startup' &&
    portal !== 'event_organizer'
  ) {
    throw new Error('INVALID_ACCOUNT_PORTAL');
  }

  const account = await authenticateAccount(idToken);

  const decision = account.portals[portal];

  if (!decision.allowed) {
    throw new Error(
      decision.reason || 'PORTAL_ACCESS_DENIED'
    );
  }

  return account;
}
