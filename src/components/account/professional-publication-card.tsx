'use client';

import Link from 'next/link';

import {
  CheckCircle2,
  Circle,
  AlertCircle,
  Loader2,
  RefreshCw,
  Globe,
  EyeOff,
} from 'lucide-react';

import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from '@/components/ui/card';

import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';

import type {
  ProfessionalProfileRole,
} from '@/lib/profile-readiness';

import type {
  useProfessionalPublication,
} from '@/hooks/use-professional-publication';

type Props = {
  publication: ReturnType<
    typeof useProfessionalPublication
  >;
  editable?: boolean;
  disabled?: boolean;
  hasUnsavedChanges?: boolean;
  emailVerified?: boolean | null;
};

const ROLE_LABELS: Record<
  ProfessionalProfileRole,
  string
> = {
  founder: 'Founder',
  investor: 'Investor',
  mentor: 'Mentor',
};

export function ProfessionalPublicationCard({
  publication,
  editable = false,
  disabled = false,
  hasUnsavedChanges = false,
  emailVerified = null,
}: Props) {
  const {
    status,
    loading,
    busy,
    error,
    refresh,
    changePublication,
  } = publication;

  const roles = status?.roles.filter(item =>
    item.readiness.eligible ||
    !item.readiness.blockers.includes('ROLE_NOT_OWNED') ||
    item.storedPublicationStatus !== 'absent'
  ) ?? [];

  const actionDisabled =
    disabled ||
    loading ||
    busy ||
    hasUnsavedChanges;

  return (
    <Card
      id="profile-publication"
      className="rounded-3xl border-slate-100 shadow-sm"
    >
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <CardTitle className="flex items-center gap-2 text-xl font-black">
            <Globe className="h-5 w-5 text-primary" />
            Profile Quality & Publication
          </CardTitle>

          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={loading || busy || disabled}
            onClick={() => void refresh()}
            className="gap-2"
          >
            <RefreshCw
              className={
                loading
                  ? 'h-4 w-4 animate-spin'
                  : 'h-4 w-4'
              }
            />
            Refresh
          </Button>
        </div>

        <CardDescription>
          Complete and publish each professional profile
          separately. Progress is based on your saved
          information and server-checked requirements.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-5">
        {error && (
          <div
            role="alert"
            className="flex gap-2 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900"
          >
            <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        {(loading || busy) && (
          <div
            role="status"
            className="flex items-center gap-3 py-6 text-sm text-slate-500"
          >
            <Loader2 className="h-5 w-5 animate-spin" />
            {busy
              ? 'Updating publication...'
              : 'Checking saved profile requirements...'}
          </div>
        )}

        {!loading && !busy && !status && (
          <p className="text-sm text-slate-500">
            Publication status is unavailable.
            Refresh to check your current status.
          </p>
        )}

        {status && (
          <>
            <div className="rounded-xl bg-slate-50 p-4 space-y-2">
              <p className="text-sm font-semibold">
                Email requirement for publication
              </p>

              <p className="text-sm text-slate-600">
                {status.emailVerified
                  ? 'Satisfied'
                  : 'Not satisfied'}
              </p>

              {emailVerified === true &&
                !status.emailVerified && (
                  <p className="text-xs text-amber-700">
                    Your email is verified, but that
                    verification is not currently accepted
                    for professional profile publication.
                  </p>
                )}

              {!status.emailVerified &&
                emailVerified !== true && (
                  <Link
                    href="/dashboard/profile#email-verification"
                    className="text-sm font-medium text-primary underline"
                  >
                    Check email verification
                  </Link>
                )}
            </div>

            {hasUnsavedChanges && (
              <p
                role="status"
                className="rounded-xl bg-amber-50 p-3 text-sm text-amber-800"
              >
                Save your changes before publishing.
                The checklist reflects saved information.
              </p>
            )}

            {roles.length === 0 && (
              <p className="text-sm text-slate-500">
                No professional profiles are available.
                Activate a professional role in Profile Settings.
              </p>
            )}

            {roles.map(item => {
              const readiness = item.readiness;

              const published =
                item.publicationStatus === 'published';

              const hasStoredPublication =
                item.storedPublicationStatus !== 'absent';

              return (
                <section
                  key={item.role}
                  className="space-y-4 rounded-2xl border border-slate-200 p-4 sm:p-5"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h3 className="font-bold text-slate-900">
                      {ROLE_LABELS[item.role]} Profile
                    </h3>

                    <Badge
                      variant={
                        published ? 'default' : 'secondary'
                      }
                    >
                      {item.requiresReconciliation
                        ? 'Needs review'
                        : published
                          ? 'Published'
                          : 'Unpublished'}
                    </Badge>
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-slate-500">
                        Required information
                      </span>
                      <span className="font-bold">
                        {readiness.completionPercent}%
                      </span>
                    </div>

                    <Progress
                      value={readiness.completionPercent}
                      aria-label={
                        ROLE_LABELS[item.role] +
                        ' profile completion'
                      }
                    />

                    <p className="text-xs text-slate-500">
                      {readiness.completedCount} of{' '}
                      {readiness.requiredCount} requirements met
                    </p>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {readiness.checks.map(check => (
                      <div
                        key={check.key}
                        className="flex items-center gap-2 rounded-lg bg-slate-50 p-2.5 text-xs"
                      >
                        {check.completed ? (
                          <CheckCircle2 className="h-4 w-4 shrink-0 text-green-600" />
                        ) : (
                          <Circle className="h-4 w-4 shrink-0 text-slate-400" />
                        )}

                        <span>
                          {check.label}
                          <span className="sr-only">
                            {check.completed
                              ? ': Complete'
                              : ': Required'}
                          </span>
                        </span>
                      </div>
                    ))}
                  </div>

                  {!readiness.eligible && (
                    <p className="text-sm text-amber-700">
                      This role is not currently eligible
                      for publication.
                    </p>
                  )}

                  {item.requiresReconciliation && (
                    <p className="rounded-lg bg-amber-50 p-3 text-xs text-amber-800">
                      A stored publication needs reconciliation.
                      Its removal has not been confirmed.
                    </p>
                  )}

                  {editable ? (
                    <div className="flex flex-wrap gap-2">
                      {!published && readiness.eligible && (
                        <Button
                          type="button"
                          disabled={
                            actionDisabled ||
                            !readiness.ready
                          }
                          onClick={() =>
                            void changePublication(
                              item.role,
                              'publish'
                            )
                          }
                          className="gap-2"
                        >
                          <Globe className="h-4 w-4" />
                          Publish Profile
                        </Button>
                      )}

                      {hasStoredPublication &&
                        readiness.eligible && (
                          <Button
                            type="button"
                            variant="outline"
                            disabled={
                              disabled || loading || busy
                            }
                            onClick={() =>
                              void changePublication(
                                item.role,
                                'unpublish'
                              )
                            }
                            className="gap-2"
                          >
                            <EyeOff className="h-4 w-4" />
                            Unpublish Profile
                          </Button>
                        )}
                    </div>
                  ) : (
                    <Button
                      variant="outline"
                      size="sm"
                      asChild
                    >
                      <Link href="/dashboard/profile#profile-publication">
                        Manage Profile
                      </Link>
                    </Button>
                  )}
                </section>
              );
            })}

            <p className="text-xs text-slate-500">
              Profile completion does not establish identity,
              financial or professional verification.
              Publishing requires an explicit action.
            </p>
          </>
        )}
      </CardContent>
    </Card>
  );
}
