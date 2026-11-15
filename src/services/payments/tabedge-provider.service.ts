import 'server-only';

import {
  PaymentProviderError,
  type PaymentInitiationContext,
  type HostedCheckoutResult,
} from '@/lib/payment-provider';

import {
  requirePaymentProviderEnabled,
} from '@/services/payments/payment-provider.service';

const TABEDGE_ORIGIN =
  'https://www.tabedge.com';

const REQUEST_TIMEOUT_MS = 12000;

const MAX_RESPONSE_BYTES = 65536;

export interface TabEdgeCheckoutStatus {
  id: string;
  status: string;
  amountCents: number;
  currency: 'usd';
  merchantReference: string | null;
  paymentIntentId: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  expiresAt: string | null;
  paidAt: string | null;
}

export class TabEdgeRequestError extends Error {
  constructor(
    public readonly kind:
      | 'configuration'
      | 'provider_rejected'
      | 'outcome_unknown'
      | 'invalid_response',
    public readonly httpStatus: number | null = null
  ) {
    super(`TABEDGE_${kind.toUpperCase()}`);
    this.name = 'TabEdgeRequestError';
  }
}

function validProviderId(
  value: unknown
): value is string {
  return (
    typeof value === 'string' &&
    /^[A-Za-z0-9_-]{1,200}$/.test(value)
  );
}

function readConfig() {
  requirePaymentProviderEnabled('tabedge');

  const apiBase =
    process.env.TABEDGE_API_BASE_URL ??
    TABEDGE_ORIGIN;

  const secret =
    process.env.TABEDGE_SECRET_KEY;

  const publicBase =
    process.env.TABSTARTUP_PUBLIC_BASE_URL ??
    'https://tabstartup.com';

  if (
    apiBase !== TABEDGE_ORIGIN ||
    typeof secret !== 'string' ||
    !/^tb_sk_live_[A-Za-z0-9_-]+$/.test(secret) ||
    publicBase !== 'https://tabstartup.com'
  ) {
    throw new TabEdgeRequestError(
      'configuration'
    );
  }

  return {
    apiBase,
    secret,
    publicBase,
  };
}

/**
 * Validate provider configuration before
 * acquiring a persistent checkout claim.
 */
export function assertTabEdgeCheckoutConfigured(): void {
  readConfig();
}

async function readResponse(
  response: Response
): Promise<Record<string, unknown>> {
  if (!response.body) {
    throw new TabEdgeRequestError(
      'invalid_response'
    );
  }

  const reader = response.body.getReader();

  const chunks: Uint8Array[] = [];

  let size = 0;

  try {
    while (true) {
      const { done, value } =
        await reader.read();

      if (done) {
        break;
      }

      size += value.byteLength;

      if (size > MAX_RESPONSE_BYTES) {
        await reader.cancel();

        throw new TabEdgeRequestError(
          'invalid_response'
        );
      }

      chunks.push(value);
    }

    const raw = Buffer.concat(
      chunks.map(chunk => Buffer.from(chunk))
    ).toString('utf8');

    const result: unknown = JSON.parse(raw);

    if (
      !result ||
      typeof result !== 'object' ||
      Array.isArray(result)
    ) {
      throw new Error('Invalid response');
    }

    return result as Record<string, unknown>;
  } catch {
    throw new TabEdgeRequestError(
      'invalid_response'
    );
  } finally {
    reader.releaseLock();
  }
}

async function requestTabEdge(
  path: string,
  method: 'GET' | 'POST',
  body?: Record<string, unknown>
): Promise<Record<string, unknown>> {
  const config = readConfig();

  let response: Response;

  try {
    response = await fetch(
      `${config.apiBase}${path}`,
      {
        method,

        headers: {
          Authorization:
            `Bearer ${config.secret}`,

          Accept: 'application/json',

          ...(method === 'POST'
            ? {
                'Content-Type':
                  'application/json',
              }
            : {}),
        },

        ...(body
          ? { body: JSON.stringify(body) }
          : {}),

        cache: 'no-store',

        redirect: 'error',

        signal: AbortSignal.timeout(
          REQUEST_TIMEOUT_MS
        ),
      }
    );
  } catch {
    throw new TabEdgeRequestError(
      'outcome_unknown'
    );
  }

  if (response.status !== 200) {
    if (response.body) {
      void response.body.cancel().catch(
        () => undefined
      );
    }

    const rejected = [
      400,
      401,
      403,
      404,
      409,
      503,
    ].includes(response.status);

    throw new TabEdgeRequestError(
      rejected
        ? 'provider_rejected'
        : 'outcome_unknown',

      response.status
    );
  }

  return readResponse(response);
}

function readCheckoutUrl(
  value: unknown,
  checkoutId: string
): string {
  if (
    typeof value !== 'string' ||
    value.length > 2048
  ) {
    throw new TabEdgeRequestError(
      'invalid_response'
    );
  }

  let url: URL;

  try {
    url = new URL(value);
  } catch {
    throw new TabEdgeRequestError(
      'invalid_response'
    );
  }

  if (
    url.origin !== TABEDGE_ORIGIN ||
    url.username ||
    url.password ||
    url.pathname !==
      `/checkout/${checkoutId}` ||
    url.hash
  ) {
    throw new TabEdgeRequestError(
      'invalid_response'
    );
  }

  return url.toString();
}

/**
 * Creates one hosted checkout.
 *
 * MUST be called only after a persistent
 * checkout creation claim has been committed.
 *
 * This adapter never retries a POST request.
 */
export async function createTabEdgeCheckout(
  context: PaymentInitiationContext
): Promise<HostedCheckoutResult> {
  if (
    context.provider !== 'tabedge' ||
    context.currency !== 'USD' ||
    context.purpose !== 'event_ticket' ||
    !validProviderId(context.paymentId) ||
    !validProviderId(context.productOrderId) ||
    !Number.isSafeInteger(context.amountMinor) ||
    context.amountMinor <= 0
  ) {
    throw new PaymentProviderError(
      'PAYMENT_METHOD_MISMATCH'
    );
  }

  if (context.expiresAtMs <= Date.now()) {
    throw new PaymentProviderError(
      'PAYMENT_WINDOW_EXPIRED'
    );
  }

  const config = readConfig();

  const returnUrl =
    `${config.publicBase}/events/orders/` +
    encodeURIComponent(
      context.productOrderId
    );

  const result = await requestTabEdge(
    '/api/platform/v1/checkout-sessions',
    'POST',
    {
      amountCents: context.amountMinor,

      currency: 'usd',

      description: 'TabStartup Event Ticket',

      successUrl: returnUrl,

      cancelUrl: returnUrl,

      merchantReference: context.paymentId,
    }
  );

  if (!validProviderId(result.checkoutId)) {
    throw new TabEdgeRequestError(
      'invalid_response'
    );
  }

  return {
    provider: 'tabedge',
    currency: 'USD',
    type: 'hosted_checkout',

    checkoutSessionId: result.checkoutId,

    checkoutUrl: readCheckoutUrl(
      result.checkoutUrl,
      result.checkoutId
    ),
  };
}

function nullableString(
  value: unknown
): value is string | null {
  return (
    value === null ||
    (
      typeof value === 'string' &&
      value.length > 0 &&
      value.length <= 200
    )
  );
}

function nullableDate(
  value: unknown
): value is string | null {
  return (
    value === null ||
    (
      typeof value === 'string' &&
      value.length <= 40 &&
      /^\d{4}-\d{2}-\d{2}T/.test(value) &&
      Number.isFinite(Date.parse(value))
    )
  );
}

/**
 * Read-only provider status lookup.
 *
 * The caller must independently compare the
 * returned reference, amount and payment state
 * with canonical TabStartup records.
 */
export async function getTabEdgeCheckoutStatus(
  checkoutId: string
): Promise<TabEdgeCheckoutStatus> {
  if (!validProviderId(checkoutId)) {
    throw new TabEdgeRequestError(
      'invalid_response'
    );
  }

  const result = await requestTabEdge(
    '/api/platform/v1/checkouts/' +
      encodeURIComponent(checkoutId),
    'GET'
  );

  if (
    result.id !== checkoutId ||
    typeof result.status !== 'string' ||
    result.status.length < 1 ||
    result.status.length > 64 ||
    typeof result.amountCents !== 'number' ||
    !Number.isSafeInteger(result.amountCents) ||
    result.amountCents <= 0 ||
    result.currency !== 'usd' ||
    !nullableString(result.merchantReference) ||
    !nullableString(result.paymentIntentId) ||
    !nullableDate(result.createdAt) ||
    !nullableDate(result.updatedAt) ||
    !nullableDate(result.expiresAt) ||
    !nullableDate(result.paidAt)
  ) {
    throw new TabEdgeRequestError(
      'invalid_response'
    );
  }

  return {
    id: checkoutId,
    status: result.status,
    amountCents: result.amountCents,
    currency: 'usd',
    merchantReference: result.merchantReference,
    paymentIntentId: result.paymentIntentId,
    createdAt: result.createdAt,
    updatedAt: result.updatedAt,
    expiresAt: result.expiresAt,
    paidAt: result.paidAt,
  };
}
