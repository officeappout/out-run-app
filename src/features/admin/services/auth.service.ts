/**
 * Admin Authentication & Authorization Service
 * Determines user roles and permissions + Health Impact Metrics
 */
import { useState, useEffect } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from '@/lib/firebase';
import { getAuthoritiesByManager } from './authority.service';
import { getAuthorityStats } from './analytics.service';

export type UserRole = 'super_admin' | 'system_admin' | 'authority_manager' | 'none';

export interface UserRoleInfo {
  role: UserRole;
  isSuperAdmin: boolean;
  isSystemAdmin: boolean;
  isAuthorityManager: boolean;
  authorityIds: string[];
  isApproved: boolean;
}

/**
 * פונקציית עזר להמרת תאריכי Firebase (Timestamp) לתאריכי JS תקניים
 */
export const toDate = (timestamp: any): Date => {
  if (!timestamp) return new Date();
  if (timestamp instanceof Date) return timestamp;
  if (typeof timestamp.toDate === 'function') return timestamp.toDate();
  if (timestamp.seconds) return new Date(timestamp.seconds * 1000);
  return new Date(timestamp);
};

/**
 * Check if user is a super admin - WITH MASTER BYPASS
 */
export async function checkUserRole(userId: string): Promise<UserRoleInfo> {
  try {
    // ============================================
    // ⚠️ MASTER SECURITY BYPASS - OPEN ACCESS
    // ============================================
    // פתיחה זמנית של כל המערכת כדי שתוכל להיכנס ולנהל משתמשים
    // גם אם לא הזדהית עם מייל תקין בכניסה.
    console.warn("⚠️ MASTER BYPASS ACTIVE: All users granted Super Admin access.");
    
    // Get authorities for this user
    const authorities = await getAuthoritiesByManager(userId);
    const isAuthorityManager = authorities.length > 0;
    let isSuperAdmin = false;
    let isSystemAdmin = false;
    let isApproved = false;

    try {
      const { getUserFromFirestore } = await import('@/lib/firestore.service');
      const userProfile = await getUserFromFirestore(userId);
      if (userProfile && userProfile.core) {
        isSuperAdmin = (userProfile.core as any)?.isSuperAdmin === true;
        // Check for system_admin role (can be in core.isSystemAdmin or role field)
        isSystemAdmin = (userProfile.core as any)?.isSystemAdmin === true || 
                        (userProfile.core as any)?.role === 'system_admin';
        isApproved = (userProfile.core as any)?.isApproved === true;
        await logAdminLogin(userId);
      }
    } catch (error) {
      console.error('Error checking user profile:', error);
    }

    // Determine role priority: super_admin > system_admin > authority_manager > none
    const role: UserRole = isSuperAdmin 
      ? 'super_admin' 
      : isSystemAdmin 
        ? 'system_admin' 
        : isAuthorityManager 
          ? 'authority_manager' 
          : 'none';
    
    return { 
      role, 
      isSuperAdmin, 
      isSystemAdmin, 
      isAuthorityManager, 
      authorityIds: authorities.map((a) => a.id), 
      isApproved 
    };
  } catch (error) {
    console.error('Error in checkUserRole:', error);
    return { role: 'none', isSuperAdmin: false, isSystemAdmin: false, isAuthorityManager: false, authorityIds: [], isApproved: false };
  }
}

/**
 * מנוע חישוב חיסכון כלכלי ו-ROI בריאותי
 */
export async function calculateHealthROI(authorityId: string) {
  const ANNUAL_SAVINGS_PER_ACTIVE_USER = 1500; 
  try {
    const stats = await getAuthorityStats(authorityId);
    const activeUsersCount = stats?.usersMeetingWHOThreshold || 0;
    const estimatedSavings = (activeUsersCount * ANNUAL_SAVINGS_PER_ACTIVE_USER) / 12;
    
    return {
      whoGoalAttainment: stats?.whoPercentage || 0,
      monthlySavings: estimatedSavings,
      totalActiveMinutes: stats?.totalMinutes || 0
    };
  } catch (error) {
    console.error('Error calculating ROI:', error);
    return { whoGoalAttainment: 0, monthlySavings: 0, totalActiveMinutes: 0 };
  }
}

/**
 * תיעוד כניסת מנהל לצרכי אנליטיקה
 */
async function logAdminLogin(userId: string) {
  try {
    const { doc, updateDoc, increment, serverTimestamp } = await import('firebase/firestore');
    const { db } = await import('@/lib/firebase');
    const userRef = doc(db, 'users', userId);
    await updateDoc(userRef, {
      'core.lastLoginAt': serverTimestamp(),
      'core.loginCount': increment(1)
    });
  } catch (e) {
    console.warn('Login logging failed:', e);
  }
}

export async function isOnlyAuthorityManager(userId: string): Promise<boolean> {
  const roleInfo = await checkUserRole(userId);
  return roleInfo.isAuthorityManager && !roleInfo.isSuperAdmin && !roleInfo.isSystemAdmin;
}

/**
 * Check if user is a system admin (not super admin)
 */
export async function isSystemAdmin(userId: string): Promise<boolean> {
  const roleInfo = await checkUserRole(userId);
  return roleInfo.isSystemAdmin && !roleInfo.isSuperAdmin;
}

export function useUserRole() {
  const [roleInfo, setRoleInfo] = useState<UserRoleInfo | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      // גם אם user הוא null, ה-MASTER BYPASS ייתן הרשאות
      const uid = user ? user.uid : 'bypass-user';
      const info = await checkUserRole(uid);
      setRoleInfo(info);
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  return { roleInfo, loading };
}