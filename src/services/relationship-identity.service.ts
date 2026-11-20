import 'server-only';

import { getFirebaseAdmin } from '@/firebase/admin';

import {
  ACCOUNT_IDENTITIES_COLLECTION,
} from '@/lib/account-identity';

import {
  hasActiveStartupProfile,
  resolveStartupProfessionalRoles,
} from '@/lib/legacy-startup-profile';

import {
  isGlobalAccountEligible,
} from '@/services/account-suspension-guard.service';

import {
  isValidProfessionalProfileUid,
} from '@/lib/professional-profile-validation';

import {
  PROFESSIONAL_PROFILES_COLLECTION,
  getProfessionalProfileId,
} from '@/lib/professional-profile';

import {
  RELATIONSHIP_COLLECTIONS,
  RELATIONSHIP_BATCH_MAX,
  parseRelationshipContext,
  isValidRelationshipContextId,
  createUnavailableRelationshipIdentity,
  type RelationshipContext,
  type RelationshipIdentityResult,
  type RelationshipIdentity,
} from '@/lib/relationship-identity';

import {
  resolveAuthorizedRelationshipParticipants,
} from '@/lib/relationship-participants';

import {
  projectPublishedRelationshipIdentity,
} from '@/lib/relationship-identity-projection';

import {
  isAcceptedConnection,
  isAcceptedMentorshipRequest,
  hasMatchingFundingEvidence,
  hasMatchingMentorshipEvidence,
  hasMatchingSessionEvidence,
} from '@/lib/relationship-trust';

export async function getRelationshipIdentities(
  idToken: string,
  input: unknown
): Promise<RelationshipIdentityResult[]> {
  if (
    typeof idToken !== 'string' ||
    !idToken.trim()
  ) {
    throw new Error('UNAUTHENTICATED');
  }

  if (
    !Array.isArray(input) ||
    input.length === 0 ||
    input.length > RELATIONSHIP_BATCH_MAX
  ) {
    throw new Error('INVALID_RELATIONSHIP_CONTEXT');
  }

  const contexts: RelationshipContext[] = [];

  for (const item of input) {
    const context = parseRelationshipContext(item);

    if (!context) {
      throw new Error('INVALID_RELATIONSHIP_CONTEXT');
    }

    contexts.push(context);
  }

  const keys = contexts.map(
    context =>
      JSON.stringify([
        context.contextType,
        context.contextId,
      ])
  );

  if (new Set(keys).size !== keys.length) {
    throw new Error('INVALID_RELATIONSHIP_CONTEXT');
  }

  const { adminAuth, adminDb } = getFirebaseAdmin();

  const decoded = await adminAuth
    .verifyIdToken(idToken.trim(), true)
    .catch(() => {
      throw new Error('UNAUTHENTICATED');
    });

  const uid = decoded.uid;

  if (!isValidProfessionalProfileUid(uid)) {
    throw new Error('UNAUTHENTICATED');
  }

  return adminDb.runTransaction(
    async transaction => {
      const identityRef = adminDb
        .collection(ACCOUNT_IDENTITIES_COLLECTION)
        .doc(uid);

      const userRef = adminDb
        .collection('users')
        .doc(uid);

      const [identitySnap, userSnap] =
        await transaction.getAll(
          identityRef,
          userRef
        );

      if (
        !isGlobalAccountEligible(uid, identitySnap) ||
        !hasActiveStartupProfile(uid, userSnap.data())
      ) {
        throw new Error('PORTAL_ACCESS_DENIED');
      }

      const results: RelationshipIdentityResult[] = [];

      for (const context of contexts) {
        const relationshipRef = adminDb
          .collection(
            RELATIONSHIP_COLLECTIONS[context.contextType]
          )
          .doc(context.contextId);

        const relationshipSnap =
          await transaction.get(relationshipRef);

        const relationshipData = relationshipSnap.data();

        const authorizedParticipants =
          resolveAuthorizedRelationshipParticipants(
            uid,
            context.contextType,
            relationshipData
          );

        if (!authorizedParticipants) {
          results.push({
            context,
            status: 'unavailable',
            participants: [],
          });
          continue;
        }

        let trusted = false;

        if (context.contextType === 'connection') {
          trusted = isAcceptedConnection(relationshipData);
        } else if (
          context.contextType === 'mentorshipRequest'
        ) {
          trusted = isAcceptedMentorshipRequest(relationshipData);
        } else if (
          context.contextType === 'dealRoom'
        ) {
          const connectionId =
            relationshipData?.connectionId;

          if (
            isValidRelationshipContextId(connectionId)
          ) {
            const connectionSnap = await transaction.get(
              adminDb.collection('connections').doc(connectionId)
            );

            trusted = hasMatchingFundingEvidence(
              relationshipData,
              connectionId,
              connectionSnap.data()
            );
          }
        } else if (
          context.contextType === 'activeMentorship' ||
          context.contextType === 'mentorshipSession'
        ) {
          const mentorshipId =
            context.contextType === 'activeMentorship'
              ? context.contextId
              : relationshipData?.mentorshipId;

          if (
            isValidRelationshipContextId(mentorshipId)
          ) {
            const mentorshipData =
              context.contextType === 'activeMentorship'
                ? relationshipData
                : (
                    await transaction.get(
                      adminDb
                        .collection('activeMentorships')
                        .doc(mentorshipId)
                    )
                  ).data();

            const requestId = mentorshipData?.requestId;

            if (
              isValidRelationshipContextId(requestId)
            ) {
              const requestSnap = await transaction.get(
                adminDb
                  .collection('mentorshipRequests')
                  .doc(requestId)
              );

              trusted = hasMatchingMentorshipEvidence(
                mentorshipId,
                mentorshipData,
                requestId,
                requestSnap.data()
              );

              if (
                trusted &&
                context.contextType === 'mentorshipSession'
              ) {
                trusted = hasMatchingSessionEvidence(
                  relationshipData,
                  mentorshipId,
                  mentorshipData
                );
              }
            }
          }
        }

        const participants = trusted
          ? authorizedParticipants
          : null;

        if (!participants) {
          results.push({
            context,
            status: 'unavailable',
            participants: [],
          });

          continue;
        }

        const identities: RelationshipIdentity[] = [];

        for (const participant of participants) {
          const unavailable =
            createUnavailableRelationshipIdentity({
              uid: participant.uid,
              role: null,
            });

          const [targetIdentity, targetUser] =
            await transaction.getAll(
              adminDb
                .collection(ACCOUNT_IDENTITIES_COLLECTION)
                .doc(participant.uid),
              adminDb
                .collection('users')
                .doc(participant.uid)
            );

          const targetData = targetUser.data();

          if (
            !isGlobalAccountEligible(
              participant.uid,
              targetIdentity
            ) ||
            !hasActiveStartupProfile(
              participant.uid,
              targetData
            )
          ) {
            identities.push(unavailable);
            continue;
          }

          const ownedRoles =
            resolveStartupProfessionalRoles(targetData);

          const candidateRoles =
            participant.role === null
              ? ownedRoles
              : ownedRoles.filter(
                  role => role === participant.role
                );

          let resolved = unavailable;

          for (const role of candidateRoles) {
            const publicationRef = adminDb
              .collection(PROFESSIONAL_PROFILES_COLLECTION)
              .doc(
                getProfessionalProfileId(
                  participant.uid,
                  role
                )
              );

            const publicationSnap =
              await transaction.get(publicationRef);

            const projected =
              projectPublishedRelationshipIdentity(
                {
                  uid: participant.uid,
                  role,
                },
                publicationSnap.data()
              );

            if (projected.isPubliclyAvailable) {
              resolved = projected;
              break;
            }
          }

          identities.push(resolved);
        }

        results.push({
          context,
          status: 'ok',
          participants: identities,
        });
      }

      return results;
    },
    { readOnly: true }
  );
}
