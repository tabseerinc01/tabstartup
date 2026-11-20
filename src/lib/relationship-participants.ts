import {
  isPlainProfessionalRecord,
  getOwnProfessionalValue,
  getOwnProfessionalArrayItem,
  isValidProfessionalProfileUid,
} from '@/lib/professional-profile-validation';

import {
  createRelationshipParticipants,
  type RelationshipContextType,
  type RelationshipParticipant,
} from '@/lib/relationship-identity';

export function resolveRelationshipParticipants(
  contextType: RelationshipContextType,
  data: unknown
): RelationshipParticipant[] | null {
  if (!isPlainProfessionalRecord(data)) {
    return null;
  }

  const get = (key: string) =>
    getOwnProfessionalValue(data, key);

  switch (contextType) {
    case 'connection': {
      const type = get('type');

      if (
        type !== 'investor' &&
        type !== 'cofounder' &&
        type !== 'mentor' &&
        type !== 'founder' &&
        type !== 'service'
      ) {
        return null;
      }

      const initiator = get('initiatorUid');
      const recipient = get('recipientUid');

      if (type === 'investor') {
        return createRelationshipParticipants(
          initiator,
          recipient,
          'investor',
          'founder'
        );
      }

      return createRelationshipParticipants(
        initiator,
        recipient,
        null,
        null
      );
    }

    case 'dealRoom':
      return createRelationshipParticipants(
        get('founderUid'),
        get('investorUid'),
        'founder',
        'investor'
      );

    case 'mentorshipRequest':
    case 'activeMentorship':
    case 'mentorshipSession':
      return createRelationshipParticipants(
        get('founderUid'),
        get('mentorUid'),
        'founder',
        'mentor'
      );

    case 'venturePitch':
      return createRelationshipParticipants(
        get('senderUid'),
        get('recipientUid'),
        'founder',
        'investor'
      );

    case 'chat': {
      const participants = get('participants');

      if (
        !Array.isArray(participants) ||
        participants.length !== 2
      ) {
        return null;
      }

      return createRelationshipParticipants(
        getOwnProfessionalArrayItem(participants, 0),
        getOwnProfessionalArrayItem(participants, 1),
        null,
        null
      );
    }

    default:
      return null;
  }
}

export function resolveAuthorizedRelationshipParticipants(
  requesterUid: unknown,
  contextType: RelationshipContextType,
  data: unknown
): RelationshipParticipant[] | null {
  if (!isValidProfessionalProfileUid(requesterUid)) {
    return null;
  }

  const participants =
    resolveRelationshipParticipants(contextType, data);

  if (
    !participants ||
    !participants.some(
      participant => participant.uid === requesterUid
    )
  ) {
    return null;
  }

  return participants;
}
