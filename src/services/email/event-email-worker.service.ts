import 'server-only';

import {
  Timestamp,
} from 'firebase-admin/firestore';

import {
  getFirebaseAdmin,
} from '@/firebase/admin';

import {
  EVENT_COLLECTIONS,
} from '@/lib/event-types';

import {
  isEventEmailEnabled,
} from './resend-email.service';

import {
  processEventEmailJob,
  type EventEmailProcessingResult,
} from './event-email-delivery.service';

const MAX_JOBS_PER_CATEGORY = 3;

const WORKER_CONCURRENCY = 2;

const WORKER_TIME_BUDGET_MS = 12 * 1000;

export interface EventEmailWorkerSummary {
  enabled: boolean;

  scanned: number;
  processed: number;

  accepted: number;
  retryPending: number;
  failed: number;
  skipped: number;
  requiresReview: number;

  leaseLost: number;
  notProcessed: number;

  errors: number;
  queryFailed: boolean;

  hasMore: boolean;
}

function emptySummary(
  enabled: boolean
): EventEmailWorkerSummary {
  return {
    enabled,

    scanned: 0,
    processed: 0,

    accepted: 0,
    retryPending: 0,
    failed: 0,
    skipped: 0,
    requiresReview: 0,

    leaseLost: 0,
    notProcessed: 0,

    errors: 0,
    queryFailed: false,

    hasMore: false,
  };
}

function countResult(
  summary: EventEmailWorkerSummary,
  result: EventEmailProcessingResult
): void {
  summary.processed++;

  switch (result.status) {
    case 'accepted':
      summary.accepted++;
      break;

    case 'retry_pending':
      summary.retryPending++;
      break;

    case 'failed':
      summary.failed++;
      break;

    case 'skipped':
      summary.skipped++;
      break;

    case 'requires_review':
      summary.requiresReview++;
      break;

    case 'lease_lost':
      summary.leaseLost++;
      break;

    default:
      summary.notProcessed++;
      break;
  }
}

/**
 * Internal bounded email maintenance worker.
 *
 * No public access.
 *
 * Individual jobs are protected by
 * atomic claims and processing leases.
 */
export async function runEventEmailWorker():
  Promise<EventEmailWorkerSummary> {
  const enabled = isEventEmailEnabled();

  const summary = emptySummary(enabled);

  if (!enabled) {
    return summary;
  }

  const startedAt = Date.now();

  const cutoff = Timestamp.now();

  const { adminDb } = getFirebaseAdmin();

  const outbox = adminDb.collection(
    EVENT_COLLECTIONS.emailOutbox
  );

  const queries = [
    outbox
      .where('status', '==', 'pending')
      .where('nextAttemptAt', '<=', cutoff)
      .orderBy('nextAttemptAt', 'asc')
      .limit(MAX_JOBS_PER_CATEGORY + 1),

    outbox
      .where('status', '==', 'retry_pending')
      .where('nextAttemptAt', '<=', cutoff)
      .orderBy('nextAttemptAt', 'asc')
      .limit(MAX_JOBS_PER_CATEGORY + 1),

    outbox
      .where('status', '==', 'processing')
      .where('leaseExpiresAt', '<=', cutoff)
      .orderBy('leaseExpiresAt', 'asc')
      .limit(MAX_JOBS_PER_CATEGORY + 1),
  ];

  const queryResults =
    await Promise.allSettled(
      queries.map(query => query.get())
    );

  const categories: string[][] = [];

  for (const result of queryResults) {
    if (result.status === 'rejected') {
      summary.queryFailed = true;
      summary.errors++;

      categories.push([]);

      console.error(
        '[event-email-worker] Outbox query failed'
      );

      continue;
    }

    const docs = result.value.docs;

    if (docs.length > MAX_JOBS_PER_CATEGORY) {
      summary.hasMore = true;
    }

    categories.push(
      docs
        .slice(0, MAX_JOBS_PER_CATEGORY)
        .map(doc => doc.id)
    );
  }

  // Round-robin selection prevents one
  // category from consuming the entire run.

  const selectedIds = new Set<string>();

  for (
    let i = 0;
    i < MAX_JOBS_PER_CATEGORY;
    i++
  ) {
    for (const category of categories) {
      const emailId = category[i];

      if (emailId) {
        selectedIds.add(emailId);
      }
    }
  }

  const emailIds = [...selectedIds];

  summary.scanned = emailIds.length;

  for (
    let i = 0;
    i < emailIds.length;
    i += WORKER_CONCURRENCY
  ) {
    if (
      !isEventEmailEnabled() ||
      Date.now() - startedAt >=
        WORKER_TIME_BUDGET_MS
    ) {
      summary.hasMore = true;
      break;
    }

    const batch = emailIds.slice(
      i,
      i + WORKER_CONCURRENCY
    );

    await Promise.all(
      batch.map(async emailId => {
        try {
          const result =
            await processEventEmailJob(emailId);

          countResult(summary, result);
        } catch {
          summary.errors++;

          console.error(
            '[event-email-worker] Job processing failed',
            { emailId }
          );
        }
      })
    );
  }

  return summary;
}
