import 'server-only';

import {
  EMAIL_OTP_POLICY,
  isValidEmailOtp,
} from '@/lib/email-verification';

export interface EmailOtpTemplate {
  subject: string;
  html: string;
  text: string;
}

export function buildEmailOtpTemplate(
  code: string
): EmailOtpTemplate {
  if (!isValidEmailOtp(code)) {
    throw new Error('INVALID_EMAIL_OTP_CODE');
  }

  const expiryMinutes =
    EMAIL_OTP_POLICY.validityMs / 60000;

  const subject =
    'Your TabStartup verification code';

  const text = [
    'TabStartup',
    '',
    'Verify your email address',
    '',
    'Welcome to TabStartup!',
    '',
    'Your verification code is: ' + code,
    '',
    'Enter this code in TabStartup to verify your email address.',
    '',
    'This code expires in ' +
      expiryMinutes + ' minutes.',
    '',
    'Never share this verification code with anyone.',
    '',
    'If you did not request this code, you can safely ignore this email.',
    '',
    'Best regards,',
    'The TabStartup Team',
    '',
    'Connecting Founders, Investors & Mentors',
    'info@tabstartup.com',
  ].join('\n');

  const html = [
    '<!DOCTYPE html>',
    '<html lang="en">',
    '<head>',
    '<meta charset="UTF-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1.0">',
    '<title>Verify your TabStartup email</title>',
    '</head>',

    '<body style="margin:0;padding:0;background:#f3f6fa;font-family:Arial,sans-serif;color:#17233b;">',

    '<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f3f6fa;">',

    '<tr><td align="center" style="padding:24px 12px;">',

    '<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;background:#ffffff;border-radius:16px;overflow:hidden;">',

    '<tr><td align="center" style="background:#10254a;padding:32px 24px;color:#ffffff;">',

    '<div style="font-size:30px;font-weight:700;">TabStartup</div>',

    '<div style="margin-top:8px;font-size:11px;letter-spacing:2px;color:#d0ddf4;">CONNECT &middot; BUILD &middot; GROW</div>',

    '</td></tr>',

    '<tr><td style="padding:32px 28px;">',

    '<h1 style="margin:0 0 20px;font-size:24px;line-height:1.4;">Verify your email address</h1>',

    '<p style="font-size:15px;line-height:1.7;">Welcome to TabStartup!</p>',

    '<p style="font-size:15px;line-height:1.7;">Enter the verification code below to verify your email address.</p>',

    '<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin:24px 0;background:#edf3fc;border-radius:12px;">',

    '<tr><td align="center" style="padding:26px 12px;">',

    '<div style="font-size:11px;font-weight:700;letter-spacing:1px;color:#536681;">YOUR VERIFICATION CODE</div>',

    '<div style="padding:18px 0;font-size:32px;font-weight:700;letter-spacing:8px;color:#10254a;">' +
      code +
    '</div>',

    '<div style="font-size:13px;color:#536681;">Expires in ' +
      expiryMinutes +
    ' minutes</div>',

    '</td></tr></table>',

    '<p style="font-size:14px;line-height:1.7;">For your security, never share this code with anyone.</p>',

    '<p style="font-size:14px;line-height:1.7;">If you did not request this verification code, you can safely ignore this email.</p>',

    '<p style="margin-top:28px;font-size:14px;line-height:1.7;">Best regards,<br><strong>The TabStartup Team</strong></p>',

    '</td></tr>',

    '<tr><td align="center" style="background:#f8fafc;border-top:1px solid #e5eaf0;padding:24px;color:#64748b;font-size:12px;line-height:1.8;">',

    'Connecting Founders, Investors &amp; Mentors<br>',

    'tabstartup.com &middot; info@tabstartup.com',

    '</td></tr></table>',

    '</td></tr></table>',

    '</body></html>',
  ].join('');

  return {
    subject,
    html,
    text,
  };
}
