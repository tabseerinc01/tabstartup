
'use client';

import { collection, addDoc, serverTimestamp, Firestore } from 'firebase/firestore';
import { errorEmitter } from '@/firebase/error-emitter';
import { FirestorePermissionError } from '@/firebase/errors';

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
 * Follows the non-blocking mutation pattern.
 */
export async function logAdminAction(
  db: Firestore, 
  adminUid: string, 
  action: AdminActionType, 
  targetId: string,
  details?: string
) {
  const logData = {
    adminUid,
    action,
    targetId,
    details: details || '',
    timestamp: serverTimestamp()
  };

  // Initiate write without awaiting to leverage optimistic UI/caching
  addDoc(collection(db, 'auditLogs'), logData)
    .catch(async (serverError) => {
      // Create rich contextual error for debugging security rules
      const permissionError = new FirestorePermissionError({
        path: `auditLogs`,
        operation: 'create',
        requestResourceData: logData,
      });

      // Emit the error through the global emitter
      errorEmitter.emit('permission-error', permissionError);
    });
}
