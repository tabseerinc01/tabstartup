import {
  isPlainProfessionalRecord,
  getOwnProfessionalValue,
  sanitizePublicText,
  sanitizePublicUrl,
  PROFESSIONAL_NAME_MAX_LENGTH,
} from '@/lib/professional-profile-validation';

import {
  PROFESSIONAL_PROFILE_SCHEMA_VERSION,
} from '@/lib/professional-profile';

import {
  isProfessionalProfileRole,
} from '@/lib/profile-readiness';

import {
  createUnavailableRelationshipIdentity,
  type RelationshipParticipant,
  type RelationshipIdentity,
} from '@/lib/relationship-identity';

export function projectPublishedRelationshipIdentity(
  participant: RelationshipParticipant,
  publication: unknown
): RelationshipIdentity {
  const unavailable =
    createUnavailableRelationshipIdentity(participant);

  if (!isPlainProfessionalRecord(publication)) {
    return unavailable;
  }

  const get = (key: string) =>
    getOwnProfessionalValue(publication, key);

  const role = get('role');

  if (
    get('uid') !== participant.uid ||
    get('schemaVersion') !==
      PROFESSIONAL_PROFILE_SCHEMA_VERSION ||
    get('visibility') !== 'public' ||
    get('status') !== 'published' ||
    !isProfessionalProfileRole(role) ||
    (
      participant.role !== null &&
      participant.role !== role
    )
  ) {
    return unavailable;
  }

  const fullName = sanitizePublicText(
    get('fullName'),
    PROFESSIONAL_NAME_MAX_LENGTH
  );

  const imageUrl = sanitizePublicUrl(
    get('imageUrl')
  );

  const headline = sanitizePublicText(
    role === 'investor'
      ? get('investorHeadline')
      : get('headline')
  );

  if (!fullName || !imageUrl || !headline) {
    return unavailable;
  }

  return {
    uid: participant.uid,
    role,
    fullName,
    imageUrl,
    headline,
    isPubliclyAvailable: true,
    availability: 'published',
  };
}
