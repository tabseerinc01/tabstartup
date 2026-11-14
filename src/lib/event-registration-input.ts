import 'server-only';

import type {
  EventParticipant,
} from '@/lib/event-types';

import {
  EVENT_LIMITS,
  isValidEventDocumentId,
  isValidEventSlug,
} from '@/lib/event-validation';

import {
  isPaymentCurrency,
  type PaymentCurrency,
} from '@/lib/payment-types';

export class EventRegistrationInputError
  extends Error {

  constructor(
    public readonly field: string
  ) {
    super('INVALID_REGISTRATION_INPUT');
    this.name = 'EventRegistrationInputError';
  }
}

export type RegistrationParticipantInput =
  Omit<EventParticipant, 'uid'>;

export interface EventRegistrationInput {
  eventSlug: string;

  ticketTypeId: string;

  quantity: number;

  currency: PaymentCurrency | null;

  purchaserEmail: string;

  participants: RegistrationParticipantInput[];

  acceptedTerms: true;

  termsHash: string;

  refundPolicyHash: string;

  expectedUnitAmountMinor: number;

  idempotencyKey: string;
}

function requireField(
  condition: unknown,
  field: string
): asserts condition {
  if (!condition) {
    throw new EventRegistrationInputError(field);
  }
}

function asObject(
  value: unknown,
  field: string
): Record<string, unknown> {
  requireField(
    value !== null &&
    typeof value === 'object' &&
    !Array.isArray(value),
    field
  );

  return value as Record<string, unknown>;
}

function assertAllowedFields(
  value: Record<string, unknown>,
  allowed: readonly string[],
  field: string
): void {
  requireField(
    Object.keys(value).every(
      key => allowed.includes(key)
    ),
    field
  );
}

function requiredText(
  value: unknown,
  field: string,
  maxLength: number
): string {
  requireField(
    typeof value === 'string',
    field
  );

  const normalized = value.trim();

  requireField(
    normalized.length > 0 &&
    normalized.length <= maxLength &&
    !/[\u0000-\u001f\u007f]/.test(normalized),
    field
  );

  return normalized;
}

function optionalText(
  value: unknown,
  field: string,
  maxLength: number
): string | null {
  if (
    value === undefined ||
    value === null ||
    value === ''
  ) {
    return null;
  }

  requireField(
    typeof value === 'string',
    field
  );

  if (!value.trim()) {
    return null;
  }

  return requiredText(
    value,
    field,
    maxLength
  );
}

function normalizeEmail(
  value: unknown,
  field: string
): string {
  const email = requiredText(
    value,
    field,
    254
  ).toLowerCase();

  requireField(
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email),
    field
  );

  return email;
}

function normalizePhone(
  value: unknown,
  field: string
): string | null {
  const phone = optionalText(
    value,
    field,
    40
  );

  if (phone === null) {
    return null;
  }

  requireField(
    /^\+?[0-9 ()-]+$/.test(phone),
    field
  );

  const digits = phone.replace(/\D/g, '');

  requireField(
    digits.length >= 7 &&
    digits.length <= 15,
    field
  );

  return phone;
}

function readParticipant(
  value: unknown,
  index: number
): RegistrationParticipantInput {
  const field = `participants.${index}`;

  const participant = asObject(
    value,
    field
  );

  assertAllowedFields(
    participant,
    [
      'fullName',
      'email',
      'phone',
      'organization',
      'designation',
    ],
    field
  );

  return {
    fullName: requiredText(
      participant.fullName,
      `${field}.fullName`,
      150
    ),

    email: normalizeEmail(
      participant.email,
      `${field}.email`
    ),

    phone: normalizePhone(
      participant.phone,
      `${field}.phone`
    ),

    organization: optionalText(
      participant.organization,
      `${field}.organization`,
      200
    ),

    designation: optionalText(
      participant.designation,
      `${field}.designation`,
      150
    ),
  };
}

function readPolicyHash(
  value: unknown,
  field: string
): string {
  requireField(
    typeof value === 'string' &&
    /^[a-f0-9]{64}$/.test(value),
    field
  );

  return value;
}

function readExpectedUnitAmount(
  value: unknown
): number {
  requireField(
    typeof value === 'number' &&
    Number.isSafeInteger(value) &&
    value >= 0,
    'expectedUnitAmountMinor'
  );

  return value;
}

function readIdempotencyKey(
  value: unknown
): string {
  const key = requiredText(
    value,
    'idempotencyKey',
    36
  ).toLowerCase();

  requireField(
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
      .test(key),
    'idempotencyKey'
  );

  return key;
}

export function validateEventRegistrationInput(
  value: unknown
): EventRegistrationInput {
  const input = asObject(
    value,
    'registration'
  );

  assertAllowedFields(
    input,
    [
      'eventSlug',
      'ticketTypeId',
      'quantity',
      'currency',
      'purchaserEmail',
      'participants',
      'acceptedTerms',
      'termsHash',
      'refundPolicyHash',
      'expectedUnitAmountMinor',
      'idempotencyKey',
    ],
    'registration'
  );

  const eventSlug = requiredText(
    input.eventSlug,
    'eventSlug',
    120
  );

  requireField(
    isValidEventSlug(eventSlug),
    'eventSlug'
  );

  const ticketTypeId = requiredText(
    input.ticketTypeId,
    'ticketTypeId',
    128
  );

  requireField(
    isValidEventDocumentId(ticketTypeId) &&
    !/^__.*__$/.test(ticketTypeId),
    'ticketTypeId'
  );

  const quantity = input.quantity;

  requireField(
    typeof quantity === 'number' &&
    Number.isSafeInteger(quantity) &&
    quantity >= 1 &&
    quantity <= EVENT_LIMITS.maxTicketsPerOrder,
    'quantity'
  );

  const currency = input.currency;

  requireField(
    currency === null ||
    isPaymentCurrency(currency),
    'currency'
  );

  requireField(
    input.acceptedTerms === true,
    'acceptedTerms'
  );

  requireField(
    Array.isArray(input.participants) &&
    input.participants.length === quantity,
    'participants'
  );

  const participants = Array.from(
    input.participants,
    (participant, index) =>
      readParticipant(participant, index)
  );

  return {
    eventSlug,
    ticketTypeId,
    quantity,
    currency,

    purchaserEmail: normalizeEmail(
      input.purchaserEmail,
      'purchaserEmail'
    ),

    participants,

    acceptedTerms: true,

    termsHash: readPolicyHash(
      input.termsHash,
      'termsHash'
    ),

    refundPolicyHash: readPolicyHash(
      input.refundPolicyHash,
      'refundPolicyHash'
    ),

    expectedUnitAmountMinor:
      readExpectedUnitAmount(
        input.expectedUnitAmountMinor
      ),

    idempotencyKey: readIdempotencyKey(
      input.idempotencyKey
    ),
  };
}
