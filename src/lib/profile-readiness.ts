import {
  resolveLegacyStartupStatus,
  resolveStartupProfessionalRoles,
} from '@/lib/legacy-startup-profile';

import {
  PROFESSIONAL_NAME_MAX_LENGTH,
  sanitizePublicText,
  sanitizePublicStringArray,
  sanitizePublicUrl,
  isValidProfessionalProfileUid,
  isPlainProfessionalRecord,
  getOwnProfessionalValue,
  hasOwnProfessionalTrue,
  buildProfessionalIdentitySnapshot,
} from '@/lib/professional-profile-validation';

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

/**
 * Readiness and public projection must use
 * the same field validation rules.
 */

function hasText(
  value: unknown,
  maxLength?: number
): boolean {
  return (
    sanitizePublicText(
      value,
      maxLength
    ) !== undefined
  );
}

function hasValidStringArray(
  value: unknown
): boolean {
  const sanitized =
    sanitizePublicStringArray(value);

  return (
    sanitized !== undefined &&
    sanitized.length > 0
  );
}

function hasValidPhoto(
  value: unknown
): boolean {
  return (
    sanitizePublicUrl(value) !== undefined
  );
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

  if (!isPlainProfessionalRecord(context)) {
    throw new Error(
      'INVALID_READINESS_CONTEXT'
    );
  }

  const identity =
    buildProfessionalIdentitySnapshot(profile);

  function readField(
    key: string
  ): unknown {
    return getOwnProfessionalValue(
      profile,
      key
    );
  }
  const checks: ProfileReadinessCheck[] = [];
  const blockers: string[] = [];

  function add(
    key: string,
    label: string,
    completed: boolean
  ) {
    checks.push({ key, label, completed });
  }

  const uid = getOwnProfessionalValue(
    context,
    'uid'
  );

  const accountActive =
    hasOwnProfessionalTrue(
      context,
      'accountActive'
    );

  if (
    !isValidProfessionalProfileUid(uid) ||
    !accountActive ||
    !identity ||
    resolveLegacyStartupStatus(
      uid,
      identity
    ) !== 'active'
  ) {
    blockers.push('ACCOUNT_NOT_ACTIVE');
  }

  if (
    !identity ||
    !resolveStartupProfessionalRoles(identity)
      .includes(role)
  ) {
    blockers.push('ROLE_NOT_OWNED');
  }

  add(
    'fullName',
    'Full Name',
    hasText(
      readField('fullName'),
      PROFESSIONAL_NAME_MAX_LENGTH
    )
  );

  add(
    'imageUrl',
    'Profile Photo',
    hasValidPhoto(readField('imageUrl'))
  );

  add(
    'emailVerified',
    'Email Verification',
    hasOwnProfessionalTrue(
      context,
      'emailVerified'
    )
  );

  add(
    'location',
    'Location',
    hasText(readField('location'))
  );

  if (role === 'investor') {
    add(
      'investorHeadline',
      'Investor Headline',
      hasText(readField('investorHeadline')) ||
        hasText(readField('headline'))
    );
  } else {
    add(
      'headline',
      'Professional Headline',
      hasText(readField('headline'))
    );
  }

  switch (role) {
    case 'founder':
      add(
        'bio',
        'Founder Bio',
        hasText(readField('bio'))
      );

      add(
        'skills',
        'Professional Skills',
        hasValidStringArray(readField('skills'))
      );
      break;

    case 'investor':
      add(
        'investorBio',
        'Investor Bio',
        hasText(readField('investorBio'))
      );

      add(
        'investmentFocus',
        'Investment Focus',
        hasValidStringArray(readField('investmentFocus'))
      );

      add(
        'preferredStage',
        'Preferred Investment Stage',
        hasValidStringArray(readField('preferredStage'))
      );

      add(
        'ticketSize',
        'Investment Ticket Size',
        hasText(readField('ticketSize'))
      );
      break;

    case 'mentor':
      add(
        'mentorBio',
        'Mentor Bio',
        hasText(readField('mentorBio'))
      );

      add(
        'mentorSkills',
        'Mentoring Skills',
        hasValidStringArray(readField('mentorSkills'))
      );

      add(
        'yearsOfExperience',
        'Years of Experience',
        hasText(readField('yearsOfExperience'))
      );

      add(
        'mentorAvailability',
        'Mentor Availability',
        hasText(readField('mentorAvailability'))
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
  if (!isPlainProfessionalRecord(context)) {
    throw new Error(
      'INVALID_READINESS_CONTEXT'
    );
  }

  const identity =
    buildProfessionalIdentitySnapshot(profile);

  if (!identity) {
    return [];
  }

  return resolveStartupProfessionalRoles(identity)
    .map(role =>
      evaluateProfileReadiness(
        profile,
        role,
        context
      )
    );
}
