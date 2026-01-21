/**
 * Maintenance Reports Types
 * For user-reported equipment issues in parks
 */

export interface MaintenanceReport {
  id: string;
  parkId: string;
  authorityId: string;
  equipmentId?: string; // Gym equipment ID if specific
  equipmentName?: string; // Human-readable name
  issueType: MaintenanceIssueType;
  description: string;
  reportedBy: string; // User ID (anonymized - no PII)
  status: MaintenanceStatus;
  priority: 'low' | 'medium' | 'high' | 'urgent';
  reportedAt: Date;
  resolvedAt?: Date;
  resolvedBy?: string; // Manager user ID
  notes?: string; // Manager notes
}

export type MaintenanceIssueType =
  | 'broken'
  | 'damaged'
  | 'missing'
  | 'unsafe'
  | 'other';

export type MaintenanceStatus =
  | 'reported'
  | 'in_review'
  | 'in_progress'
  | 'resolved'
  | 'dismissed';
