import { NextResponse } from 'next/server';

import {
  requireEventApiToken,
  readEventApiBody,
  eventApiSuccess,
  eventApiFailure,
} from '@/lib/event-admin-api';

import {
  getAdminBkashSettings,
  updateAdminBkashSettings,
  BkashSettingsError,
} from '@/services/payments/bkash-settings.service';

export const runtime = 'nodejs';

export const dynamic = 'force-dynamic';

function settingsFailure(
  error: unknown
) {
  if (error instanceof BkashSettingsError) {
    return NextResponse.json(
      {
        success: false,

        error: error.code,
      },
      {
        status:
          error.code === 'INVALID_BKASH_SETTINGS'
            ? 400
            : 409,

        headers: {
          'Cache-Control':
            'private, no-store, max-age=0',

          'Vary': 'Authorization',
        },
      }
    );
  }

  return eventApiFailure(error);
}

/**
 * Read platform bKash configuration.
 * Requires server-side admin authorization.
 */
export async function GET(
  request: Request
) {
  try {
    const token =
      requireEventApiToken(request);

    const settings =
      await getAdminBkashSettings(
        token
      );

    return eventApiSuccess(settings);
  } catch (error) {
    return settingsFailure(error);
  }
}

/**
 * Update versioned bKash configuration.
 *
 * Settings and audit logs are written
 * atomically by the settings service.
 */
export async function PUT(
  request: Request
) {
  try {
    const token =
      requireEventApiToken(request);

    const input =
      await readEventApiBody(request);

    const settings =
      await updateAdminBkashSettings(
        token,
        input
      );

    return eventApiSuccess(settings);
  } catch (error) {
    return settingsFailure(error);
  }
}
