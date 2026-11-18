import {
  resolveLegacyStartupStatus,
  resolveStartupProfessionalRoles,
} from '@/lib/legacy-startup-profile';

export const PROFILE_READINESS_VERSION = 1;

export type ProfessionalProfileRole =
  | 'founder'
  | 'investor'
  | 'mentor';

export type ProfileReadinessCheck = {
  key: string;
  label: string;
  completed: boolean;
};

export type ProfileReadinessContext = {
  uid: string;
  emailVerified: boolean;
  accountActive: boolean;
};

export type ProfileReadinessResult = {
  version: number;
  role: ProfessionalProfileRole;
  ready: boolean;
  eligible: boolean;
  requiredCount: number;
  completedCount: number;
  completionPercent: number;
  missingFields: string[];
  blockers: string[];
  checks: ProfileReadinessCheck[];
};

function hasText(
  value: unknown,
  maxLength = 10000
): boolean {
  return (
    typeof value === 'string' &&
    value.trim().length > 0 &&
    value.length <= maxLength
  );
}

function hasValidStringArray(value: unknown): boolean {
  return (
    Array.isArray(value) &&
    value.length > 0 &&
    value.length <= 100 &&
    value.every(item => hasText(item, 1000))
  );
}

function hasValidPhoto(value: unknown): boolean {
  if (!hasText(value)) return false;

  try {
    const url = new URL((value as string).trim());

    return (
      url.protocol === 'https:' &&
      url.hostname.length > 0 &&
      !url.username &&
      !url.password
    );
  } catch {
    return false;
  }
}

export function isProfessionalProfileRole(
  value: unknown
): value is ProfessionalProfileRole {
  return (
    value === 'founder' ||
    value === 'investor' ||
    value === 'mentor'
  );
}

export function evaluateProfileReadiness(
  profile: Record<string, unknown> | undefined,
  role: ProfessionalProfileRole,
  context: ProfileReadinessContext
): ProfileReadinessResult {
  if (!isProfessionalProfileRole(role)) {
    throw new Error('INVALID_PROFESSIONAL_ROLE');
  }

  const data = profile ?? {};
  const checks: ProfileReadinessCheck[] = [];
  const blockers: string[] = [];

  function add(
    key: string,
    label: string,
    completed: boolean
  ) {
    checks.push({ key, label, completed });
  }

  const validUid =
    typeof context.uid === 'string' &&
    context.uid.trim().length > 0 &&
    !context.uid.includes('/');

  if (
    !validUid ||
    context.accountActive !== true ||
    resolveLegacyStartupStatus(
      context.uid,
      profile
    ) !== 'active'
  ) {
    blockers.push('ACCOUNT_NOT_ACTIVE');
  }

  if (
    !resolveStartupProfessionalRoles(profile)
      .includes(role)
  ) {
    blockers.push('ROLE_NOT_OWNED');
  }

  add(
    'fullName',
    'Full Name',
    hasText(data.fullName, 120)
  );

  add(
    'imageUrl',
    'Profile Photo',
    hasValidPhoto(data.imageUrl)
  );

  add(
    'emailVerified',
    'Email Verification',
    context.emailVerified === true
  );

  add(
    'location',
    'Location',
    hasText(data.location)
  );

  if (role === 'investor') {
    add(
      'investorHeadline',
      'Investor Headline',
      hasText(data.investorHeadline) ||
        hasText(data.headline)
    );
  } else {
    add(
      'headline',
      'Professional Headline',
      hasText(data.headline)
    );
  }

  switch (role) {
    case 'founder':
      add(
        'bio',
        'Founder Bio',
        hasText(data.bio)
      );

      add(
        'skills',
        'Professional Skills',
        hasValidStringArray(data.skills)
      );
      break;

    case 'investor':
      add(
        'investorBio',
        'Investor Bio',
        hasText(data.investorBio)
      );

      add(
        'investmentFocus',
        'Investment Focus',
        hasValidStringArray(data.investmentFocus)
      );

      add(
        'preferredStage',
        'Preferred Investment Stage',
        hasValidStringArray(data.preferredStage)
      );

      add(
        'ticketSize',
        'Investment Ticket Size',
        hasText(data.ticketSize)
      );
      break;

    case 'mentor':
      add(
        'mentorBio',
        'Mentor Bio',
        hasText(data.mentorBio)
      );

      add(
        'mentorSkills',
        'Mentoring Skills',
        hasValidStringArray(data.mentorSkills)
      );

      add(
        'yearsOfExperience',
        'Years of Experience',
        hasText(data.yearsOfExperience)
      );

      add(
        'mentorAvailability',
        'Mentor Availability',
        hasText(data.mentorAvailability)
      );
      break;
  }

  const requiredCount = checks.length;

  const completedCount = checks.filter(
    check => check.completed
  ).length;

  const missingFields = checks
    .filter(check => !check.completed)
    .map(check => check.key);

  const eligible = blockers.length === 0;

  return {
    version: PROFILE_READINESS_VERSION,
    role,
    ready: eligible && missingFields.length === 0,
    eligible,
    requiredCount,
    completedCount,
    completionPercent: Math.floor(
      (completedCount / requiredCount) * 100
    ),
    missingFields,
    blockers,
    checks,
  };
}

export function evaluateAllProfileReadiness(
  profile: Record<string, unknown> | undefined,
  context: ProfileReadinessContext
): ProfileReadinessResult[] {
  return resolveStartupProfessionalRoles(profile)
    .map(role =>
      evaluateProfileReadiness(
        profile,
        role,
        context
      )
    );
}
