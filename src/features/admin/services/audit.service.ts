import {
  collection,
  getDocs,
  query,
  where,
  orderBy,
  limit,
  Timestamp,
  QueryConstraint,
} from 'firebase/firestore';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { db, app } from '@/lib/firebase';
import { AuditLog, AuditLogData } from '@/types/audit-log.type';

// Re-export for legacy import paths (e.g. admin/audit-logs/page.tsx).
export type { AuditLog, AuditLogData };

const AUDIT_LOGS_COLLECTION = 'audit_logs';

/**
 * Helper — convert any Firebase Timestamp/raw value to a JS Date.
 */
function toDate(timestamp: any): Date {
  if (!timestamp) return new Date();
  if (timestamp instanceof Date) return timestamp;
  if (typeof timestamp.toDate === 'function') return timestamp.toDate();
  if (timestamp.seconds) return new Date(timestamp.seconds * 1000);
  return new Date(timestamp);
}

/**
 * Map a Firestore audit-log document → typed AuditLog object.
 * `oldValue` / `newValue` are stored as JSON strings (server-truncated
 * to 10 KB) and surfaced as-is to the UI.
 */
const mapDocToAuditLog = (doc: any): AuditLog => {
  const data = doc.data() ?? {};
  return {
    id: doc.id,
    adminId: data.adminId || '',
    adminName: data.adminName || 'מערכת',
    actionType: data.actionType || 'UPDATE',
    targetEntity: data.targetEntity || 'System',
    targetId: data.targetId || undefined,
    details: data.details || '',
    oldValue: data.oldValue ?? null,
    newValue: data.newValue ?? null,
    sourceIp: data.sourceIp || 'unknown',
    timestamp: toDate(data.timestamp),
  } as AuditLog;
};

/* ────────────────────────────────────────────────────────────────────
 * WRITE PATH
 *
 * All audit writes go through the `logAuditAction` Cloud Function.
 * Direct client writes to /audit_logs are blocked by Firestore Rules
 * (see firestore.rules → audit_logs match). The function captures the
 * caller's IP and uid server-side, so log entries cannot be forged.
 * ──────────────────────────────────────────────────────────────────── */

let _logCallable: ReturnType<typeof httpsCallable> | null = null;
function getLogCallable() {
  if (_logCallable) return _logCallable;
  const fns = getFunctions(app, 'us-central1');
  _logCallable = httpsCallable(fns, 'logAuditAction');
  return _logCallable;
}

/**
 * Persist an audit row.
 *
 * Failures are swallowed and logged to the console — auditing must
 * never break a user-facing flow. (Mirrors the previous behaviour.)
 */
export async function logAction(data: AuditLogData): Promise<void> {
  try {
    await getLogCallable()({
      adminName: data.adminName,
      actionType: data.actionType,
      targetEntity: data.targetEntity,
      targetId: data.targetId,
      details: data.details,
      oldValue: data.oldValue,
      newValue: data.newValue,
    });
  } catch (error) {
    console.error('[audit.service] Failed to record audit log:', error);
  }
}

/* ────────────────────────────────────────────────────────────────────
 * READ PATH (admin UI only — Firestore rules require isAdmin())
 * ──────────────────────────────────────────────────────────────────── */

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

    return snapshot.docs.map(mapDocToAuditLog);
  } catch (error) {
    console.error('Error fetching audit logs:', error);
    throw error;
  }
}

export async function getAuditLogsForEntity(
  targetEntity: string,
  targetId: string,
): Promise<AuditLog[]> {
  try {
    const q = query(
      collection(db, AUDIT_LOGS_COLLECTION),
      where('targetEntity', '==', targetEntity),
      where('targetId', '==', targetId),
      orderBy('timestamp', 'desc'),
    );
    const snapshot = await getDocs(q);
    return snapshot.docs.map(mapDocToAuditLog);
  } catch (error) {
    console.error('Error fetching audit logs for entity:', error);
    throw error;
  }
}
