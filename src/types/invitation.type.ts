/**
 * Admin Invitation Types
 */
export type InvitationRole = 'super_admin' | 'authority_manager';

export interface AdminInvitation {
  id: string;
  email: string;
  role: InvitationRole;
  authorityId?: string; // Required if role is authority_manager
  token: string;
  isUsed: boolean;
  expiresAt: Date;
  createdAt: Date;
  createdBy: string; // Admin ID who created the invitation
  usedAt?: Date;
  usedBy?: string; // User ID who used the invitation
}

export interface InvitationData {
  email: string;
  role: InvitationRole;
  authorityId?: string;
}
