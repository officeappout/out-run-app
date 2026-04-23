/**
 * Admin Invitation Types
 */
export type InvitationRole = 'super_admin' | 'authority_manager' | 'unit_admin' | 'tenant_owner' | 'vertical_admin';

export interface AdminInvitation {
  id: string;
  email: string;
  role: InvitationRole;
  authorityId?: string;
  tenantId?: string;
  unitId?: string;
  unitPath?: string[];
  managedVertical?: 'military' | 'municipal' | 'educational';
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
}
