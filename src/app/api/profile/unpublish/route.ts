import {
  profileApiResponse,
  profileApiError,
  requireProfileApiToken,
  readProfileApiRole,
} from '@/services/professional-profile-api.service';

import {
  unpublishOwnProfessionalProfile,
} from '@/services/professional-profile-publishing.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const token = requireProfileApiToken(request);
    const role = await readProfileApiRole(request);

    const result =
      await unpublishOwnProfessionalProfile(token, role);

    return profileApiResponse({
      success: true,
      status: result.status,
      role: result.role,
      profileId: result.profileId,
      changed: result.changed,
    });
  } catch (error) {
    return profileApiError(error);
  }
}
