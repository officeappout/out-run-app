'use client';

// Force dynamic rendering to prevent SSR issues with window/localStorage
export const dynamic = 'force-dynamic';

import React, { useState, useEffect, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { onAuthStateChanged } from 'firebase/auth';
import { auth } from '@/lib/firebase';
import { checkUserRole, isOnlyAuthorityManager } from '@/features/admin/services/auth.service';
import {
  getAllUsers,
  getUserDetails,
  getUserHealthDeclarationPdfUrl,
  getUserWorkoutHistory,
  deleteUser,
  AdminUserListItem
} from '@/features/admin/services/users.service';
import { UserFullProfile } from '@/types/user-profile';
import { WorkoutHistoryEntry } from '@/features/workout-engine/core/services/storage.service';
import { getStepsTrend, type DailyStepsSnapshot } from '@/features/activity/services/activity-history.service';
import { safeRenderText } from '@/utils/render-helpers';
import { 
  Search, Trash2, Eye, Shield, Mail, Phone, Calendar, Coins, 
  User, X, Activity, TrendingUp, MapPin, Package, RefreshCw, 
  Building2, Clock, CheckCircle2, AlertCircle, Dumbbell, Footprints, Move, Bike,
  FileText, ExternalLink, Edit3, Save, Plus, ArrowRightLeft, Shuffle,
  Bell, BellOff, Smartphone, Moon, Maximize2, Minimize2, Flame
} from 'lucide-react';
import { getProgramIcon, resolveIconKey } from '@/features/content/programs/core/program-icon.util';
import dynamicImport from 'next/dynamic';

// Dynamic import for map to avoid SSR issues
const RunMapBlock = dynamicImport(
  () => import('@/features/workout-engine/summary/components/running/RunMapBlock'),
  { ssr: false }
);
import { logAction } from '@/features/admin/services/audit.service';
import { getAllGearDefinitions } from '@/features/content/equipment/gear';
import { GearDefinition } from '@/features/content/equipment/gear';
import { getUserEvents, AnalyticsEvent } from '@/features/analytics/AnalyticsService';
import { getAuthority } from '@/features/admin/services/authority.service';
import { getProgram, getAllPrograms, MASTER_PROGRAM_ID_TO_SLUG } from '@/features/content/programs';
import { Program } from '@/features/content/programs';
import { resolveToSlug, ensureIdSlugMapWarm, FULL_BODY_CHILD_DOMAINS, UPPER_BODY_CHILD_DOMAINS } from '@/features/workout-engine/services/program-hierarchy.utils';
import { usePagination } from '@/features/admin/hooks/usePagination';
import Pagination from '@/features/admin/components/shared/Pagination';
import { formatFirebaseTimestamp, convertTimestampToDate } from '@/lib/utils/date-formatter';
import { formatPace } from '@/features/workout-engine/core/utils/formatPace';
import { isTestOrMockUser } from '@/lib/testAccountFilter';
import { formatLastActivity, securityBadge, computeEffectiveLevel } from '../shared.utils';

export default function AllUsersPage() {
  const [users, setUsers] = useState<AdminUserListItem[]>([]);
  const [filteredUsers, setFilteredUsers] = useState<AdminUserListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [isAuthorized, setIsAuthorized] = useState(false);
  const router = useRouter();
  const [deletingUserId, setDeletingUserId] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [userAuthorityIds, setUserAuthorityIds] = useState<string[]>([]);
  const [isAuthorityManagerOnly, setIsAuthorityManagerOnly] = useState(false);
  
  // Filter states
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'COMPLETED' | 'ONBOARDING'>('ALL');
  const [stepFilter, setStepFilter] = useState<'ALL' | 'LOCATION' | 'EQUIPMENT' | 'HISTORY' | 'SCHEDULE' | 'HEALTH_DECLARATION' | 'COMPLETED'>('ALL');
  const [typeFilter, setTypeFilter] = useState<'ALL' | 'REGISTERED' | 'GUEST'>('ALL');
  const [activityFilter, setActivityFilter] = useState<'ALL' | 'NEW' | 'BEGINNER' | 'PRO'>('ALL');
  // Defaults to hiding test/mock accounts (core.isTestData/core.isMockData) —
  // matches isTestOrMockUser() filtering already applied to statistics-summary/
  // insights-summary/analytics.service; this list was the one surface not
  // applying it, which is why it showed ~777 instead of the real population.
  const [testAccountFilter, setTestAccountFilter] = useState<'HIDE' | 'ALL' | 'ONLY'>('HIDE');
  // Ghost quick-filter (David, 04.10.2026): no email AND 0 workouts AND
  // default level AND no name — see user.isGhost, computed in loadUsers().
  const [ghostOnly, setGhostOnly] = useState(false);
  // Join-date sort — default newest-first per David's triage workflow.
  const [joinDateSort, setJoinDateSort] = useState<'desc' | 'asc'>('desc');
  // Bulk isTestData flag action — persists across pages; cleared on refresh.
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkActionPending, setBulkActionPending] = useState(false);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        try {
          const roleInfo = await checkUserRole(user.uid);
          const isOnly = await isOnlyAuthorityManager(user.uid);
          setIsAuthorityManagerOnly(isOnly);
          setUserAuthorityIds(roleInfo.authorityIds || []);
          
          // Super Admins and System Admins only. Authority managers used to be
          // let in here too (`|| isOnly`), but this is the cross-city, full-name
          // "all users" view — exactly what SPEC-PERMISSIONS-MODEL.md §5 says an
          // authority manager must never see (his own city, aggregates only, no
          // names). The underlying query is already denied for a real-shape
          // manager by firestore.rules regardless (confirmed in the 22.09.2026
          // full-tour audit — this branch never actually returned data, only a
          // raw rules error), so removing the escape hatch here closes the
          // client-side gap without changing behavior for anyone it ever
          // actually worked for. Authority managers have their own scoped,
          // aggregate-only view at /admin/authority/users.
          if (roleInfo.isSuperAdmin || roleInfo.isSystemAdmin) {
            setIsAuthorized(true);
            loadUsers(isOnly, roleInfo.authorityIds || []);
          } else {
            setIsAuthorized(false);
          }
        } catch (error) {
          console.error('Error checking authorization:', error);
          setIsAuthorized(false);
        }
      } else {
        setIsAuthorized(false);
      }
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  // Enhanced filtering logic with all filters
  useEffect(() => {
    const filtered = users.filter((user) => {
      // 1. Search Logic
      const matchesSearch = searchTerm.trim() === '' ? true : (() => {
        const term = searchTerm.toLowerCase();
        return (
          user.name.toLowerCase().includes(term) ||
          user.email?.toLowerCase().includes(term) ||
          user.phone?.toLowerCase().includes(term)
        );
      })();

      // 2. Status Check
      const matchesStatus = statusFilter === 'ALL' ? true :
        statusFilter === 'COMPLETED' ? (user.onboardingStatus === 'COMPLETED' || (!user.onboardingStatus && !user.onboardingStep)) :
        user.onboardingStatus === 'ONBOARDING' || (!!user.onboardingStep && user.onboardingStatus !== 'COMPLETED');

      // 3. Step Check (only applies if status is ONBOARDING)
      const matchesStep = statusFilter !== 'ONBOARDING' ? true :
        stepFilter === 'ALL' ? true :
        user.onboardingStep === stepFilter;

      // 4. Type Check
      const matchesType = typeFilter === 'ALL' ? true :
        typeFilter === 'REGISTERED' ? (user.isAnonymous !== true && !!user.email) :
        user.isAnonymous === true;

      // 5. Activity Check (workoutsCompleted defaults to 0 for now)
      // TODO: Enhance getAllUsers to fetch actual workout counts
      const workoutsCompleted = (user as any).workoutsCompleted || 0;
      const matchesActivity = activityFilter === 'ALL' ? true :
        activityFilter === 'NEW' ? workoutsCompleted === 0 :
        activityFilter === 'BEGINNER' ? (workoutsCompleted > 0 && workoutsCompleted <= 5) :
        workoutsCompleted > 5; // PRO

      // 6. Test/Mock Account Check
      const isTestOrMock = isTestOrMockUser({ isTestData: user.isTestData, isMockData: user.isMockData });
      const matchesTestAccount = testAccountFilter === 'ALL' ? true :
        testAccountFilter === 'HIDE' ? !isTestOrMock :
        isTestOrMock; // ONLY

      // 7. Ghost quick-filter (no email AND 0 workouts AND default level AND no name)
      const matchesGhost = !ghostOnly || user.isGhost === true;

      return matchesSearch && matchesStatus && matchesStep && matchesType && matchesActivity && matchesTestAccount && matchesGhost;
    });

    setFilteredUsers(filtered);
  }, [searchTerm, users, statusFilter, stepFilter, typeFilter, activityFilter, testAccountFilter, ghostOnly]);

  // Sort filtered users by join date — applied before pagination so sorting
  // is stable across pages, not just within the current page's 10 rows.
  const sortedUsers = useMemo(() => {
    const withTime = (u: AdminUserListItem) => u.joinDate instanceof Date ? u.joinDate.getTime() : -Infinity;
    return [...filteredUsers].sort((a, b) =>
      joinDateSort === 'desc' ? withTime(b) - withTime(a) : withTime(a) - withTime(b)
    );
  }, [filteredUsers, joinDateSort]);

  // Pagination for sorted + filtered users
  const { currentPage, totalPages, paginatedItems, goToPage, resetPagination } = usePagination(sortedUsers, 10);

  // Reset pagination when filters change
  useEffect(() => {
    resetPagination();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchTerm, statusFilter, stepFilter, typeFilter, activityFilter, testAccountFilter, ghostOnly, joinDateSort]);


  const loadUsers = async (filterByAuthority: boolean = false, authorityIds: string[] = []) => {
    try {
      setLoading(true);
      const { collection, query: firestoreQuery, getDocs, orderBy, where } = await import('firebase/firestore');
      const { db } = await import('@/lib/firebase');
      
      // ── SERVER-SIDE FILTERING: Authority Managers only see their own users ──
      // This prevents user data from other authorities from ever reaching the client.
      let snapshots: any[] = [];
      
      if (filterByAuthority && authorityIds.length > 0) {
        // Firestore 'in' supports up to 30 values — sufficient for authority IDs
        // Each authority manager typically has 1-3 authority IDs.
        for (const authorityId of authorityIds) {
          const scopedQuery = firestoreQuery(
            collection(db, 'users'),
            where('core.authorityId', '==', authorityId),
          );
          const snapshot = await getDocs(scopedQuery);
          snapshots.push(...snapshot.docs);
        }
        // Deduplicate by doc ID (in case a user belongs to multiple authorities)
        const seen = new Set<string>();
        snapshots = snapshots.filter(doc => {
          if (seen.has(doc.id)) return false;
          seen.add(doc.id);
          return true;
        });
      } else {
        // Super Admin / System Admin — fetch all users
        const q = firestoreQuery(collection(db, 'users'), orderBy('core.name', 'asc'));
        const snapshot = await getDocs(q);
        snapshots = snapshot.docs;
      }

      // ── Protection-rule inputs (mirrors scripts/mark-test-accounts.ts) ──
      // authorityManager: uid appears in managerIds of any authorities/{id} doc.
      const authoritiesSnap = await getDocs(collection(db, 'authorities'));
      const managerUids = new Set<string>();
      authoritiesSnap.docs.forEach((d) => {
        const ids = d.data().managerIds;
        if (Array.isArray(ids)) ids.forEach((uid) => typeof uid === 'string' && managerUids.add(uid));
      });

      // realEngagedUser: real per-user workout count, from the `workouts`
      // collection itself — NOT progression.workoutCount, which is a
      // client-written counter that can silently under-count (see
      // completion-sync.service.ts). This also feeds the "רמת פעילות" filter
      // below, which previously always read 0 (workoutsCompleted was never
      // populated on this object).
      const workoutsSnap = await getDocs(collection(db, 'workouts'));
      const workoutCountByUid = new Map<string, number>();
      // Last WORKOUT date per uid — David, 04.10.2026: "lastActive reads
      // empty; a user with workouts should show a real date." Built from
      // the same already-fetched full workouts collection, no extra read.
      const lastWorkoutDateByUid = new Map<string, Date>();
      workoutsSnap.docs.forEach((d: any) => {
        const data = d.data();
        const uid = data?.userId;
        if (typeof uid !== 'string') return;
        workoutCountByUid.set(uid, (workoutCountByUid.get(uid) ?? 0) + 1);
        const workoutDate = convertTimestampToDate(data?.date);
        if (workoutDate) {
          const existing = lastWorkoutDateByUid.get(uid);
          if (!existing || workoutDate.getTime() > existing.getTime()) {
            lastWorkoutDateByUid.set(uid, workoutDate);
          }
        }
      });

      let usersData = snapshots.map((docSnap: any) => {
        const data = docSnap.data();
        const core = data?.core || {};
        const progression = data?.progression || {};
        
        // Effective level — shared with the detail page (shared.utils.ts),
        // not a second copy of this formula.
        const effectiveLevel = computeEffectiveLevel(progression);

        // Program name(s) from activePrograms — a user can be enrolled in
        // several at once; programName (first only) kept for back-compat,
        // programNames is the full list the table now renders as chips.
        const activeProgramsList = Array.isArray(progression.activePrograms) ? progression.activePrograms : [];
        const activeProg = activeProgramsList[0];
        const programName = activeProg?.name || activeProg?.templateId || undefined;
        const programNames = activeProgramsList
          .map((p: { name?: string; templateId?: string }) => p?.name || p?.templateId)
          .filter((n: unknown): n is string => typeof n === 'string' && n.length > 0);

        // City name: affiliations[].name > authorityId (string only)
        const rawAuth = core.authorityId;
        const affName = (core.affiliations as { name?: string }[])?.[0]?.name;
        const cityName = affName
          || (typeof rawAuth === 'string' ? rawAuth : undefined);

        // ── Protection rules + ghost rule (mirrors scripts/mark-test-accounts.ts) ──
        const hasName = typeof core.name === 'string' && core.name.trim().length > 0;
        const hasEmail = typeof core.email === 'string' && core.email.trim().length > 0;
        const workoutCount = workoutCountByUid.get(docSnap.id) ?? 0;
        const hasWorkout = workoutCount > 0;
        const allowedSections = core.allowedSections;
        const hasAdminRole =
          core.isSuperAdmin === true ||
          core.isSystemAdmin === true ||
          core.role === 'system_admin' ||
          core.isVerticalAdmin === true ||
          core.isTenantOwner === true ||
          (Array.isArray(allowedSections) && allowedSections.length > 0);
        const isAuthorityManager = managerUids.has(docSnap.id);

        let isProtected = false;
        let protectedReason: 'authorityManager' | 'hasAdminRole' | 'realEngagedUser' | undefined;
        if (isAuthorityManager) { isProtected = true; protectedReason = 'authorityManager'; }
        else if (hasAdminRole) { isProtected = true; protectedReason = 'hasAdminRole'; }
        else if (hasWorkout && hasEmail) { isProtected = true; protectedReason = 'realEngagedUser'; }

        // Ghost rule (David, 04.10.2026): no email AND 0 workouts AND default
        // level AND no name. CRITICAL: a no-email user WITH workouts is a real
        // anonymous-guest signup, never a ghost — hasWorkout being false is
        // load-bearing here, not incidental.
        const isGhost = !hasEmail && !hasWorkout && effectiveLevel <= 1 && !hasName;

        return {
          id: docSnap.id,
          name: core.name || 'ללא שם',
          email: core.email || undefined,
          phone: core.phone || undefined,
          gender: core.gender || undefined,
          photoURL: core.photoURL || undefined,
          coins: progression.coins || 0,
          level: effectiveLevel,
          effectiveLevel,
          // Convert raw Firestore Timestamps to real Date objects at the data
          // boundary so downstream `.toLocaleDateString()` calls are safe and the
          // runtime value matches the `Date` type declared on AdminUserListItem.
          // (Mirrors admin/authority/users, which already normalizes lastActive.)
          joinDate: convertTimestampToDate(data?.createdAt) ?? undefined,
          lastActive: convertTimestampToDate(data?.lastActive) ?? undefined,
          isSuperAdmin: core.isSuperAdmin === true,
          isApproved: core.isApproved === true,
          onboardingStep: data?.onboardingStep || undefined,
          onboardingStatus: data?.onboardingStatus || undefined,
          isAnonymous: core.isAnonymous === true,
          authorityId: typeof rawAuth === 'string' ? rawAuth : undefined,
          accountStatus: data?.accountStatus || undefined,
          accountMethod: data?.accountMethod || undefined,
          programName,
          programNames,
          cityName,
          birthDate: core.birthDate || undefined,
          isTestData: core.isTestData === true,
          isMockData: core.isMockData === true,
          workoutCount,
          lastWorkoutDate: lastWorkoutDateByUid.get(docSnap.id),
          currentStreak: typeof progression.currentStreak === 'number' ? progression.currentStreak : 0,
          isProtected,
          protectedReason,
          isGhost,
        };
      });
      
      // Server-side filtering already applied above — no client-side filter needed
      
      setUsers(usersData as AdminUserListItem[]);
      setFilteredUsers(usersData as AdminUserListItem[]);
    } catch (error) {
      console.error('Error loading users:', error);
      alert('שגיאה בטעינת המשתמשים');
    } finally {
      setLoading(false);
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      await loadUsers();
      setSelectedIds(new Set()); // underlying data just changed — stale selection isn't safe to keep
    } finally {
      setRefreshing(false);
    }
  };

  /**
   * Bulk core.isTestData flag/unflag — reuses the exact mechanism
   * scripts/mark-test-accounts.ts already uses (core.isTestData boolean,
   * read by src/lib/testAccountFilter.ts's isTestOrMockUser()). Never
   * touches core.isMockData. Protected users (authorityManager/
   * hasAdminRole/realEngagedUser — computed in loadUsers()) are always
   * skipped here even if their row was checked, and the skip count is
   * reported — this is the enforcement point, not just the checkbox UI.
   */
  const handleBulkSetTestData = async (flag: boolean) => {
    const targets = users.filter((u) => selectedIds.has(u.id));
    const toWrite = targets.filter((u) => !u.isProtected);
    const skipped = targets.filter((u) => u.isProtected);

    const verb = flag ? 'לסמן' : 'לבטל סימון עבור';
    const confirmMsg = `${verb} ${toWrite.length} משתמשים כטסט/דמו (core.isTestData)?` +
      (skipped.length > 0 ? `\n\n${skipped.length} מהנבחרים מוגנים (מנהל רשות / הרשאת מנהל / משתמש פעיל אמיתי) וידלגו אוטומטית.` : '') +
      `\n\nזו פעולה הפיכה — לא מחיקה. היא תסתיר/תציג אותם בדשבורדים בהתאם ל-core.isTestData.`;
    if (!window.confirm(confirmMsg)) return;

    if (toWrite.length === 0) {
      alert(`0 נכתבו — כל ${targets.length} הנבחרים מוגנים ודולגו.`);
      return;
    }

    setBulkActionPending(true);
    try {
      const { doc, writeBatch, arrayUnion, serverTimestamp } = await import('firebase/firestore');
      const { db } = await import('@/lib/firebase');

      // Chunk at 400 to stay safely under Firestore's 500-write batch limit
      // (mirrors scripts/backfill-age-group.ts's COMMIT_BATCH_SIZE convention).
      const CHUNK = 400;
      for (let i = 0; i < toWrite.length; i += CHUNK) {
        const batch = writeBatch(db);
        for (const u of toWrite.slice(i, i + CHUNK)) {
          const ref = doc(db, 'users', u.id);
          if (flag) {
            batch.update(ref, {
              'core.isTestData': true,
              'core.testDataReason': arrayUnion('manualBulkFlag'),
              'core.testDataMarkedAt': serverTimestamp(),
            });
          } else {
            batch.update(ref, { 'core.isTestData': false });
          }
        }
        await batch.commit();
      }

      // Optimistic local update — avoids a full reload for immediate UI feedback.
      const writtenIds = new Set(toWrite.map((u) => u.id));
      const applyFlag = (list: AdminUserListItem[]) =>
        list.map((u) => (writtenIds.has(u.id) ? { ...u, isTestData: flag } : u));
      setUsers((prev) => applyFlag(prev));
      setFilteredUsers((prev) => applyFlag(prev));
      setSelectedIds(new Set());

      alert(`${toWrite.length} ${flag ? 'סומנו' : 'בוטל סימונם'}.` + (skipped.length > 0 ? ` ${skipped.length} דולגו (מוגנים).` : ''));
    } catch (error) {
      console.error('Error in bulk isTestData update:', error);
      alert('שגיאה בעדכון המסיבי — ראה console.');
    } finally {
      setBulkActionPending(false);
    }
  };

  const handleDeleteUser = async (userId: string, userName: string) => {
    if (!confirm(`האם אתה בטוח שברצונך למחוק את המשתמש "${userName}"?\n\nפעולה זו תמחק את המשתמש מ-Firestore ואת חשבון המשתמש מ-Firebase Auth.\n\nפעולה זו בלתי הפיכה!`)) {
      return;
    }

    setDeletingUserId(userId);
    try {
      const currentUser = auth.currentUser;
      if (currentUser) {
        const { getUserFromFirestore } = await import('@/lib/firestore.service');
        const profile = await getUserFromFirestore(currentUser.uid, { allowSelfHeal: false });
        const adminInfo = {
          adminId: currentUser.uid,
          adminName: profile?.core?.name || 'System Admin',
        };

        // Delete user
        await deleteUser(userId);

        // Log audit action
        await logAction({
          adminId: adminInfo.adminId,
          adminName: adminInfo.adminName,
          actionType: 'DELETE',
          targetEntity: 'User',
          targetId: userId,
          details: `Deleted user: ${userName}`,
        });

        // Reload users
        await loadUsers();
        alert('משתמש נמחק בהצלחה');
      }
    } catch (error) {
      console.error('Error deleting user:', error);
      alert('שגיאה במחיקת המשתמש');
    } finally {
      setDeletingUserId(null);
    }
  };

  const getCurrentAdminInfo = async () => {
    const currentUser = auth.currentUser;
    if (!currentUser) return null;
    try {
      const { getUserFromFirestore } = await import('@/lib/firestore.service');
      const profile = await getUserFromFirestore(currentUser.uid, { allowSelfHeal: false });
      return {
        adminId: currentUser.uid,
        adminName: profile?.core?.name || 'System Admin',
      };
    } catch (error) {
      return {
        adminId: currentUser.uid,
        adminName: 'System Admin',
      };
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-500">טוען...</div>
      </div>
    );
  }

  if (!isAuthorized) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <Shield size={48} className="text-gray-400 mx-auto mb-4" />
          <h3 className="text-lg font-bold text-gray-900 mb-2">אין הרשאות</h3>
          <p className="text-gray-500">רק מנהלי מערכת יכולים לגשת לדף זה</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6" dir="rtl">
      <div>
        <h1 className="text-3xl font-black text-gray-900">כל המשתמשים</h1>
        <p className="text-gray-500 mt-2">ניהול וצפייה בכל המשתמשים הרשומים במערכת</p>
      </div>

      {/* Search and Refresh */}
      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <div className="flex items-center gap-3">
          <div className="relative flex-1">
            <Search size={20} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="חפש לפי שם, אימייל או טלפון..."
              className="w-full pr-10 pl-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-[#5BC2F2] focus:border-transparent outline-none font-simpler text-black"
            />
          </div>
          <button
            onClick={handleRefresh}
            disabled={refreshing || loading}
            className="flex items-center gap-2 px-4 py-3 bg-[#5BC2F2] hover:bg-[#4ab0e0] text-white font-bold rounded-xl transition-all disabled:opacity-50 disabled:cursor-not-allowed active:scale-[0.98]"
            title="רענן רשימה"
          >
            <RefreshCw size={18} className={refreshing ? 'animate-spin' : ''} />
            <span className="font-simpler">רענן</span>
          </button>
        </div>
      </div>

      {/* Advanced Filters */}
      <div className="bg-white rounded-xl border border-gray-200 p-4">
        <div className="flex flex-wrap items-center gap-3">
          {/* Status Filter */}
          <div className="flex-1 min-w-[150px]">
            <label className="block text-xs font-bold text-gray-700 mb-1.5 font-simpler">סטטוס</label>
            <select
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value as 'ALL' | 'COMPLETED' | 'ONBOARDING');
                if (e.target.value !== 'ONBOARDING') {
                  setStepFilter('ALL'); // Reset step filter when status changes
                }
              }}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm font-simpler focus:ring-2 focus:ring-[#5BC2F2] focus:border-transparent outline-none text-black"
            >
              <option value="ALL">הצג הכל</option>
              <option value="COMPLETED">משתמשים פעילים</option>
              <option value="ONBOARDING">בתהליך הרשמה</option>
            </select>
          </div>

          {/* Step Filter (only enabled when status is ONBOARDING) */}
          <div className="flex-1 min-w-[150px]">
            <label className="block text-xs font-bold text-gray-700 mb-1.5 font-simpler">שלב נטישה</label>
            <select
              value={stepFilter}
              onChange={(e) => setStepFilter(e.target.value as 'ALL' | 'LOCATION' | 'EQUIPMENT' | 'HISTORY' | 'SCHEDULE' | 'HEALTH_DECLARATION' | 'COMPLETED')}
              disabled={statusFilter !== 'ONBOARDING'}
              className={`w-full px-3 py-2 border border-slate-200 rounded-lg text-sm font-simpler focus:ring-2 focus:ring-[#5BC2F2] focus:border-transparent outline-none ${
                statusFilter !== 'ONBOARDING' ? 'bg-gray-100 text-gray-400 cursor-not-allowed' : ''
              }`}
            >
              <option value="ALL">כל השלבים</option>
              <option value="LOCATION">מיקום</option>
              <option value="EQUIPMENT">ציוד</option>
              <option value="HISTORY">היסטוריה</option>
              <option value="SCHEDULE">לוח זמנים</option>
              <option value="HEALTH_DECLARATION">הצהרת בריאות</option>
              <option value="COMPLETED">הושלם</option>
            </select>
          </div>

          {/* Type Filter */}
          <div className="flex-1 min-w-[150px]">
            <label className="block text-xs font-bold text-gray-700 mb-1.5 font-simpler">סוג משתמש</label>
            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value as 'ALL' | 'REGISTERED' | 'GUEST')}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm font-simpler focus:ring-2 focus:ring-[#5BC2F2] focus:border-transparent outline-none text-black"
            >
              <option value="ALL">כל הסוגים</option>
              <option value="REGISTERED">משתמש רשום</option>
              <option value="GUEST">אורח</option>
            </select>
          </div>

          {/* Activity Filter */}
          <div className="flex-1 min-w-[150px]">
            <label className="block text-xs font-bold text-gray-700 mb-1.5 font-simpler">רמת פעילות</label>
            <select
              value={activityFilter}
              onChange={(e) => setActivityFilter(e.target.value as 'ALL' | 'NEW' | 'BEGINNER' | 'PRO')}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm font-simpler focus:ring-2 focus:ring-[#5BC2F2] focus:border-transparent outline-none text-black"
            >
              <option value="ALL">כל הרמות</option>
              <option value="NEW">חדש (0 אימונים)</option>
              <option value="BEGINNER">מתחיל (1-5 אימונים)</option>
              <option value="PRO">מתמיד (5+ אימונים)</option>
            </select>
          </div>

          {/* Test/Mock Account Filter */}
          <div className="flex-1 min-w-[150px]">
            <label className="block text-xs font-bold text-gray-700 mb-1.5 font-simpler">חשבונות טסט/דמו</label>
            <select
              value={testAccountFilter}
              onChange={(e) => setTestAccountFilter(e.target.value as 'HIDE' | 'ALL' | 'ONLY')}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm font-simpler focus:ring-2 focus:ring-[#5BC2F2] focus:border-transparent outline-none text-black"
            >
              <option value="HIDE">הסתר (מומלץ)</option>
              <option value="ALL">הצג הכל</option>
              <option value="ONLY">הצג רק טסט/דמו</option>
            </select>
          </div>

          {/* Ghost Quick-Filter */}
          <div className="flex-1 min-w-[180px]">
            <label className="block text-xs font-bold text-gray-700 mb-1.5 font-simpler">
              חשבונות ריקים
            </label>
            <button
              type="button"
              onClick={() => setGhostOnly((v) => !v)}
              title="ריק = ללא אימייל וללא אימונים וללא שם וברמת בסיס. משתמש אנונימי-אורח עם אימונים/streak לעולם לא ייחשב ריק."
              className={`w-full px-3 py-2 rounded-lg text-sm font-simpler border transition-colors ${
                ghostOnly
                  ? 'bg-[#5BC2F2] text-white border-[#5BC2F2]'
                  : 'bg-white text-gray-700 border-slate-200 hover:border-[#5BC2F2]'
              }`}
            >
              {ghostOnly ? '✓ מציג רק ריקים' : 'הצג רק ריקים'}
            </button>
          </div>

          {/* Result Count Badge */}
          <div className="flex items-end">
            <div className="px-4 py-2 bg-[#5BC2F2]/10 rounded-lg border border-[#5BC2F2]/20">
              <span className="text-sm font-bold text-[#5BC2F2] font-simpler">
                נמצאו: {filteredUsers.length} משתמשים
              </span>
            </div>
          </div>
        </div>
        <p className="mt-3 text-xs text-gray-500 font-simpler" dir="rtl">
          <strong>כלל "ריק":</strong> ללא אימייל <strong>וגם</strong> 0 אימונים <strong>וגם</strong> רמת בסיס (≤1) <strong>וגם</strong> ללא שם.
          משתמש ללא אימייל שיש לו אימונים/streak הוא אורח-אנונימי אמיתי — לעולם לא ייחשב ריק ולא יסומן אוטומטית.
        </p>
      </div>

      {/* Bulk Action Bar — only visible when rows are selected */}
      {selectedIds.size > 0 && (
        <div className="bg-amber-50 rounded-xl border border-amber-200 p-4 flex items-center justify-between gap-4">
          <span className="text-sm font-bold text-amber-800 font-simpler">
            {selectedIds.size} נבחרו
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={bulkActionPending}
              onClick={() => handleBulkSetTestData(true)}
              className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white font-bold text-sm rounded-lg transition-colors disabled:opacity-50 font-simpler"
            >
              סמן כטסט/דמו
            </button>
            <button
              type="button"
              disabled={bulkActionPending}
              onClick={() => handleBulkSetTestData(false)}
              className="px-4 py-2 bg-white hover:bg-gray-50 text-gray-700 border border-gray-300 font-bold text-sm rounded-lg transition-colors disabled:opacity-50 font-simpler"
            >
              בטל סימון
            </button>
            <button
              type="button"
              onClick={() => setSelectedIds(new Set())}
              className="px-3 py-2 text-gray-500 hover:text-gray-700 text-sm font-simpler"
            >
              נקה בחירה
            </button>
          </div>
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <div className="text-sm text-gray-500 mb-1">סה"כ משתמשים</div>
          <div className="text-3xl font-black text-gray-900">{users.length}</div>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <div className="text-sm text-gray-500 mb-1">משתמשים מאושרים</div>
          <div className="text-3xl font-black text-green-600">
            {users.filter((u) => u.isApproved).length}
          </div>
        </div>
        <div className="bg-white rounded-xl border border-gray-200 p-6">
          <div className="text-sm text-gray-500 mb-1">סה"כ מטבעות</div>
          <div className="text-3xl font-black text-yellow-600">
            {users.reduce((sum, u) => sum + u.coins, 0).toLocaleString()}
          </div>
        </div>
      </div>

      {/* Users Table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden min-h-[600px]">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 border-b border-gray-200">
              <tr>
                <th className="py-4 px-4 text-sm font-bold text-gray-700 w-10">
                  <input
                    type="checkbox"
                    title="בחר הכל בעמוד"
                    checked={paginatedItems.length > 0 && paginatedItems.every((u) => selectedIds.has(u.id))}
                    onChange={(e) => {
                      setSelectedIds((prev) => {
                        const next = new Set(prev);
                        if (e.target.checked) paginatedItems.forEach((u) => next.add(u.id));
                        else paginatedItems.forEach((u) => next.delete(u.id));
                        return next;
                      });
                    }}
                    className="w-4 h-4 cursor-pointer"
                  />
                </th>
                <th className="text-right py-4 px-6 text-sm font-bold text-gray-700">משתמש</th>
                <th className="text-right py-4 px-6 text-sm font-bold text-gray-700">תוכניות</th>
                <th className="text-right py-4 px-6 text-sm font-bold text-gray-700">רמה אפקטיבית</th>
                <th className="text-right py-4 px-6 text-sm font-bold text-gray-700">עיר</th>
                <th className="text-right py-4 px-6 text-sm font-bold text-gray-700">פעילות אחרונה</th>
                <th className="text-right py-4 px-6 text-sm font-bold text-gray-700">אימונים</th>
                <th className="text-right py-4 px-6 text-sm font-bold text-gray-700">רצף</th>
                <th className="text-right py-4 px-6 text-sm font-bold text-gray-700">סטטוס</th>
                <th className="text-right py-4 px-6 text-sm font-bold text-gray-700">תאריך לידה</th>
                <th className="text-right py-4 px-6 text-sm font-bold text-gray-700">מטבעות</th>
                <th
                  className="text-right py-4 px-6 text-sm font-bold text-gray-700 cursor-pointer select-none hover:text-[#5BC2F2]"
                  onClick={() => setJoinDateSort((prev) => (prev === 'desc' ? 'asc' : 'desc'))}
                  title="מיין לפי תאריך הצטרפות"
                >
                  <span className="inline-flex items-center gap-1">
                    הצטרפות
                    <span className="text-xs">{joinDateSort === 'desc' ? '▼' : '▲'}</span>
                  </span>
                </th>
                <th className="text-right py-4 px-6 text-sm font-bold text-gray-700">פעולות</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-200">
              {paginatedItems.length === 0 ? (
                <tr>
                  <td colSpan={13} className="text-center py-12 text-gray-500 font-simpler" dir="rtl">
                    {searchTerm ? 'לא נמצאו משתמשים התואמים לחיפוש' : 'אין משתמשים'}
                  </td>
                </tr>
              ) : (
                paginatedItems.map((user) => (
                  <tr key={user.id} className="hover:bg-gray-50 transition-colors">
                    {/* בחירה */}
                    <td className="py-4 px-4">
                      <input
                        type="checkbox"
                        checked={selectedIds.has(user.id)}
                        onChange={(e) => {
                          setSelectedIds((prev) => {
                            const next = new Set(prev);
                            if (e.target.checked) next.add(user.id);
                            else next.delete(user.id);
                            return next;
                          });
                        }}
                        title={user.isProtected ? `מוגן (${user.protectedReason}) — ידלג אוטומטית מסימון טסט/דמו` : undefined}
                        className="w-4 h-4 cursor-pointer"
                      />
                    </td>
                    {/* משתמש — identity: avatar + name, email folded in as a
                        secondary line, security state as a small inline
                        badge (David's brief, 04.10.2026). Replaces the old
                        separate אימייל + אבטחת חשבון columns — same data,
                        denser, with room freed for פעילות אחרונה. */}
                    <td className="py-4 px-6">
                      <div className="flex items-center gap-3">
                        {user.photoURL ? (
                          <img src={user.photoURL} alt={user.name} className="w-10 h-10 rounded-full object-cover" />
                        ) : (
                          <div className="w-10 h-10 rounded-full bg-[#5BC2F2] text-white flex items-center justify-center font-bold">
                            {user.name.charAt(0).toUpperCase()}
                          </div>
                        )}
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span className="font-bold text-gray-900 font-simpler truncate max-w-[180px]">{user.name}</span>
                            {(() => {
                              const badge = securityBadge(user);
                              return (
                                <span
                                  title={badge.title}
                                  className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold font-simpler shrink-0 ${badge.className}`}
                                >
                                  {badge.label}
                                </span>
                              );
                            })()}
                          </div>
                          {user.email && (
                            <div className="flex items-center gap-1 text-xs text-gray-500 font-simpler truncate max-w-[220px]">
                              <Mail size={11} className="shrink-0" />
                              {user.email}
                            </div>
                          )}
                          {user.isSuperAdmin && (
                            <div className="text-xs text-purple-600 font-medium flex items-center gap-1">
                              <Shield size={12} /> מנהל מערכת
                            </div>
                          )}
                        </div>
                      </div>
                    </td>
                    {/* תוכניות — a chip per active program, not just the first */}
                    <td className="py-4 px-6">
                      {(user as any).programNames && (user as any).programNames.length > 0 ? (
                        <div className="flex flex-wrap gap-1 max-w-[220px]">
                          {((user as any).programNames as string[]).map((name, idx) => (
                            <span key={`${user.id}-prog-${idx}`} className="px-2 py-1 bg-cyan-50 text-cyan-700 rounded-lg text-xs font-bold font-simpler">
                              {name}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <span className="text-xs text-gray-400 font-simpler">—</span>
                      )}
                    </td>
                    {/* רמה אפקטיבית */}
                    <td className="py-4 px-6">
                      <div className="flex items-center gap-1 text-[#5BC2F2] font-black text-lg font-simpler">
                        <TrendingUp size={18} />
                        <span>{(user as any).effectiveLevel ?? user.level}</span>
                      </div>
                    </td>
                    {/* עיר */}
                    <td className="py-4 px-6">
                      {(user as any).cityName ? (
                        <div className="flex items-center gap-1.5 text-gray-700 font-simpler text-sm">
                          <MapPin size={14} className="text-gray-400 flex-shrink-0" />
                          <span>{(user as any).cityName}</span>
                        </div>
                      ) : (
                        <span className="text-xs text-gray-400 font-simpler">—</span>
                      )}
                    </td>
                    {/* פעילות אחרונה — switched to lastWorkoutDate (David,
                        04.10.2026: "lastActive reads empty; a user with
                        workouts should show a real date"). Falls back to
                        the helper's own "no data" display only when there's
                        truly no workout doc — never silently back to
                        lastActive. */}
                    <td className="py-4 px-6">
                      {(() => {
                        const recency = formatLastActivity(user.lastWorkoutDate);
                        return (
                          <span className={`inline-flex items-center gap-1.5 text-xs font-simpler ${recency.textClass}`}>
                            <span className={`w-2 h-2 rounded-full shrink-0 ${recency.dotColor}`} />
                            {recency.label}
                          </span>
                        );
                      })()}
                    </td>
                    {/* אימונים */}
                    <td className="py-4 px-6 text-center">
                      <span className="text-sm font-bold text-gray-800">{user.workoutCount ?? 0}</span>
                    </td>
                    {/* רצף */}
                    <td className="py-4 px-6">
                      <div className="flex items-center gap-1 text-orange-600 font-bold text-sm">
                        {(user.currentStreak ?? 0) > 0 && <Flame size={14} />}
                        {user.currentStreak ?? 0}
                      </div>
                    </td>
                    {/* סטטוס */}
                    <td className="py-4 px-6">
                      {user.onboardingStatus === 'ONBOARDING' ? (
                        <div className="flex items-center gap-2">
                          <span className="px-2 py-1 bg-yellow-100 text-yellow-700 rounded-full text-xs font-bold font-simpler">בהרשמה</span>
                          {user.onboardingStep && (
                            <span className="text-[10px] text-gray-500 font-simpler">({user.onboardingStep})</span>
                          )}
                        </div>
                      ) : user.onboardingStatus === 'COMPLETED' ? (
                        <span className="px-2 py-1 bg-green-100 text-green-700 rounded-full text-xs font-bold font-simpler">פעיל</span>
                      ) : (
                        <span className="text-xs text-gray-400 font-simpler">—</span>
                      )}
                    </td>
                    {/* תאריך לידה */}
                    <td className="py-4 px-6 text-sm text-black font-simpler">
                      {(() => {
                        const raw = (user as any).birthDate;
                        if (!raw) return '—';
                        let d: Date | null = null;
                        if (raw instanceof Date && !isNaN(raw.getTime())) d = raw;
                        else if (typeof raw?.toDate === 'function') d = raw.toDate();
                        else if (typeof raw === 'string') { const p = new Date(raw); if (!isNaN(p.getTime())) d = p; }
                        else if (typeof raw?.seconds === 'number') d = new Date(raw.seconds * 1000);
                        return d ? d.toLocaleDateString('he-IL') : '—';
                      })()}
                    </td>
                    {/* מטבעות */}
                    <td className="py-4 px-6">
                      <div className="flex items-center gap-1 text-yellow-600 font-bold font-simpler">
                        <Coins size={16} />
                        <span>{user.coins.toLocaleString()}</span>
                      </div>
                    </td>
                    {/* הצטרפות */}
                    <td className="py-4 px-6 text-sm text-black font-simpler">
                      {formatFirebaseTimestamp(user.joinDate)}
                    </td>
                    {/* פעולות */}
                    <td className="py-4 px-6">
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => router.push(`/admin/users/${user.id}`)}
                          className="p-2 hover:bg-[#5BC2F2]/10 rounded-lg transition-colors text-[#5BC2F2]"
                          title="צפה בפרטים"
                        >
                          <Eye size={18} />
                        </button>
                        <button
                          onClick={() => handleDeleteUser(user.id, user.name)}
                          disabled={deletingUserId === user.id}
                          className="p-2 hover:bg-red-50 rounded-lg transition-colors text-red-600 disabled:opacity-50 disabled:cursor-not-allowed"
                          title="מחק משתמש"
                        >
                          <Trash2 size={18} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <Pagination
          currentPage={currentPage}
          totalPages={totalPages}
          onPageChange={goToPage}
          totalItems={filteredUsers.length}
          itemsPerPage={10}
        />
      </div>

    </div>
  );
}
