import {
  resolveOwnEmailVerification,
} from '@/services/email/account-email-verification.service';

import {
  isEmailOtpEnabled,
} from '@/services/email/email-otp-crypto.service';

import {
  otpApiResponse,
  otpApiError,
  requireOtpApiToken,
} from '@/services/email/email-otp-api.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(
  request: Request
) {
  try {
    const idToken =
      requireOtpApiToken(request);

    const verification =
      await resolveOwnEmailVerification(idToken);

    if (verification.emailVerified) {
      return otpApiResponse({
        success: true,
        emailVerified: true,
        source: verification.source,
        otpEnabled: isEmailOtpEnabled(),
      });
    }

    return otpApiResponse({
      success: true,
      emailVerified: false,
      source: 'none',
      otpEnabled: isEmailOtpEnabled(),
    });

  } catch (error) {
    return otpApiError(error);
  }
}
