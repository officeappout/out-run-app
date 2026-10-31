'use client';

// Force dynamic rendering to prevent SSR issues with window/localStorage
export const dynamic = 'force-dynamic';

import React, { useState, useEffect, useMemo } from 'react';
import { usePathname, useParams, useRouter, useSearchParams } from 'next/navigation';
import {
  getUserDetails,
  getUserHealthDeclarationPdfUrl,
  getUserWorkoutHistory,
  AdminUserListItem,
} from '@/features/admin/services/users.service';
import { UserFullProfile } from '@/types/user-profile';
import { WorkoutHistoryEntry } from '@/features/workout-engine/core/services/storage.service';
import { getStepsTrend, type DailyStepsSnapshot } from '@/features/activity/services/activity-history.service';
import { CheckCircle2 } from 'lucide-react';
import { getAllGearDefinitions } from '@/features/content/equipment/gear';
import { GearDefinition } from '@/features/content/equipment/gear';
import { getUserEvents, AnalyticsEvent } from '@/features/analytics/AnalyticsService';
import { getAuthority } from '@/features/admin/services/authority.service';
import { getAllPrograms } from '@/features/content/programs';
import { Program } from '@/features/content/programs';
import { convertTimestampToDate } from '@/lib/utils/date-formatter';
import {
  PushHistoryEntry,
  groupPushEventsByPushId,
  computeEffectiveLevel,
  resolveTrackSlug,
} from '../shared.utils';
import { hebrewOrEmpty } from '@/features/content/shared/stored-text-fields';
import { useUserAdminActions } from './useUserAdminActions';
import UserHeader from './UserHeader';
import UserTabs, { parseUserTab, type UserTabId } from './UserTabs';
import OverviewTab from './tabs/OverviewTab';
import WorkoutsTab from './tabs/WorkoutsTab';
import ProgressTab from './tabs/ProgressTab';
import ProfileTab from './tabs/ProfileTab';
import AdminToolsTab from './tabs/AdminToolsTab';
import type { UserTabData } from './tabs/types';

/**
 * Phase C rework (04.10.2026): route page, not a modal, per David's
 * explicit correction. I1 (31.10.2026, owner: "בלגן, יותר מדי פרטים
 * חוזרים"): fixed header + 5 tabs. This file keeps data loading, state and
 * the auto-sync; every section lives in ./tabs and ./sections, and the
 * manual admin actions in ./useUserAdminActions.
 *
 * `user` (the AdminUserListItem-shaped summary the tabs reference) is
 * DERIVED from fullProfile + workoutCount via useMemo, not a separate
 * fetch+state, so there is only ever one source of truth.
 */
export default function UserDetailPage() {
  const params = useParams();
  const router = useRouter();
  const uid = typeof params?.uid === 'string' ? params.uid : Array.isArray(params?.uid) ? params.uid[0] : '';

  const [fullProfile, setFullProfile] = useState<UserFullProfile | null>(null);
  const [workoutHistory, setWorkoutHistory] = useState<WorkoutHistoryEntry[]>([]);
  const [workoutCount, setWorkoutCount] = useState<number>(0);
  const [stepsHistory, setStepsHistory] = useState<DailyStepsSnapshot[]>([]);
  const [analyticsEvents, setAnalyticsEvents] = useState<AnalyticsEvent[]>([]);
  const [pushHistory, setPushHistory] = useState<PushHistoryEntry[]>([]);
  const [gearDefinitions, setGearDefinitions] = useState<GearDefinition[]>([]);
  const [authority, setAuthority] = useState<{ name: string; type?: string; id?: string } | null>(null);
  const [programs, setPrograms] = useState<Program[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);
  const [healthDeclarationPdfUrl, setHealthDeclarationPdfUrl] = useState<string | undefined>(undefined);

  // Real per-user workout count — getCountFromServer (established
  // convention, e.g. workout-settings/page.tsx), not capped like
  // workoutHistory's 50-doc fetch.
  useEffect(() => {
    if (!uid) return;
    (async () => {
      try {
        const { collection, query: firestoreQuery, where, getCountFromServer } = await import('firebase/firestore');
        const { db } = await import('@/lib/firebase');
        const snap = await getCountFromServer(firestoreQuery(collection(db, 'workouts'), where('userId', '==', uid)));
        setWorkoutCount(snap.data().count);
      } catch (error) {
        console.error('Error counting workouts:', error);
      }
    })();
  }, [uid]);

  useEffect(() => {
    if (uid) {
      loadUserDetails(uid);
    }
  }, [uid]);

  const user: AdminUserListItem | null = useMemo(() => {
    if (!fullProfile) return null;
    const core = (fullProfile.core ?? {}) as Record<string, any>;
    const progression = (fullProfile.progression ?? {}) as Record<string, any>;
    const effectiveLevel = computeEffectiveLevel(progression);
    const activeProg = progression.activePrograms?.[0];
    return {
      id: fullProfile.id ?? uid,
      name: core.name || 'ללא שם',
      email: core.email || undefined,
      phone: core.phone || undefined,
      gender: core.gender || undefined,
      photoURL: core.photoURL || undefined,
      coins: progression.coins || 0,
      level: effectiveLevel,
      effectiveLevel,
      joinDate: convertTimestampToDate((fullProfile as any)?.createdAt) ?? undefined,
      lastActive: convertTimestampToDate((fullProfile as any)?.lastActive) ?? undefined,
      isSuperAdmin: core.isSuperAdmin === true,
      isApproved: core.isApproved === true,
      onboardingStep: (fullProfile as any)?.onboardingStep || undefined,
      onboardingStatus: (fullProfile as any)?.onboardingStatus || undefined,
      isAnonymous: core.isAnonymous === true,
      authorityId: typeof core.authorityId === 'string' ? core.authorityId : undefined,
      accountStatus: (fullProfile as any)?.accountStatus || undefined,
      accountMethod: (fullProfile as any)?.accountMethod || undefined,
      programName: activeProg?.name || activeProg?.templateId || undefined,
      cityName: (core.affiliations as { name?: string }[])?.[0]?.name || (typeof core.authorityId === 'string' ? core.authorityId : undefined),
      birthDate: core.birthDate || undefined,
      pushEnabled: typeof (fullProfile as any)?.settings?.pushEnabled === 'boolean' ? (fullProfile as any).settings.pushEnabled : false,
      fcmTokenCount: Array.isArray((fullProfile as any)?.fcmTokens) ? (fullProfile as any).fcmTokens.length : 0,
      marketingAttribution: (fullProfile as any)?.marketingAttribution,
      isTestData: core.isTestData === true,
      isMockData: core.isMockData === true,
      workoutCount,
      // David, 04.10.2026: "lastActive reads empty; a user with workouts
      // should show a real date" — same fix as the list page, applied here
      // too so this screen's own KPI/retention tiles don't repeat the bug.
      // workoutHistory is already sorted desc by date (getUserWorkoutHistory's
      // orderBy), so the first entry is the most recent workout — no new read.
      lastWorkoutDate: workoutHistory[0]?.date,
    };
  }, [fullProfile, workoutCount, uid, workoutHistory]);

  const loadUserDetails = async (forUid: string) => {
    setLoading(true);
    try {
      // Load full profile
      const profile = await getUserDetails(forUid);
      setFullProfile(profile);

      // SPEC-02 SEC-06: separate fetch — no longer a field on the profile doc itself.
      setHealthDeclarationPdfUrl(await getUserHealthDeclarationPdfUrl(forUid));

      // Load workout history
      const history = await getUserWorkoutHistory(forUid, 50);
      setWorkoutHistory(history);

      // Load passive step-sync history (HealthKit / Health Connect —
      // separate from workout-session distance, see getStepsTrend's doc
      // comment: reads dailyActivity/{uid}_{date}, written by
      // useActivityStore.syncToServer()).
      const steps = await getStepsTrend(forUid, 30);
      setStepsHistory(steps);

      // Load analytics events
      const events = await getUserEvents(forUid, undefined, 100);
      setAnalyticsEvents(events);

      // Load this user's push history — read-only aggregation over the
      // existing push_events collection, no writes. See
      // .claude/knowledge/push-notifications-audit-2026-10-04.md for why
      // this only covers 2 of 12 senders today (measurement is opt-in).
      try {
        const { collection, query: firestoreQuery, getDocs, where } = await import('firebase/firestore');
        const { db: firestoreDb } = await import('@/lib/firebase');
        const pushEventsSnap = await getDocs(
          firestoreQuery(collection(firestoreDb, 'push_events'), where('uid', '==', forUid)),
        );
        let grouped = groupPushEventsByPushId(pushEventsSnap.docs);

        // Best-effort copy lookup: resolve each distinct variantId (bundleId)
        // against the live "מנהל התראות" corpus. A miss just means no copy
        // shown — never blocks rendering the rest of the row.
        const bundleIds = Array.from(new Set(grouped.map((e) => e.variantId).filter((v): v is string => !!v))).slice(0, 30);
        if (bundleIds.length > 0) {
          const corpusSnap = await getDocs(
            firestoreQuery(
              collection(firestoreDb, 'workoutMetadata', 'notifications', 'notifications'),
              where('bundleId', 'in', bundleIds),
            ),
          );
          const textByBundleId = new Map<string, string>();
          corpusSnap.docs.forEach((d) => {
            const data = d.data() as { bundleId?: string; text?: unknown };
            const text = hebrewOrEmpty(data.text); // string, or the Hebrew slot of a { he, en } pair
            if (data.bundleId && text) textByBundleId.set(data.bundleId, text);
          });
          grouped = grouped.map((e) => ({ ...e, copyText: e.variantId ? textByBundleId.get(e.variantId) : undefined }));
        }

        setPushHistory(grouped);
      } catch (error) {
        console.error('Error loading push history:', error);
        setPushHistory([]);
      }

      // Load gear definitions for equipment display
      const gear = await getAllGearDefinitions();
      setGearDefinitions(gear);

      // Load all programs for program name lookup
      const allPrograms = await getAllPrograms();
      setPrograms(allPrograms);

      // Load authority information if user has authorityId
      if (profile?.core?.authorityId) {
        try {
          const auth = await getAuthority(profile.core.authorityId);
          if (auth) {
            setAuthority({ name: auth.name, type: auth.type, id: auth.id });
          }
        } catch (error) {
          console.error('Error loading authority:', error);
        }
      }

      // Auto-Sync: if tracks have higher levels than domains, sync domains up
      await autoSyncDomainsFromTracks(profile, forUid);
    } catch (error) {
      console.error('Error loading user details:', error);
    } finally {
      setLoading(false);
    }
  };

  // ── Auto-Sync: treat tracks as source of truth, push to domains ────────
  // Also recalculates master program levels using Avg(push,pull,legs), core excluded, cap 15.
  const autoSyncDomainsFromTracks = async (profile: UserFullProfile | null, forUid: string) => {
    if (!profile) return;
    const tracks = (profile.progression as any)?.tracks as Record<string, { currentLevel?: number; maxLevel?: number }> | undefined;
    const domains = (profile.progression as any)?.domains as Record<string, { currentLevel?: number; maxLevel?: number }> | undefined;
    if (!tracks || Object.keys(tracks).length === 0) return;

    const MASTER_EXCLUDED_SYNC: Record<string, string[]> = { full_body: ['core'] };
    const MASTER_CAP_SYNC: Record<string, number> = { full_body: 15 };

    const updates: Record<string, number> = {};

    // 1. Sync child track levels → domains
    for (const [trackId, trackData] of Object.entries(tracks)) {
      const trackLevel = trackData?.currentLevel ?? 0;
      if (trackLevel <= 0) continue;
      const domainLevel = domains?.[trackId]?.currentLevel ?? 0;
      if (domainLevel < trackLevel) {
        updates[trackId] = trackLevel;
      }
    }

    // 2. Recalculate master program levels with new formula
    for (const masterProg of programs.filter(p => p.isMaster && p.subPrograms?.length)) {
      const excluded = MASTER_EXCLUDED_SYNC[masterProg.id] ?? [];
      const childLevels = (masterProg.subPrograms ?? [])
        .filter(s => !excluded.includes(s))
        .map(s => tracks[s]?.currentLevel ?? 0)
        .filter(l => l > 0);
      if (childLevels.length > 0) {
        const cap = MASTER_CAP_SYNC[masterProg.id] ?? Infinity;
        const derivedLevel = Math.min(cap, Math.round(childLevels.reduce((a, b) => a + b, 0) / childLevels.length));
        // Stage 7 fix: write the resolved slug key, not the raw masterProg.id
        // hash — read both forms so an existing hash-keyed entry doesn't
        // trigger a spurious re-write of the (now-separate) slug key.
        const masterKey = await resolveTrackSlug(masterProg.id);
        const currentMasterTrack = tracks[masterKey]?.currentLevel ?? tracks[masterProg.id]?.currentLevel ?? 0;
        const currentMasterDomain = domains?.[masterKey]?.currentLevel ?? domains?.[masterProg.id]?.currentLevel ?? 0;
        if (currentMasterTrack !== derivedLevel || currentMasterDomain !== derivedLevel) {
          updates[masterKey] = derivedLevel;
        }
      }
    }

    if (Object.keys(updates).length === 0) return;

    try {
      const { doc, updateDoc } = await import('firebase/firestore');
      const { db } = await import('@/lib/firebase');
      const firestoreUpdates: Record<string, any> = {};
      for (const [domain, level] of Object.entries(updates)) {
        firestoreUpdates[`progression.domains.${domain}.currentLevel`] = level;
        firestoreUpdates[`progression.tracks.${domain}.currentLevel`] = level;
      }
      await updateDoc(doc(db, 'users', forUid), firestoreUpdates);

      // Update local state
      const updatedProfile = { ...profile };
      const updatedDomains = { ...(updatedProfile.progression as any)?.domains } || {};
      const updatedTracks = { ...(updatedProfile.progression as any)?.tracks } || {};
      for (const [domain, level] of Object.entries(updates)) {
        if (!updatedDomains[domain]) updatedDomains[domain] = {};
        updatedDomains[domain].currentLevel = level;
        if (!updatedTracks[domain]) updatedTracks[domain] = {};
        updatedTracks[domain].currentLevel = level;
      }
      (updatedProfile.progression as any).domains = updatedDomains;
      (updatedProfile.progression as any).tracks = updatedTracks;
      setFullProfile(updatedProfile);

      const syncedDomains = Object.entries(updates).map(([d, l]) => `${d}→${l}`).join(', ');
      setSyncMessage(`סנכרון אוטומטי: ${syncedDomains}`);
      setTimeout(() => setSyncMessage(null), 4000);
      console.log(`[AdminSync] Auto-synced domains for user ${forUid}:`, updates);
    } catch (err) {
      console.error('[AdminSync] Failed to auto-sync domains:', err);
    }
  };


  const actions = useUserAdminActions({ user, fullProfile, programs, setFullProfile, setSyncMessage });

  // Active tab lives in the URL (?tab=progress) so a refresh keeps it.
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const activeTab = parseUserTab(searchParams?.get('tab'));
  const setActiveTab = (tab: UserTabId) => {
    const next = new URLSearchParams(searchParams?.toString() ?? '');
    if (tab === 'overview') next.delete('tab');
    else next.set('tab', tab);
    const qs = next.toString();
    router.replace(`${pathname}${qs ? `?${qs}` : ''}`, { scroll: false });
  };

  if (!uid) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50" dir="rtl">
        <p className="text-gray-500">מזהה משתמש חסר בכתובת</p>
      </div>
    );
  }
  if (loading && !fullProfile) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50" dir="rtl">
        <div className="text-gray-400">טוען...</div>
      </div>
    );
  }
  if (!loading && !user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50" dir="rtl">
        <div className="text-center">
          <p className="text-gray-500 mb-4">משתמש לא נמצא</p>
          <button
            onClick={() => router.push('/admin/users/all')}
            className="px-4 py-2 bg-[#5BC2F2] hover:bg-[#4ab0e0] text-white font-bold rounded-xl transition-colors"
          >
            חזרה לרשימה
          </button>
        </div>
      </div>
    );
  }
  if (!user) return null;

  const tabData: UserTabData | null = fullProfile
    ? {
        user,
        fullProfile,
        workoutHistory,
        stepsHistory,
        analyticsEvents,
        pushHistory,
        gearDefinitions,
        authority,
        programs,
        healthDeclarationPdfUrl,
      }
    : null;

  return (
    <div className="min-h-screen bg-gray-50" dir="rtl">
      <div className="max-w-5xl mx-auto bg-white shadow-sm min-h-screen">
        {/* Fixed header + tab bar */}
        <div className="sticky top-0 z-10 bg-white border-b border-gray-200 px-6 pt-6">
          <UserHeader
            user={user}
            fullProfile={fullProfile}
            authority={authority}
            onBack={() => router.push('/admin/users/all')}
          />
          <UserTabs active={activeTab} onChange={setActiveTab} />
        </div>

        {/* Content */}
        <div className="p-6">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="text-gray-500">טוען...</div>
            </div>
          ) : (
            <div className="space-y-6">
              {syncMessage && (
                <div className="bg-green-50 border border-green-200 rounded-xl p-3 text-sm text-green-700 font-bold flex items-center gap-2">
                  <CheckCircle2 size={16} />
                  {syncMessage}
                </div>
              )}
              {tabData && (
                <>
                  {activeTab === 'overview' && <OverviewTab {...tabData} />}
                  {activeTab === 'workouts' && <WorkoutsTab {...tabData} />}
                  {activeTab === 'progress' && <ProgressTab {...tabData} actions={actions} />}
                  {activeTab === 'profile' && <ProfileTab {...tabData} />}
                  {activeTab === 'admin' && <AdminToolsTab {...tabData} />}
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
