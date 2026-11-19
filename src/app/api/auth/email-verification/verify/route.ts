import {
  claimEmailOtpVerification,
} from '@/services/email/email-otp-verification.service';

import {
  finalizeEmailOtpVerification,
} from '@/services/email/email-otp-finalization.service';

import {
  resolveOwnEmailVerification,
} from '@/services/email/account-email-verification.service';

import {
  otpApiResponse,
  otpApiError,
  requireOtpApiToken,
  requireOtpApiEnabled,
  requireOtpApiTrustedIp,
  readOtpVerifyCode,
} from '@/services/email/email-otp-api.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

async function verifiedResponse(
  idToken: string,
  status: 'verified' | 'already_verified'
) {
  const verification =
    await resolveOwnEmailVerification(idToken);

  if (!verification.emailVerified) {
    return otpApiResponse({
      success: false,
      status: 'verification_unavailable',
    }, 409);
  }

  return otpApiResponse({
    success: true,
    status,
    emailVerified: true,
    source: verification.source,
  });
}

export async function POST(
  request: Request
) {
  try {
    requireOtpApiEnabled();

    const idToken =
      requireOtpApiToken(request);

    const trustedIp =
      requireOtpApiTrustedIp(request);

    const code =
      await readOtpVerifyCode(request);

    const current =
      await resolveOwnEmailVerification(idToken);

    if (current.emailVerified) {
      return otpApiResponse({
        success: true,
        status: 'already_verified',
        emailVerified: true,
        source: current.source,
      });
    }

    if (
      current.reason === 'authority_binding_mismatch' ||
      current.reason === 'binding_mismatch' ||
      current.reason === 'account_not_active' ||
      current.reason === 'verification_invalid' ||
      current.reason === 'email_invalid' ||
      current.reason === 'email_missing'
    ) {
      return otpApiResponse({
        success: false,
        status: 'verification_unavailable',
      }, 409);
    }

    const result =
      await claimEmailOtpVerification(
        idToken,
        code,
        trustedIp
      );

    switch (result.status) {
      case 'already_verified':
        return await verifiedResponse(
          idToken,
          'already_verified'
        );

      case 'claimed': {
        // The claim never leaves the server.
        const finalized =
          await finalizeEmailOtpVerification(
            idToken,
            result.claim
          );

        if (finalized.status === 'verified') {
          return await verifiedResponse(
            idToken,
            'verified'
          );
        }

        return otpApiResponse({
          success: false,
          status: finalized.status,
        }, 409);
      }

      case 'invalid_code':
        return otpApiResponse({
          success: false,
          status: 'invalid_code',
          attemptsRemaining:
            result.attemptsRemaining,
        }, 400);

      case 'rate_limited':
        return otpApiResponse({
          success: false,
          status: 'rate_limited',
          retryAfterSeconds:
            result.retryAfterSeconds,
        }, 429, result.retryAfterSeconds);

      case 'locked':
      case 'expired':
      case 'no_active_challenge':
      case 'delivery_pending':
      case 'email_changed':
      case 'verification_in_progress':
        return otpApiResponse({
          success: false,
          status: result.status,
        }, 409);
    }

    return otpApiResponse({
      success: false,
      status: 'temporarily_unavailable',
    }, 503);

  } catch (error) {
    return otpApiError(error);
  }
}
