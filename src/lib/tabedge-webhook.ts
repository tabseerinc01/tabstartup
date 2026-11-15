import {
  createHmac,
  timingSafeEqual,
} from 'node:crypto';

export const TABEDGE_WEBHOOK_TOLERANCE_SECONDS = 300;

export const TABEDGE_WEBHOOK_MAX_BODY_BYTES =
  64 * 1024;

export type TabEdgeWebhookErrorCode =
  | 'WEBHOOK_CONFIGURATION_INVALID'
  | 'WEBHOOK_BODY_INVALID'
  | 'WEBHOOK_HEADERS_INVALID'
  | 'WEBHOOK_TIMESTAMP_INVALID'
  | 'WEBHOOK_SIGNATURE_INVALID'
  | 'WEBHOOK_PAYLOAD_INVALID'
  | 'WEBHOOK_BUSINESS_MISMATCH';

export class TabEdgeWebhookError extends Error {
  constructor(
    public readonly code: TabEdgeWebhookErrorCode
  ) {
    super(code);
    this.name = 'TabEdgeWebhookError';
  }
}

export interface TabEdgeWebhookHeaders {
  id: string | null;
  timestamp: string | null;
  signature: string | null;
}

export interface TabEdgePaymentSucceededEvent {
  id: string;
  type: 'checkout.payment_succeeded';
  data: {
    checkoutId: string;
    paymentId: string;
    businessId: string;
    merchantReference: string;
    amountCents: number;
    currency: 'usd';
  };
}

export type VerifiedTabEdgeWebhook =
  | {
      kind: 'payment_succeeded';
      event: TabEdgePaymentSucceededEvent;
    }
  | {
      kind: 'ignored';
      eventId: string;
      eventType: string;
    };

function validIdentifier(
  value: unknown,
  maxLength = 200
): value is string {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    value.length <= maxLength &&
    /^[A-Za-z0-9_-]+$/.test(value)
  );
}

function isRecord(
  value: unknown
): value is Record<string, unknown> {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value)
  );
}

export function readTabEdgeWebhookConfiguration() {
  const secret =
    process.env.TABEDGE_WEBHOOK_SECRET;

  const businessId =
    process.env.TABEDGE_BUSINESS_ID;

  if (
    typeof secret !== 'string' ||
    secret.length < 16 ||
    secret.length > 512 ||
    secret !== secret.trim() ||
    !validIdentifier(businessId)
  ) {
    throw new TabEdgeWebhookError(
      'WEBHOOK_CONFIGURATION_INVALID'
    );
  }

  return {
    secret,
    businessId,
  };
}

export function verifyTabEdgeWebhook(
  rawBody: Buffer,
  headers: TabEdgeWebhookHeaders,
  configuration: {
    secret: string;
    businessId: string;
  },
  nowMs = Date.now()
): VerifiedTabEdgeWebhook {
  if (
    typeof configuration.secret !== 'string' ||
    configuration.secret.length < 16 ||
    configuration.secret.length > 512 ||
    configuration.secret !==
      configuration.secret.trim() ||
    !validIdentifier(configuration.businessId)
  ) {
    throw new TabEdgeWebhookError(
      'WEBHOOK_CONFIGURATION_INVALID'
    );
  }

  if (
    !Buffer.isBuffer(rawBody) ||
    rawBody.length === 0 ||
    rawBody.length >
      TABEDGE_WEBHOOK_MAX_BODY_BYTES
  ) {
    throw new TabEdgeWebhookError(
      'WEBHOOK_BODY_INVALID'
    );
  }

  const {
    id,
    timestamp,
    signature,
  } = headers;

  if (
    !validIdentifier(id) ||
    typeof timestamp !== 'string' ||
    !/^[0-9]{1,12}$/.test(timestamp) ||
    typeof signature !== 'string' ||
    !/^[a-fA-F0-9]{64}$/.test(signature)
  ) {
    throw new TabEdgeWebhookError(
      'WEBHOOK_HEADERS_INVALID'
    );
  }

  const timestampSeconds = Number(timestamp);

  if (
    !Number.isSafeInteger(timestampSeconds) ||
    timestampSeconds <= 0 ||
    !Number.isFinite(nowMs) ||
    Math.abs(
      nowMs / 1000 - timestampSeconds
    ) > TABEDGE_WEBHOOK_TOLERANCE_SECONDS
  ) {
    throw new TabEdgeWebhookError(
      'WEBHOOK_TIMESTAMP_INVALID'
    );
  }

  const expectedSignature = createHmac(
    'sha256',
    configuration.secret
  )
    .update(timestamp + '.', 'utf8')
    .update(rawBody)
    .digest();

  const receivedSignature = Buffer.from(
    signature,
    'hex'
  );

  if (
    receivedSignature.length !==
      expectedSignature.length ||
    !timingSafeEqual(
      receivedSignature,
      expectedSignature
    )
  ) {
    throw new TabEdgeWebhookError(
      'WEBHOOK_SIGNATURE_INVALID'
    );
  }

  let payload: unknown;

  try {
    const decoded = new TextDecoder(
      'utf-8',
      { fatal: true }
    ).decode(rawBody);

    payload = JSON.parse(decoded);
  } catch {
    throw new TabEdgeWebhookError(
      'WEBHOOK_PAYLOAD_INVALID'
    );
  }

  if (
    !isRecord(payload) ||
    !validIdentifier(payload.id) ||
    payload.id !== id ||
    typeof payload.type !== 'string' ||
    !/^[a-z][a-z0-9_.]{0,127}$/.test(
      payload.type
    )
  ) {
    throw new TabEdgeWebhookError(
      'WEBHOOK_PAYLOAD_INVALID'
    );
  }

  if (
    payload.type !==
      'checkout.payment_succeeded'
  ) {
    return {
      kind: 'ignored',
      eventId: payload.id,
      eventType: payload.type,
    };
  }

  const data = payload.data;

  if (
    !isRecord(data) ||
    !validIdentifier(data.checkoutId) ||
    !validIdentifier(data.paymentId) ||
    !validIdentifier(data.businessId) ||
    !validIdentifier(data.merchantReference) ||
    typeof data.amountCents !== 'number' ||
    !Number.isSafeInteger(data.amountCents) ||
    data.amountCents <= 0 ||
    data.currency !== 'usd'
  ) {
    throw new TabEdgeWebhookError(
      'WEBHOOK_PAYLOAD_INVALID'
    );
  }

  if (
    data.businessId !==
      configuration.businessId
  ) {
    throw new TabEdgeWebhookError(
      'WEBHOOK_BUSINESS_MISMATCH'
    );
  }

  return {
    kind: 'payment_succeeded',
    event: {
      id: payload.id,
      type: 'checkout.payment_succeeded',
      data: {
        checkoutId: data.checkoutId,
        paymentId: data.paymentId,
        businessId: data.businessId,
        merchantReference: data.merchantReference,
        amountCents: data.amountCents,
        currency: 'usd',
      },
    },
  };
}
