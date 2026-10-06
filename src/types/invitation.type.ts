/**
 * Admin Invitation Types
 */
/** 06.10.2026 ("chief fitness officer") — 'readiness_chief_officer' is a deliberately NEW name, not a reuse of 'vertical_admin' (that name is tied to core.isVerticalAdmin, a global-admin-adjacent flag — see axioms.md §32). No tenantId/unitId/authorityId required; see invitation.service.ts/the accept-invitation route for the grant it actually writes. */
export type InvitationRole = 'super_admin' | 'authority_manager' | 'unit_admin' | 'tenant_owner' | 'vertical_admin' | 'platform_member' | 'readiness_chief_officer';

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
