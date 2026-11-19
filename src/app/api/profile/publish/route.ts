import {
  profileApiResponse,
  profileApiError,
  requireProfileApiToken,
  readProfileApiRole,
} from '@/services/professional-profile-api.service';

import {
  publishOwnProfessionalProfile,
} from '@/services/professional-profile-publishing.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const token = requireProfileApiToken(request);
    const role = await readProfileApiRole(request);

    const result =
      await publishOwnProfessionalProfile(token, role);

    if (result.status === 'not_ready') {
      return profileApiResponse({
        success: false,
        status: 'not_ready',
        role: result.role,
        readiness: result.readiness,
        publicationRemoved: result.publicationRemoved,
      }, result.readiness.eligible ? 409 : 403);
    }

    return profileApiResponse({
      success: true,
      status: result.status,
      role: result.role,
      profileId: result.profileId,
      readiness: result.readiness,
    });
  } catch (error) {
    return profileApiError(error);
  }
}
