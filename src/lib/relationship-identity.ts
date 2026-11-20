import {
  isValidProfessionalProfileUid,
  isPlainProfessionalRecord,
  getOwnProfessionalValue,
} from '@/lib/professional-profile-validation';

import type {
  ProfessionalProfileRole,
} from '@/lib/profile-readiness';

export const RELATIONSHIP_COLLECTIONS = {
  connection: 'connections',
  dealRoom: 'dealRooms',
  chat: 'chats',
  mentorshipRequest: 'mentorshipRequests',
  activeMentorship: 'activeMentorships',
  mentorshipSession: 'mentorshipSessions',
  venturePitch: 'venturePitches',
} as const;

export type RelationshipContextType =
  keyof typeof RELATIONSHIP_COLLECTIONS;

export type RelationshipContext = {
  contextType: RelationshipContextType;
  contextId: string;
};

export const RELATIONSHIP_BATCH_MAX = 5;

export type RelationshipParticipant = {
  uid: string;
  role: ProfessionalProfileRole | null;
};

export type RelationshipIdentity = {
  uid: string;
  role: ProfessionalProfileRole | null;
  fullName: string | null;
  imageUrl: string | null;
  headline: string | null;
  isPubliclyAvailable: boolean;
  availability:
    | 'published'
    | 'relationship_only'
    | 'unavailable';
};

export type RelationshipIdentityResult = {
  context: RelationshipContext;
  status: 'ok' | 'unavailable';
  participants: RelationshipIdentity[];
};

export function isRelationshipContextType(
  value: unknown
): value is RelationshipContextType {
  return (
    typeof value === 'string' &&
    Object.prototype.hasOwnProperty.call(
      RELATIONSHIP_COLLECTIONS,
      value
    )
  );
}

export function isValidRelationshipContextId(
  value: unknown
): value is string {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    value.length <= 512 &&
    Buffer.byteLength(value, 'utf8') <= 1500 &&
    value === value.trim() &&
    value !== '.' &&
    value !== '..' &&
    !/^__[\s\S]*__$/.test(value) &&
    !/[/\u0000-\u001f\u007f]/.test(value)
  );
}

export function parseRelationshipContext(
  value: unknown
): RelationshipContext | null {
  if (!isPlainProfessionalRecord(value)) {
    return null;
  }

  const keys = Reflect.ownKeys(value);

  if (
    keys.length !== 2 ||
    !keys.includes('contextType') ||
    !keys.includes('contextId')
  ) {
    return null;
  }

  const contextType =
    getOwnProfessionalValue(value, 'contextType');

  const contextId =
    getOwnProfessionalValue(value, 'contextId');

  if (
    !isRelationshipContextType(contextType) ||
    !isValidRelationshipContextId(contextId)
  ) {
    return null;
  }

  return { contextType, contextId };
}

export function createRelationshipParticipants(
  firstUid: unknown,
  secondUid: unknown,
  firstRole: ProfessionalProfileRole | null,
  secondRole: ProfessionalProfileRole | null
): RelationshipParticipant[] | null {
  if (
    !isValidProfessionalProfileUid(firstUid) ||
    !isValidProfessionalProfileUid(secondUid) ||
    firstUid === secondUid
  ) {
    return null;
  }

  return [
    { uid: firstUid, role: firstRole },
    { uid: secondUid, role: secondRole },
  ];
}

export function createUnavailableRelationshipIdentity(
  participant: RelationshipParticipant
): RelationshipIdentity {
  return {
    uid: participant.uid,
    role: participant.role,
    fullName: null,
    imageUrl: null,
    headline: null,
    isPubliclyAvailable: false,
    availability: 'unavailable',
  };
}
