import 'server-only';

import {
  getFirebaseAdmin,
} from '@/firebase/admin';

import {
  PAYMENT_COLLECTIONS,
} from '@/lib/payment-types';

import {
  requireEventAdmin,
} from '@/services/event-authorization.service';

import {
  assertCurrentEventAdmin,
} from '@/services/event-management.service';

import {
  projectRecoveryBkashSubmission,
  type BkashRecoveryPaymentSummary,
} from '@/services/payments/bkash-recovery-projection.service';

export const BKASH_RECOVERY_LIST_LIMIT = 100;

export interface BkashRecoveryPaymentList {
  items: BkashRecoveryPaymentSummary[];

  limit: number;

  hasMore: boolean;
}

export async function listAdminRecoveryBkashPayments(
  idToken: string
): Promise<BkashRecoveryPaymentList> {
  const context =
    await requireEventAdmin(
      idToken,
      'event:manage_payments'
    );

  const { adminDb } =
    getFirebaseAdmin();

  const query = adminDb
    .collection(
      PAYMENT_COLLECTIONS.manualSubmissions
    )
    .where(
      'status',
      '==',
      'requires_review'
    )
    .limit(
      BKASH_RECOVERY_LIST_LIMIT + 1
    );

  return adminDb.runTransaction(
    async tx => {
      await assertCurrentEventAdmin(
        tx,
        context,
        idToken
      );

      const result =
        await tx.get(query);

      const items = result.docs
        .slice(0, BKASH_RECOVERY_LIST_LIMIT)
        .map(doc =>
          projectRecoveryBkashSubmission(
            doc.id,
            doc.data()
          )
        );

      items.sort(
        (a, b) =>
          a.submittedAtMs - b.submittedAtMs ||
          a.submissionId.localeCompare(
            b.submissionId
          )
      );

      return {
        items,

        limit:
          BKASH_RECOVERY_LIST_LIMIT,

        hasMore:
          result.size >
            BKASH_RECOVERY_LIST_LIMIT,
      };
    },
    {
      readOnly: true,
    }
  );
}
