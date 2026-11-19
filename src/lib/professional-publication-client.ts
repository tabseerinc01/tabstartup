'use client';

import type { User } from 'firebase/auth';

import type {
  ProfessionalProfileRole,
  ProfileReadinessResult,
} from '@/lib/profile-readiness';

export type ProfessionalPublicationRoleStatus = {
  role: ProfessionalProfileRole;
  profileId: string;
  readiness: ProfileReadinessResult;
  publicationStatus: 'published' | 'unpublished';
  storedPublicationStatus:
    | 'absent'
    | 'published'
    | 'invalid';
  requiresReconciliation: boolean;
};

export type ProfessionalPublicationStatus = {
  uid: string;
  emailVerified: boolean;
  roles: ProfessionalPublicationRoleStatus[];
};

export type PublicationActionResult =
  | {
      status: 'published';
      role: ProfessionalProfileRole;
    }
  | {
      status: 'unpublished';
      role: ProfessionalProfileRole;
      changed: boolean;
    }
  | {
      status: 'not_ready';
      role: ProfessionalProfileRole;
      readiness: ProfileReadinessResult;
      publicationRemoved: boolean;
    };

const ROLES = [
  'founder',
  'investor',
  'mentor',
] as const;

function isRecord(
  value: unknown
): value is Record<string, unknown> {
  return typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value);
}

function isRole(
  value: unknown
): value is ProfessionalProfileRole {
  return ROLES.some(role => role === value);
}

function isStringArray(
  value: unknown
): value is string[] {
  return Array.isArray(value) &&
    value.every(item => typeof item === 'string');
}

function invalidResponse(): never {
  throw new Error('INVALID_PUBLICATION_RESPONSE');
}

function parseReadiness(
  value: unknown,
  role: ProfessionalProfileRole
): ProfileReadinessResult {
  if (
    !isRecord(value) ||
    value.version !== 1 ||
    value.role !== role ||
    typeof value.ready !== 'boolean' ||
    typeof value.eligible !== 'boolean' ||
    !isStringArray(value.missingFields) ||
    !isStringArray(value.blockers) ||
    !Array.isArray(value.checks)
  ) {
    invalidResponse();
  }

  const checks = value.checks.map(check => {
    if (
      !isRecord(check) ||
      typeof check.key !== 'string' ||
      typeof check.label !== 'string' ||
      typeof check.completed !== 'boolean'
    ) {
      invalidResponse();
    }

    return {
      key: check.key,
      label: check.label,
      completed: check.completed,
    };
  });

  const requiredCount =
    role === 'founder' ? 7 : 9;

  if (
    checks.length !== requiredCount ||
    new Set(checks.map(check => check.key)).size !==
      requiredCount
  ) {
    invalidResponse();
  }

  const completedCount =
    checks.filter(check => check.completed).length;

  const missingFields = checks
    .filter(check => !check.completed)
    .map(check => check.key);

  const completionPercent = Math.floor(
    completedCount / requiredCount * 100
  );

  if (
    value.requiredCount !== requiredCount ||
    value.completedCount !== completedCount ||
    value.completionPercent !== completionPercent ||
    JSON.stringify(value.missingFields) !==
      JSON.stringify(missingFields) ||
    value.eligible !== (value.blockers.length === 0) ||
    value.ready !== (
      value.eligible && missingFields.length === 0
    )
  ) {
    invalidResponse();
  }

  return {
    version: 1,
    role,
    ready: value.ready,
    eligible: value.eligible,
    requiredCount,
    completedCount,
    completionPercent,
    missingFields,
    blockers: value.blockers,
    checks,
  };
}

async function requestPublication(
  user: User,
  action: 'publication-status' | 'publish' | 'unpublish',
  signal: AbortSignal,
  role?: ProfessionalProfileRole
) {
  const token = await user.getIdToken(true);

  if (signal.aborted) {
    throw new Error('REQUEST_CANCELLED');
  }

  const headers: Record<string, string> = {
    Authorization: 'Bearer ' + token,
    Accept: 'application/json',
  };

  const options: RequestInit = {
    method: action === 'publication-status'
      ? 'GET'
      : 'POST',
    headers,
    cache: 'no-store',
    credentials: 'same-origin',
    redirect: 'error',
    signal,
  };

  if (action !== 'publication-status') {
    if (!isRole(role)) {
      throw new Error('INVALID_PROFESSIONAL_ROLE');
    }

    headers['Content-Type'] = 'application/json';
    options.body = JSON.stringify({ role });
  }

  const response = await fetch(
    '/api/profile/' + action,
    options
  );

  const data: unknown = await response.json();

  if (
    !isRecord(data) ||
    typeof data.success !== 'boolean'
  ) {
    invalidResponse();
  }

  return {
    ok: response.ok,
    httpStatus: response.status,
    data,
  };
}

export async function fetchProfessionalPublicationStatus(
  user: User,
  signal: AbortSignal
): Promise<ProfessionalPublicationStatus> {
  const { ok, data } = await requestPublication(
    user,
    'publication-status',
    signal
  );

  if (
    !ok ||
    data.success !== true ||
    data.status !== 'ok' ||
    data.uid !== user.uid ||
    typeof data.emailVerified !== 'boolean' ||
    !Array.isArray(data.roles) ||
    data.roles.length !== ROLES.length
  ) {
    throw new Error('PUBLICATION_STATUS_UNAVAILABLE');
  }

  const roles = data.roles.map(
    (item): ProfessionalPublicationRoleStatus => {
      if (
        !isRecord(item) ||
        !isRole(item.role) ||
        item.profileId !== item.role + '_' + user.uid ||
        (
          item.publicationStatus !== 'published' &&
          item.publicationStatus !== 'unpublished'
        ) ||
        (
          item.storedPublicationStatus !== 'absent' &&
          item.storedPublicationStatus !== 'published' &&
          item.storedPublicationStatus !== 'invalid'
        ) ||
        typeof item.requiresReconciliation !== 'boolean'
      ) {
        invalidResponse();
      }

      const readiness = parseReadiness(
        item.readiness,
        item.role
      );

      const published =
        item.storedPublicationStatus === 'published' &&
        readiness.ready;

      const requiresReconciliation =
        item.storedPublicationStatus !== 'absent' &&
        !published;

      if (
        item.publicationStatus !== (
          published ? 'published' : 'unpublished'
        ) ||
        item.requiresReconciliation !==
          requiresReconciliation
      ) {
        invalidResponse();
      }

      return {
        role: item.role,
        profileId: item.profileId,
        readiness,
        publicationStatus: item.publicationStatus,
        storedPublicationStatus:
          item.storedPublicationStatus,
        requiresReconciliation,
      };
    }
  );

  if (
    new Set(roles.map(item => item.role)).size !==
      ROLES.length
  ) {
    invalidResponse();
  }

  return {
    uid: user.uid,
    emailVerified: data.emailVerified,
    roles,
  };
}

export async function changeProfessionalPublication(
  user: User,
  role: ProfessionalProfileRole,
  action: 'publish' | 'unpublish',
  signal: AbortSignal
): Promise<PublicationActionResult> {
  const { ok, httpStatus, data } =
    await requestPublication(
      user,
      action,
      signal,
      role
    );

  if (
    action === 'publish' &&
    !ok &&
    (httpStatus === 409 || httpStatus === 403) &&
    data.success === false &&
    data.status === 'not_ready' &&
    data.role === role &&
    typeof data.publicationRemoved === 'boolean'
  ) {
    return {
      status: 'not_ready',
      role,
      readiness: parseReadiness(data.readiness, role),
      publicationRemoved: data.publicationRemoved,
    };
  }

  if (
    !ok ||
    data.success !== true ||
    data.role !== role ||
    data.profileId !== role + '_' + user.uid
  ) {
    throw new Error('PUBLICATION_ACTION_FAILED');
  }

  if (
    action === 'publish' &&
    data.status === 'published'
  ) {
    const readiness = parseReadiness(
      data.readiness,
      role
    );

    if (!readiness.ready) {
      invalidResponse();
    }

    return {
      status: 'published',
      role,
    };
  }

  if (
    action === 'unpublish' &&
    data.status === 'unpublished' &&
    typeof data.changed === 'boolean'
  ) {
    return {
      status: 'unpublished',
      role,
      changed: data.changed,
    };
  }

  return invalidResponse();
}
