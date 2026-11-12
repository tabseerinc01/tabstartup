import type { User } from 'firebase/auth';

export async function mutateOwnProfile(
  user: User,
  operation: 'update' | 'activate-role',
  payload: Record<string, unknown>
) {
  const token = await user.getIdToken();

  const response = await fetch('/api/profile/' + operation, {
    method: 'POST',
    headers: {
      Authorization: 'Bearer ' + token,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
    cache: 'no-store',
  });

  const result = await response.json();

  if (!response.ok || result.success !== true) {
    throw new Error(result.error || 'PROFILE_MUTATION_FAILED');
  }

  return result;
}
