/**
 * Admin Invitation Service
 * Handles invitation link generation and validation
 */
import {
  collection,
  doc,
  getDoc,
  getDocs,
  addDoc,
  updateDoc,
  query,
  where,
  orderBy,
  serverTimestamp,
  Timestamp,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { AdminInvitation, InvitationData } from '@/types/invitation.type';
import { logAction } from './audit.service';
import { updateAuthority } from './authority.service';

const INVITATIONS_COLLECTION = 'admin_invitations';

/**
 * Generate a random token for invitation
 */
function generateToken(): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(32)))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

/**
 * Convert Firestore timestamp to Date
 */
function toDate(timestamp: Timestamp | Date | undefined): Date | undefined {
  if (!timestamp) return undefined;
  if (timestamp instanceof Date) return timestamp;
  return timestamp.toDate();
}

/**
 * Create a new admin invitation
 */
export async function createInvitation(
  data: InvitationData,
  createdBy: { adminId: string; adminName: string }
): Promise<{ invitationId: string; inviteLink: string }> {
  try {
    // Validate authorityId if role is authority_manager
    if (data.role === 'authority_manager' && !data.authorityId) {
      throw new Error('authorityId is required for authority_manager role');
    }

    const token = generateToken();
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7); // Expires in 7 days

    const invitationData = {
      email: data.email.toLowerCase().trim(),
      role: data.role,
      authorityId: data.authorityId || null,
      token,
      isUsed: false,
      expiresAt: Timestamp.fromDate(expiresAt),
      createdAt: serverTimestamp(),
      createdBy: createdBy.adminId,
    };

    const docRef = await addDoc(collection(db, INVITATIONS_COLLECTION), invitationData);
    
    // Generate invite link
    const inviteLink = `${typeof window !== 'undefined' ? window.location.origin : ''}/admin/authority-login?token=${token}`;

    // Log audit action
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
  } catch (error) {
    console.error('Error creating invitation:', error);
    throw error;
  }
}

/**
 * Validate an invitation token
 */
export async function validateInvitation(token: string): Promise<AdminInvitation | null> {
  try {
    const q = query(
      collection(db, INVITATIONS_COLLECTION),
      where('token', '==', token),
      where('isUsed', '==', false)
    );
    const snapshot = await getDocs(q);

    if (snapshot.empty) {
      return null; // Token not found or already used
    }

    const doc = snapshot.docs[0];
    const data = doc.data();

    // Check expiration
    const expiresAt = toDate(data?.expiresAt);
    if (expiresAt && expiresAt < new Date()) {
      return null; // Token expired
    }

    return {
      id: doc.id,
      email: data?.email ?? '',
      role: data?.role ?? 'authority_manager',
      authorityId: data?.authorityId ?? undefined,
      token: data?.token ?? '',
      isUsed: data?.isUsed ?? false,
      expiresAt: expiresAt ?? new Date(),
      createdAt: toDate(data?.createdAt) ?? new Date(),
      createdBy: data?.createdBy ?? '',
      usedAt: toDate(data?.usedAt),
      usedBy: data?.usedBy ?? undefined,
    };
  } catch (error) {
    console.error('Error validating invitation:', error);
    return null;
  }
}

/**
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

    // Check if user profile exists
    if (!userDoc.exists()) {
      // User profile doesn't exist yet - create it with invitation data
      const { auth } = await import('@/lib/firebase');
      const currentUser = auth.currentUser;
      const { serverTimestamp: st } = await import('firebase/firestore');
      
      await setDoc(userDocRef, {
        id: userId,
        core: {
          name: currentUser?.displayName || invitation.email.split('@')[0] || 'User',
          email: invitation.email,
          initialFitnessTier: 1,
          trackingMode: 'wellness',
          mainGoal: 'healthy_lifestyle',
          gender: 'other',
          weight: 70,
          photoURL: currentUser?.photoURL,
          isApproved: true, // Auto-approve invited users
          isSuperAdmin: invitation.role === 'super_admin',
          authorityId: invitation.role === 'authority_manager' ? invitation.authorityId : undefined,
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
          weeklyMileageGoal: 0,
          runFrequency: 1,
          activeProgram: null,
          paceProfile: { easyPace: 0, thresholdPace: 0, vo2MaxPace: 0, qualityWorkoutsHistory: [] },
        },
        createdAt: st(),
        updatedAt: st(),
      });
    } else {
      // User profile exists - update it
      const updateData: any = {
        'core.isApproved': true, // Auto-approve invited users
        updatedAt: serverTimestamp(),
      };

      if (invitation.role === 'super_admin') {
        updateData['core.isSuperAdmin'] = true;
      }

      if (invitation.role === 'authority_manager' && invitation.authorityId) {
        updateData['core.authorityId'] = invitation.authorityId;
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
 * Get all invitations (for admin management)
 */
export async function getAllInvitations(): Promise<AdminInvitation[]> {
  try {
    const q = query(
      collection(db, INVITATIONS_COLLECTION),
      orderBy('createdAt', 'desc')
    );
    const snapshot = await getDocs(q);
    
    return snapshot.docs.map((doc) => {
      const data = doc.data();
      return {
        id: doc.id,
        email: data?.email ?? '',
        role: data?.role ?? 'authority_manager',
        authorityId: data?.authorityId ?? undefined,
        token: data?.token ?? '',
        isUsed: data?.isUsed ?? false,
        expiresAt: toDate(data?.expiresAt) ?? new Date(),
        createdAt: toDate(data?.createdAt) ?? new Date(),
        createdBy: data?.createdBy ?? '',
        usedAt: toDate(data?.usedAt),
        usedBy: data?.usedBy ?? undefined,
      };
    });
  } catch (error) {
    console.error('Error fetching invitations:', error);
    throw error;
  }
}
