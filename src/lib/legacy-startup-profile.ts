import type { AccountStatus } from '@/lib/account-identity';

/**
 * Historical trusted Startup profiles may omit
 * uid or status. Explicit invalid values are rejected.
 */
export function resolveLegacyStartupStatus(
  uid: string,
  profile: Record<string, unknown> | undefined
): AccountStatus | null {
  if (!profile) {
    return null;
  }

  if (
    profile.uid !== undefined &&
    profile.uid !== uid
  ) {
    return null;
  }

  if (profile.status === 'suspended') {
    return 'suspended';
  }

  if (
    profile.status === undefined ||
    profile.status === 'active'
  ) {
    return 'active';
  }

  return null;
}


export function resolveStartupProfessionalRoles(
  profile: Record<string, unknown> | undefined
): Array<'founder' | 'investor' | 'mentor'> {
  if (!profile) {
    return [];
  }

  const roles: unknown[] =
    Array.isArray(profile.roles)
      ? profile.roles
      : profile.roles === undefined &&
        typeof profile.role === 'string'
        ? [profile.role]
        : [];

  const allowed = [
    'founder',
    'investor',
    'mentor',
  ] as const;

  return allowed.filter(role => roles.includes(role));
}

export function hasActiveStartupProfile(
  uid: string,
  profile: Record<string, unknown> | undefined
): boolean {
  return (
    resolveLegacyStartupStatus(uid, profile) === 'active' &&
    resolveStartupProfessionalRoles(profile).length > 0
  );
}
