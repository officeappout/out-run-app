import {
  collection,
  addDoc,
  getDocs,
  query,
  where,
  orderBy,
  limit,
  Timestamp,
  serverTimestamp,
  QueryConstraint
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { AuditLog, AuditLogData } from '@/types/audit-log.type';

const AUDIT_LOGS_COLLECTION = 'audit_logs';

/**
 * פונקציית עזר להמרת תאריכי Firebase לתאריכי JS תקניים
 */
function toDate(timestamp: any): Date {
  if (!timestamp) return new Date();
  if (timestamp instanceof Date) return timestamp;
  if (typeof timestamp.toDate === 'function') return timestamp.toDate();
  if (timestamp.seconds) return new Date(timestamp.seconds * 1000);
  return new Date(timestamp);
}

/**
 * פונקציה פנימית למיפוי מסמך Firestore לאובייקט AuditLog
 * חוסכת כפילות קוד (זו הסיבה שהקוד מתקצר)
 */
const mapDocToAuditLog = (doc: any): AuditLog => {
  const data = doc.data();
  return {
    id: doc.id,
    adminId: data?.adminId || '',
    adminName: data?.adminName || 'מערכת',
    actionType: data?.actionType || 'UPDATE',
    targetEntity: data?.targetEntity || 'System',
    targetId: data?.targetId || undefined,
    details: data?.details || '',
    timestamp: toDate(data?.timestamp),
  } as AuditLog;
};

/**
 * תיעוד פעולה
 */
export async function logAction(data: AuditLogData): Promise<void> {
  try {
    await addDoc(collection(db, AUDIT_LOGS_COLLECTION), {
      ...data,
      targetId: data.targetId || null,
      timestamp: serverTimestamp(),
    });
  } catch (error) {
    console.error('Error logging audit action:', error);
  }
}

/**
 * שליפת כל הלוגים עם פילטרים
 */
export async function getAuditLogs(options?: {
  adminName?: string;
  startDate?: Date;
  endDate?: Date;
  actionType?: string;
  targetEntity?: string;
  limitCount?: number;
}): Promise<AuditLog[]> {
  try {
    const constraints: QueryConstraint[] = [];

    if (options?.adminName) constraints.push(where('adminName', '==', options.adminName));
    if (options?.actionType) constraints.push(where('actionType', '==', options.actionType));
    if (options?.targetEntity) constraints.push(where('targetEntity', '==', options.targetEntity));
    if (options?.startDate) constraints.push(where('timestamp', '>=', Timestamp.fromDate(options.startDate)));
    if (options?.endDate) constraints.push(where('timestamp', '<=', Timestamp.fromDate(options.endDate)));

    constraints.push(orderBy('timestamp', 'desc'));
    constraints.push(limit(options?.limitCount || 1000));

    const q = query(collection(db, AUDIT_LOGS_COLLECTION), ...constraints);
    const snapshot = await getDocs(q);

    return snapshot.docs.map(mapDocToAuditLog); // שימוש בפונקציה המאוחדת
  } catch (error) {
    console.error('Error fetching audit logs:', error);
    throw error;
  }
}

/**
 * שליפת לוגים עבור ישות ספציפית
 */
export async function getAuditLogsForEntity(
  targetEntity: string,
  targetId: string
): Promise<AuditLog[]> {
  try {
    const q = query(
      collection(db, AUDIT_LOGS_COLLECTION),
      where('targetEntity', '==', targetEntity),
      where('targetId', '==', targetId),
      orderBy('timestamp', 'desc')
    );
    const snapshot = await getDocs(q);
    return snapshot.docs.map(mapDocToAuditLog); // שימוש בפונקציה המאוחדת
  } catch (error) {
    console.error('Error fetching audit logs for entity:', error);
    throw error;
  }
}