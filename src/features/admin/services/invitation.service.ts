/**
 * Admin Invitation Service
 * Handles invitation link generation and validation.
 *
 * SECURITY:
 * - Root Admins can create/delete any invitation.
 * - Authority managers can create invitations scoped to their own authority
 *   (or its child neighborhoods).
 */
import {
  collection,
  doc,
  getDoc,
  getDocs,
  addDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
  orderBy,
  serverTimestamp,
  Timestamp,
  arrayRemove,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { AdminInvitation, InvitationData } from '@/types/invitation.type';
import { logAction } from './audit.service';
import { updateAuthority, getAuthority, getChildrenByParent } from './authority.service';
import { isRootAdmin } from '@/config/feature-flags';

const INVITATIONS_COLLECTION = 'admin_invitations';

/**
 * Assert that the calling admin is a Root Admin.
 * Throws if not — prevents non-root admins from managing invitations.
 */
function assertRootAdmin(adminEmail: string | null | undefined): void {
  if (!isRootAdmin(adminEmail)) {
    throw new Error(
      `[Security] Only Root Admins can manage invitations. Email "${adminEmail}" is not authorized.`
    );
  }
}

/**
 * Generate a random token for invitation
 */
function generateToken(): string {
  // Use crypto API if available (browser), otherwise fallback to Math.random
  if (typeof window !== 'undefined' && window.crypto && window.crypto.getRandomValues) {
    return Array.from(window.crypto.getRandomValues(new Uint8Array(32)))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  }
  // Fallback for SSR or environments without crypto API
  const bytes = new Uint8Array(32);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = Math.floor(Math.random() * 256);
  }
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Convert Firestore timestamp to Date
 */
function toDate(timestamp: unknown): Date | undefined {
  if (timestamp == null) return undefined;
  if (timestamp instanceof Date) return timestamp;
  if (typeof timestamp === 'number') {
    const ms = timestamp < 1e12 ? timestamp * 1000 : timestamp;
    const d = new Date(ms);
    return isNaN(d.getTime()) ? undefined : d;
  }
  if (typeof timestamp === 'string') {
    const d = new Date(timestamp);
    return isNaN(d.getTime()) ? undefined : d;
  }
  if (typeof timestamp === 'object' && 'toDate' in timestamp && typeof (timestamp as Timestamp).toDate === 'function') {
    return (timestamp as Timestamp).toDate();
  }
  return undefined;
}

/**
 * @deprecated SUPERSEDED 22.09.2026 (SPEC-PERMISSIONS-MODEL.md §7/§8) — no
 * live caller. Invitation creation moved to POST /api/admin/invitations
 * (Admin SDK, root-only verified server-side from the ID token) after a
 * Part-0 audit found admin_invitations' firestore.rules write gate was
 * `isAdmin()` (any DB-flagged super_admin/system_admin), not root-only —
 * meaning this function's own `assertRootAdmin`-style check below was a
 * client-side-only guard a non-root admin could bypass entirely by calling
 * `addDoc` directly. The branch that introduced the server route also
 * narrows the rule to `allow write: if false`, so calling this function
 * now would fail with permission-denied regardless. Left in place
 * (unreachable) rather than deleted — do not reintroduce a client-side
 * invitation-creation call path; use the server route.
 *
 * Create a new admin invitation.
 * SECURITY: Only Root Admins can call this function.
 *
 * @param data - Invitation data (email, role, authorityId)
 * @param createdBy - Admin creating the invitation (must be Root Admin)
 */
export async function createInvitation(
  data: InvitationData,
  createdBy: { adminId: string; adminName: string; adminEmail?: string },
  options?: { callerAuthorityId?: string }
): Promise<{ invitationId: string; inviteLink: string }> {
  try {
    console.log('[invitation.service] createInvitation called:', {
      email: data.email,
      role: data.role,
      authorityId: data.authorityId,
      tenantId: data.tenantId,
      unitId: data.unitId,
      createdBy: createdBy.adminId,
      adminEmail: createdBy.adminEmail,
      callerAuthorityId: options?.callerAuthorityId,
    });

    const isRoot = isRootAdmin(createdBy.adminEmail);
    console.log('[invitation.service] isRoot:', isRoot, 'email:', createdBy.adminEmail);

    if (!isRoot) {
      if (data.role === 'super_admin' || data.role === 'tenant_owner' || data.role === 'vertical_admin' || data.role === 'platform_member') {
        throw new Error('[Security] Only Root Admins can create super_admin, tenant_owner, vertical_admin, or platform_member invitations.');
      }

      // unit_admin invitations can be created by tenant owners using tenantId scope
      if (data.role === 'unit_admin' && data.tenantId && data.unitId) {
        // Tenant-scoped — caller must own this tenant or be root (root already handled above)
        if (options?.callerAuthorityId && data.tenantId === options.callerAuthorityId) {
          // Allowed: tenant owner inviting under their own tenant
        } else {
          throw new Error('[Security] You can only invite unit admins under your own tenant.');
        }
      } else {
        // Authority-scoped invitations
        if (!options?.callerAuthorityId) {
          throw new Error('[Security] Authority managers must provide their own authorityId for scope validation.');
        }
        if (!data.authorityId) {
          throw new Error('authorityId is required for authority_manager invitations.');
        }
        if (data.authorityId !== options.callerAuthorityId) {
          const children = await getChildrenByParent(options.callerAuthorityId);
          const childIds = children.map(c => c.id);
          if (!childIds.includes(data.authorityId)) {
            throw new Error('[Security] You can only invite coordinators to your own authority or its neighborhoods.');
          }
        }
      }
    }

    if (data.role === 'authority_manager' && !data.authorityId) {
      throw new Error('authorityId is required for authority_manager role');
    }

    if (data.role === 'unit_admin' && (!data.tenantId || !data.unitId)) {
      throw new Error('tenantId and unitId are required for unit_admin role');
    }

    if (data.role === 'tenant_owner' && !data.tenantId) {
      throw new Error('tenantId is required for tenant_owner role');
    }

    if (data.role === 'vertical_admin' && !data.managedVertical) {
      throw new Error('managedVertical is required for vertical_admin role');
    }

    if (data.role === 'platform_member' && (!data.allowedSections || data.allowedSections.length === 0)) {
      throw new Error('allowedSections is required for platform_member role — select at least one section');
    }

    const token = generateToken();
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);

    const invitationData: Record<string, any> = {
      email: data.email.toLowerCase().trim(),
      role: data.role,
      authorityId: data.authorityId || null,
      tenantId: data.tenantId || null,
      unitId: data.unitId || null,
      unitPath: data.unitPath || null,
      managedVertical: data.managedVertical || null,
      allowedSections: data.allowedSections || null,
      teamRole: data.teamRole || null,
      token,
      isUsed: false,
      expiresAt: Timestamp.fromDate(expiresAt),
      createdAt: serverTimestamp(),
      createdBy: createdBy.adminId,
    };

    console.log('[invitation.service] Writing to Firestore:', INVITATIONS_COLLECTION, invitationData);
    const docRef = await addDoc(collection(db, INVITATIONS_COLLECTION), invitationData);
    console.log('[invitation.service] Firestore doc created:', docRef.id);
    
    const authorityParam = data.authorityId ? `&authority=${data.authorityId}` : '';
    const inviteLink = `${typeof window !== 'undefined' ? window.location.origin : ''}/admin/authority-login?token=${token}${authorityParam}`;
    console.log('[invitation.service] Generated invite link:', inviteLink);

    await logAction({
      adminId: createdBy.adminId,
      adminName: createdBy.adminName,
      actionType: 'CREATE',
      targetEntity: 'Admin',
      targetId: docRef.id,
      details: `Created invitation for ${data.email} as ${data.role}${data.authorityId ? ` (Authority: ${data.authorityId})` : ''}`,
    });

    return {
      invitationId: docRef.id,
      inviteLink,
    };
  } catch (error: any) {
    console.error('[invitation.service] Error creating invitation:', error, '| message:', error?.message, '| code:', error?.code, '| stack:', error?.stack);
    throw error;
  }
}

/**
 * Validate an invitation token.
 *
 * SPEC-01 task 1: admin_invitations no longer allows client `list`, so this
 * can't be a direct Firestore `where('token', ...)` query anymore — it
 * resolves via a server route backed by the Admin SDK instead. The token
 * itself remains the authorization; only the enforcement point moved.
 */
export async function validateInvitation(token: string): Promise<AdminInvitation | null> {
  try {
    const res = await fetch(`/api/auth/admin-invite/verify-token?token=${encodeURIComponent(token)}`);
    if (!res.ok) return null;

    const { invitation } = (await res.json()) as { invitation: Record<string, any> | null };
    if (!invitation) return null; // Token not found, used, or expired

    return {
      id: invitation.id,
      email: invitation.email ?? '',
      role: invitation.role ?? 'authority_manager',
      authorityId: invitation.authorityId ?? undefined,
      token: invitation.token ?? '',
      isUsed: invitation.isUsed ?? false,
      expiresAt: toDate(invitation.expiresAt) ?? new Date(),
      createdAt: toDate(invitation.createdAt) ?? new Date(),
      createdBy: invitation.createdBy ?? '',
      usedAt: toDate(invitation.usedAt),
      usedBy: invitation.usedBy ?? undefined,
    };
  } catch (error) {
    console.error('Error validating invitation:', error);
    return null;
  }
}

/**
 * @deprecated SUPERSEDED 22.09.2026 — no live caller. The "mark as used"
 * write now happens inside the same Firestore transaction as the actual
 * role grant, in POST /api/auth/accept-invitation — doing it as a separate
 * call (as this function did) left a window where an invitation could be
 * replayed between the grant and the mark-used write. Left in place
 * (unreachable) rather than deleted; would fail with permission-denied
 * under this branch's `admin_invitations` rule regardless.
 *
 * Mark invitation as used
 */
export async function markInvitationAsUsed(
  invitationId: string,
  userId: string,
  adminInfo?: { adminId: string; adminName: string }
): Promise<void> {
  try {
    const docRef = doc(db, INVITATIONS_COLLECTION, invitationId);
    await updateDoc(docRef, {
      isUsed: true,
      usedAt: serverTimestamp(),
      usedBy: userId,
    });

    // Log audit action
    if (adminInfo) {
      await logAction({
        adminId: adminInfo.adminId,
        adminName: adminInfo.adminName,
        actionType: 'UPDATE',
        targetEntity: 'Admin',
        targetId: invitationId,
        details: `Invitation accepted by user ${userId}`,
      });
    }
  } catch (error) {
    console.error('Error marking invitation as used:', error);
    throw error;
  }
}

/**
 * @deprecated SUPERSEDED 22.09.2026 (SPEC-PERMISSIONS-MODEL.md §7) — no
 * live caller. admin/auth/callback/page.tsx now calls
 * POST /api/auth/accept-invitation instead, which handles ONLY
 * authority_manager and platform_member (the two supported types today —
 * super_admin/tenant_owner/unit_admin/vertical_admin are rejected there,
 * matching SPEC §10/§11: those verticals/levels aren't built). This
 * function's client-side writes to users/{uid} were also the concrete
 * blocker described in SPEC §6.1 — a brand-new invitee has no stored doc
 * yet, so firestore.rules' noAdminFieldsChanged() has no existing role to
 * read and permit elevating from; moving the write server-side (Admin SDK,
 * which bypasses Security Rules by design) is the only way to resolve
 * that. Left in place (unreachable) rather than deleted, since it still
 * covers role types (tenant_owner, unit_admin, vertical_admin) the new
 * endpoint deliberately does not — useful reference if those verticals
 * get built later, but do not wire anything to call it as-is: it still
 * writes client-side and would fail under this branch's rule regardless.
 *
 * Apply invitation to user profile
 * Sets isSuperAdmin, isApproved, and authorityId based on invitation
 */
export async function applyInvitationToUser(
  userId: string,
  invitation: AdminInvitation
): Promise<void> {
  try {
    const { doc, updateDoc, getDoc, setDoc } = await import('firebase/firestore');
    const { db } = await import('@/lib/firebase');
    const userDocRef = doc(db, 'users', userId);
    const userDoc = await getDoc(userDocRef);

    // 19.09.2026 — role:'admin' used to be written unconditionally for every
    // invitation type. That top-level field alone satisfies firestore.rules'
    // isAdmin() (and its server-side mirror, resolveIdentity() in
    // firebase-admin.ts) — a GLOBAL, non-tenant-scoped admin grant. For
    // authority_manager/platform_member/unit_admin/tenant_owner, the real
    // authorization already lives in the correctly-scoped fields
    // (core.authorityId + authorities.managerIds, core.allowedSections,
    // core.tenantId, core.isTenantOwner) — role:'admin' on top of that gave
    // them blanket cross-tenant admin access with no scoping at all.
    // Only super_admin / vertical_admin are meant to be global admins, so
    // only those two keep this field.
    const grantsGlobalAdminRoleFlag =
      invitation.role === 'super_admin' || invitation.role === 'vertical_admin';

    // Check if user profile exists
    if (!userDoc.exists()) {
      // User profile doesn't exist yet - create it with invitation data
      const { auth } = await import('@/lib/firebase');
      const currentUser = auth.currentUser;
      const { serverTimestamp: st } = await import('firebase/firestore');

      // 20.09.2026 (SPEC-PERMISSIONS-MODEL.md §6.2) — every one of the four
      // role-dependent fields below used to be written as `field: undefined`
      // whenever the invitation type didn't apply to it. The Firestore client
      // SDK rejects a setDoc() payload containing a literal `undefined` value
      // outright (this app's `db` does not set ignoreUndefinedProperties —
      // see src/lib/firebase.ts — so this is real, unconditional rejection,
      // not a testing artifact). The request never left the SDK for ANY
      // invitation type, because at least one of these four always evaluated
      // to undefined. Fixed by omitting the key entirely when it doesn't
      // apply — the same "absent, not undefined" pattern the UPDATE branch
      // just below already uses (`if (cond) updateData['core.x'] = value`,
      // no `else` branch). See docs/SPEC-PERMISSIONS-MODEL.md §6.2 for the
      // full narrative; this does NOT touch §6.1 (the separate, still-open
      // acceptance-flow block in noAdminFieldsChanged()).
      await setDoc(userDocRef, {
        id: userId,
        ...(grantsGlobalAdminRoleFlag ? { role: 'admin' } : {}),
        core: {
          name: currentUser?.displayName || invitation.email.split('@')[0] || 'User',
          email: invitation.email,
          initialFitnessTier: 1,
          trackingMode: 'wellness',
          mainGoal: 'healthy_lifestyle',
          gender: 'other',
          weight: 70,
          // Firebase Auth's User.photoURL is `string | null`, never
          // `undefined` — but `currentUser` itself can be null/undefined in
          // rare timing cases, and optional chaining then yields `undefined`
          // (not null). Not role-dependent — a general auth-profile
          // fallback, unrelated to invitation type. `null` matches the SDK's
          // own type contract for this field.
          photoURL: currentUser?.photoURL ?? null,
          isApproved: true,
          isSuperAdmin: invitation.role === 'super_admin',
          isVerticalAdmin: invitation.role === 'vertical_admin',
          // vertical_admin only. SPEC-PERMISSIONS-MODEL.md does not mention
          // this role at all (its §2 table covers root + 2 levels per
          // vertical, all scoped to one tenant/authority — vertical_admin's
          // "manage one whole vertical across every tenant in it" doesn't
          // fit that shape). Flagging, not resolving — out of scope for
          // §6.2, which is about the undefined-value bug only.
          ...(invitation.role === 'vertical_admin' && invitation.managedVertical ? { managedVertical: invitation.managedVertical } : {}),
          // authority_manager only. Matches SPEC-PERMISSIONS-MODEL.md §2 —
          // level-1 "מנהל בריאות רשותי", scope = one authorityId.
          ...(invitation.role === 'authority_manager' && invitation.authorityId ? { authorityId: invitation.authorityId } : {}),
          // platform_member only (internal team tooling access — CRM/
          // marketing staff, not a customer-facing role). Not covered by
          // SPEC-PERMISSIONS-MODEL.md at all — that spec is scoped to the
          // 3 customer verticals + root. Flagging, not resolving.
          ...(invitation.role === 'platform_member' ? { allowedSections: invitation.allowedSections ?? [] } : {}),
          ...(invitation.role === 'platform_member' && invitation.teamRole ? { teamRole: invitation.teamRole } : {}),
        },
        progression: {
          globalLevel: 1,
          globalXP: 0,
          coins: 0,
          totalCaloriesBurned: 0,
          hasUnlockedAdvancedStats: false,
        },
        equipment: {
          home: [],
          office: [],
          outdoor: [],
        },
        lifestyle: {
          hasDog: false,
          commute: { method: 'walk', enableChallenges: false },
        },
        health: { injuries: [], connectedWatch: 'none' },
        running: {
          isUnlocked: false,
          currentGoal: 'couch_to_5k',
          activeProgram: null,
          paceProfile: { basePace: 0, profileType: 3, qualityWorkoutsHistory: [], qualityWorkoutCount: 0, lastSelfCorrectionDate: null },
        },
        createdAt: st(),
        updatedAt: st(),
      });
    } else {
      // User profile exists - update it
      const updateData: any = {
        'core.isApproved': true,
        updatedAt: serverTimestamp(),
      };
      // See grantsGlobalAdminRoleFlag comment above — only super_admin /
      // vertical_admin get the global role:'admin' flag. Not clearing an
      // existing role field here for other invitation types — that's a
      // separate, deliberate backfill (not a byproduct of a new invite).
      if (grantsGlobalAdminRoleFlag) {
        updateData['role'] = 'admin';
      }

      if (invitation.role === 'super_admin') {
        updateData['core.isSuperAdmin'] = true;
      }

      if (invitation.role === 'authority_manager' && invitation.authorityId) {
        updateData['core.authorityId'] = invitation.authorityId;
      }

      if (invitation.role === 'tenant_owner') {
        if (invitation.tenantId) updateData['core.tenantId'] = invitation.tenantId;
        if (invitation.authorityId) updateData['core.authorityId'] = invitation.authorityId;
        updateData['core.isTenantOwner'] = true;
        updateData['core.tenantType'] = invitation.tenantId ? 'military' : undefined;
      }

      if (invitation.role === 'unit_admin') {
        if (invitation.tenantId) updateData['core.tenantId'] = invitation.tenantId;
        if (invitation.unitId) updateData['core.unitId'] = invitation.unitId;
        if (invitation.unitPath) updateData['core.unitPath'] = invitation.unitPath;
        if (invitation.authorityId) updateData['core.authorityId'] = invitation.authorityId;
      }

      if (invitation.role === 'vertical_admin') {
        updateData['core.isVerticalAdmin'] = true;
        if (invitation.managedVertical) {
          updateData['core.managedVertical'] = invitation.managedVertical;
        }
      }

      if (invitation.role === 'platform_member') {
        // platform_member: section-limited team member — no isSuperAdmin, only sections
        if (invitation.allowedSections && invitation.allowedSections.length > 0) {
          updateData['core.allowedSections'] = invitation.allowedSections;
        }
        if (invitation.teamRole) {
          updateData['core.teamRole'] = invitation.teamRole;
        }
      }

      await updateDoc(userDocRef, updateData);
    }

    // Add user to authority's managerIds array (if authority_manager)
    if (invitation.role === 'authority_manager' && invitation.authorityId) {
      try {
        const { getAuthority, updateAuthority } = await import('./authority.service');
        const authority = await getAuthority(invitation.authorityId);
        if (authority) {
          const currentManagerIds = authority.managerIds || [];
          if (!currentManagerIds.includes(userId)) {
            await updateAuthority(
              invitation.authorityId,
              {
                managerIds: [...currentManagerIds, userId],
              }
            );
          }
        }
      } catch (authError) {
        console.error('Error updating authority managerIds:', authError);
        // Don't fail the whole process if authority update fails
      }
    }

    // Mark invitation as used (with audit logging)
    try {
      const { getUserFromFirestore } = await import('@/lib/firestore.service');
      const userProfile = await getUserFromFirestore(userId);
      const userName = userProfile?.core?.name || userId;
      
      await markInvitationAsUsed(invitation.id, userId, {
        adminId: userId,
        adminName: userName,
      });
    } catch (markError) {
      console.error('Error marking invitation as used:', markError);
      // Don't fail the whole process if marking fails
    }
  } catch (error) {
    console.error('Error applying invitation to user:', error);
    throw error;
  }
}

/**
 * Get all invitations (for admin management).
 * Read-only — no Root Admin check required.
 */
export async function getAllInvitations(): Promise<AdminInvitation[]> {
  try {
    const q = query(
      collection(db, INVITATIONS_COLLECTION),
      orderBy('createdAt', 'desc')
    );
    const snapshot = await getDocs(q);
    
    return snapshot.docs.map((docSnap) => normalizeInvitation(docSnap));
  } catch (error) {
    console.error('Error fetching invitations:', error);
    throw error;
  }
}

function normalizeInvitation(docSnap: any): AdminInvitation {
  const data = docSnap.data();
  return {
    id: docSnap.id,
    email: data?.email ?? '',
    role: data?.role ?? 'authority_manager',
    authorityId: data?.authorityId ?? undefined,
    tenantId: data?.tenantId ?? undefined,
    unitId: data?.unitId ?? undefined,
    unitPath: data?.unitPath ?? undefined,
    managedVertical: data?.managedVertical ?? undefined,
    allowedSections: Array.isArray(data?.allowedSections) ? data.allowedSections : undefined,
    teamRole: data?.teamRole ?? undefined,
    token: data?.token ?? '',
    isUsed: data?.isUsed ?? false,
    expiresAt: toDate(data?.expiresAt) ?? new Date(),
    createdAt: toDate(data?.createdAt) ?? new Date(),
    createdBy: data?.createdBy ?? '',
    usedAt: toDate(data?.usedAt),
    usedBy: data?.usedBy ?? undefined,
  };
}

/**
 * @deprecated SUPERSEDED 22.09.2026 — no live caller. Deletion moved to
 * DELETE /api/admin/invitations/[id] (Admin SDK, root-only), matching
 * creation. Left in place (unreachable) rather than deleted; would fail
 * with permission-denied under this branch's `admin_invitations` rule
 * regardless.
 *
 * Delete an invitation by ID.
 * SECURITY: Only Root Admins can delete invitations.
 */
export async function deleteInvitationById(
  invitationId: string,
  adminInfo: { adminId: string; adminName: string; adminEmail?: string },
): Promise<void> {
  try {
    const docRef = doc(db, INVITATIONS_COLLECTION, invitationId);
    const invDoc = await getDoc(docRef);

    if (!invDoc.exists()) {
      throw new Error('Invitation not found');
    }

    const invData = invDoc.data();

    // Root admins can delete anything; authority managers can only delete
    // invitations targeting their own authority or children.
    const isRoot = isRootAdmin(adminInfo.adminEmail);
    if (!isRoot) {
      if (!adminInfo.adminEmail) {
        throw new Error('[Security] Cannot determine caller identity for deletion.');
      }
      // Non-root: must own the invitation's authority scope
      if (invData?.authorityId && adminInfo.adminEmail) {
        // Scope check is done at the UI layer — we trust callerAuthorityId
        // was verified before reaching here.
      }
    }

    await deleteDoc(docRef);

    await logAction({
      adminId: adminInfo.adminId,
      adminName: adminInfo.adminName,
      actionType: 'DELETE',
      targetEntity: 'Admin',
      targetId: invitationId,
      details: `Deleted invitation for ${invData?.email || 'unknown'} (role: ${invData?.role || 'unknown'})`,
    });
  } catch (error) {
    console.error('Error deleting invitation:', error);
    throw error;
  }
}

/**
 * Remove a manager (UID) from an authority's managerIds array.
 */
export async function removeManagerFromAuthority(
  authorityId: string,
  uidToRemove: string,
  adminInfo: { adminId: string; adminName: string }
): Promise<void> {
  try {
    const authorityRef = doc(db, 'authorities', authorityId);
    await updateDoc(authorityRef, {
      managerIds: arrayRemove(uidToRemove),
    });

    await logAction({
      adminId: adminInfo.adminId,
      adminName: adminInfo.adminName,
      actionType: 'UPDATE',
      targetEntity: 'Authority',
      targetId: authorityId,
      details: `Removed manager ${uidToRemove} from authority ${authorityId}`,
    });
  } catch (error) {
    console.error('Error removing manager from authority:', error);
    throw error;
  }
}

/**
 * Get invitations filtered by authorityId (for team management pages).
 */
export async function getInvitationsByAuthority(authorityId: string): Promise<AdminInvitation[]> {
  try {
    const q = query(
      collection(db, INVITATIONS_COLLECTION),
      where('authorityId', '==', authorityId),
      orderBy('createdAt', 'desc')
    );
    const snapshot = await getDocs(q);

    return snapshot.docs.map((docSnap) => normalizeInvitation(docSnap));
  } catch (error) {
    console.error('Error fetching invitations by authority:', error);
    return [];
  }
}
