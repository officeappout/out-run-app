/**
 * Engagement & Push Notification Service
 * Handles manager notifications and push messages to residents
 */
import {
  collection,
  addDoc,
  query,
  where,
  getDocs,
  orderBy,
  limit,
  serverTimestamp,
  Timestamp,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { logAction } from './audit.service';

const NOTIFICATIONS_COLLECTION = 'manager_notifications';
const PUSH_MESSAGES_COLLECTION = 'push_messages';

/**
 * Notification types for health milestones
 */
export type NotificationType = 'health_milestone' | 'park_achievement' | 'community_event' | 'encouragement';

export interface ManagerNotification {
  id: string;
  authorityId: string;
  type: NotificationType;
  title: string;
  message: string;
  parkId?: string;
  parkName?: string;
  savingsAmount?: number; // In ₪
  createdAt: Date;
  isRead: boolean;
  actionTaken?: boolean; // Whether manager sent encouragement
}

export interface PushMessage {
  id: string;
  authorityId: string;
  parkId?: string;
  title: string;
  message: string;
  sentBy: string; // Manager user ID
  sentAt: Date;
  targetAudience: 'all' | 'park_users' | 'active_users' | 'inactive_users';
}

/**
 * Create a health milestone notification
 */
export async function createHealthMilestoneNotification(
  authorityId: string,
  data: {
    parkId?: string;
    parkName?: string;
    savingsAmount: number;
    message?: string;
  }
): Promise<string> {
  try {
    const title = data.parkName
      ? `פארק ${data.parkName} חסך לרשות ₪${data.savingsAmount.toLocaleString()} החודש!`
      : `הרשות חסכה ₪${data.savingsAmount.toLocaleString()} בעלויות בריאות החודש!`;

    const message =
      data.message ||
      `פעילות גופנית של תושבי הרשות הביאה לחיסכון משמעותי בעלויות בריאות. המשיכו כך!`;

    const docRef = await addDoc(collection(db, NOTIFICATIONS_COLLECTION), {
      authorityId,
      type: 'health_milestone',
      title,
      message,
      parkId: data.parkId || null,
      parkName: data.parkName || null,
      savingsAmount: data.savingsAmount,
      createdAt: serverTimestamp(),
      isRead: false,
      actionTaken: false,
    });

    return docRef.id;
  } catch (error) {
    console.error('Error creating health milestone notification:', error);
    throw error;
  }
}

/**
 * Get notifications for an authority manager
 */
export async function getManagerNotifications(
  authorityId: string,
  limitCount: number = 20
): Promise<ManagerNotification[]> {
  try {
    const q = query(
      collection(db, NOTIFICATIONS_COLLECTION),
      where('authorityId', '==', authorityId),
      orderBy('createdAt', 'desc'),
      limit(limitCount)
    );

    const snapshot = await getDocs(q);
    return snapshot.docs.map((doc) => {
      const data = doc.data();
      return {
        id: doc.id,
        authorityId: data.authorityId,
        type: data.type as NotificationType,
        title: data.title,
        message: data.message,
        parkId: data.parkId,
        parkName: data.parkName,
        savingsAmount: data.savingsAmount,
        createdAt: data.createdAt?.toDate() || new Date(),
        isRead: data.isRead || false,
        actionTaken: data.actionTaken || false,
      };
    });
  } catch (error) {
    console.error('Error fetching manager notifications:', error);
    return [];
  }
}

/**
 * Mark notification as read
 */
export async function markNotificationAsRead(notificationId: string): Promise<void> {
  try {
    const { doc, updateDoc } = await import('firebase/firestore');
    const docRef = doc(db, NOTIFICATIONS_COLLECTION, notificationId);
    await updateDoc(docRef, {
      isRead: true,
    });
  } catch (error) {
    console.error('Error marking notification as read:', error);
    throw error;
  }
}

/**
 * Send encouragement push message to residents
 */
export async function sendEncouragementPush(
  authorityId: string,
  data: {
    title: string;
    message: string;
    parkId?: string;
    targetAudience: 'all' | 'park_users' | 'active_users' | 'inactive_users';
    sentBy: { adminId: string; adminName: string };
  }
): Promise<string> {
  try {
    const docRef = await addDoc(collection(db, PUSH_MESSAGES_COLLECTION), {
      authorityId: authorityId,
      parkId: data.parkId || null,
      title: data.title,
      message: data.message,
      sentBy: data.sentBy.adminId,
      sentAt: serverTimestamp(),
      targetAudience: data.targetAudience,
    });

    // Mark related notification as action taken
    if (data.parkId) {
      // Find related notifications and mark them
      const notifications = await getManagerNotifications(authorityId, 50);
      const relatedNotifications = notifications.filter(
        (n) => n.parkId === data.parkId && !n.actionTaken
      );
      
      for (const notif of relatedNotifications) {
        const { doc, updateDoc } = await import('firebase/firestore');
        const notifRef = doc(db, NOTIFICATIONS_COLLECTION, notif.id);
        await updateDoc(notifRef, {
          actionTaken: true,
        });
      }
    }

    // Log audit action
    await logAction({
      adminId: data.sentBy.adminId,
      adminName: data.sentBy.adminName,
      actionType: 'CREATE',
      targetEntity: 'PushMessage',
      targetId: docRef.id,
      details: `Sent encouragement push: ${data.title} (Audience: ${data.targetAudience})`,
    });

    return docRef.id;
  } catch (error) {
    console.error('Error sending encouragement push:', error);
    throw error;
  }
}

/**
 * Check if a park has reached a health milestone (e.g., saved ₪5,000)
 */
export async function checkHealthMilestones(
  authorityId: string,
  parkId: string,
  parkName: string,
  currentSavings: number
): Promise<boolean> {
  try {
    const MILESTONE_THRESHOLDS = [5000, 10000, 25000, 50000, 100000]; // ₪ thresholds

    // Check if current savings crosses any milestone
    const crossedMilestone = MILESTONE_THRESHOLDS.find((threshold) => {
      // Check if we've just crossed this threshold
      // (In production, you'd compare with previous month's savings)
      return currentSavings >= threshold;
    });

    if (crossedMilestone) {
      // Check if we've already notified for this milestone
      const recentNotifications = await getManagerNotifications(authorityId, 50);
      const alreadyNotified = recentNotifications.some(
        (n) =>
          n.parkId === parkId &&
          n.savingsAmount === crossedMilestone &&
          n.type === 'health_milestone'
      );

      if (!alreadyNotified) {
        await createHealthMilestoneNotification(authorityId, {
          parkId,
          parkName,
          savingsAmount: currentSavings,
          message: `פארק ${parkName} הגיע ליעד של ₪${crossedMilestone.toLocaleString()} בחיסכון בעלויות בריאות!`,
        });
        return true;
      }
    }

    return false;
  } catch (error) {
    console.error('Error checking health milestones:', error);
    return false;
  }
}
