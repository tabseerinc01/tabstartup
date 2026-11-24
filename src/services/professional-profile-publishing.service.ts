import 'server-only';

import {
  writeProfessionalEligibility,
} from '@/services/professional-eligibility.service';

import {
  evaluateVerifiedProfileReadiness,
} from '@/services/professional-profile-image-readiness.service';

import {
  readTransactionalEmailVerification,
} from '@/services/email/email-verification-transaction.service';

import {
  FieldValue,
  Timestamp,
  type Transaction,
  type DocumentReference,
  type DocumentSnapshot,
  type Firestore,
} from 'firebase-admin/firestore';

import { getFirebaseAdmin } from '@/firebase/admin';

import {
  ACCOUNT_IDENTITIES_COLLECTION,
} from '@/lib/account-identity';

import {
  isProfessionalProfileRole,
  evaluateProfileReadiness,
  type ProfessionalProfileRole,
} from '@/lib/profile-readiness';

import {
  PROFESSIONAL_PROFILES_COLLECTION,
  PROFESSIONAL_PROFILE_SCHEMA_VERSION,
  getProfessionalProfileId,
  buildProfessionalProfile,
} from '@/lib/professional-profile';

import {
  isValidProfessionalProfileUid,
} from '@/lib/professional-profile-validation';

import {
  requirePortalAccess,
} from '@/services/account-authorization.service';

import {
  isGlobalAccountEligible,
} from '@/services/account-suspension-guard.service';

const PROFESSIONAL_ROLES = [
  'founder',
  'investor',
  'mentor',
] as const;

function assertRole(
  role: unknown
): asserts role is ProfessionalProfileRole {
  if (!isProfessionalProfileRole(role)) {
    throw new Error('INVALID_PROFESSIONAL_ROLE');
  }
}

function assertUid(
  uid: unknown
): asserts uid is string {
  if (!isValidProfessionalProfileUid(uid)) {
    throw new Error('INVALID_PROFESSIONAL_PROFILE_UID');
  }
}

/**
 * Authenticate the owner of a professional profile.
 *
 * Never accept a client-provided UID or verification flag.
 * Firebase Auth supplies the trusted account snapshot.
 * Publication verification is evaluated transactionally.
 */
async function authenticatePublishingOwner(
  idToken: string
) {
  const account = await requirePortalAccess(
    idToken,
    'startup'
  );

  assertUid(account.uid);

  const { adminAuth } = getFirebaseAdmin();

  const authUser = await adminAuth.getUser(
    account.uid
  );

  if (
    authUser.uid !== account.uid ||
    authUser.disabled
  ) {
    throw new Error('ACCOUNT_NOT_ACTIVE');
  }

  return {
    uid: account.uid,
    authUser,
  };
}

/**
 * Existing publication must belong to the expected
 * user and professional role.
 */
function isExpectedProjectionError(
  error: unknown
): error is Error {
  return error instanceof Error &&
    [
      'PROFESSIONAL_PROFILE_NOT_READY',
      'SANITIZED_PROFILE_NOT_READY',
      'PROFESSIONAL_PROFILE_TOO_LARGE',
      'INVALID_CANONICAL_PROFILE',
    ].includes(error.message);
}

function isValidExistingPublication(
  data: Record<string, unknown> | undefined,
  uid: string,
  role: ProfessionalProfileRole
): boolean {
  return !!data &&
    data.uid === uid &&
    data.role === role &&
    data.schemaVersion ===
      PROFESSIONAL_PROFILE_SCHEMA_VERSION &&
    data.visibility === 'public' &&
    data.status === 'published';
}

/**
 * Explicitly publish one owned professional role.
 *
 * This service must not be called by signup,
 * role activation, or automatic profile synchronization.
 *
 * Release integration must additionally enforce the
 * trusted profile photo storage policy.
 */
async function readOtherPublishedRoles(
  transaction: Transaction,
  db: Firestore,
  uid: string,
  role: ProfessionalProfileRole
): Promise<ProfessionalProfileRole[]> {
  const roles = PROFESSIONAL_ROLES.filter(r => r !== role);
  const refs = roles.map(r =>
    db.collection(PROFESSIONAL_PROFILES_COLLECTION)
      .doc(getProfessionalProfileId(uid, r))
  );
  const snapshots = await transaction.getAll(...refs);

  return roles.filter((r, index) =>
    isValidExistingPublication(
      snapshots[index].data(),
      uid,
      r
    )
  );
}

export async function publishOwnProfessionalProfile(
  idToken: string,
  role: ProfessionalProfileRole
) {
  assertRole(role);

  const owner =
    await authenticatePublishingOwner(idToken);

  const { uid, authUser } = owner;

  const { adminDb } = getFirebaseAdmin();

  const identityRef = adminDb
    .collection(ACCOUNT_IDENTITIES_COLLECTION)
    .doc(uid);

  const userRef = adminDb
    .collection('users')
    .doc(uid);

  const profileId = getProfessionalProfileId(
    uid,
    role
  );

  const publicRef = adminDb
    .collection(PROFESSIONAL_PROFILES_COLLECTION)
    .doc(profileId);

  return adminDb.runTransaction(
    async transaction => {
      const identitySnap =
        await transaction.get(identityRef);

      const userSnap =
        await transaction.get(userRef);

      const publicSnap =
        await transaction.get(publicRef);

      const otherRoles = await readOtherPublishedRoles(
        transaction, adminDb, uid, role
      );

      if (!userSnap.exists) {
        throw new Error('USER_NOT_FOUND');
      }

      const data = userSnap.data()!;

      const accountActive =
        isGlobalAccountEligible(
          uid,
          identitySnap
        );

      const { emailVerified } =
        await readTransactionalEmailVerification({
          transaction,
          db: adminDb,
          uid,
          authUser,
          accountActive: accountActive,
        });

      const readinessContext = {
        uid,
        emailVerified,
        accountActive,
      };

      const readiness =
        await evaluateVerifiedProfileReadiness(
          data,
          role,
          readinessContext
        );

      if (!readiness.ready) {
        writeProfessionalEligibility(
          transaction, adminDb, uid, otherRoles
        );

        if (publicSnap.exists) {
          transaction.delete(publicRef);
        }

        return {
          status: 'not_ready' as const,
          role,
          readiness,
          publicationRemoved: publicSnap.exists,
        };
      }

      const existing = publicSnap.data();

      const existingValid =
        isValidExistingPublication(
          existing,
          uid,
          role
        );

      let projection:
        ReturnType<typeof buildProfessionalProfile>;

      try {
        projection =
          buildProfessionalProfile(
            data,
            role,
            {
              ...readinessContext,
              publicationAuthorized: true,
            }
          );
      } catch (error) {
        if (!isExpectedProjectionError(error)) {
          throw error;
        }

        writeProfessionalEligibility(
          transaction, adminDb, uid, otherRoles
        );

        if (publicSnap.exists) {
          transaction.delete(publicRef);
        }

        return {
          status: 'not_ready' as const,
          role,
          readiness,
          reason: error.message,
          publicationRemoved: publicSnap.exists,
        };
      }

      writeProfessionalEligibility(
        transaction, adminDb, uid, [...otherRoles, role]
      );

      transaction.set(publicRef, {
        ...projection,

        publishedAt:
          existingValid &&
          existing?.publishedAt instanceof Timestamp
            ? existing.publishedAt
            : FieldValue.serverTimestamp(),

        updatedAt:
          FieldValue.serverTimestamp(),
      });

      return {
        status: 'published' as const,
        role,
        profileId,
        readiness,
      };
    }
  );
}

/**
 * Explicitly unpublish one professional role.
 *
 * Does not delete or modify canonical profile data.
 * Does not affect other professional roles.
 *
 * Repeated unpublish requests are idempotent.
 */
export async function unpublishOwnProfessionalProfile(
  idToken: string,
  role: ProfessionalProfileRole
) {
  assertRole(role);

  const { uid } =
    await authenticatePublishingOwner(idToken);

  const { adminDb } = getFirebaseAdmin();

  const identityRef = adminDb
    .collection(ACCOUNT_IDENTITIES_COLLECTION)
    .doc(uid);

  const userRef = adminDb
    .collection('users')
    .doc(uid);

  const profileId = getProfessionalProfileId(
    uid,
    role
  );

  const publicRef = adminDb
    .collection(PROFESSIONAL_PROFILES_COLLECTION)
    .doc(profileId);

  return adminDb.runTransaction(
    async transaction => {
      const identitySnap =
        await transaction.get(identityRef);

      const userSnap =
        await transaction.get(userRef);

      const publicSnap =
        await transaction.get(publicRef);

      const otherRoles = await readOtherPublishedRoles(
        transaction, adminDb, uid, role
      );

      if (!userSnap.exists) {
        throw new Error('USER_NOT_FOUND');
      }

      if (
        !isGlobalAccountEligible(
          uid,
          identitySnap
        )
      ) {
        throw new Error('ACCOUNT_NOT_ACTIVE');
      }

      const readiness =
        evaluateProfileReadiness(
          userSnap.data()!,
          role,
          {
            uid,
            accountActive: true,
            emailVerified: false,
          }
        );

      if (!readiness.eligible) {
        throw new Error(
          'PROFESSIONAL_ROLE_NOT_ELIGIBLE'
        );
      }

      writeProfessionalEligibility(
        transaction, adminDb, uid, otherRoles
      );

      if (!publicSnap.exists) {
        return {
          status: 'unpublished' as const,
          role,
          profileId,
          changed: false,
        };
      }

      // The authenticated owner and deterministic
      // document path were already validated.
      // Malformed metadata must not prevent removal.
      transaction.delete(publicRef);

      return {
        status: 'unpublished' as const,
        role,
        profileId,
        changed: true,
      };
    }
  );
}

/**
 * Read publication and readiness status for
 * the authenticated account's professional roles.
 *
 * Never publishes or repairs profiles implicitly.
 */
export async function getOwnProfessionalPublicationStatus(
  idToken: string
) {
  const { uid, authUser } =
    await authenticatePublishingOwner(idToken);

  const { adminDb } = getFirebaseAdmin();

  const identityRef = adminDb
    .collection(ACCOUNT_IDENTITIES_COLLECTION)
    .doc(uid);

  const userRef = adminDb
    .collection('users')
    .doc(uid);

  const publicRefs = PROFESSIONAL_ROLES.map(
    role => adminDb
      .collection(PROFESSIONAL_PROFILES_COLLECTION)
      .doc(getProfessionalProfileId(uid, role))
  );

  return adminDb.runTransaction(
    async transaction => {
      const identitySnap =
        await transaction.get(identityRef);

      const userSnap =
        await transaction.get(userRef);

      const publicSnaps =
        await transaction.getAll(...publicRefs);

      if (!userSnap.exists) {
        throw new Error('USER_NOT_FOUND');
      }

      const accountActive =
        isGlobalAccountEligible(
          uid,
          identitySnap
        );

      const data = userSnap.data()!;

      const { emailVerified } =
        await readTransactionalEmailVerification({
          transaction,
          db: adminDb,
          uid,
          authUser,
          accountActive: accountActive,
        });

      const roles = await Promise.all(
        PROFESSIONAL_ROLES.map(
        async (role, index) => {
          const readiness =
            await evaluateVerifiedProfileReadiness(
              data,
              role,
              {
                uid,
                emailVerified,
                accountActive,
              }
            );

          const snapshot = publicSnaps[index];

          const publicationValid =
            snapshot.exists &&
            isValidExistingPublication(
              snapshot.data(),
              uid,
              role
            );

          return {
            role,
            profileId: snapshot.id,
            readiness,

            publicationStatus:
              publicationValid && readiness.ready
                ? 'published' as const
                : 'unpublished' as const,

            storedPublicationStatus:
              !snapshot.exists
                ? 'absent' as const
                : publicationValid
                  ? 'published' as const
                  : 'invalid' as const,

            requiresReconciliation:
              snapshot.exists &&
              (
                !publicationValid ||
                !readiness.ready
              ),
          };
        }
      ));

      return {
        uid,
        emailVerified,
        roles,
      };
    },
    { readOnly: true }
  );
}

// =====================================================
// TRANSACTIONAL PUBLICATION SYNCHRONIZATION
// =====================================================

type PublicationSnapshot = {
  role: ProfessionalProfileRole;
  ref: DocumentReference;
  snapshot: DocumentSnapshot;
};

type PublicationSyncContext = {
  uid: string;
  emailVerified: boolean;
  accountActive: boolean;
};

type PublicationSyncAction =
  | {
      kind: 'keep_absent';
      role: ProfessionalProfileRole;
      ref: DocumentReference;
    }
  | {
      kind: 'remove';
      role: ProfessionalProfileRole;
      ref: DocumentReference;
      reason: string;
    }
  | {
      kind: 'update';
      role: ProfessionalProfileRole;
      ref: DocumentReference;
      data: Record<string, unknown>;
    };

/**
 * Read every deterministic publication document.
 *
 * Must be called before any transaction writes.
 * Does not create or modify documents.
 */
export async function readProfessionalPublicationSnapshots(
  transaction: Transaction,
  adminDb: Firestore,
  uid: string
): Promise<PublicationSnapshot[]> {
  assertUid(uid);

  const refs = PROFESSIONAL_ROLES.map(
    role => adminDb
      .collection(PROFESSIONAL_PROFILES_COLLECTION)
      .doc(getProfessionalProfileId(uid, role))
  );

  const snapshots =
    await transaction.getAll(...refs);

  return PROFESSIONAL_ROLES.map(
    (role, index) => ({
      role,
      ref: refs[index],
      snapshot: snapshots[index],
    })
  );
}

/**
 * Prepare synchronization from trusted server state.
 *
 * The canonical profile must represent the intended
 * post-mutation state, not stale pre-mutation data.
 *
 * Missing publications are never created.
 *
 * No Firestore reads or writes occur here.
 */
function prepareProfessionalPublicationSync(
  canonical: Record<string, unknown> | undefined,
  publications: PublicationSnapshot[],
  context: PublicationSyncContext
): PublicationSyncAction[] {
  assertUid(context.uid);

  if (
    typeof context.emailVerified !== 'boolean' ||
    typeof context.accountActive !== 'boolean'
  ) {
    throw new Error(
      'INVALID_PUBLICATION_SYNC_CONTEXT'
    );
  }

  if (
    !Array.isArray(publications) ||
    publications.length !==
      PROFESSIONAL_ROLES.length
  ) {
    throw new Error(
      'INVALID_PUBLICATION_SNAPSHOTS'
    );
  }

  const { uid } = context;

  return PROFESSIONAL_ROLES.map(
    (role, index): PublicationSyncAction => {
      const publication = publications[index];

      const expectedId =
        getProfessionalProfileId(uid, role);

      const expectedPath =
        PROFESSIONAL_PROFILES_COLLECTION +
        '/' + expectedId;

      if (
        !publication ||
        publication.role !== role ||
        publication.ref.path !== expectedPath ||
        publication.snapshot.ref.path !==
          expectedPath ||
        publication.snapshot.id !== expectedId
      ) {
        throw new Error(
          'INVALID_PUBLICATION_SNAPSHOT'
        );
      }

      const { ref, snapshot } = publication;

      function remove(
        reason: string
      ): PublicationSyncAction {
        return {
          kind: 'remove',
          role,
          ref,
          reason,
        };
      }

      // No implicit publication, even when ready.
      if (!snapshot.exists) {
        return {
          kind: 'keep_absent',
          role,
          ref,
        };
      }

      if (!canonical) {
        return remove('USER_NOT_FOUND');
      }

      if (!context.accountActive) {
        return remove('ACCOUNT_NOT_ACTIVE');
      }

      if (!context.emailVerified) {
        return remove('EMAIL_NOT_VERIFIED');
      }

      const existing = snapshot.data();

      if (
        !isValidExistingPublication(
          existing,
          uid,
          role
        )
      ) {
        return remove(
          'INVALID_EXISTING_PUBLICATION'
        );
      }

      const readiness =
        evaluateProfileReadiness(
          canonical,
          role,
          context
        );

      if (!readiness.ready) {
        return remove(
          'PROFESSIONAL_PROFILE_NOT_READY'
        );
      }

      try {
        const projection =
          buildProfessionalProfile(
            canonical,
            role,
            {
              uid,
              emailVerified:
                context.emailVerified,
              accountActive:
                context.accountActive,
              publicationAuthorized: true,
            }
          );

        const publishedAt =
          existing?.publishedAt instanceof Timestamp
            ? existing.publishedAt
            : FieldValue.serverTimestamp();

        return {
          kind: 'update',
          role,
          ref,
          data: {
            ...projection,
            publishedAt,
            updatedAt:
              FieldValue.serverTimestamp(),
          },
        };
      } catch (error) {
        if (isExpectedProjectionError(error)) {
          return remove(error.message);
        }

        // Unexpected errors abort the transaction.
        throw error;
      }
    }
  );
}

/**
 * Apply the prepared synchronization plan.
 *
 * Must be called only after all transaction reads.
 * Never performs additional reads.
 */
export function applyProfessionalPublicationSync(
  transaction: Transaction,
  actions: PublicationSyncAction[]
) {
  if (actions.length > 0) {
    const uid = actions[0].ref.id.slice(
      actions[0].role.length + 1
    );

    if (
      actions.length !== PROFESSIONAL_ROLES.length ||
      new Set(actions.map(action => action.role)).size !==
        PROFESSIONAL_ROLES.length ||
      actions.some(action =>
        action.ref.path !==
          PROFESSIONAL_PROFILES_COLLECTION + '/' +
          getProfessionalProfileId(uid, action.role)
      )
    ) {
      throw new Error('INVALID_ELIGIBILITY_SYNC_ACTIONS');
    }

    writeProfessionalEligibility(
      transaction,
      actions[0].ref.firestore,
      uid,
      actions
        .filter(action => action.kind === 'update')
        .map(action => action.role)
    );
  }

  const result = {
    updated: 0,
    removed: 0,
    unchanged: 0,
  };

  for (const action of actions) {
    switch (action.kind) {
      case 'keep_absent':
        result.unchanged++;
        break;

      case 'remove':
        transaction.delete(action.ref);
        result.removed++;
        break;

      case 'update':
        transaction.set(
          action.ref,
          action.data
        );
        result.updated++;
        break;

      default:
        throw new Error(
          'INVALID_PUBLICATION_SYNC_ACTION'
        );
    }
  }

  return result;
}

/**
 * Prepare removal of all existing publications.
 *
 * Intended for trusted account suspension,
 * deletion, or other mandatory visibility removal.
 */
export function prepareProfessionalPublicationRemoval(
  publications: PublicationSnapshot[],
  uid: string
): PublicationSyncAction[] {
  return prepareProfessionalPublicationSync(
    undefined,
    publications,
    {
      uid,
      emailVerified: false,
      accountActive: false,
    }
  );
}


/**
 * Verify photo readiness before synchronizing
 * existing professional publications.
 *
 * No implicit publication.
 * Infrastructure failures abort synchronization.
 */
export async function prepareVerifiedProfessionalPublicationSync(
  canonical: Record<string, unknown> | undefined,
  publications: PublicationSnapshot[],
  context: PublicationSyncContext
): Promise<PublicationSyncAction[]> {
  const actions = prepareProfessionalPublicationSync(
    canonical,
    publications,
    context
  );

  if (!canonical) {
    return actions;
  }

  return Promise.all(
    actions.map(async (action): Promise<PublicationSyncAction> => {
      if (action.kind !== 'update') {
        return action;
      }

      const readiness =
        await evaluateVerifiedProfileReadiness(
          canonical,
          action.role,
          context
        );

      if (!readiness.ready) {
        return {
          kind: 'remove',
          role: action.role,
          ref: action.ref,
          reason: 'PROFILE_IMAGE_NOT_VERIFIED',
        };
      }

      return action;
    })
  );
}
