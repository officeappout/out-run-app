/**
 * Audit Log Types
 */
export type AuditActionType = 'CREATE' | 'UPDATE' | 'DELETE';
export type AuditTargetEntity = 'Exercise' | 'Park' | 'Authority' | 'Admin' | 'User' | 'Program' | 'Level' | 'Questionnaire';

export interface AuditLog {
  id: string;
  adminId: string;
  adminName: string;
  actionType: AuditActionType;
  targetEntity: AuditTargetEntity;
  targetId?: string; // ID of the entity that was acted upon
  details: string;
  timestamp: Date;
}

export interface AuditLogData {
  adminId: string;
  adminName: string;
  actionType: AuditActionType;
  targetEntity: AuditTargetEntity;
  targetId?: string;
  details: string;
}
