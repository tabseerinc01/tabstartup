import {
  evaluateProfileReadiness,
  isProfessionalProfileRole,
  type ProfessionalProfileRole,
} from '@/lib/profile-readiness';

import {
  PROFESSIONAL_NAME_MAX_LENGTH,
  PROFESSIONAL_TEXT_MAX_LENGTH,
  sanitizePublicText,
  sanitizePublicStringArray,
  sanitizePublicUrl,
  isValidProfessionalProfileUid,
  isPlainProfessionalRecord,
  getOwnProfessionalValue,
  getOwnProfessionalArrayItem,
  hasOwnProfessionalTrue,
} from '@/lib/professional-profile-validation';

import {
  buildPublicVerificationSummary,
  type PublicProfessionalVerificationSummary,
} from '@/lib/professional-verification';

/**
 * TabStartup role-specific public professional profiles.
 *
 * Private canonical profile: users/{uid}
 * Public projection: professionalProfiles/{role}_{uid}
 *
 * Never copy an entire private user document.
 * Never expose unpublished professional roles.
 * Verification claims must originate from trusted server context.
 */

/**
 * Conservative UTF-8 JSON budget for a professional
 * public projection.
 *
 * This is not the exact Firestore document size.
 * Reserve capacity for Firestore storage overhead,
 * document metadata and publication timestamps.
 */

export const PROFESSIONAL_PROFILE_MAX_JSON_BYTES =
  512 * 1024;

export const PROFESSIONAL_PROFILES_COLLECTION =
  'professionalProfiles';

export const PROFESSIONAL_PROFILE_SCHEMA_VERSION = 1;

export const PROFESSIONAL_PROFILE_VISIBILITY =
  'public' as const;

export const PROFESSIONAL_PROFILE_STATUS =
  'published' as const;

/**
 * Shared professional information.
 * Publication metadata and verification claims
 * are constructed separately by trusted code.
 */
export const PROFESSIONAL_SHARED_STRING_FIELDS = [
  'fullName',
  'imageUrl',
  'coverImageUrl',
  'headline',
  'location',
  'linkedinUrl',
  'website',
] as const;

export const PROFESSIONAL_SHARED_ARRAY_FIELDS = [
  'achievements',
] as const;

/**
 * Founder-only public information.
 */
export const FOUNDER_PUBLIC_STRING_FIELDS = [
  'bio',
  'stage',
  'whyBuilding',
  'lookingFor',
  'cofounderRole',
  'equityOffer',
  'commitmentType',
] as const;

export const FOUNDER_PUBLIC_ARRAY_FIELDS = [
  'skills',
  'cofounderSkills',
] as const;

export const FOUNDER_PUBLIC_BOOLEAN_FIELDS = [
  'lookingForCofounder',
] as const;

/**
 * Investor-only public information.
 */
export const INVESTOR_PUBLIC_STRING_FIELDS = [
  'investorHeadline',
  'investorBio',
  'ticketSize',
] as const;

export const INVESTOR_PUBLIC_ARRAY_FIELDS = [
  'investmentFocus',
  'preferredStage',
] as const;

export const INVESTOR_PUBLIC_BOOLEAN_FIELDS = [
  'isOpenToPitches',
] as const;

/**
 * Mentor-only public information.
 */
export const MENTOR_PUBLIC_STRING_FIELDS = [
  'mentorBio',
  'yearsOfExperience',
  'mentorAvailability',
] as const;

export const MENTOR_PUBLIC_ARRAY_FIELDS = [
  'mentorSkills',
] as const;

/**
 * Explicit nested field allowlists.
 */
export const PROFESSIONAL_SOCIAL_LINK_FIELDS = [
  'linkedin',
  'website',
  'twitter',
] as const;

export const PROFESSIONAL_EXPERIENCE_FIELDS = [
  'company',
  'role',
  'duration',
  'description',
] as const;

export const FOUNDER_AVAILABILITY_FIELDS = [
  'openToInvestment',
  'hiring',
  'coFounder',
] as const;

/**
 * Public projection sanitization helpers.
 * Never coerce unknown values into public strings.
 */

function asPublicRecord(
  value: unknown
): Record<string, unknown> | undefined {
  return isPlainProfessionalRecord(value)
    ? value
    : undefined;
}

function copyPublicStringFields(
  target: Record<string, unknown>,
  source: Record<string, unknown>,
  fields: readonly string[]
): void {
  for (const field of fields) {
    const rawValue =
      getOwnProfessionalValue(
        source,
        field
      );

    const isUrlField =
      field === 'imageUrl' ||
      field === 'coverImageUrl' ||
      field === 'linkedinUrl' ||
      field === 'website';

    const value = isUrlField
      ? sanitizePublicUrl(rawValue)
      : sanitizePublicText(
          rawValue,
          field === 'fullName'
            ? PROFESSIONAL_NAME_MAX_LENGTH
            : PROFESSIONAL_TEXT_MAX_LENGTH
        );

    if (value !== undefined) {
      target[field] = value;
    }
  }
}

function copyPublicArrayFields(
  target: Record<string, unknown>,
  source: Record<string, unknown>,
  fields: readonly string[]
): void {
  for (const field of fields) {
    const value = sanitizePublicStringArray(
      getOwnProfessionalValue(
        source,
        field
      )
    );

    if (value !== undefined) {
      target[field] = value;
    }
  }
}

function copyPublicBooleanFields(
  target: Record<string, unknown>,
  source: Record<string, unknown>,
  fields: readonly string[]
): void {
  for (const field of fields) {
    const value =
      getOwnProfessionalValue(
        source,
        field
      );

    if (typeof value === 'boolean') {
      target[field] = value;
    }
  }
}

/**
 * Explicit nested public field sanitization.
 */

function sanitizePublicSocialLinks(
  value: unknown
): Record<string, string> | undefined {
  const data = asPublicRecord(value);

  if (!data) return undefined;

  const result: Record<string, string> = {};

  for (const field of PROFESSIONAL_SOCIAL_LINK_FIELDS) {
    const url = sanitizePublicUrl(
      getOwnProfessionalValue(
        data,
        field
      )
    );

    if (url !== undefined) {
      result[field] = url;
    }
  }

  return Object.keys(result).length > 0
    ? result
    : undefined;
}

function sanitizePublicExperience(
  value: unknown
): Array<Record<string, string>> | undefined {
  if (
    !Array.isArray(value) ||
    value.length > 50
  ) {
    return undefined;
  }

  const result: Array<Record<string, string>> = [];

  for (
    let index = 0;
    index < value.length;
    index++
  ) {
    const entry =
      getOwnProfessionalArrayItem(
        value,
        index
      );

    const data = asPublicRecord(entry);

    if (!data) return undefined;

    const item: Record<string, string> = {};

    for (const field of PROFESSIONAL_EXPERIENCE_FIELDS) {
      const cleaned = sanitizePublicText(
        getOwnProfessionalValue(
          data,
          field
        )
      );

      if (cleaned !== undefined) {
        item[field] = cleaned;
      }
    }

    if (Object.keys(item).length > 0) {
      result.push(item);
    }
  }

  return result.length > 0
    ? result
    : undefined;
}

function sanitizeFounderAvailability(
  value: unknown
): Record<string, boolean> | undefined {
  const data = asPublicRecord(value);

  if (!data) return undefined;

  const result: Record<string, boolean> = {};

  for (const field of FOUNDER_AVAILABILITY_FIELDS) {
    const item =
      getOwnProfessionalValue(
        data,
        field
      );

    if (typeof item === 'boolean') {
      result[field] = item;
    }
  }

  return Object.keys(result).length > 0
    ? result
    : undefined;
}

/**
 * Shared public information.
 * No role ownership or publication metadata is copied here.
 */
function buildSharedPublicFields(
  data: Record<string, unknown>
): Record<string, unknown> {
  const result: Record<string, unknown> = {};

  copyPublicStringFields(
    result,
    data,
    PROFESSIONAL_SHARED_STRING_FIELDS
  );

  copyPublicArrayFields(
    result,
    data,
    PROFESSIONAL_SHARED_ARRAY_FIELDS
  );

  const socialLinks = sanitizePublicSocialLinks(
    getOwnProfessionalValue(
      data,
      'socialLinks'
    )
  );

  if (socialLinks !== undefined) {
    result.socialLinks = socialLinks;
  }

  const experience = sanitizePublicExperience(
    getOwnProfessionalValue(
      data,
      'experience'
    )
  );

  if (experience !== undefined) {
    result.experience = experience;
  }

  return result;
}

/**
 * Construct fields for exactly one professional role.
 * Never copy another role's private or draft information.
 *
 * This helper does not authorize publication.
 */
function buildRoleSpecificPublicFields(
  data: Record<string, unknown>,
  role: ProfessionalProfileRole
): Record<string, unknown> {
  const result = buildSharedPublicFields(data);

  switch (role) {
    case 'founder': {
      copyPublicStringFields(
        result,
        data,
        FOUNDER_PUBLIC_STRING_FIELDS
      );

      copyPublicArrayFields(
        result,
        data,
        FOUNDER_PUBLIC_ARRAY_FIELDS
      );

      copyPublicBooleanFields(
        result,
        data,
        FOUNDER_PUBLIC_BOOLEAN_FIELDS
      );

      const availability =
        sanitizeFounderAvailability(
          getOwnProfessionalValue(
            data,
            'availability'
          )
        );

      if (availability !== undefined) {
        result.availability = availability;
      }

      break;
    }

    case 'investor': {
      copyPublicStringFields(
        result,
        data,
        INVESTOR_PUBLIC_STRING_FIELDS
      );

      copyPublicArrayFields(
        result,
        data,
        INVESTOR_PUBLIC_ARRAY_FIELDS
      );

      copyPublicBooleanFields(
        result,
        data,
        INVESTOR_PUBLIC_BOOLEAN_FIELDS
      );

      // Prefer the investor-specific headline.
      if (
        typeof result.investorHeadline === 'string'
      ) {
        result.headline = result.investorHeadline;
      }

      break;
    }

    case 'mentor': {
      copyPublicStringFields(
        result,
        data,
        MENTOR_PUBLIC_STRING_FIELDS
      );

      copyPublicArrayFields(
        result,
        data,
        MENTOR_PUBLIC_ARRAY_FIELDS
      );

      break;
    }

    default:
      throw new Error(
        'INVALID_PROFESSIONAL_ROLE'
      );
  }

  return result;
}

/**
 * Validate the canonical Firebase Auth UID before
 * constructing a professional profile document ID.
 */
function assertProfessionalProfileUid(
  uid: unknown
): asserts uid is string {
  if (!isValidProfessionalProfileUid(uid)) {
    throw new Error(
      'INVALID_PROFESSIONAL_PROFILE_UID'
    );
  }
}

/**
 * Deterministic document identity for one professional role.
 *
 * This helper validates identity format only.
 * It does not grant role ownership or publishing permission.
 */
export function getProfessionalProfileId(
  uid: string,
  role: ProfessionalProfileRole
): string {
  assertProfessionalProfileUid(uid);

  if (!isProfessionalProfileRole(role)) {
    throw new Error(
      'INVALID_PROFESSIONAL_ROLE'
    );
  }

  return role + '_' + uid;
}

/**
 * Trusted publication context.
 *
 * Construct this context on the server only.
 * Never populate it directly from a client request.
 *
 * Publication authorization remains the responsibility
 * of the centralized publishing service.
 */
export type ProfessionalProfileBuildContext = {
  uid: string;
  emailVerified: boolean;
  accountActive: boolean;
  publicationAuthorized: boolean;
};

export type ProfessionalProfileProjection =
  Record<string, unknown> & {
    schemaVersion: number;
    uid: string;
    role: ProfessionalProfileRole;
    visibility: 'public';
    status: 'published';
    verification:
      PublicProfessionalVerificationSummary;
  };

/**
 * Reject oversized sanitized public projections.
 *
 * Measure UTF-8 bytes rather than JavaScript
 * character count.
 *
 * Never truncate or mutate canonical profile data.
 */

function assertProfessionalProfileSize(
  projection: ProfessionalProfileProjection
): void {
  const serialized = JSON.stringify(projection);

  const byteLength =
    new TextEncoder()
      .encode(serialized)
      .byteLength;

  if (
    byteLength >
    PROFESSIONAL_PROFILE_MAX_JSON_BYTES
  ) {
    throw new Error(
      'PROFESSIONAL_PROFILE_TOO_LARGE'
    );
  }
}

/**
 * Build one sanitized professional public projection.
 *
 * Pure function: no database reads or writes.
 * Does not mutate the canonical private profile.
 *
 * Verification claims are constructed from
 * trusted server-side context only.
 * Publication timestamps are handled separately.
 */
export function buildProfessionalProfile(
  data: Record<string, unknown>,
  role: ProfessionalProfileRole,
  context: ProfessionalProfileBuildContext
): ProfessionalProfileProjection {
  if (!isPlainProfessionalRecord(context)) {
    throw new Error(
      'INVALID_PUBLICATION_CONTEXT'
    );
  }

  const uid = getOwnProfessionalValue(
    context,
    'uid'
  );

  assertProfessionalProfileUid(uid);

  if (!isProfessionalProfileRole(role)) {
    throw new Error(
      'INVALID_PROFESSIONAL_ROLE'
    );
  }

  if (
    !hasOwnProfessionalTrue(
      context,
      'publicationAuthorized'
    )
  ) {
    throw new Error(
      'PROFILE_PUBLICATION_NOT_AUTHORIZED'
    );
  }

  const canonical = asPublicRecord(data);

  if (!canonical) {
    throw new Error(
      'INVALID_CANONICAL_PROFILE'
    );
  }

  const readinessContext = {
    uid,
    emailVerified:
      hasOwnProfessionalTrue(
        context,
        'emailVerified'
      ),
    accountActive:
      hasOwnProfessionalTrue(
        context,
        'accountActive'
      ),
  };

  const readiness = evaluateProfileReadiness(
    canonical,
    role,
    readinessContext
  );

  if (!readiness.ready) {
    throw new Error(
      'PROFESSIONAL_PROFILE_NOT_READY'
    );
  }

  const fields = buildRoleSpecificPublicFields(
    canonical,
    role
  );

  /**
   * Recheck readiness after sanitization.
   *
   * Internal validation metadata is used only
   * for this check and is never returned.
   */
  const sanitizedReadiness =
    evaluateProfileReadiness(
      {
        ...fields,
        uid,
        roles: [role],
        status: 'active',
      },
      role,
      readinessContext
    );

  if (!sanitizedReadiness.ready) {
    throw new Error(
      'SANITIZED_PROFILE_NOT_READY'
    );
  }

  const projection: ProfessionalProfileProjection = {
    ...fields,
    schemaVersion:
      PROFESSIONAL_PROFILE_SCHEMA_VERSION,
    uid,
    role,
    visibility:
      PROFESSIONAL_PROFILE_VISIBILITY,
    status:
      PROFESSIONAL_PROFILE_STATUS,
    verification:
      buildPublicVerificationSummary({
        emailVerified:
          readinessContext.emailVerified,
      }),
  };

  assertProfessionalProfileSize(projection);

  return projection;
}
