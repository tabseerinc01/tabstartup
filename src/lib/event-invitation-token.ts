import 'server-only';

import {
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from 'node:crypto';

const TOKEN_CONTEXT =
  'tabstartup-event-invitation-v1';

const INVITATION_ID_PATTERN =
  /^inv_[a-f0-9]{48}$/;

const TOKEN_PATTERN =
  /^[a-f0-9]{64}$/;

function getInvitationSecret(): string {
  const secret =
    process.env.EVENT_INVITATION_SECRET;

  if (
    typeof secret !== 'string' ||
    !/^[a-fA-F0-9]{64}$/.test(secret)
  ) {
    throw new Error(
      'EVENT_INVITATION_SECRET_NOT_CONFIGURED'
    );
  }

  return secret;
}

export function createEventInvitationId(): string {
  return 'inv_' +
    randomBytes(24).toString('hex');
}

export function isValidEventInvitationId(
  value: unknown
): value is string {
  return (
    typeof value === 'string' &&
    INVITATION_ID_PATTERN.test(value)
  );
}

export function isValidEventInvitationToken(
  value: unknown
): value is string {
  return (
    typeof value === 'string' &&
    TOKEN_PATTERN.test(value)
  );
}

export function deriveEventInvitationToken(
  invitationId: string,
  tokenVersion: number
): string {
  if (
    !isValidEventInvitationId(invitationId) ||
    !Number.isSafeInteger(tokenVersion) ||
    tokenVersion < 1
  ) {
    throw new Error(
      'INVALID_INVITATION_TOKEN_INPUT'
    );
  }

  return createHmac(
    'sha256',
    Buffer.from(getInvitationSecret(), 'hex')
  )
    .update(
      JSON.stringify([
        TOKEN_CONTEXT,
        invitationId,
        tokenVersion,
      ])
    )
    .digest('hex');
}

export function hashEventInvitationToken(
  token: string
): string {
  if (!isValidEventInvitationToken(token)) {
    throw new Error(
      'INVALID_INVITATION_TOKEN'
    );
  }

  return createHash('sha256')
    .update(TOKEN_CONTEXT + ':' + token)
    .digest('hex');
}

export function verifyEventInvitationToken(
  token: unknown,
  storedHash: unknown
): boolean {
  if (
    !isValidEventInvitationToken(token) ||
    typeof storedHash !== 'string' ||
    !TOKEN_PATTERN.test(storedHash)
  ) {
    return false;
  }

  const candidateHash =
    hashEventInvitationToken(token);

  return timingSafeEqual(
    Buffer.from(candidateHash, 'hex'),
    Buffer.from(storedHash, 'hex')
  );
}
