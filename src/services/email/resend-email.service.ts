import 'server-only';

const RESEND_ENDPOINT =
  'https://api.resend.com/emails';

const REQUEST_TIMEOUT_MS = 12000;

export type EmailDeliveryErrorCode =
  | 'EMAIL_DISABLED'
  | 'EMAIL_CONFIGURATION_INVALID'
  | 'EMAIL_INPUT_INVALID'
  | 'EMAIL_PROVIDER_REJECTED'
  | 'EMAIL_PROVIDER_UNAVAILABLE'
  | 'EMAIL_DELIVERY_UNCERTAIN';

export class EmailDeliveryError extends Error {
  constructor(
    public readonly code: EmailDeliveryErrorCode,
    public readonly retryable: boolean,
    public readonly providerStatus: number | null = null
  ) {
    super(code);
    this.name = 'EmailDeliveryError';
  }
}

export interface EmailPdfAttachment {
  filename: string;
  content: string;
}

export interface TransactionalEmailInput {
  to: string;
  subject: string;
  html: string;
  text: string;
  idempotencyKey: string;
  attachments?: EmailPdfAttachment[];
}

export interface EmailDeliveryResult {
  provider: 'resend';
  providerEmailId: string;
  status: 'accepted';
}

function validEmail(value: string): boolean {
  return (
    typeof value === 'string' &&
    value.length <= 254 &&
    /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(value) &&
    !/[\u0000-\u001f\u007f]/.test(value)
  );
}

export function isEventEmailEnabled(): boolean {
  return process.env.EVENT_EMAIL_ENABLED === 'true';
}

function getEmailConfiguration() {
  if (!isEventEmailEnabled()) {
    throw new EmailDeliveryError(
      'EMAIL_DISABLED',
      false
    );
  }

  const apiKey =
    process.env.RESEND_API_KEY?.trim() || '';

  const from =
    process.env.EVENT_EMAIL_FROM?.trim() || '';

  const replyTo =
    process.env.EVENT_EMAIL_REPLY_TO?.trim() || '';

  if (
    !/^re_[A-Za-z0-9_-]{10,250}$/.test(apiKey) ||
    from !==
      'TabStartup Events <events@tabstartup.com>' ||
    replyTo !== 'info@tabstartup.com'
  ) {
    throw new EmailDeliveryError(
      'EMAIL_CONFIGURATION_INVALID',
      false
    );
  }

  return { apiKey, from, replyTo };
}

function validAttachments(
  attachments: EmailPdfAttachment[] | undefined
): boolean {
  if (attachments === undefined) {
    return true;
  }

  if (
    !Array.isArray(attachments) ||
    attachments.length < 1 ||
    attachments.length > 20
  ) {
    return false;
  }

  let totalBytes = 0;
  const filenames = new Set<string>();

  for (const attachment of attachments) {
    if (
      !attachment ||
      typeof attachment.filename !== 'string' ||
      !/^TabStartup-Ticket-TS-[A-F0-9]{64}\.pdf$/.test(
        attachment.filename
      ) ||
      filenames.has(attachment.filename) ||
      typeof attachment.content !== 'string' ||
      attachment.content.length < 8 ||
      attachment.content.length > 1400000 ||
      !/^[A-Za-z0-9+/]+={0,2}$/.test(
        attachment.content
      )
    ) {
      return false;
    }

    const bytes = Buffer.from(
      attachment.content,
      'base64'
    );

    if (
      bytes.length > 1024 * 1024 ||
      bytes.toString('base64') !== attachment.content ||
      bytes.subarray(0, 5).toString('ascii') !== '%PDF-'
    ) {
      return false;
    }

    filenames.add(attachment.filename);
    totalBytes += bytes.length;

    if (totalBytes > 8 * 1024 * 1024) {
      return false;
    }
  }

  return true;
}

function validateInput(
  input: TransactionalEmailInput
): void {
  if (
    !validEmail(input.to) ||
    !validAttachments(input.attachments) ||
    typeof input.subject !== 'string' ||
    !input.subject.trim() ||
    input.subject.length > 200 ||
    /[\u0000-\u001f\u007f]/.test(input.subject) ||
    typeof input.html !== 'string' ||
    !input.html.trim() ||
    Buffer.byteLength(input.html, 'utf8') > 200000 ||
    typeof input.text !== 'string' ||
    !input.text.trim() ||
    Buffer.byteLength(input.text, 'utf8') > 100000 ||
    typeof input.idempotencyKey !== 'string' ||
    !/^[A-Za-z0-9_:/.-]{1,200}$/.test(
      input.idempotencyKey
    )
  ) {
    throw new EmailDeliveryError(
      'EMAIL_INPUT_INVALID',
      false
    );
  }
}

export async function sendTransactionalEmail(
  input: TransactionalEmailInput
): Promise<EmailDeliveryResult> {
  const config = getEmailConfiguration();

  validateInput(input);

  const controller = new AbortController();

  const timeout = setTimeout(
    () => controller.abort(),
    REQUEST_TIMEOUT_MS
  );

  try {
    const response = await fetch(
      RESEND_ENDPOINT,
      {
        method: 'POST',

        headers: {
          Authorization: 'Bearer ' + config.apiKey,

          'Content-Type': 'application/json',

          'Idempotency-Key': input.idempotencyKey,
        },

        body: JSON.stringify({
          from: config.from,
          to: [input.to],
          reply_to: config.replyTo,
          subject: input.subject,
          html: input.html,
          text: input.text,

          ...(input.attachments
            ? { attachments: input.attachments }
            : {}),
        }),

        cache: 'no-store',
        redirect: 'error',
        signal: controller.signal,
      }
    );

    if (!response.ok) {
      const retryable =
        response.status === 429 ||
        response.status >= 500;

      await response.body?.cancel().catch(() => {});

      throw new EmailDeliveryError(
        retryable
          ? 'EMAIL_PROVIDER_UNAVAILABLE'
          : 'EMAIL_PROVIDER_REJECTED',
        retryable,
        response.status
      );
    }

    const body: unknown = await response.json();

    if (
      typeof body !== 'object' ||
      body === null ||
      !('id' in body) ||
      typeof body.id !== 'string' ||
      !/^[A-Za-z0-9_-]{1,200}$/.test(body.id)
    ) {
      throw new EmailDeliveryError(
        'EMAIL_DELIVERY_UNCERTAIN',
        true
      );
    }

    return {
      provider: 'resend',
      providerEmailId: body.id,
      status: 'accepted',
    };
  } catch (error) {
    if (error instanceof EmailDeliveryError) {
      throw error;
    }

    throw new EmailDeliveryError(
      'EMAIL_DELIVERY_UNCERTAIN',
      true
    );
  } finally {
    clearTimeout(timeout);
  }
}
