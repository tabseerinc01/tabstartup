import {
  requestEmailOtp,
} from '@/services/email/email-otp-challenge.service';

import {
  resolveOwnEmailVerification,
} from '@/services/email/account-email-verification.service';

import {
  otpApiResponse,
  otpApiError,
  requireOtpApiToken,
  requireOtpApiEnabled,
  requireOtpApiTrustedIp,
  validateOtpSendRequest,
} from '@/services/email/email-otp-api.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(
  request: Request
) {
  try {
    requireOtpApiEnabled();

    const idToken =
      requireOtpApiToken(request);

    const trustedIp =
      requireOtpApiTrustedIp(request);

    await validateOtpSendRequest(request);

    const verification =
      await resolveOwnEmailVerification(idToken);

    if (verification.emailVerified) {
      return otpApiResponse({
        success: true,
        status: 'already_verified',
        emailVerified: true,
      });
    }

    if (
      verification.reason === 'binding_mismatch' ||
      verification.reason === 'account_not_active' ||
      verification.reason === 'verification_invalid' ||
      verification.reason === 'email_invalid' ||
      verification.reason === 'email_missing'
    ) {
      return otpApiResponse({
        success: false,
        status: 'verification_unavailable',
      }, 409);
    }

    const result =
      await requestEmailOtp(
        idToken,
        trustedIp
      );

    switch (result.status) {
      case 'already_verified': {
        const current =
          await resolveOwnEmailVerification(idToken);

        if (!current.emailVerified) {
          return otpApiResponse({
            success: false,
            status: 'verification_unavailable',
          }, 409);
        }

        return otpApiResponse({
          success: true,
          status: 'already_verified',
          emailVerified: true,
        });
      }

      case 'sent':
        return otpApiResponse({
          success: true,
          status: 'sent',
          expiresAtMs: result.expiresAtMs,
          resendAvailableAtMs:
            result.resendAvailableAtMs,
        });

      case 'cooldown':
      case 'rate_limited':
        return otpApiResponse({
          success: false,
          status: result.status,
          retryAfterSeconds:
            result.retryAfterSeconds,
        }, 429, result.retryAfterSeconds);

      case 'verification_in_progress':
      case 'superseded':
      case 'expired':
        return otpApiResponse({
          success: false,
          status: result.status,
        }, 409);

      case 'delivery_failed':
      case 'delivery_uncertain':
        return otpApiResponse({
          success: false,
          status: result.status,
        }, 503);
    }

    return otpApiResponse({
      success: false,
      status: 'temporarily_unavailable',
    }, 503);

  } catch (error) {
    return otpApiError(error);
  }
}
