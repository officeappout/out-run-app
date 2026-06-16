/**
 * Admin Invitation Types
 */
export type InvitationRole = 'super_admin' | 'authority_manager' | 'unit_admin' | 'tenant_owner' | 'vertical_admin' | 'platform_member';

export interface AdminInvitation {
  id: string;
  email: string;
  role: InvitationRole;
  authorityId?: string;
  tenantId?: string;
  unitId?: string;
  unitPath?: string[];
  managedVertical?: 'military' | 'municipal' | 'educational';
  /** Sections visible to this platform_member (empty = no access) */
  allowedSections?: string[];
  /** Display label for the team role (e.g. "מנהל מכירות") */
  teamRole?: string;
  token: string;
  isUsed: boolean;
  expiresAt: Date;
  createdAt: Date;
  createdBy: string;
  usedAt?: Date;
  usedBy?: string;
}

export interface InvitationData {
  email: string;
  role: InvitationRole;
  authorityId?: string;
  tenantId?: string;
  unitId?: string;
  unitPath?: string[];
  managedVertical?: 'military' | 'municipal' | 'educational';
  /** Sections visible to this platform_member (empty = no access) */
  allowedSections?: string[];
  /** Display label for the team role */
  teamRole?: string;
}
