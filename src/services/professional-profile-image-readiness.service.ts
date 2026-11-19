import 'server-only';

import {
  evaluateProfileReadiness,
  type ProfessionalProfileRole,
  type ProfileReadinessContext,
  type ProfileReadinessResult,
} from '@/lib/profile-readiness';

import {
  verifyTrustedProfileImage,
} from '@/services/profile-image-verification.service';

/**
 * Server-side readiness with verified photo evidence.
 *
 * Never accepts client-supplied verification claims.
 * Infrastructure failures propagate to the caller.
 */
export async function evaluateVerifiedProfileReadiness(
  canonical: Record<string, unknown> | undefined,
  role: ProfessionalProfileRole,
  context: ProfileReadinessContext
): Promise<ProfileReadinessResult> {
  const readiness = evaluateProfileReadiness(
    canonical,
    role,
    context
  );

  if (
    !canonical ||
    !readiness.eligible ||
    !readiness.checks.some(
      check => check.key === 'imageUrl' && check.completed
    )
  ) {
    return readiness;
  }

  const verification = await verifyTrustedProfileImage(
    canonical.imageUrl,
    context.uid
  );

  if (verification.valid) {
    return readiness;
  }

  const checks = readiness.checks.map(check =>
    check.key === 'imageUrl'
      ? { ...check, completed: false }
      : check
  );

  const completedCount = checks.filter(
    check => check.completed
  ).length;

  const missingFields = checks
    .filter(check => !check.completed)
    .map(check => check.key);

  return {
    ...readiness,
    ready: false,
    checks,
    completedCount,
    missingFields,
    completionPercent: Math.floor(
      completedCount / readiness.requiredCount * 100
    ),
  };
}
