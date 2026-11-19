import {
  profileApiResponse,
  profileApiError,
  requireProfileApiToken,
} from '@/services/professional-profile-api.service';

import {
  getOwnProfessionalPublicationStatus,
} from '@/services/professional-profile-publishing.service';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const token = requireProfileApiToken(request);

    const result =
      await getOwnProfessionalPublicationStatus(token);

    return profileApiResponse({
      success: true,
      status: 'ok',
      uid: result.uid,
      emailVerified: result.emailVerified,
      roles: result.roles,
    });
  } catch (error) {
    return profileApiError(error);
  }
}
