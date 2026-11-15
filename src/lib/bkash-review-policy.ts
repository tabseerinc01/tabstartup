/**
 * Manual payment review policy.
 *
 * Payment initiation and administrative
 * verification have separate deadlines.
 */

export const BKASH_REVIEW_WINDOW_MS =
  24 * 60 * 60 * 1000;

export function calculateBkashReviewDeadlineMs(
  submittedAtMs: number,
  eventEndsAtMs: number
): number {
  if (
    !Number.isSafeInteger(submittedAtMs) ||
    submittedAtMs <= 0 ||
    !Number.isSafeInteger(eventEndsAtMs) ||
    eventEndsAtMs <= submittedAtMs ||
    !Number.isSafeInteger(
      submittedAtMs + BKASH_REVIEW_WINDOW_MS
    )
  ) {
    throw new Error(
      'INVALID_BKASH_REVIEW_WINDOW'
    );
  }

  return Math.min(
    submittedAtMs + BKASH_REVIEW_WINDOW_MS,
    eventEndsAtMs
  );
}
