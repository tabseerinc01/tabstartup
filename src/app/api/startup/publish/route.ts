import {
  profileApiResponse,
  profileApiError,
  requireProfileApiToken,
} from '@/services/professional-profile-api.service';

import {
  publishOwnStartup,
} from '@/services/startup-publishing.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const token = requireProfileApiToken(request);
    const result = await publishOwnStartup(token);

    if (result.status === 'not_ready') {
      return profileApiResponse({
        success: false,
        status: result.status,
        readiness: result.readiness,
      }, result.readiness.eligible ? 409 : 403);
    }

    if (result.status === 'startup_not_ready') {
      return profileApiResponse({
        success: false,
        status: result.status,
        missingStartupFields: result.missingStartupFields,
      }, 409);
    }

    return profileApiResponse({
      success: true,
      status: result.status,
      readiness: result.readiness,
    });
  } catch (error) {
    return profileApiError(error);
  }
}
