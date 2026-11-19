'use client';

import { useId } from 'react';

import type { User } from 'firebase/auth';

import {
  ShieldCheck,
  Mail,
  Loader2,
  CheckCircle2,
} from 'lucide-react';

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from '@/components/ui/card';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';

import {
  useEmailVerification,
} from '@/hooks/use-email-verification';

function formatCountdown(seconds: number) {
  const minutes =
    Math.floor(seconds / 60);

  const remainder =
    seconds % 60;

  return (
    String(minutes).padStart(2, '0') +
    ':' +
    String(remainder).padStart(2, '0')
  );
}

function VerificationCardContent({
  user,
}: {
  user: User;
}) {
  const verification =
    useEmailVerification(user);

  const inputId = useId();

  const {
    status,
    busy,
    error,
    notice,
    showCode,
    code,
    expiresAtMs,
    expiresSeconds,
    resendSeconds,
    verifyRetrySeconds,
    expired,
    canSend,
    canVerify,
  } = verification;

  const verified =
    status?.emailVerified === true;

  return (
    <Card
      id="email-verification"
      className="rounded-3xl border border-slate-100 shadow-sm"
    >
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <CardTitle className="flex items-center gap-2 text-lg">
            <ShieldCheck className="h-5 w-5 text-primary" />
            Email Verification
          </CardTitle>

          {verified ? (
            <Badge className="bg-green-100 text-green-800 hover:bg-green-100">
              Verified
            </Badge>
          ) : status ? (
            <Badge variant="secondary">
              Unverified
            </Badge>
          ) : null}
        </div>

        <CardDescription>
          Verify your registered email address to meet
          the email requirement for professional profile
          publishing.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-5">
        <div className="flex items-start gap-3 rounded-xl bg-muted p-4">
          <Mail className="mt-1 h-5 w-5 shrink-0 text-muted-foreground" />

          <div className="min-w-0 space-y-1">
            <p className="text-xs text-muted-foreground">
              Registered email address
            </p>

            <p className="break-all text-sm font-semibold">
              {user.email || 'No email address available'}
            </p>
          </div>
        </div>

        {busy === 'status' && !status && (
          <div
            role="status"
            className="flex items-center gap-2 text-sm text-muted-foreground"
          >
            <Loader2 className="h-4 w-4 animate-spin" />
            Checking verification status...
          </div>
        )}

        {error && (
          <div
            role="alert"
            className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800"
          >
            {error}
          </div>
        )}

        {notice && (
          <div
            role="status"
            className="rounded-xl bg-muted p-3 text-sm"
          >
            {notice}
          </div>
        )}

        {verified ? (
          <div className="flex items-start gap-3 rounded-xl border border-green-200 bg-green-50 p-4 text-green-800">
            <CheckCircle2 className="h-5 w-5 shrink-0" />

            <div className="space-y-1">
              <p className="font-semibold">
                Your email is verified
              </p>

              <p className="text-sm">
                Continue completing your professional profile.
                Verification does not publish your profile automatically.
              </p>
            </div>
          </div>
        ) : status && !status.otpEnabled ? (
          <p className="text-sm text-muted-foreground">
            Email verification is temporarily unavailable.
          </p>
        ) : status?.otpEnabled && user.email ? (
          <>
            {showCode && (
              <div className="space-y-3">
                <Label htmlFor={inputId}>
                  Enter your 6-digit verification code
                </Label>

                <Input
                  id={inputId}
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  pattern="[0-9]{6}"
                  maxLength={6}
                  placeholder="000000"
                  value={code}
                  disabled={busy !== null || expired}
                  onChange={event =>
                    verification.updateCode(
                      event.target.value
                    )
                  }
                  onKeyDown={event => {
                    if (event.key === 'Enter') {
                      event.preventDefault();
                      verification.verifyCode();
                    }
                  }}
                  className="h-12 text-center text-xl tracking-[0.35em]"
                />

                {expiresAtMs > 0 && (
                  <p className="text-xs text-muted-foreground">
                    {expired
                      ? 'Code expired. Request a new code.'
                      : 'Code expires in ' +
                        formatCountdown(expiresSeconds)}
                  </p>
                )}

                {verifyRetrySeconds > 0 && (
                  <p className="text-xs text-muted-foreground">
                    Try verifying again in{' '}
                    {formatCountdown(verifyRetrySeconds)}.
                  </p>
                )}

                <Button
                  type="button"
                  className="w-full"
                  disabled={!canVerify}
                  onClick={verification.verifyCode}
                >
                  {busy === 'verify' && (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  )}

                  Verify email
                </Button>
              </div>
            )}

            <Button
              type="button"
              variant={showCode ? 'outline' : 'default'}
              className="w-full"
              disabled={!canSend}
              onClick={verification.sendCode}
            >
              {busy === 'send' && (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              )}

              {resendSeconds > 0
                ? 'Resend available in ' +
                  formatCountdown(resendSeconds)
                : showCode
                  ? 'Resend verification code'
                  : 'Send verification code'}
            </Button>

            {!showCode && (
              <Button
                type="button"
                variant="ghost"
                className="w-full"
                disabled={busy !== null}
                onClick={verification.openCodeEntry}
              >
                I already have a code
              </Button>
            )}
          </>
        ) : null}

        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="w-full"
          disabled={busy !== null}
          onClick={verification.refreshStatus}
        >
          Refresh verification status
        </Button>

        <p className="text-xs text-muted-foreground">
          Never share your verification code with anyone.
        </p>
      </CardContent>
    </Card>
  );
}

export function EmailVerificationCard({
  user,
}: {
  user: User | null;
}) {
  if (!user) return null;

  return (
    <VerificationCardContent
      key={JSON.stringify([user.uid, user.email])}
      user={user}
    />
  );
}
