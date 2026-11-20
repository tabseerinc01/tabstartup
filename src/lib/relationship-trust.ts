import {
  isPlainProfessionalRecord,
  getOwnProfessionalValue,
  isValidProfessionalProfileUid,
} from '@/lib/professional-profile-validation';

import {
  isValidRelationshipContextId,
} from '@/lib/relationship-identity';

function get(data: unknown, key: string): unknown {
  return getOwnProfessionalValue(data, key);
}

function validPair(first: unknown, second: unknown): boolean {
  return (
    isValidProfessionalProfileUid(first) &&
    isValidProfessionalProfileUid(second) &&
    first !== second
  );
}

export function isAcceptedConnection(
  data: unknown
): boolean {
  if (!isPlainProfessionalRecord(data)) {
    return false;
  }

  const type = get(data, 'type');

  return (
    get(data, 'status') === 'accepted' &&
    (
      type === 'investor' ||
      type === 'cofounder' ||
      type === 'mentor' ||
      type === 'founder' ||
      type === 'service'
    ) &&
    validPair(
      get(data, 'initiatorUid'),
      get(data, 'recipientUid')
    )
  );
}

export function hasMatchingFundingEvidence(
  deal: unknown,
  connectionId: unknown,
  connection: unknown
): boolean {
  if (
    !isPlainProfessionalRecord(deal) ||
    !isValidRelationshipContextId(connectionId) ||
    !isAcceptedConnection(connection)
  ) {
    return false;
  }

  const founderUid = get(deal, 'founderUid');
  const investorUid = get(deal, 'investorUid');

  return (
    validPair(founderUid, investorUid) &&
    get(deal, 'startupId') === founderUid &&
    get(deal, 'connectionId') === connectionId &&
    get(connection, 'type') === 'investor' &&
    get(connection, 'initiatorUid') === investorUid &&
    get(connection, 'recipientUid') === founderUid
  );
}

export function isAcceptedMentorshipRequest(
  request: unknown
): boolean {
  return (
    isPlainProfessionalRecord(request) &&
    get(request, 'status') === 'Accepted' &&
    validPair(
      get(request, 'founderUid'),
      get(request, 'mentorUid')
    )
  );
}

export function hasMatchingMentorshipEvidence(
  mentorshipId: unknown,
  mentorship: unknown,
  requestId: unknown,
  request: unknown
): boolean {
  if (
    !isValidRelationshipContextId(mentorshipId) ||
    !isValidRelationshipContextId(requestId) ||
    !isPlainProfessionalRecord(mentorship) ||
    !isAcceptedMentorshipRequest(request)
  ) {
    return false;
  }

  const startupId = get(mentorship, 'startupId');

  return (
    mentorshipId === `mentorship_${requestId}` &&
    get(mentorship, 'requestId') === requestId &&
    isValidRelationshipContextId(startupId) &&
    get(request, 'startupId') === startupId &&
    get(mentorship, 'founderUid') ===
      get(request, 'founderUid') &&
    get(mentorship, 'mentorUid') ===
      get(request, 'mentorUid')
  );
}

export function hasMatchingSessionEvidence(
  session: unknown,
  mentorshipId: unknown,
  mentorship: unknown
): boolean {
  if (
    !isPlainProfessionalRecord(session) ||
    !isPlainProfessionalRecord(mentorship) ||
    !isValidRelationshipContextId(mentorshipId)
  ) {
    return false;
  }

  const founderUid = get(session, 'founderUid');
  const mentorUid = get(session, 'mentorUid');
  const startupId = get(session, 'startupId');

  return (
    validPair(founderUid, mentorUid) &&
    isValidRelationshipContextId(startupId) &&
    get(session, 'mentorshipId') === mentorshipId &&
    get(mentorship, 'founderUid') === founderUid &&
    get(mentorship, 'mentorUid') === mentorUid &&
    get(mentorship, 'startupId') === startupId
  );
}
