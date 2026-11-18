import {
  isPlainProfessionalRecord,
  hasOwnProfessionalTrue,
} from '@/lib/professional-profile-validation';

/**
 * TabStartup public professional verification contract.
 *
 * Public claims are not verification evidence.
 * Never expose verification documents, review notes,
 * account numbers or private verification decisions.
 */

export const PROFESSIONAL_VERIFICATION_VERSION = 1;

/**
 * Supported verification claim categories.
 *
 * Category definitions do not authorize badges.
 * Actual verification approval requires trusted
 * server-side evidence and review.
 */
export const PROFESSIONAL_VERIFICATION_CLAIMS = [
  'email',
  'identity',
  'address',
  'business',
  'bankAccount',
  'financialCapacity',
  'professional',
] as const;

export type ProfessionalVerificationClaim =
  typeof PROFESSIONAL_VERIFICATION_CLAIMS[number];

/**
 * Public verification summaries expose only approved
 * positive claims.
 *
 * Missing claims do not imply rejection or failure.
 */
export type PublicProfessionalVerificationSummary =
  Partial<Record<ProfessionalVerificationClaim, true>>;

/**
 * Initial trusted verification context.
 *
 * Email verification must come from Firebase Auth
 * or another authoritative server-side Auth check.
 *
 * Do not populate this context from private profile
 * flags or client-submitted request data.
 */
export type TrustedProfessionalVerificationContext = {
  emailVerified: boolean;
};

/**
 * Initial public verification summary builder.
 *
 * Only email verification is supported at this stage.
 *
 * Additional claims remain disabled until the
 * dedicated verification review service is implemented.
 */
export function buildPublicVerificationSummary(
  context: TrustedProfessionalVerificationContext
): PublicProfessionalVerificationSummary {
  if (!isPlainProfessionalRecord(context)) {
    throw new Error(
      'INVALID_VERIFICATION_CONTEXT'
    );
  }

  const result: PublicProfessionalVerificationSummary = {};

  if (
    hasOwnProfessionalTrue(
      context,
      'emailVerified'
    )
  ) {
    result.email = true;
  }

  return result;
}
