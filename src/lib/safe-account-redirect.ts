import type {
  AccountAccessResponse,
} from '@/lib/account-access-client';

export function sanitizeAccountReturnTo(
  value: string | null | undefined
): string | null {
  if (
    typeof value !== 'string' ||
    !value ||
    value.length > 2048 ||
    !value.startsWith('/') ||
    value.startsWith('//') ||
    /[\\\u0000-\u0020\u007f]/.test(value)
  ) {
    return null;
  }

  const path = value.split(/[?#]/, 1)[0];

  // Reject encoded path characters and path traversal.
  if (
    path.includes('%') ||
    path.split('/').some(
      segment => segment === '.' || segment === '..'
    )
  ) {
    return null;
  }

  try {
    const origin = 'https://tabstartup.invalid';
    const parsed = new URL(value, origin);

    if (parsed.origin !== origin) {
      return null;
    }

    return (
      parsed.pathname +
      parsed.search +
      parsed.hash
    );
  } catch {
    return null;
  }
}

export function resolveAccountLoginDestination(
  account: AccountAccessResponse,
  returnTo?: string | null
): string | null {
  if (account.status === 'suspended') {
    return null;
  }

  const safeReturnTo =
    sanitizeAccountReturnTo(returnTo);

  if (safeReturnTo) {
    const path = safeReturnTo.split(/[?#]/, 1)[0];

    if (
      account.isAdmin &&
      (
        path === '/control' ||
        path.startsWith('/control/')
      )
    ) {
      return safeReturnTo;
    }

    if (
      account.portals.startup.allowed &&
      (
        path === '/dashboard' ||
        path.startsWith('/dashboard/') ||
        path.startsWith('/startups/')
      )
    ) {
      return safeReturnTo;
    }
  }

  if (account.isAdmin) {
    return '/control';
  }

  if (
    account.portals.startup.allowed &&
    !account.portals.event_organizer.allowed
  ) {
    return '/dashboard';
  }

  // Event Organizer and dual-profile accounts will use
  // portal selection until the independent portal is ready.
  return null;
}
