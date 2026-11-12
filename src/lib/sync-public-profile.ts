import type { User } from 'firebase/auth';

export async function syncOwnPublicProfile(user: User) {
  if (!user?.uid) {
    throw new Error('Authentication required');
  }

  const token = await user.getIdToken();

  const response = await fetch('/api/profile/sync-public', {
    method: 'POST',
    headers: {
      Authorization: 'Bearer ' + token,
    },
    cache: 'no-store',
  });

  if (!response.ok) {
    throw new Error('Public profile synchronization failed');
  }

  const result = await response.json();

  if (result.success !== true ||
      !['synced', 'removed'].includes(result.status)) {
    throw new Error('Invalid synchronization response');
  }

  return result as {
    success: true;
    status: 'synced' | 'removed';
  };
}
