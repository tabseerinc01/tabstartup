import 'server-only';

import {
  Timestamp,
  type Query,
  type QueryDocumentSnapshot,
} from 'firebase-admin/firestore';

import {
  getFirebaseAdmin,
} from '@/firebase/admin';

import {
  EVENT_COLLECTIONS,
} from '@/lib/event-types';

import {
  PAYMENT_COLLECTIONS,
} from '@/lib/payment-types';

import {
  expireUnpaidEventReservation,
} from '@/services/payments/event-unpaid-expiry.service';

import {
  expireBkashPaymentReview,
} from '@/services/payments/bkash-review-expiry.service';

const PAGE_SIZE = 10;

const MAX_RECORDS_PER_CATEGORY = 50;

const MAX_WORKER_DURATION_MS = 40_000;

export function isEventExpiryWorkerEnabled():
  boolean {
  return (
    process.env.EVENT_EXPIRY_WORKER_ENABLED
      === 'true'
  );
}

type ExpiryCategory =
  | 'unpaid_reservations'
  | 'bkash_reviews';

type CategorySummary = {
  scanned: number;

  processed: number;

  expired: number;

  requiresReview: number;

  inventoryReleased: number;

  skipped: number;

  errors: number;

  hasMore: boolean;

  queryFailed: boolean;
};

export type EventExpiryWorkerSummary = {
  startedAtMs: number;

  finishedAtMs: number;

  durationMs: number;

  unpaidReservations: CategorySummary;

  bkashReviews: CategorySummary;
};

function createSummary(): CategorySummary {
  return {
    scanned: 0,

    processed: 0,

    expired: 0,

    requiresReview: 0,

    inventoryReleased: 0,

    skipped: 0,

    errors: 0,

    hasMore: false,

    queryFailed: false,
  };
}

function safeErrorName(
  error: unknown
): string {
  if (
    error instanceof Error &&
    /^[A-Za-z0-9_]{1,80}$/.test(
      error.name
    )
  ) {
    return error.name;
  }

  return 'UnknownError';
}

type ExpiryResult = {
  status: string;

  inventoryReleased: boolean;
};

type CategoryState = {
  category: ExpiryCategory;

  query: Query;

  summary: CategorySummary;

  cursor: QueryDocumentSnapshot | null;

  finished: boolean;

  process: (
    documentId: string
  ) => Promise<ExpiryResult>;
};

/**
 * Process one bounded page.
 *
 * Each individual record uses its own
 * canonical Firestore transaction.
 */
async function processPage(
  state: CategoryState,
  stopAtMs: number
): Promise<void> {
  if (state.finished) {
    return;
  }

  const summary = state.summary;

  const remaining =
    MAX_RECORDS_PER_CATEGORY -
    summary.scanned;

  if (
    remaining <= 0 ||
    Date.now() >= stopAtMs
  ) {
    summary.hasMore = true;

    state.finished = true;

    return;
  }

  const limit = Math.min(
    PAGE_SIZE,
    remaining
  );

  let query =
    state.query.limit(limit);

  if (state.cursor !== null) {
    query = query.startAfter(
      state.cursor
    );
  }

  let documents: QueryDocumentSnapshot[];

  try {
    const snapshot =
      await query.get();

    documents = snapshot.docs;
  } catch (error) {
    summary.errors++;

    summary.queryFailed = true;

    summary.hasMore = true;

    state.finished = true;

    console.error(
      '[event-expiry-worker] query failed',
      {
        category: state.category,

        errorName: safeErrorName(error),
      }
    );

    return;
  }

  if (documents.length === 0) {
    state.finished = true;

    return;
  }

  for (const document of documents) {
    if (Date.now() >= stopAtMs) {
      summary.hasMore = true;

      state.finished = true;

      return;
    }

    summary.scanned++;

    state.cursor = document;

    try {
      const result =
        await state.process(
          document.id
        );

      summary.processed++;

      if (result.inventoryReleased) {
        summary.inventoryReleased++;
      }

      if (result.status === 'expired') {
        summary.expired++;

        if (
          state.category ===
            'bkash_reviews'
        ) {
          summary.requiresReview++;
        }
      } else if (
        result.status === 'requires_review'
      ) {
        summary.requiresReview++;
      } else {
        summary.skipped++;
      }
    } catch (error) {
      summary.errors++;

      console.error(
        '[event-expiry-worker] record failed',
        {
          category: state.category,

          documentId: document.id,

          errorName: safeErrorName(error),
        }
      );
    }
  }

  if (documents.length < limit) {
    state.finished = true;
  } else if (
    summary.scanned >=
      MAX_RECORDS_PER_CATEGORY
  ) {
    summary.hasMore = true;

    state.finished = true;
  }
}

/**
 * Internal scheduled maintenance worker.
 *
 * Must be called only by an authorized
 * maintenance entry point.
 *
 * Disabled by default.
 */
export async function runEventExpiryWorker():
  Promise<EventExpiryWorkerSummary> {
  if (!isEventExpiryWorkerEnabled()) {
    throw new Error(
      'EVENT_EXPIRY_WORKER_DISABLED'
    );
  }

  const startedAtMs = Date.now();

  const stopAtMs =
    startedAtMs + MAX_WORKER_DURATION_MS;

  const cutoff =
    Timestamp.fromMillis(startedAtMs);

  const { adminDb } =
    getFirebaseAdmin();

  const unpaidReservations =
    createSummary();

  const bkashReviews =
    createSummary();

  const unpaid: CategoryState = {
    category: 'unpaid_reservations',

    query: adminDb
      .collection(
        EVENT_COLLECTIONS.reservations
      )
      .where('status', '==', 'active')
      .where('expiresAt', '<=', cutoff)
      .orderBy('expiresAt', 'asc'),

    summary: unpaidReservations,

    cursor: null,

    finished: false,

    process: expireUnpaidEventReservation,
  };

  const bkash: CategoryState = {
    category: 'bkash_reviews',

    query: adminDb
      .collection(
        PAYMENT_COLLECTIONS.manualSubmissions
      )
      .where(
        'status',
        '==',
        'pending_verification'
      )
      .where(
        'reviewDeadlineAt',
        '<=',
        cutoff
      )
      .orderBy(
        'reviewDeadlineAt',
        'asc'
      ),

    summary: bkashReviews,

    cursor: null,

    finished: false,

    process: expireBkashPaymentReview,
  };

  // Alternate categories to reduce
  // starvation during large backlogs.

  while (
    !unpaid.finished ||
    !bkash.finished
  ) {
    if (Date.now() >= stopAtMs) {
      if (!unpaid.finished) {
        unpaid.summary.hasMore = true;
      }

      if (!bkash.finished) {
        bkash.summary.hasMore = true;
      }

      break;
    }

    await processPage(
      unpaid,
      stopAtMs
    );

    await processPage(
      bkash,
      stopAtMs
    );
  }

  const finishedAtMs = Date.now();

  return {
    startedAtMs,

    finishedAtMs,

    durationMs:
      finishedAtMs - startedAtMs,

    unpaidReservations,

    bkashReviews,
  };
}
