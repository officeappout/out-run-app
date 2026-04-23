/**
 * Audit Log Types — Ashkelon Req. 4.0 compliant.
 *
 * Every audit row records: who, what, on which entity, before, after,
 * when, AND from which IP. Source IP is captured server-side by the
 * `logAuditAction` Cloud Function (clients cannot forge it).
 */

export type AuditActionType =
  | 'CREATE'
  | 'UPDATE'
  | 'DELETE'
  | 'APPROVE'
  | 'REJECT'
  | 'LOGIN';

export type AuditTargetEntity =
  | 'Exercise'
  | 'Park'
  | 'Authority'
  | 'Admin'
  | 'User'
  | 'Program'
  | 'Level'
  | 'Questionnaire'
  | 'EditRequest'
  | 'Route'
  | 'AccessCode'
  | 'ProductTask'
  | 'ProductTag'
  | 'PushMessage'
  | 'System';

export interface AuditLog {
  id: string;
  adminId: string;
  adminName: string;
  actionType: AuditActionType;
  targetEntity: AuditTargetEntity;
  targetId?: string;
  details: string;
  /** JSON-serialized snapshot of the entity (or affected fields) before the change. */
  oldValue?: string | null;
  /** JSON-serialized snapshot of the entity (or affected fields) after the change. */
  newValue?: string | null;
  /** Client IP captured by the server (e.g. "203.0.113.42") or "unknown". */
  sourceIp?: string;
  timestamp: Date;
}

/**
 * Payload shape sent from client → `logAuditAction` Cloud Function.
 *
 * Notes:
 *   • adminId / sourceIp / timestamp are NOT in this interface — the
 *     server derives them from request.auth and request.rawRequest.
 *   • `oldValue` / `newValue` are arbitrary JSON-serialisable values;
 *     the function will JSON.stringify them with a 10 KB cap.
 */
export interface AuditLogData {
  /**
   * Legacy field — accepted for backwards compatibility with older
   * callers but IGNORED by the server. The Cloud Function derives
   * `adminId` from `request.auth.uid` so it cannot be forged.
   */
  adminId?: string;
  adminName?: string;
  actionType: AuditActionType;
  targetEntity: AuditTargetEntity;
  targetId?: string;
  details: string;
  oldValue?: unknown;
  newValue?: unknown;
}
