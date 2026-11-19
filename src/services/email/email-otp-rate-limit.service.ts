import 'server-only';

import {
  Timestamp,
  type Firestore,
  type Transaction,
} from 'firebase-admin/firestore';

import {
  EMAIL_VERIFICATION_SCHEMA_VERSION,
  EMAIL_VERIFICATION_RATE_LIMITS_COLLECTION,
  EMAIL_OTP_POLICY,
  type EmailVerificationRateLimitAction,
  type EmailVerificationRateLimitScope,
} from '@/lib/email-verification';

import {
  createEmailOtpRateLimitKey,
} from './email-otp-crypto.service';

import type {
  EmailOtpRateLimitDocument,
} from './email-otp-schema';

export type EmailOtpRateLimitResult =
  | {
      allowed: true;
      retryAfterSeconds: 0;
    }
  | {
      allowed: false;
      retryAfterSeconds: number;
    };

interface RateLimitInput {
  action: EmailVerificationRateLimitAction;
  uid: string;
  email: string;
  ip: string;
}

function getScopeLimit(
  action: EmailVerificationRateLimitAction,
  scope: EmailVerificationRateLimitScope
): number {
  if (action === 'send') {
    switch (scope) {
      case 'uid':
        return EMAIL_OTP_POLICY.maxSendPerUid;

      case 'email':
        return EMAIL_OTP_POLICY.maxSendPerEmail;

      case 'ip':
        return EMAIL_OTP_POLICY.maxSendPerIp;
    }
  }

  if (action === 'verify') {
    switch (scope) {
      case 'uid':
        return EMAIL_OTP_POLICY.maxVerifyPerUid;

      case 'email':
        return EMAIL_OTP_POLICY.maxVerifyPerEmail;

      case 'ip':
        return EMAIL_OTP_POLICY.maxVerifyPerIp;
    }
  }

  throw new Error('INVALID_EMAIL_OTP_RATE_LIMIT');
}

function parseRateLimitDocument(
  value: unknown
): EmailOtpRateLimitDocument {
  if (
    typeof value !== 'object' ||
    value === null ||
    Array.isArray(value)
  ) {
    throw new Error('INVALID_EMAIL_OTP_RATE_STATE');
  }

  const data =
    value as Record<string, unknown>;

  if (
    data.schemaVersion !==
      EMAIL_VERIFICATION_SCHEMA_VERSION ||

    typeof data.count !== 'number' ||

    !Number.isSafeInteger(data.count) ||

    data.count < 1 ||

    !(data.expiresAt instanceof Timestamp) ||

    !(data.updatedAt instanceof Timestamp) ||

    data.expiresAt.toMillis() <=
      data.updatedAt.toMillis() ||

    data.expiresAt.toMillis() -
      data.updatedAt.toMillis() >
        EMAIL_OTP_POLICY.rateLimitWindowMs
  ) {
    throw new Error('INVALID_EMAIL_OTP_RATE_STATE');
  }

  return data as unknown as EmailOtpRateLimitDocument;
}

/**
 * Read and evaluate all rate-limit documents.
 *
 * Does not write until apply() is called.
 *
 * The caller must use apply() in the same
 * transaction, after completing all other reads.
 */
export async function prepareEmailOtpRateLimit(
  transaction: Transaction,
  db: Firestore,
  input: RateLimitInput,
  nowMs: number
): Promise<{
  result: EmailOtpRateLimitResult;
  apply: () => void;
}> {
  if (
    !Number.isSafeInteger(nowMs) ||
    nowMs <= 0
  ) {
    throw new Error('INVALID_EMAIL_OTP_RATE_TIME');
  }

  const scopes: {
    scope: EmailVerificationRateLimitScope;
    value: string;
  }[] = [
    { scope: 'uid', value: input.uid },
    { scope: 'email', value: input.email },
    { scope: 'ip', value: input.ip },
  ];

  const entries = scopes.map(({ scope, value }) => {
    const key = createEmailOtpRateLimitKey(
      input.action,
      scope,
      value
    );

    return {
      limit: getScopeLimit(input.action, scope),

      ref: db
        .collection(
          EMAIL_VERIFICATION_RATE_LIMITS_COLLECTION
        )
        .doc(key),
    };
  });

  const snapshots = await transaction.getAll(
    ...entries.map(entry => entry.ref)
  );

  let retryAfterSeconds = 0;

  const updates = entries.map((entry, index) => {
    const snapshot = snapshots[index];

    if (
      !snapshot ||
      snapshot.ref.path !== entry.ref.path
    ) {
      throw new Error('INVALID_EMAIL_OTP_RATE_SNAPSHOT');
    }

    const existing = snapshot.exists
      ? parseRateLimitDocument(snapshot.data())
      : null;

    if (
      existing &&
      existing.updatedAt.toMillis() > nowMs
    ) {
      throw new Error('INVALID_EMAIL_OTP_RATE_CLOCK');
    }

    const activeWindow =
      existing !== null &&
      existing.expiresAt.toMillis() > nowMs;

    const count =
      activeWindow && existing
        ? existing.count
        : 0;

    const expiryMs =
      activeWindow && existing
        ? existing.expiresAt.toMillis()
        : nowMs + EMAIL_OTP_POLICY.rateLimitWindowMs;

    if (count >= entry.limit) {
      retryAfterSeconds = Math.max(
        retryAfterSeconds,
        Math.max(
          1,
          Math.ceil((expiryMs - nowMs) / 1000)
        )
      );
    }

    const data: EmailOtpRateLimitDocument = {
      schemaVersion:
        EMAIL_VERIFICATION_SCHEMA_VERSION,

      count: count + 1,

      expiresAt: Timestamp.fromMillis(expiryMs),

      updatedAt: Timestamp.fromMillis(nowMs),
    };

    return {
      ref: entry.ref,
      data,
    };
  });

  if (retryAfterSeconds > 0) {
    return {
      result: {
        allowed: false,
        retryAfterSeconds,
      },

      apply: () => {
        throw new Error('EMAIL_OTP_RATE_LIMIT_EXCEEDED');
      },
    };
  }

  let applied = false;

  return {
    result: {
      allowed: true,
      retryAfterSeconds: 0,
    },

    apply: () => {
      if (applied) {
        throw new Error('EMAIL_OTP_RATE_ALREADY_APPLIED');
      }

      applied = true;

      for (const update of updates) {
        transaction.set(update.ref, update.data);
      }
    },
  };
}
