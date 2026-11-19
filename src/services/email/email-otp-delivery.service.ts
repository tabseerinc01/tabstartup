import 'server-only';

import {
  isValidEmailOtp,
  requireExactVerificationEmail,
} from '@/lib/email-verification';

import {
  isEmailOtpEnabled,
} from './email-otp-crypto.service';

import {
  buildEmailOtpTemplate,
} from './email-otp-template.service';

const RESEND_ENDPOINT =
  'https://api.resend.com/emails';

const REQUEST_TIMEOUT_MS = 12000;

export type EmailOtpDeliveryErrorCode =
  | 'EMAIL_OTP_DISABLED'
  | 'EMAIL_OTP_CONFIGURATION_INVALID'
  | 'EMAIL_OTP_INPUT_INVALID'
  | 'EMAIL_OTP_PROVIDER_REJECTED'
  | 'EMAIL_OTP_PROVIDER_UNAVAILABLE'
  | 'EMAIL_OTP_DELIVERY_UNCERTAIN';

export class EmailOtpDeliveryError extends Error {
  constructor(
    public readonly code:
      EmailOtpDeliveryErrorCode,

    public readonly outcome:
      'not_sent' | 'uncertain',

    public readonly providerStatus:
      number | null = null
  ) {
    super(code);

    this.name = 'EmailOtpDeliveryError';
  }
}

export interface EmailOtpDeliveryInput {
  email: string;

  code: string;

  challengeId: string;
}

export interface EmailOtpDeliveryResult {
  provider: 'resend';

  providerEmailId: string;

  status: 'accepted';
}

function getOtpEmailConfiguration() {
  if (!isEmailOtpEnabled()) {
    throw new EmailOtpDeliveryError(
      'EMAIL_OTP_DISABLED',
      'not_sent'
    );
  }

  const apiKey =
    process.env.RESEND_API_KEY?.trim() || '';

  const from =
    process.env.AUTH_EMAIL_FROM?.trim() || '';

  const replyTo =
    process.env.AUTH_EMAIL_REPLY_TO?.trim() || '';

  if (
    !/^re_[A-Za-z0-9_-]{10,250}$/.test(apiKey) ||

    from !==
      'TabStartup <verify@tabstartup.com>' ||

    replyTo !== 'info@tabstartup.com'
  ) {
    throw new EmailOtpDeliveryError(
      'EMAIL_OTP_CONFIGURATION_INVALID',
      'not_sent'
    );
  }

  return {
    apiKey,
    from,
    replyTo,
  };
}

/**
 * Validate delivery configuration before
 * creating a new OTP challenge.
 *
 * Does not send email or expose credentials.
 */
export function assertEmailOtpDeliveryConfigured(): void {
  getOtpEmailConfiguration();
}

/**
 * Independent OTP delivery.
 *
 * No event outbox, ticket attachments,
 * automatic retries or provider-body logging.
 */
export async function sendEmailOtp(
  input: EmailOtpDeliveryInput
): Promise<EmailOtpDeliveryResult> {
  const config = getOtpEmailConfiguration();

  if (
    !input ||
    !isValidEmailOtp(input.code) ||

    typeof input.challengeId !== 'string' ||

    !/^[a-f0-9]{64}$/.test(
      input.challengeId
    )
  ) {
    throw new EmailOtpDeliveryError(
      'EMAIL_OTP_INPUT_INVALID',
      'not_sent'
    );
  }

  let email: string;

  try {
    email = requireExactVerificationEmail(
      input.email
    );
  } catch {
    throw new EmailOtpDeliveryError(
      'EMAIL_OTP_INPUT_INVALID',
      'not_sent'
    );
  }

  const template =
    buildEmailOtpTemplate(input.code);

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
          Authorization:
            'Bearer ' + config.apiKey,

          'Content-Type':
            'application/json',

          'Idempotency-Key':
            'tabstartup:email-otp:v1:' +
            input.challengeId,
        },

        body: JSON.stringify({
          from: config.from,

          to: [email],

          reply_to: config.replyTo,

          subject: template.subject,

          html: template.html,

          text: template.text,
        }),

        cache: 'no-store',

        redirect: 'error',

        signal: controller.signal,
      }
    );

    if (!response.ok) {
      await response.body
        ?.cancel()
        .catch(() => {});

      // A provider rejection is not always
      // proof that no email was accepted.
      const definiteRejection = [
        400,
        401,
        403,
        404,
        413,
        422,
        429,
      ].includes(response.status);

      throw new EmailOtpDeliveryError(
        definiteRejection
          ? 'EMAIL_OTP_PROVIDER_REJECTED'
          : 'EMAIL_OTP_PROVIDER_UNAVAILABLE',

        definiteRejection
          ? 'not_sent'
          : 'uncertain',

        response.status
      );
    }

    const body: unknown =
      await response.json();

    if (
      typeof body !== 'object' ||
      body === null ||
      !('id' in body) ||

      typeof body.id !== 'string' ||

      !/^[A-Za-z0-9_-]{1,200}$/.test(
        body.id
      )
    ) {
      throw new EmailOtpDeliveryError(
        'EMAIL_OTP_DELIVERY_UNCERTAIN',
        'uncertain'
      );
    }

    return {
      provider: 'resend',

      providerEmailId: body.id,

      status: 'accepted',
    };

  } catch (error: unknown) {
    if (
      error instanceof EmailOtpDeliveryError
    ) {
      throw error;
    }

    // Timeout, network failure or malformed
    // response may occur after acceptance.
    // Never log request content or OTP codes.
    throw new EmailOtpDeliveryError(
      'EMAIL_OTP_DELIVERY_UNCERTAIN',
      'uncertain'
    );

  } finally {
    clearTimeout(timeout);
  }
}
