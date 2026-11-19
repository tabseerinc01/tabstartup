import 'server-only';

import {
  Timestamp,
  type Firestore,
  type Transaction,
} from 'firebase-admin/firestore';

import {
  ACCOUNT_EMAIL_VERIFICATIONS_COLLECTION,
  EMAIL_VERIFICATION_CHALLENGES_COLLECTION,
} from '@/lib/email-verification';

import {
  assertValidAccountUid,
} from '@/services/account-identity.service';

import {
  readProfessionalPublicationSnapshots,
  prepareProfessionalPublicationRemoval,
  applyProfessionalPublicationSync,
} from '@/services/professional-profile-publishing.service';

import {
  parseAccountEmailVerification,
} from './account-email-verification-schema';

export type EmailVerificationRevocationResult = {
  uid: string;
  authorityRevoked: boolean;
  invalidAuthorityRemoved: boolean;
  challengeInvalidated: boolean;
  publicationsRemoved: number;
};

export type EmailVerificationRevocationInput = {
  transaction: Transaction;
  db: Firestore;
  uid: string;

  // preserve_native:
  // Caller independently establishes that native
  // verification and account eligibility permit
  // retaining existing publications.
  //
  // remove:
  // This helper owns publication removal.
  //
  // caller_removes:
  // Caller already prepared mandatory publication
  // removal in the same transaction and must apply
  // it before the transaction commits.
  publicationPolicy:
    | 'preserve_native'
    | 'remove'
    | 'caller_removes';
};

/**
 * Internal transactional revocation foundation.
 *
 * Caller must independently authorize the operation.
 *
 * This helper owns no transaction and performs
 * no Firebase Auth mutation.
 *
 * Invoke before any transaction writes.
 *
 * All reads are completed before writes.
 *
 * This helper never creates a publication.
 *
 * This is not an authenticated public API.
 */
export async function revokeTransactionalEmailVerification(
  input: EmailVerificationRevocationInput
): Promise<EmailVerificationRevocationResult> {
  assertValidAccountUid(input.uid);

  if (
    input.publicationPolicy !== 'preserve_native' &&
    input.publicationPolicy !== 'remove' &&
    input.publicationPolicy !== 'caller_removes'
  ) {
    throw new Error(
      'INVALID_EMAIL_REVOCATION_CONTEXT'
    );
  }

  const {
    transaction,
    db,
    uid,
  } = input;

  const authorityRef = db
    .collection(
      ACCOUNT_EMAIL_VERIFICATIONS_COLLECTION
    )
    .doc(uid);

  const challengeRef = db
    .collection(
      EMAIL_VERIFICATION_CHALLENGES_COLLECTION
    )
    .doc(uid);

  const [
    authoritySnap,
    challengeSnap,
  ] = await transaction.getAll(
    authorityRef,
    challengeRef
  );

  if (
    authoritySnap.id !== uid ||
    authoritySnap.ref.path !==
      authorityRef.path ||
    challengeSnap.id !== uid ||
    challengeSnap.ref.path !==
      challengeRef.path
  ) {
    throw new Error(
      'EMAIL_REVOCATION_PATH_MISMATCH'
    );
  }

  const publications =
    input.publicationPolicy !== 'remove'
      ? []
      : await readProfessionalPublicationSnapshots(
          transaction,
          db,
          uid
        );

  const removalActions =
    input.publicationPolicy !== 'remove'
      ? []
      : prepareProfessionalPublicationRemoval(
          publications,
          uid
        );

  const nowMs = Date.now();

  if (
    !Number.isSafeInteger(nowMs) ||
    nowMs <= 0
  ) {
    throw new Error(
      'INVALID_EMAIL_REVOCATION_CLOCK'
    );
  }

  let revokedAuthority:
    ReturnType<
      typeof parseAccountEmailVerification
    > | null = null;

  let invalidAuthorityRemoved = false;

  if (authoritySnap.exists) {
    let authority:
      ReturnType<
        typeof parseAccountEmailVerification
      > | null = null;

    // Snapshot access is outside the parser catch.
    // Unexpected snapshot/read failures must still
    // abort the transaction.

    const authorityData = authoritySnap.data();

    try {
      authority =
        parseAccountEmailVerification(
          uid,
          authorityData
        );
    } catch {
      // Invalid data cannot become trusted
      // verification evidence.
      invalidAuthorityRemoved = true;
    }

    if (authority) {
      if (
        authority.updatedAt.toMillis() > nowMs ||
        authority.verifiedAt.toMillis() > nowMs
      ) {
        // Future-dated authority is invalid.
        // Do not allow it to block suspension.
        invalidAuthorityRemoved = true;
      } else if (authority.status === 'verified') {
        const now = Timestamp.fromMillis(nowMs);

        revokedAuthority =
          parseAccountEmailVerification(
            uid,
            {
              ...authority,
              status: 'revoked',
              revokedAt: now,
              updatedAt: now,
            }
          );
      }
    }
  }

  // All transaction reads and preparation
  // must finish before this point.

  if (invalidAuthorityRemoved) {
    transaction.delete(authorityRef);
  } else if (revokedAuthority) {
    transaction.set(
      authorityRef,
      revokedAuthority
    );
  }

  // Remove the outstanding challenge entirely.
  // Existing rate-limit documents are preserved.
  // A stale claim must not finalize without its
  // matching challenge document.

  if (challengeSnap.exists) {
    transaction.delete(challengeRef);
  }

  const publicationResult =
    applyProfessionalPublicationSync(
      transaction,
      removalActions
    );

  return {
    uid,
    authorityRevoked:
      revokedAuthority !== null,
    invalidAuthorityRemoved,
    challengeInvalidated:
      challengeSnap.exists,
    publicationsRemoved:
      publicationResult.removed,
  };
}
