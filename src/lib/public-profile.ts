/**
 * TabStartup public profile projection.
 * Never copy the complete private user document.
 */

export const PUBLIC_PROFILE_STRING_FIELDS = [
  'fullName',
  'imageUrl',
  'coverImageUrl',
  'headline',
  'investorHeadline',
  'location',
  'stage',
  'bio',
  'investorBio',
  'whyBuilding',
  'lookingFor',
  'linkedinUrl',
  'website',
  'ticketSize',
  'cofounderRole',
  'equityOffer',
  'commitmentType',
  'mentorBio',
  'yearsOfExperience',
  'mentorAvailability',
] as const;

export const PUBLIC_PROFILE_ARRAY_FIELDS = [
  'skills',
  'investmentFocus',
  'preferredStage',
  'cofounderSkills',
  'mentorSkills',
  'achievements',
] as const;

const PROFESSIONAL_ROLES = [
  'founder',
  'investor',
  'mentor',
];

function text(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function strings(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((v): v is string => typeof v === 'string')
    : [];
}

function object(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

export function buildPublicProfile(
  uid: string,
  data: Record<string, unknown>
): Record<string, unknown> {
  const result: Record<string, unknown> = { uid };

  for (const field of PUBLIC_PROFILE_STRING_FIELDS) {
    result[field] = text(data[field]);
  }

  for (const field of PUBLIC_PROFILE_ARRAY_FIELDS) {
    result[field] = strings(data[field]);
  }

  const roles = [...new Set(
    Array.isArray(data.roles)
      ? strings(data.roles)
      : [text(data.role)]
  )].filter(role => PROFESSIONAL_ROLES.includes(role));

  result.roles = roles;
  result.role = roles.includes(text(data.role))
    ? text(data.role)
    : roles[0] || '';

  result.primaryRole = roles.includes(text(data.primaryRole))
    ? text(data.primaryRole)
    : result.role;

  result.isMentor = roles.includes('mentor');
  result.isOpenToPitches = data.isOpenToPitches === true;
  result.lookingForCofounder = data.lookingForCofounder === true;

  const social = object(data.socialLinks);

  result.socialLinks = {
    linkedin: text(social.linkedin),
    website: text(social.website),
    twitter: text(social.twitter),
  };

  const availability = object(data.availability);

  result.availability = {
    openToInvestment: availability.openToInvestment === true,
    hiring: availability.hiring === true,
    coFounder: availability.coFounder === true,
  };

  result.experience = Array.isArray(data.experience)
    ? data.experience.map(value => {
        const item = object(value);
        return {
          company: text(item.company),
          role: text(item.role),
          duration: text(item.duration),
          description: text(item.description),
        };
      })
    : [];

  return result;
}
