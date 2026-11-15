import 'server-only';

export type EventEmailType =
  | 'registration_confirmed'
  | 'payment_submitted'
  | 'payment_rejected'
  | 'registration_requires_review'
  | 'payment_pending'
  | 'payment_reminder'
  | 'registration_expired'
  | 'event_reminder';

export interface EventEmailTemplateInput {
  type: EventEmailType;

  eventTitle: string;
  eventSlug: string;

  participantName: string;
  orderId: string;

  startsAtMs: number;
  timezone: string;

  venue: string | null;

  attendanceMode: 'online' | 'offline';

  quantity: number;

  currency: 'BDT' | 'USD' | null;
  totalAmountMinor: number;

  paymentDeadlineMs: number | null;
}

export interface EventEmailTemplate {
  subject: string;
  html: string;
  text: string;
}

interface EmailMessage {
  heading: string;
  subject: string;
  status: string;
  color: string;
  message: string;
  button: string;
}

const BASE_URL = 'https://tabstartup.com';

const SUPPORT_EMAIL = 'info@tabstartup.com';

const LOGO_URL =
  BASE_URL + '/brand/tabstartup-logo.png';

const MESSAGES: Record<EventEmailType, EmailMessage> = {
  registration_confirmed: {
    heading: 'Registration confirmed!',
    subject: 'Registration confirmed',
    status: 'Confirmed',
    color: '#15803d',
    message:
      'Your event registration is confirmed. ' +
      'Your admission ticket is now available.',
    button: 'View & Download Ticket',
  },

  payment_submitted: {
    heading: 'Payment submitted for review',
    subject: 'Payment submission received',
    status: 'Pending verification',
    color: '#b45309',
    message:
      'We have received your payment information. ' +
      'Our team will verify it before confirming ' +
      'your registration. Please do not pay again.',
    button: 'View Registration Status',
  },

  payment_rejected: {
    heading: 'Payment verification unsuccessful',
    subject: 'Payment verification update',
    status: 'Rejected',
    color: '#b91c1c',
    message:
      'Your submitted payment could not be approved. ' +
      'If you believe funds were transferred, ' +
      'contact support before paying again.',
    button: 'View Registration Status',
  },

  registration_requires_review: {
    heading: 'Registration requires review',
    subject: 'Registration status update',
    status: 'Requires review',
    color: '#b45309',
    message:
      'Your registration requires further review. ' +
      'If you have already transferred payment, ' +
      'contact support. Do not pay again.',
    button: 'View Registration Status',
  },

  payment_pending: {
    heading: 'Your registration is almost complete!',
    subject: 'Complete your event registration',
    status: 'Payment pending',
    color: '#b45309',
    message:
      'Thank you for submitting your registration. ' +
      'Payment is required to confirm participation. ' +
      'Open your order to check its current status ' +
      'and available payment options.',
    button: 'Complete Registration',
  },

  payment_reminder: {
    heading: 'Complete your registration',
    subject: 'Reminder: Registration payment pending',
    status: 'Payment pending',
    color: '#b45309',
    message:
      'Your registration payment is still pending. ' +
      'Please check your order before the payment ' +
      'deadline. If you have already sent money, ' +
      'do not pay again.',
    button: 'View Payment Status',
  },

  registration_expired: {
    heading: 'Your registration has expired',
    subject: 'Registration expired',
    status: 'Expired',
    color: '#b91c1c',
    message:
      'Your payment reservation has expired. ' +
      'If you have not sent any money, you may ' +
      'register again, subject to ticket availability. ' +
      'If you have already transferred payment, ' +
      'contact support before registering again.',
    button: 'View Event',
  },

  event_reminder: {
    heading: 'Your event is coming up!',
    subject: 'Upcoming event reminder',
    status: 'Confirmed',
    color: '#173b80',
    message:
      'We look forward to welcoming you. ' +
      'Please review the event details and keep ' +
      'your admission ticket available.',
    button: 'View & Download Ticket',
  },
};

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

function validTimestamp(
  value: number
): boolean {
  return (
    Number.isSafeInteger(value) &&
    value > 0 &&
    value <= 253402300799999
  );
}

function isPaymentReminder(
  type: EventEmailType
): boolean {
  return (
    type === 'payment_pending' ||
    type === 'payment_reminder'
  );
}

function validateInput(
  input: EventEmailTemplateInput
): void {
  if (
    !Object.prototype.hasOwnProperty.call(
      MESSAGES,
      input.type
    ) ||
    !validText(input.eventTitle, 300) ||
    !validText(input.participantName, 200) ||
    !validText(input.timezone, 100) ||
    !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(
      input.eventSlug
    ) ||
    input.eventSlug.length > 200 ||
    !/^[A-Za-z0-9_-]{1,200}$/.test(
      input.orderId
    ) ||
    !validTimestamp(input.startsAtMs) ||
    !['online', 'offline'].includes(
      input.attendanceMode
    ) ||
    (
      input.venue !== null &&
      !validText(input.venue, 1500)
    ) ||
    (
      input.attendanceMode === 'offline' &&
      input.venue === null
    ) ||
    !Number.isSafeInteger(input.quantity) ||
    input.quantity < 1 ||
    input.quantity > 20 ||
    !Number.isSafeInteger(input.totalAmountMinor) ||
    input.totalAmountMinor < 0 ||
    (
      input.currency !== null &&
      input.currency !== 'BDT' &&
      input.currency !== 'USD'
    ) ||
    (
      input.currency === null &&
      input.totalAmountMinor !== 0
    ) ||
    (
      input.paymentDeadlineMs !== null &&
      !validTimestamp(input.paymentDeadlineMs)
    ) ||
    (
      isPaymentReminder(input.type) &&
      (
        input.paymentDeadlineMs === null ||
        input.totalAmountMinor <= 0 ||
        input.currency === null
      )
    )
  ) {
    throw new Error('INVALID_EVENT_EMAIL_INPUT');
  }
}

function formatDate(
  milliseconds: number,
  timezone: string
): string {
  return new Intl.DateTimeFormat('en-GB', {
    dateStyle: 'full',
    timeStyle: 'short',
    timeZone: timezone,
  }).format(milliseconds);
}

export function buildEventEmailTemplate(
  input: EventEmailTemplateInput
): EventEmailTemplate {
  validateInput(input);

  const message = MESSAGES[input.type];

  const eventDate = formatDate(
    input.startsAtMs,
    input.timezone
  );

  const venue =
    input.attendanceMode === 'online'
      ? 'Online event'
      : input.venue!;

  const amount =
    input.totalAmountMinor === 0
      ? 'Free'
      : input.currency + ' ' +
        (input.totalAmountMinor / 100).toFixed(2);

  const orderUrl =
    BASE_URL + '/events/orders/' +
    encodeURIComponent(input.orderId);

  const eventUrl =
    BASE_URL + '/events/' +
    encodeURIComponent(input.eventSlug);

  const actionUrl =
    input.type === 'registration_expired'
      ? eventUrl
      : orderUrl;

  const subject =
    message.subject + ' | TabStartup';

  const accessNote =
    'Use the account or browser session used ' +
    'during registration to access your order. ' +
    'If you cannot access it, contact support.';

  const rows: Array<[string, string]> = [
    ['Event', input.eventTitle],
    ['Date and time', eventDate],
    ['Timezone', input.timezone],
    ['Venue', venue],
    ['Tickets', String(input.quantity)],
    ['Registration fee', amount],
    ['Status', message.status],
    ['Order reference', input.orderId],
  ];

  if (
    isPaymentReminder(input.type) &&
    input.paymentDeadlineMs !== null
  ) {
    rows.push([
      'Payment deadline',
      formatDate(
        input.paymentDeadlineMs,
        input.timezone
      ),
    ]);
  }

  const detailsHtml = rows.map(
    ([label, value]) => `
      <tr>
        <td style="padding:8px;color:#64748b;
          font-size:13px;vertical-align:top;">
          ${escapeHtml(label)}
        </td>
        <td style="padding:8px;color:#172033;
          font-size:14px;overflow-wrap:anywhere;">
          ${escapeHtml(value)}
        </td>
      </tr>
    `
  ).join('');

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport"
    content="width=device-width, initial-scale=1">
  <title>${escapeHtml(subject)}</title>
</head>

<body style="margin:0;padding:0;background:#f1f5f9;
  font-family:Arial,sans-serif;color:#172033;">

  <table role="presentation" width="100%"
    cellspacing="0" cellpadding="0">

    <tr>
      <td align="center" style="padding:24px 12px;">

        <table role="presentation" width="100%"
          cellspacing="0" cellpadding="0"
          style="max-width:600px;background:#ffffff;
          border-radius:14px;overflow:hidden;">

          <tr>
            <td style="padding:24px;
              border-bottom:1px solid #e2e8f0;">

              <img src="${LOGO_URL}"
                alt="TabStartup"
                width="150"
                style="display:block;max-width:100%;
                height:auto;">

              <p style="margin:12px 0 0;
                font-size:11px;color:#64748b;
                letter-spacing:1px;">
                TABSTARTUP EVENTS
              </p>

            </td>
          </tr>

          <tr>
            <td style="padding:28px 24px;">

              <h1 style="font-size:24px;
                line-height:1.3;margin:0 0 18px;
                color:${message.color};">
                ${escapeHtml(message.heading)}
              </h1>

              <p style="font-size:15px;">
                Hello ${escapeHtml(input.participantName)},
              </p>

              <p style="font-size:15px;line-height:1.7;">
                ${escapeHtml(message.message)}
              </p>

              <table role="presentation" width="100%"
                cellspacing="0" cellpadding="0"
                style="background:#f8fafc;
                border-radius:10px;margin:20px 0;">
                ${detailsHtml}
              </table>

              <table role="presentation"
                cellspacing="0" cellpadding="0">
                <tr>
                  <td style="background:#173b80;
                    border-radius:8px;">

                    <a href="${escapeHtml(actionUrl)}"
                      style="display:inline-block;
                      padding:14px 22px;
                      color:#ffffff;
                      text-decoration:none;
                      font-size:14px;font-weight:bold;">
                      ${escapeHtml(message.button)}
                    </a>

                  </td>
                </tr>
              </table>

              <p style="font-size:12px;
                color:#64748b;line-height:1.6;
                margin-top:18px;">
                ${escapeHtml(accessNote)}
              </p>

              <p style="font-size:14px;line-height:1.6;">
                Need help?
                <a href="mailto:${SUPPORT_EMAIL}">
                  ${SUPPORT_EMAIL}
                </a>
              </p>

              <p style="font-size:14px;">
                Best regards,<br>
                TabStartup Events Team
              </p>

            </td>
          </tr>

          <tr>
            <td style="background:#173b80;
              padding:22px;text-align:center;
              color:#ffffff;font-size:12px;">

              Connecting Founders, Investors
              and Mentors

              <br><br>

              <a href="${BASE_URL}"
                style="color:#ffffff;">
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
    'TABSTARTUP EVENTS',
    '',
    message.heading,
    '',
    'Hello ' + input.participantName + ',',
    '',
    message.message,
    '',
    ...rows.map(
      ([label, value]) => label + ': ' + value
    ),
    '',
    message.button + ':',
    actionUrl,
    '',
    accessNote,
    '',
    'Support: ' + SUPPORT_EMAIL,
    '',
    'Best regards,',
    'TabStartup Events Team',
    BASE_URL,
  ].join('\n');

  return {
    subject,
    html,
    text,
  };
}
