import 'server-only';

import {
  deriveEventInvitationToken,
  isValidEventInvitationId,
} from '@/lib/event-invitation-token';

import type {
  EventEmailTemplate,
} from './event-email-template.service';

export interface EventInvitationEmailTemplateInput {
  invitationId: string;
  tokenVersion: number;

  eventTitle: string;
  guestName: string;
  ticketName: string;

  startsAtMs: number;
  expiresAtMs: number;
  timezone: string;

  attendanceMode: 'online' | 'offline';
  venue: string | null;
}

const BASE_URL = 'https://tabstartup.com';

const SUPPORT_EMAIL = 'info@tabstartup.com';

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function validText(
  value: unknown,
  max: number
): value is string {
  return (
    typeof value === 'string' &&
    value.trim().length > 0 &&
    value.length <= max &&
    !/[\u0000-\u001f\u007f]/.test(value)
  );
}

function validMillis(
  value: unknown
): value is number {
  return (
    typeof value === 'number' &&
    Number.isSafeInteger(value) &&
    value > 0 &&
    value <= 253402300799999
  );
}

export function validateEventInvitationEmailTemplate(
  input: EventInvitationEmailTemplateInput
): void {
  if (
    !input ||
    !isValidEventInvitationId(
      input.invitationId
    ) ||
    !Number.isSafeInteger(
      input.tokenVersion
    ) ||
    input.tokenVersion < 1 ||
    !validText(input.eventTitle, 300) ||
    !validText(input.guestName, 150) ||
    !validText(input.ticketName, 200) ||
    !validMillis(input.startsAtMs) ||
    !validMillis(input.expiresAtMs) ||
    !validText(input.timezone, 100) ||
    !['online', 'offline'].includes(
      input.attendanceMode
    ) ||
    (
      input.venue !== null &&
      !validText(input.venue, 2000)
    ) ||
    (
      input.attendanceMode === 'online' &&
      input.venue !== null
    )
  ) {
    throw new Error(
      'INVALID_INVITATION_EMAIL_TEMPLATE'
    );
  }

  new Intl.DateTimeFormat('en-GB', {
    timeZone: input.timezone,
  });
}

function formatDate(
  value: number,
  timezone: string
): string {
  return new Intl.DateTimeFormat('en-GB', {
    dateStyle: 'full',
    timeStyle: 'short',
    timeZone: timezone,
  }).format(new Date(value));
}

/**
 * Render only at delivery time.
 *
 * Never persist the returned HTML, text
 * or reconstructed invitation URL.
 */
export function buildEventInvitationEmailTemplate(
  input: EventInvitationEmailTemplateInput
): EventEmailTemplate {
  validateEventInvitationEmailTemplate(input);

  const token = deriveEventInvitationToken(
    input.invitationId,
    input.tokenVersion
  );

  const invitationUrl =
    BASE_URL +
    '/events/invitations/' +
    input.invitationId +
    '#token=' +
    token;

  const startsAt = formatDate(
    input.startsAtMs,
    input.timezone
  );

  const expiresAt = formatDate(
    input.expiresAtMs,
    input.timezone
  );

  const attendance =
    input.attendanceMode === 'online'
      ? 'Online event'
      : input.venue || 'In-person event';

  const subject =
    "You're invited: " + input.eventTitle;

  const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport"
        content="width=device-width, initial-scale=1">
  <title>${escapeHtml(subject)}</title>
</head>
<body style="margin:0;background:#f1f5f9;color:#0f172a;font-family:Arial,sans-serif;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0">
    <tr>
      <td align="center" style="padding:24px 12px;">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0"
               style="max-width:600px;background:#ffffff;border-radius:14px;overflow:hidden;">

          <tr>
            <td align="center" style="padding:28px;background:#142d50;color:#ffffff;">
              <img src="${BASE_URL}/brand/tabstartup-logo.png"
                   alt="TabStartup"
                   width="160"
                   style="max-width:160px;height:auto;">
              <p style="margin:12px 0 0;font-size:12px;letter-spacing:2px;">
                CONNECT &middot; BUILD &middot; GROW
              </p>
            </td>
          </tr>

          <tr>
            <td style="padding:32px 24px;">

              <p style="color:#2563eb;font-size:12px;font-weight:bold;letter-spacing:1px;">
                PERSONAL EVENT INVITATION
              </p>

              <h1 style="margin:12px 0 20px;font-size:28px;">
                You're Invited!
              </h1>

              <p>Dear ${escapeHtml(input.guestName)},</p>

              <p style="line-height:1.7;">
                We are delighted to invite you to
                <strong>${escapeHtml(input.eventTitle)}</strong>.
              </p>

              <table role="presentation" width="100%" cellspacing="0" cellpadding="0"
                     style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:10px;">

                <tr>
                  <td style="padding:20px;line-height:1.7;">
                    <strong>Event Date &amp; Time</strong><br>
                    ${escapeHtml(startsAt)}<br>
                    ${escapeHtml(input.timezone)}

                    <br><br>

                    <strong>Attendance</strong><br>
                    ${escapeHtml(attendance)}

                    <br><br>

                    <strong>Your Ticket</strong><br>
                    ${escapeHtml(input.ticketName)}<br>
                    Complimentary &middot; 1 participant

                    <br><br>

                    <strong>Accept Before</strong><br>
                    ${escapeHtml(expiresAt)}<br>
                    ${escapeHtml(input.timezone)}
                  </td>
                </tr>
              </table>

              <p style="line-height:1.7;margin-top:24px;">
                Accept your personal invitation and
                complete your registration to receive
                your event ticket.
              </p>

              <table role="presentation" cellspacing="0" cellpadding="0" width="100%">
                <tr>
                  <td align="center" style="padding:12px 0 20px;">
                    <a href="${escapeHtml(invitationUrl)}"
                       style="display:inline-block;background:#2563eb;color:#ffffff;text-decoration:none;padding:16px 26px;border-radius:8px;font-weight:bold;">
                      Accept Your Invitation
                    </a>
                  </td>
                </tr>
              </table>

              <p style="font-size:13px;line-height:1.7;color:#475569;">
                This invitation is personal and non-transferable.
                Sign in using the verified email address
                that received this invitation.
                No payment is required.
              </p>

              <p style="font-size:13px;line-height:1.7;color:#475569;">
                If the button does not work, copy the
                complete link below into your browser:
              </p>

              <p style="font-size:12px;word-break:break-all;line-height:1.6;">
                ${escapeHtml(invitationUrl)}
              </p>

              <p style="font-size:13px;color:#475569;">
                Please do not share your personal invitation link.
              </p>

              <p style="margin-top:28px;line-height:1.7;">
                Best regards,<br>
                <strong>TabStartup Events Team</strong>
              </p>
            </td>
          </tr>

          <tr>
            <td align="center"
                style="background:#f8fafc;padding:24px;color:#64748b;font-size:12px;line-height:1.8;">
              TabStartup Events<br>
              <a href="mailto:${SUPPORT_EMAIL}"
                 style="color:#2563eb;">
                ${SUPPORT_EMAIL}
              </a><br>
              <a href="${BASE_URL}"
                 style="color:#2563eb;">
                tabstartup.com
              </a>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  const text = [
    "You're Invited!",
    '',
    'Dear ' + input.guestName + ',',
    '',
    'We are delighted to invite you to ' +
      input.eventTitle + '.',
    '',
    'Event: ' + input.eventTitle,
    'Date: ' + startsAt,
    'Timezone: ' + input.timezone,
    'Attendance: ' + attendance,
    'Ticket: ' + input.ticketName,
    'Complimentary admission: 1 participant',
    '',
    'Accept before: ' + expiresAt +
      ' (' + input.timezone + ')',
    '',
    'Accept your personal invitation:',
    invitationUrl,
    '',
    'Sign in using the verified email address ' +
      'that received this invitation.',
    '',
    'This invitation is personal and non-transferable.',
    'Please do not share your invitation link.',
    'No payment is required.',
    '',
    'Best regards,',
    'TabStartup Events Team',
    SUPPORT_EMAIL,
    BASE_URL,
  ].join('\n');

  return {
    subject,
    html,
    text,
  };
}
