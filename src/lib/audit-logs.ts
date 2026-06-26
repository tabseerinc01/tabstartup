'use client';

import { collection, addDoc, serverTimestamp, Firestore } from 'firebase/firestore';

export type AdminActionType = 
  | 'suspend_user' 
  | 'unsuspend_user' 
  | 'update_role' 
  | 'grant_pro' 
  | 'grant_growth' 
  | 'feature_startup' 
  | 'hide_startup' 
  | 'verify_startup'
  | 'delete_seo_page'
  | 'create_seo_page';

/**
 * Logs an administrative action to the auditLog collection.
 */
export async function logAdminAction(
  db: Firestore, 
  adminUid: string, 
  action: AdminActionType, 
  targetId: string,
  details?: string
) {
  try {
    await addDoc(collection(db, 'auditLogs'), {
      adminUid,
      action,
      targetId,
      details: details || '',
      timestamp: serverTimestamp()
    });
  } catch (e) {
    console.error("Audit log failed:", e);
  }
}
