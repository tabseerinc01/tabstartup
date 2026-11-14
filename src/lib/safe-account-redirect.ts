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

export type AvailableAccountPortal = {
  id: 'startup' | 'admin' | 'event_organizer';
  label: string;
  path: string;
};

// Enable only after the independent Event Organizer
// dashboard and its access guard are implemented.
const EVENT_ORGANIZER_PORTAL_READY: boolean = false;

export function getAvailableAccountPortals(
  account: AccountAccessResponse
): AvailableAccountPortal[] {
  if (account.status === 'suspended') {
    return [];
  }

  const portals: AvailableAccountPortal[] = [];

  if (
    account.status === 'active' &&
    account.portals.startup.allowed
  ) {
    portals.push({
      id: 'startup',
      label: 'Startup Dashboard',
      path: '/dashboard',
    });
  }

  if (account.isAdmin) {
    portals.push({
      id: 'admin',
      label: 'Control Dashboard',
      path: '/control',
    });
  }

  if (
    EVENT_ORGANIZER_PORTAL_READY &&
    account.status === 'active' &&
    account.portals.event_organizer.allowed
  ) {
    portals.push({
      id: 'event_organizer',
      label: 'Event Organizer Dashboard',
      path: '/event-organizer/dashboard',
    });
  }

  return portals;
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

  const portals = getAvailableAccountPortals(account);

  // Single available portal: automatic navigation.
  // Multiple available portals: let the user choose.
  return portals.length === 1
    ? portals[0].path
    : null;
}
