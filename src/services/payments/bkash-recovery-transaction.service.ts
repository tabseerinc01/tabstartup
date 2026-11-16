import 'server-only';

import type {
  Transaction,
  Firestore,
} from 'firebase-admin/firestore';

import {
  readAuthorizedEventOrder,
} from '@/services/event-order-access.service';

import {
  readAuthorizedBkashRecoveryRecords,
} from '@/services/payments/bkash-recovery-records.service';

import type {
  RegistrationAccessContext,
} from '@/services/event-registration.service';

/**
 * Internal transactional payment preflight.
 *
 * The caller must resolve uid from verified
 * authentication before entering this transaction.
 *
 * No writes or external provider calls occur here.
 * All returned records remain server-side.
 */
export async function readBkashRecoveryTransaction(
  tx: Transaction,
  db: Firestore,
  orderId: string,
  access: RegistrationAccessContext,
  uid: string | null,
  expectedProvider: 'bkash_manual'
) {
  const order = await readAuthorizedEventOrder(
    tx,
    db,
    orderId,
    access,
    uid
  );

  return readAuthorizedBkashRecoveryRecords(
    tx,
    db,
    orderId,
    order,
    expectedProvider
  );
}
