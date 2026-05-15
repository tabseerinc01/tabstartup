'use client';

import { 
  collection, 
  addDoc, 
  serverTimestamp, 
  Firestore 
} from 'firebase/firestore';
import { errorEmitter } from '@/firebase/error-emitter';
import { FirestorePermissionError } from '@/firebase/errors';

export type NotificationType = 'like' | 'comment' | 'pitch' | 'connection' | 'system' | 'message';
export type NotificationTargetType = 'post' | 'pitch' | 'chat' | 'user';

interface CreateNotificationParams {
  recipientUid: string;
  actorUid: string;
  type: NotificationType;
  title: string;
  message: string;
  targetId?: string;
  targetType?: NotificationTargetType;
}

/**
 * Reusable helper to create a notification in Firestore.
 * Follows the non-blocking write pattern.
 */
export function createNotification(db: Firestore, params: CreateNotificationParams) {
  const notificationsRef = collection(db, 'notifications');
  
  const notificationData = {
    ...params,
    read: false,
    createdAt: serverTimestamp(),
  };

  // Initiate write without awaiting
  addDoc(notificationsRef, notificationData)
    .catch(async (serverError) => {
      // Create contextual error for security rules debugging
      const permissionError = new FirestorePermissionError({
        path: 'notifications',
        operation: 'create',
        requestResourceData: notificationData,
      });

      // Emit to the global listener
      errorEmitter.emit('permission-error', permissionError);
    });
}
