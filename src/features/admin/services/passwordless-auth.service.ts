/**
 * Passwordless Authentication Service for Admin Portal
 * Checks admin permissions before sending magic links
 */
import { collection, query, where, getDocs, doc, getDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { sendMagicLink } from '@/lib/auth.service';
import { getAuthoritiesByManager } from './authority.service';
import { getUserByEmail } from './admin-management.service';
import { checkUserRole } from './auth.service';
import { isRootAdmin, isAdminEmailAllowed } from '@/config/feature-flags';

const INVITATIONS_COLLECTION = 'admin_invitations';

export type AdminRole = 'super_admin' | 'system_admin' | 'authority_manager';

export interface AdminCheckResult {
  exists: boolean;
  role: AdminRole | null;
  isApproved: boolean;
  userId?: string;
  authorityIds?: string[];
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
      // Still try to find an existing user for their userId
      const existingUser = await getUserByEmail(normalizedEmail);
      return {
        exists: true,
        role: 'super_admin',
        isApproved: true,
        userId: existingUser?.id,
      };
    }
    
    // ── PRIORITY 1: Firestore users collection ────────────────────────
    const userDoc = await getUserByEmail(normalizedEmail);
    
    // If user doesn't exist, check admin_invitations collection
    if (!userDoc) {
      try {
        const invitationsQuery = query(
          collection(db, INVITATIONS_COLLECTION),
          where('email', '==', normalizedEmail),
          where('isUsed', '==', false)
        );
        const invitationsSnapshot = await getDocs(invitationsQuery);
        
        if (!invitationsSnapshot.empty) {
          const invitationData = invitationsSnapshot.docs[0].data();
          const role = invitationData?.role as AdminRole;
          
          // Check if invitation is expired
          const expiresAt = invitationData?.expiresAt;
          let isExpired = false;
          if (expiresAt) {
            const expiryDate = expiresAt.toDate ? expiresAt.toDate() : new Date(expiresAt);
            isExpired = expiryDate < new Date();
          }
          
          if (!isExpired && role) {
            // Invitation exists and is valid
            return {
              exists: true,
              role: role === 'authority_manager' ? 'authority_manager' : null,
              isApproved: true, // Invitations are considered "approved" if valid
            };
          }
        }
      } catch (error) {
        console.error('Error checking admin invitations:', error);
      }
      
      // No user and no valid invitation
      return {
        exists: false,
        role: null,
        isApproved: false,
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
  continueUrl?: string
): Promise<{ sent: boolean; error: string | null }> {
  try {
    // First, verify the email exists and has the required role
    const adminCheck = await checkAdminEmail(email);
    
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
