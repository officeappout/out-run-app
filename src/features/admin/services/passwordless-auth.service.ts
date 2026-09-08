/**
 * Passwordless Authentication Service for Admin Portal
 * Checks admin permissions before sending magic links
 */
import { sendMagicLink } from '@/lib/auth.service';
import { getAuthoritiesByManager } from './authority.service';
import { getUserByEmail } from './admin-management.service';
import { checkUserRole } from './auth.service';
import { isRootAdmin, isAdminEmailAllowed } from '@/config/feature-flags';
import { resolveInviteLookupOutcome } from '@/lib/adminInviteLookupOutcome';

export type AdminRole = 'super_admin' | 'system_admin' | 'authority_manager';

export interface AdminCheckResult {
  exists: boolean;
  role: AdminRole | null;
  isApproved: boolean;
  userId?: string;
  authorityIds?: string[];
  /**
   * SPEC-02 SEC-16: true when the admin_invitations lookup itself failed
   * (check-email returned non-2xx, or the fetch threw) — as opposed to a
   * clean response that legitimately found no invitation. Without this
   * distinction, a transient server error looked identical to "no
   * invitation exists," and a real admin whose lookup merely failed once
   * would be told "email not found in the system" instead of "try again."
   */
  checkFailed?: boolean;
}

/**
 * Check if email exists in admins/users collection and verify role.
 * Also checks:
 *   1. Root Admin ENV list (highest priority — always granted super_admin)
 *   2. Admin allowlist (feature-flags.ts)
 *   3. Firestore users collection
 *   4. admin_invitations collection
 */
export async function checkAdminEmail(email: string): Promise<AdminCheckResult> {
  try {
    const normalizedEmail = email.toLowerCase().trim();

    // ── PRIORITY 0: Root Admin (ENV-defined) ──────────────────────────
    if (isRootAdmin(normalizedEmail)) {
      return {
        exists: true,
        role: 'super_admin',
        isApproved: true,
      };
    }

    // ── PRIORITY 0.5: Admin Email Allowlist ───────────────────────────
    // If the email is in the hardcoded allowlist, grant super_admin
    // even if there's no Firestore user doc yet (first-time login).
    if (isAdminEmailAllowed(normalizedEmail)) {
      let existingUser: Awaited<ReturnType<typeof getUserByEmail>> = null;
      try { existingUser = await getUserByEmail(normalizedEmail); } catch {}
      return {
        exists: true,
        role: 'super_admin',
        isApproved: true,
        userId: existingUser?.id,
      };
    }
    
    // ── PRIORITY 1: Firestore users collection ────────────────────────
    let userDoc: Awaited<ReturnType<typeof getUserByEmail>> = null;
    try {
      userDoc = await getUserByEmail(normalizedEmail);
    } catch (userLookupError) {
      console.warn('[checkAdminEmail] getUserByEmail failed (user may be unauthenticated):', userLookupError);
    }
    
    // If user doesn't exist, check admin_invitations via the server
    // (SPEC-01 task 1 — admin_invitations no longer allows client `list`,
    // so this can't be a direct Firestore query anymore).
    if (!userDoc) {
      // SPEC-02 SEC-16: distinguish "the lookup ran and found nothing" from
      // "the lookup itself failed" — check-email/route.ts returns HTTP 500
      // on an unexpected server error (its own catch block), which used to
      // be indistinguishable here from a clean "no invitation" response.
      // A real admin hitting a transient failure was told "email not found
      // in the system" — wrong diagnosis, wrong remedy.
      let checkFailed = false;
      try {
        const res = await fetch(`/api/auth/admin-invite/check-email?email=${encodeURIComponent(normalizedEmail)}`);
        const body = res.ok ? ((await res.json()) as { role: AdminRole | null }) : { role: null };
        const outcome = resolveInviteLookupOutcome(res.ok, body.role);
        if (outcome.role) {
          // Invitation exists and is valid
          return {
            exists: true,
            role: outcome.role,
            isApproved: true, // Invitations are considered "approved" if valid
          };
        }
        checkFailed = outcome.checkFailed;
      } catch (error) {
        console.error('Error checking admin invitations:', error);
        checkFailed = true;
      }

      // No user and no valid invitation — or the check itself couldn't run.
      return {
        exists: false,
        role: null,
        isApproved: false,
        checkFailed,
      };
    }

    // Check if user is super_admin or system_admin
    if (userDoc.isSuperAdmin) {
      return {
        exists: true,
        role: 'super_admin',
        isApproved: userDoc.isApproved,
        userId: userDoc.id,
      };
    }

    // Check if user is system_admin (via getUserFromFirestore)
    try {
      const { getUserFromFirestore } = await import('@/lib/firestore.service');
      const userProfile = await getUserFromFirestore(userDoc.id);
      const isSystemAdmin = (userProfile?.core as any)?.isSystemAdmin === true || 
                            (userProfile?.core as any)?.role === 'system_admin';
      
      if (isSystemAdmin) {
        return {
          exists: true,
          role: 'system_admin',
          isApproved: userDoc.isApproved,
          userId: userDoc.id,
        };
      }
    } catch (error) {
      console.error('Error checking system admin:', error);
    }

    // Check if user is authority_manager
    try {
      const authorities = await getAuthoritiesByManager(userDoc.id);
      if (authorities.length > 0) {
        return {
          exists: true,
          role: 'authority_manager',
          isApproved: userDoc.isApproved,
          userId: userDoc.id,
          authorityIds: authorities.map(a => a.id),
        };
      }
    } catch (error) {
      console.error('Error checking authority manager:', error);
    }

    // User exists but is not an admin
    return {
      exists: true,
      role: null,
      isApproved: false,
      userId: userDoc.id,
    };
  } catch (error) {
    console.error('Error checking admin email:', error);
    return {
      exists: false,
      role: null,
      isApproved: false,
    };
  }
}

/**
 * Send magic link to admin email (only if they have the correct role)
 */
export async function sendAdminMagicLink(
  email: string,
  requiredRole: AdminRole,
  continueUrl?: string,
  options?: { invitationToken?: string }
): Promise<{ sent: boolean; error: string | null }> {
  try {
    // If the caller has an invitation token AND it resolves (server-side)
    // to an unused, unexpired invitation for THIS exact email, skip the
    // full admin-email verification — the user may be brand new. The
    // invitation itself is redeemed after they click the magic link (in
    // auth/callback).
    //
    // SPEC-01 (docs/audit-2026-09/SPEC-01-close-guest-leaks.md) task 1
    // bonus: this used to bypass on the mere PRESENCE of a token-shaped
    // string in the URL, with no validation at all — anyone could get a
    // magic link sent to an arbitrary email by adding `?token=x` to the
    // login URL. It now requires the token to actually match this email.
    if (options?.invitationToken) {
      try {
        const res = await fetch(
          `/api/auth/admin-invite/verify-token?token=${encodeURIComponent(options.invitationToken)}`
        );
        const data = res.ok ? await res.json() : { invitation: null };
        const invitation = data?.invitation as { email?: string } | null;
        if (invitation?.email && invitation.email.toLowerCase() === email.toLowerCase().trim()) {
          console.log('[sendAdminMagicLink] Invitation token verified for this email — bypassing role check, sending magic link directly.');
          const result = await sendMagicLink(email, continueUrl);
          if (result.error) {
            return {
              sent: false,
              error: 'שגיאה בשליחת הקישור. נסה שוב.',
            };
          }
          return { sent: true, error: null };
        }
        console.warn('[sendAdminMagicLink] Invitation token present but does not match this email — falling through to role check.');
      } catch (err) {
        console.error('[sendAdminMagicLink] Error verifying invitation token:', err);
        // Fall through to the normal role check below.
      }
    }

    // Localhost dev bypass — Firestore security rules block unauthenticated
    // reads on the `users` collection, so checkAdminEmail always throws
    // permission-denied before the user has a session. Skip the role check
    // entirely in local development and send the magic link directly.
    const isLocalhost =
      typeof window !== 'undefined' && window.location.hostname === 'localhost';
    if (isLocalhost) {
      console.log('[sendAdminMagicLink] localhost detected — skipping Firestore role check, sending magic link directly.');
      const result = await sendMagicLink(email, continueUrl);
      if (result.error) {
        console.error('[sendAdminMagicLink] sendMagicLink error on localhost:', result.error);
        return { sent: false, error: `שגיאה בשליחת הקישור: ${result.error}` };
      }
      return { sent: true, error: null };
    }

    // First, verify the email exists and has the required role
    const adminCheck = await checkAdminEmail(email);

    // SPEC-02 SEC-16: a failed lookup is not the same as a confirmed
    // "no invitation" — tell the user to retry, not that they have no
    // permission.
    if (adminCheck.checkFailed) {
      return {
        sent: false,
        error: 'שגיאה בבדיקת ההרשאות. נסה שוב.',
      };
    }

    if (!adminCheck.exists) {
      return {
        sent: false,
        error: 'כתובת האימייל לא נמצאה במערכת. אנא פנה למנהל המערכת.',
      };
    }

    // Special handling: super_admin portal accepts both super_admin and system_admin
    if (requiredRole === 'super_admin') {
      if (!adminCheck.role || (adminCheck.role !== 'super_admin' && adminCheck.role !== 'system_admin')) {
        return {
          sent: false,
          error: 'אין לך הרשאות גישה לפורטל זה. אנא פנה למנהל המערכת.',
        };
      }
    } else if (requiredRole === 'authority_manager') {
      // For authority_manager: Allow if role matches OR if it's a super_admin (testing bypass)
      if (adminCheck.role === 'super_admin' || adminCheck.role === 'system_admin') {
        // Super Admin bypass for testing - allow access
        // Return success without sending magic link (they'll redirect in the page)
        return {
          sent: true,
          error: null,
        };
      }
      
      if (!adminCheck.role || adminCheck.role !== requiredRole) {
        return {
          sent: false,
          error: 'אין לך הרשאות גישה לפורטל זה. אנא פנה למנהל המערכת.',
        };
      }
    }

    if (!adminCheck.isApproved) {
      return {
        sent: false,
        error: 'החשבון שלך ממתין לאישור. אנא פנה למנהל המערכת.',
      };
    }

    // Role matches - send magic link
    const result = await sendMagicLink(email, continueUrl);
    
    if (result.error) {
      return {
        sent: false,
        error: result.error === 'auth/user-not-found' 
          ? 'כתובת האימייל לא נמצאה במערכת.'
          : 'שגיאה בשליחת הקישור. נסה שוב.',
      };
    }

    return {
      sent: true,
      error: null,
    };
  } catch (error: any) {
    console.error('Error sending admin magic link:', error);
    return {
      sent: false,
      error: 'שגיאה בשליחת הקישור. נסה שוב.',
    };
  }
}
