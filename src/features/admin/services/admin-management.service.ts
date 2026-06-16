/**
 * Admin Management Service
 * Handles super admin user management
 */
import {
  collection,
  doc,
  getDoc,
  getDocs,
  updateDoc,
  query,
  where,
  orderBy,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { getUserFromFirestore, saveUserToFirestore } from '@/lib/firestore.service';
import { logAction } from './audit.service';

const USERS_COLLECTION = 'users';

/**
 * Admin User Info
 */
export interface AdminUser {
  id: string;
  name: string;
  email?: string;
  photoURL?: string;
  isSuperAdmin: boolean;
  isApproved: boolean;
  allowedSections: string[];
  createdAt?: Date;
  lastLogin?: Date;
}

/**
 * Get all super admin users
 */
export async function getAllSuperAdmins(): Promise<AdminUser[]> {
  try {
    const usersSnapshot = await getDocs(collection(db, USERS_COLLECTION));
    const admins: AdminUser[] = [];

    usersSnapshot.docs.forEach((doc) => {
      const data = doc.data();
      const isSuperAdmin = data?.core?.isSuperAdmin === true;
      
      if (isSuperAdmin) {
        admins.push({
          id: doc.id,
          name: data?.core?.name || 'Unknown',
          email: data?.core?.email,
          photoURL: data?.core?.photoURL,
          isSuperAdmin: true,
          isApproved: data?.core?.isApproved !== false, // Default to true if not set
          allowedSections: Array.isArray(data?.core?.allowedSections) ? data.core.allowedSections : [],
          createdAt: data?.createdAt?.toDate?.() || undefined,
          lastLogin: data?.lastLogin?.toDate?.() || undefined,
        });
      }
    });

    // Sort by name
    return admins.sort((a, b) => a.name.localeCompare(b.name));
  } catch (error) {
    console.error('Error fetching super admins:', error);
    throw error;
  }
}

/**
 * Get all pending users (users waiting for approval)
 * Only returns users with role === 'PENDING_ADMIN' or requiresApproval === true
 * Regular app users (role === 'USER') are excluded
 */
export async function getPendingUsers(): Promise<AdminUser[]> {
  try {
    const usersSnapshot = await getDocs(collection(db, USERS_COLLECTION));
    const pending: AdminUser[] = [];

    usersSnapshot.docs.forEach((doc) => {
      const data = doc.data();
      const core = data?.core || {};
      const role = core.role || 'USER'; // Default to 'USER' if role not set
      const requiresApproval = core.requiresApproval === true;
      const isApproved = core.isApproved === true;
      const isSuperAdmin = core.isSuperAdmin === true;
      
      // Only include users who are actually pending admin approval:
      // 1. Role is 'PENDING_ADMIN', OR
      // 2. requiresApproval is true AND not approved yet
      // Regular app users (role === 'USER') are excluded
      const isPendingAdmin = role === 'PENDING_ADMIN' || (requiresApproval && !isApproved);
      const hasEmail = !!core.email;
      
      // Exclude regular app users (role === 'USER' with requiresApproval === false)
      if (isPendingAdmin && hasEmail) {
        pending.push({
          id: doc.id,
          name: core.name || 'Unknown',
          email: core.email,
          photoURL: core.photoURL,
          isSuperAdmin: isSuperAdmin,
          isApproved: false,
          allowedSections: Array.isArray(core.allowedSections) ? core.allowedSections : [],
          createdAt: data?.createdAt?.toDate?.() || undefined,
          lastLogin: data?.lastLogin?.toDate?.() || undefined,
        });
      }
    });

    // Sort by creation date (newest first)
    return pending.sort((a, b) => {
      if (!a.createdAt) return 1;
      if (!b.createdAt) return -1;
      return b.createdAt.getTime() - a.createdAt.getTime();
    });
  } catch (error) {
    console.error('Error fetching pending users:', error);
    throw error;
  }
}

/**
 * Get user by email (for search)
 */
export async function getUserByEmail(email: string): Promise<AdminUser | null> {
  try {
    const q = query(
      collection(db, USERS_COLLECTION),
      where('core.email', '==', email.toLowerCase())
    );
    const snapshot = await getDocs(q);

    if (snapshot.empty) return null;

    const doc = snapshot.docs[0];
    const data = doc.data();

      return {
        id: doc.id,
        name: data?.core?.name || 'Unknown',
        email: data?.core?.email,
        photoURL: data?.core?.photoURL,
        isSuperAdmin: data?.core?.isSuperAdmin === true,
        isApproved: data?.core?.isApproved !== false, // Default to true if not set
        allowedSections: Array.isArray(data?.core?.allowedSections) ? data.core.allowedSections : [],
        createdAt: data?.createdAt?.toDate?.() || undefined,
        lastLogin: data?.lastLogin?.toDate?.() || undefined,
      };
  } catch (error) {
    console.error('Error fetching user by email:', error);
    throw error;
  }
}

/**
 * Approve user (set isApproved to true)
 */
export async function approveUser(
  userId: string,
  adminInfo?: { adminId: string; adminName: string }
): Promise<void> {
  try {
    const userDocRef = doc(db, USERS_COLLECTION, userId);
    const userDoc = await getDoc(userDocRef);

    if (!userDoc.exists()) {
      throw new Error('User not found');
    }

    const data = userDoc.data();
    const userName = data?.core?.name || userId;
    const prevApproved = data?.core?.isApproved === true;

    await updateDoc(userDocRef, {
      'core.isApproved': true,
      updatedAt: new Date(),
    });

    if (adminInfo) {
      await logAction({
        adminName: adminInfo.adminName,
        actionType: 'APPROVE',
        targetEntity: 'User',
        targetId: userId,
        details: `Approved user "${userName}" for admin access`,
        oldValue: { isApproved: prevApproved },
        newValue: { isApproved: true },
      });
    }
  } catch (error) {
    console.error('Error approving user:', error);
    throw error;
  }
}

/**
 * Reject admin request (demote to regular user, remove from pending list)
 */
export async function rejectAdminRequest(
  userId: string,
  adminInfo?: { adminId: string; adminName: string }
): Promise<void> {
  try {
    const userDocRef = doc(db, USERS_COLLECTION, userId);
    const userDoc = await getDoc(userDocRef);

    if (!userDoc.exists()) {
      throw new Error('User not found');
    }

    const data = userDoc.data();
    const userName = data?.core?.name || userId;
    const prevRole = data?.core?.role || 'PENDING_ADMIN';
    const prevRequiresApproval = data?.core?.requiresApproval === true;

    await updateDoc(userDocRef, {
      'core.role': 'USER',
      'core.requiresApproval': false,
      updatedAt: new Date(),
    });

    if (adminInfo) {
      await logAction({
        adminName: adminInfo.adminName,
        actionType: 'REJECT',
        targetEntity: 'User',
        targetId: userId,
        details: `Rejected admin request for user "${userName}" - demoted to regular user`,
        oldValue: { role: prevRole, requiresApproval: prevRequiresApproval },
        newValue: { role: 'USER', requiresApproval: false },
      });
    }
  } catch (error) {
    console.error('Error rejecting admin request:', error);
    throw error;
  }
}

/**
 * Promote user to super admin (also approves them)
 */
export async function promoteToSuperAdmin(
  userId: string,
  adminInfo?: { adminId: string; adminName: string }
): Promise<void> {
  try {
    const userDocRef = doc(db, USERS_COLLECTION, userId);
    const userDoc = await getDoc(userDocRef);

    if (!userDoc.exists()) {
      throw new Error('User not found');
    }

    const data = userDoc.data();
    const userName = data?.core?.name || userId;
    const prevIsSuperAdmin = data?.core?.isSuperAdmin === true;
    const prevIsApproved = data?.core?.isApproved === true;

    await updateDoc(userDocRef, {
      'core.isSuperAdmin': true,
      'core.isApproved': true,
      updatedAt: new Date(),
    });

    if (adminInfo) {
      await logAction({
        adminName: adminInfo.adminName,
        actionType: 'UPDATE',
        targetEntity: 'Admin',
        targetId: userId,
        details: `Promoted user "${userName}" to Super Admin`,
        oldValue: { isSuperAdmin: prevIsSuperAdmin, isApproved: prevIsApproved },
        newValue: { isSuperAdmin: true, isApproved: true },
      });
    }
  } catch (error) {
    console.error('Error promoting user to super admin:', error);
    throw error;
  }
}

/**
 * Revoke super admin privileges
 */
export async function revokeSuperAdmin(
  userId: string,
  adminInfo?: { adminId: string; adminName: string }
): Promise<void> {
  try {
    const userDocRef = doc(db, USERS_COLLECTION, userId);
    const userDoc = await getDoc(userDocRef);

    if (!userDoc.exists()) {
      throw new Error('User not found');
    }

    const data = userDoc.data();
    const userName = data?.core?.name || userId;
    const prevIsSuperAdmin = data?.core?.isSuperAdmin === true;

    await updateDoc(userDocRef, {
      'core.isSuperAdmin': false,
      updatedAt: new Date(),
    });

    if (adminInfo) {
      await logAction({
        adminName: adminInfo.adminName,
        actionType: 'UPDATE',
        targetEntity: 'Admin',
        targetId: userId,
        details: `Revoked Super Admin privileges from "${userName}"`,
        oldValue: { isSuperAdmin: prevIsSuperAdmin },
        newValue: { isSuperAdmin: false },
      });
    }
  } catch (error) {
    console.error('Error revoking super admin:', error);
    throw error;
  }
}

/**
 * Get total count of super admins
 */
export async function getSuperAdminCount(): Promise<number> {
  try {
    const admins = await getAllSuperAdmins();
    return admins.length;
  } catch (error) {
    console.error('Error counting super admins:', error);
    return 0;
  }
}

/**
 * Get all OUT team members (approved admins + super admins).
 * Excludes regular app users (role === 'USER' with no admin flags).
 */
export async function getAllAdmins(): Promise<AdminUser[]> {
  try {
    const usersSnapshot = await getDocs(collection(db, USERS_COLLECTION));
    const admins: AdminUser[] = [];

    usersSnapshot.docs.forEach((userDoc) => {
      const data = userDoc.data();
      const core = data?.core || {};
      const isSuperAdmin = core.isSuperAdmin === true;
      const isApproved = core.isApproved === true;
      const hasEmail = !!core.email;
      const role = core.role || 'USER';

      // Include: super admins, approved admins, or any pending admin with email
      const isTeamMember =
        isSuperAdmin || isApproved || role === 'PENDING_ADMIN' || core.requiresApproval === true;

      if (isTeamMember && hasEmail) {
        admins.push({
          id: userDoc.id,
          name: core.name || 'Unknown',
          email: core.email,
          photoURL: core.photoURL,
          isSuperAdmin,
          isApproved,
          allowedSections: Array.isArray(core.allowedSections) ? core.allowedSections : [],
          createdAt: data?.createdAt?.toDate?.() || undefined,
          lastLogin: data?.lastLogin?.toDate?.() || undefined,
        });
      }
    });

    return admins.sort((a, b) => a.name.localeCompare(b.name, 'he'));
  } catch (error) {
    console.error('Error fetching all admins:', error);
    throw error;
  }
}

/**
 * Update the allowed sections for an admin user.
 * Super admins ignore this list (they always have full access), but it is
 * stored so the UI can show it for reference or if they are later downgraded.
 */
export async function updateAdminSections(
  userId: string,
  sections: string[],
  adminInfo?: { adminId: string; adminName: string },
): Promise<void> {
  try {
    const userDocRef = doc(db, USERS_COLLECTION, userId);
    const userDoc = await getDoc(userDocRef);

    if (!userDoc.exists()) throw new Error('User not found');

    const prevSections: string[] = userDoc.data()?.core?.allowedSections ?? [];

    await updateDoc(userDocRef, {
      'core.allowedSections': sections,
      updatedAt: new Date(),
    });

    if (adminInfo) {
      await logAction({
        adminName: adminInfo.adminName,
        actionType: 'UPDATE',
        targetEntity: 'Admin',
        targetId: userId,
        details: `Updated section access: [${sections.join(', ')}]`,
        oldValue: { allowedSections: prevSections },
        newValue: { allowedSections: sections },
      });
    }
  } catch (error) {
    console.error('Error updating admin sections:', error);
    throw error;
  }
}
