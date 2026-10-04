'use client';

// Force dynamic rendering to prevent SSR issues with window/localStorage
export const dynamic = 'force-dynamic';

import React, { useState, useEffect, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import {
  getUserDetails,
  getUserHealthDeclarationPdfUrl,
  getUserWorkoutHistory,
  AdminUserListItem,
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
  Bell, BellOff, Smartphone, Moon, Flame, ArrowRight, ChevronDown, ChevronUp,
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
import { formatFirebaseTimestamp, convertTimestampToDate } from '@/lib/utils/date-formatter';
import { formatPace } from '@/features/workout-engine/core/utils/formatPace';
import {
  PushHistoryEntry,
  groupPushEventsByPushId,
  mostCommonOpenHourIsrael,
  formatLastActivity,
  securityBadge,
  computeEffectiveLevel,
  resolveTrackSlug,
  resolveProgramByIdOrSlug,
  programDisplayName,
  getTrackLevel,
  HierarchyNode,
  buildProgramHierarchy,
} from '../shared.utils';

const ONBOARDING_STEP_LABELS: Record<string, string> = {
  ACCESS_CODE: 'קוד גישה',
  PERSONA: 'בחירת פרסונה',
  PERSONAL_STATS: 'נתונים אישיים',
  LOCATION: 'מיקום ואזור',
  EQUIPMENT: 'ציוד זמין',
  SCHEDULE: 'לוח אימונים',
  HEALTH_DECLARATION: 'הצהרת בריאות',
  ACCOUNT_SECURE: 'אבטחת חשבון',
  COMPLETED: 'הסתיים',
};

/**
 * Visual identity for each AnalyticsEvent type rendered in the timeline.
 * Tailwind classes — `dot` paints the stepper bullet, `text` colors the
 * event title. Unknown event types fall back to the `default` slot.
 */
const EVENT_TIMELINE_STYLE: Record<
  string,
  { dot: string; text: string }
> = {
  app_open: { dot: 'bg-gray-300', text: 'text-gray-500' },
  app_close: { dot: 'bg-gray-300', text: 'text-gray-500' },
  login: { dot: 'bg-slate-400', text: 'text-slate-600' },
  logout: { dot: 'bg-slate-400', text: 'text-slate-600' },
  onboarding_start: { dot: 'bg-blue-500', text: 'text-blue-700' },
  onboarding_step_complete: { dot: 'bg-green-500', text: 'text-green-700' },
  onboarding_step_completed: { dot: 'bg-green-500', text: 'text-green-700' },
  onboarding_completed: { dot: 'bg-emerald-600', text: 'text-emerald-700' },
  workout_start: { dot: 'bg-[#5BC2F2]', text: 'text-[#1e88c4]' },
  workout_session_started: { dot: 'bg-[#5BC2F2]', text: 'text-[#1e88c4]' },
  workout_complete: { dot: 'bg-green-600', text: 'text-green-700' },
  workout_abandoned: { dot: 'bg-amber-500', text: 'text-amber-700' },
  profile_created: { dot: 'bg-purple-500', text: 'text-purple-700' },
  profile_updated: { dot: 'bg-purple-400', text: 'text-purple-600' },
  permission_location_status: { dot: 'bg-cyan-500', text: 'text-cyan-700' },
  error_occurred: { dot: 'bg-red-500', text: 'text-red-700' },
  default: { dot: 'bg-gray-400', text: 'text-gray-600' },
};

/**
 * Phase C rework (04.10.2026) — route page, not a modal, per David's
 * explicit correction: "My earlier 'keep the modal + full-screen toggle'
 * was wrong — replace with a proper page route." UserDetailModal (the
 * previous name) is retired; nothing else imported it (confirmed via grep
 * before this rework), so there was nothing to keep dual-purpose.
 *
 * `user` (the AdminUserListItem-shaped summary the JSX below references
 * throughout) is now DERIVED from fullProfile + workoutCount via useMemo,
 * not a separate fetch+state — avoids a real race the first draft of this
 * rework hit: two independent async loads racing to populate "the current
 * user," with functions reading a possibly-stale copy mid-load. Deriving
 * from the one state Firestore read (fullProfile) that everything else
 * already depends on means there is only ever one source of truth.
 */
export default function UserDetailPage() {
  const params = useParams();
  const router = useRouter();
  const uid = typeof params?.uid === 'string' ? params.uid : Array.isArray(params?.uid) ? params.uid[0] : '';

  const [activeTab, setActiveTab] = useState<'profile' | 'stats' | 'progression' | 'onboarding' | 'history' | 'timeline' | 'pushHistory'>('profile');
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
  const [editingDomains, setEditingDomains] = useState(false);
  const [editingTracks, setEditingTracks] = useState(false);
  const [editLevels, setEditLevels] = useState<Record<string, number>>({});
  const [editPercents, setEditPercents] = useState<Record<string, number>>({});
  const [editTrackLevels, setEditTrackLevels] = useState<Record<string, number>>({});
  const [savingLevels, setSavingLevels] = useState(false);
  const [cleaningLegacy, setCleaningLegacy] = useState(false);
  const [showProgramPicker, setShowProgramPicker] = useState(false);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);
  const [healthDeclarationPdfUrl, setHealthDeclarationPdfUrl] = useState<string | undefined>(undefined);
  const [expandedWorkoutId, setExpandedWorkoutId] = useState<string | null>(null);

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
    };
  }, [fullProfile, workoutCount, uid]);

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
            const data = d.data() as { bundleId?: string; text?: string };
            if (data.bundleId && data.text) textByBundleId.set(data.bundleId, data.text);
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

  // ── Save manual level overrides (dual-write to tracks + domains) ────────
  const saveManualLevelOverrides = async (
    levelMap: Record<string, number>,
    target: 'domains' | 'tracks' | 'both',
    percentMap?: Record<string, number>,
  ) => {
    if (!user || !fullProfile) return;
    setSavingLevels(true);
    try {
      const { doc, updateDoc } = await import('firebase/firestore');
      const { db } = await import('@/lib/firebase');

      const firestoreUpdates: Record<string, any> = {};
      for (const [key, level] of Object.entries(levelMap)) {
        if (target === 'domains' || target === 'both') {
          firestoreUpdates[`progression.domains.${key}.currentLevel`] = level;
        }
        if (target === 'tracks' || target === 'both') {
          firestoreUpdates[`progression.tracks.${key}.currentLevel`] = level;
        }
      }

      // Write percent values to tracks (percent lives only on tracks, not domains)
      if (percentMap && (target === 'tracks' || target === 'both')) {
        for (const [key, pct] of Object.entries(percentMap)) {
          firestoreUpdates[`progression.tracks.${key}.percent`] = Math.min(100, Math.max(0, pct));
        }
      }

      // Auto-derive master program levels from their child tracks.
      // full_body: Avg(push, pull, legs) — core excluded, capped at 15.
      if (target === 'tracks' || target === 'both') {
        const MASTER_EXCLUDED: Record<string, string[]> = { full_body: ['core'] };
        const MASTER_CAP: Record<string, number> = { full_body: 15 };
        const existingTracks = (fullProfile.progression as any)?.tracks as Record<string, { currentLevel?: number }> | undefined;
        for (const masterProg of programs.filter(p => p.isMaster && p.subPrograms?.length)) {
          const excluded = MASTER_EXCLUDED[masterProg.id] ?? [];
          const childLevels = (masterProg.subPrograms ?? [])
            .filter(s => !excluded.includes(s))
            .map(s => levelMap[s] ?? existingTracks?.[s]?.currentLevel ?? 0)
            .filter(l => l > 0);
          if (childLevels.length > 0) {
            const cap = MASTER_CAP[masterProg.id] ?? Infinity;
            const derivedLevel = Math.min(cap, Math.round(childLevels.reduce((a, b) => a + b, 0) / childLevels.length));
            // Stage 7 fix: write the resolved slug key, not the raw hash.
            const masterKey = await resolveTrackSlug(masterProg.id);
            firestoreUpdates[`progression.tracks.${masterKey}.currentLevel`] = derivedLevel;
            firestoreUpdates[`progression.domains.${masterKey}.currentLevel`] = derivedLevel;
          }
        }
      }

      await updateDoc(doc(db, 'users', user.id), firestoreUpdates);

      // Update local state
      const updatedProfile = { ...fullProfile };
      const prog = updatedProfile.progression as any;
      for (const [key, level] of Object.entries(levelMap)) {
        if ((target === 'domains' || target === 'both') && prog?.domains?.[key]) {
          prog.domains[key].currentLevel = level;
        }
        if ((target === 'tracks' || target === 'both') && prog?.tracks?.[key]) {
          prog.tracks[key].currentLevel = level;
        }
      }
      if (percentMap && (target === 'tracks' || target === 'both')) {
        for (const [key, pct] of Object.entries(percentMap)) {
          if (prog?.tracks?.[key]) {
            prog.tracks[key].percent = pct;
          }
        }
      }
      setFullProfile(updatedProfile);
      setEditingDomains(false);
      setEditingTracks(false);
      setEditPercents({});
      setSyncMessage('רמות עודכנו בהצלחה ✓');
      setTimeout(() => setSyncMessage(null), 3000);
    } catch (err) {
      console.error('[AdminEdit] Failed to save levels:', err);
      setSyncMessage('שגיאה בשמירה');
      setTimeout(() => setSyncMessage(null), 3000);
    } finally {
      setSavingLevels(false);
    }
  };

  // ── Assign new program to user ──────────────────────────────────────────
  const assignProgramToUser = async (program: Program) => {
    if (!user || !fullProfile) return;
    setSavingLevels(true);
    try {
      const { doc, updateDoc } = await import('firebase/firestore');
      const { db } = await import('@/lib/firebase');

      // Compute smart initial level from existing tracks
      const tracks = (fullProfile.progression as any)?.tracks as Record<string, { currentLevel?: number }> | undefined;
      const domains = (fullProfile.progression as any)?.domains as Record<string, { currentLevel?: number }> | undefined;
      let globalLevel = 1;
      if (tracks) {
        const lvls = Object.values(tracks).map(t => t?.currentLevel ?? 0);
        globalLevel = Math.max(globalLevel, ...lvls);
      }
      if (domains) {
        const lvls = Object.values(domains).map(d => d?.currentLevel ?? 0);
        globalLevel = Math.max(globalLevel, ...lvls);
      }
      globalLevel = Math.max(globalLevel, (fullProfile.progression as any)?.globalLevel ?? 1);

      const maxLevel = (program as any).maxLevels ?? 25;
      const initialLevel = Math.min(globalLevel, maxLevel);

      // Resolve the program's semantic slug so that domains/tracks use slug
      // keys (e.g. 'full_body') instead of Firestore hash IDs. Stage 7 fix
      // (program-identity audit §06): Program.slug now takes priority — the
      // old formula skipped it entirely, the same backwards-priority bug
      // Stage 6 fixed in buildProgramSlugMap. `program` is the full,
      // already-fetched Program doc, so this is a direct field read, no
      // async resolver call needed.
      const programSlug: string =
        program.slug ||
        (program as any).movementPattern ||
        MASTER_PROGRAM_ID_TO_SLUG[program.id] ||
        program.id; // safe fallback — at least consistent with itself

      const firestoreUpdates: Record<string, any> = {
        'progression.activePrograms': [{
          id: programSlug,
          templateId: programSlug,
          name: typeof program.name === 'string' ? program.name : (program.name as any)?.he ?? program.id,
          startDate: new Date(),
          durationWeeks: 52,
          currentWeek: 1,
          focusDomains: (program as any).subPrograms ?? [],
        }],
        [`progression.tracks.${programSlug}.currentLevel`]: initialLevel,
        [`progression.tracks.${programSlug}.maxLevel`]: maxLevel,
        [`progression.tracks.${programSlug}.percent`]: 0,
        [`progression.tracks.${programSlug}.totalWorkoutsCompleted`]: 0,
        [`progression.domains.${programSlug}.currentLevel`]: initialLevel,
        [`progression.domains.${programSlug}.maxLevel`]: maxLevel,
      };

      // If program has subPrograms (e.g. push, pull, legs, core), init each.
      // subPrograms[] stores Firestore hash IDs — resolve each to its slug so
      // progression.tracks and progression.domains use consistent slug keys.
      //
      // Stage 7 fix (program-identity audit §06 — the write-time site this
      // stage prioritizes): MASTER_PROGRAM_ID_TO_SLUG only covers the 4
      // MASTER programs, never leaf children (push/pull/legs/core/skills) —
      // every subHash here is a leaf child, so the old `|| subHash` fallback
      // fired on EVERY enroll, writing a brand-new raw-hash-keyed entry each
      // time. resolveTrackSlug (resolveToSlug first) actually covers leaves.
      if ((program as any).subPrograms?.length) {
        for (const subHash of (program as any).subPrograms as string[]) {
          const subSlug = await resolveTrackSlug(subHash);
          firestoreUpdates[`progression.tracks.${subSlug}.currentLevel`] = initialLevel;
          firestoreUpdates[`progression.tracks.${subSlug}.maxLevel`] = maxLevel;
          firestoreUpdates[`progression.tracks.${subSlug}.percent`] = 0;
          firestoreUpdates[`progression.domains.${subSlug}.currentLevel`] = initialLevel;
          firestoreUpdates[`progression.domains.${subSlug}.maxLevel`] = maxLevel;
        }
      }

      await updateDoc(doc(db, 'users', user.id), firestoreUpdates);

      // Refresh profile
      const updatedProfile = await getUserDetails(user.id);
      setFullProfile(updatedProfile);
      setShowProgramPicker(false);

      const pName = typeof program.name === 'string' ? program.name : (program.name as any)?.he ?? program.id;
      setSyncMessage(`תוכנית "${pName}" הוקצתה ברמה ${initialLevel} ✓`);
      setTimeout(() => setSyncMessage(null), 4000);
    } catch (err) {
      console.error('[AdminProgram] Failed to assign program:', err);
      setSyncMessage('שגיאה בהקצאת תוכנית');
      setTimeout(() => setSyncMessage(null), 3000);
    } finally {
      setSavingLevels(false);
    }
  };

  // ── Remove active program from user ────────────────────────────────────
  const removeActiveProgram = async (programId: string) => {
    if (!user || !fullProfile) return;
    setSavingLevels(true);
    try {
      const { doc, updateDoc } = await import('firebase/firestore');
      const { db } = await import('@/lib/firebase');
      const remaining = (fullProfile.progression?.activePrograms ?? []).filter(
        ap => ap.id !== programId && ap.templateId !== programId,
      );
      await updateDoc(doc(db, 'users', user.id), {
        'progression.activePrograms': remaining,
      });
      const updatedProfile = { ...fullProfile };
      (updatedProfile.progression as any).activePrograms = remaining;
      setFullProfile(updatedProfile);
      setSyncMessage('תוכנית הוסרה ✓');
      setTimeout(() => setSyncMessage(null), 3000);
    } catch (err) {
      console.error('[AdminProgram] Failed to remove program:', err);
      setSyncMessage('שגיאה בהסרת תוכנית');
      setTimeout(() => setSyncMessage(null), 3000);
    } finally {
      setSavingLevels(false);
    }
  };

  // ── Clean legacy English / broken activePrograms entries ───────────────
  // Removes entries that match ANY of these conditions:
  //   1. name contains ASCII letters → English humanized name stored by old onboarding
  //      (e.g. "full body", "Full Body", "calisthenics upper")
  //   2. id or templateId is exactly 'calisthenics' — broken slug missing '_upper'
  //   3. id is a raw 20-char Firestore auto-ID hash AND a proper slug entry
  //      for the same base program already exists elsewhere in the array
  // After filtering, deduplicates by normalized templateId (keep first occurrence).
  const cleanLegacyActivePrograms = async () => {
    // Use fullProfile.id — the ID of the user currently open in the modal.
    // Do NOT use user.id here; that refers to the AdminUserListItem prop which
    // in some auth contexts resolves to the logged-in admin's own UID.
    if (!fullProfile?.id) return;
    const targetUserId = fullProfile.id;
    setCleaningLegacy(true);
    try {
      const { doc, getDoc, updateDoc } = await import('firebase/firestore');
      const { db } = await import('@/lib/firebase');

      // Always read fresh from Firestore — never trust in-memory state.
      const snap = await getDoc(doc(db, 'users', targetUserId));
      if (!snap.exists()) {
        setSyncMessage('משתמש לא נמצא ב-Firestore');
        setTimeout(() => setSyncMessage(null), 3000);
        return;
      }
      const raw = snap.data();

      console.log('[AdminClean] progression keys:', Object.keys(raw?.progression ?? {}));

      // ── Build hash → slug map from live Firestore programs ───────────────
      // Seed with the static map for the 4 known master programs, then fill
      // the rest from all programs in Firestore so movement-pattern programs
      // (push/pull/legs/core) are covered as well.
      const allPrograms = await getAllPrograms();
      const idToSlug: Record<string, string> = { ...MASTER_PROGRAM_ID_TO_SLUG };
      for (const p of allPrograms) {
        if (!idToSlug[p.id]) {
          idToSlug[p.id] =
            (p as any).slug ??
            (p as any).movementPattern ??
            p.name.toLowerCase().replace(/[\s-]+/g, '_');
        }
      }

      // ── Determine if a map key is legacy / broken ────────────────────────
      // Valid keys are lowercase ASCII slugs with underscores (push, full_body).
      // Legacy keys have spaces ("full body"), capital letters ("Full Body"),
      // or are the broken "calisthenics" slug that was never resolved.
      const isLegacyKey = (key: string): boolean => {
        if (key === 'calisthenics') return true;       // broken slug (missing _upper)
        if (key.includes(' ')) return true;            // space → humanized English name
        if (/[A-Z]/.test(key)) return true;            // uppercase → legacy camelCase/Title
        return false;
      };

      // Returns true when a key looks like a Firestore auto-generated hash ID
      // (long alphanumeric string with no underscores or spaces).
      const isFirestoreHash = (key: string): boolean =>
        key.length > 15 && /^[a-zA-Z0-9]+$/.test(key);

      // ── Clean progression.domains ────────────────────────────────────────
      const rawDomains = raw?.progression?.domains ?? {};
      const cleanedDomains: Record<string, any> = {};
      const removedDomainKeys: string[] = [];
      for (const [k, v] of Object.entries(rawDomains)) {
        const correspondingSlug = idToSlug[k];
        const slugAlreadyInDomains = !!correspondingSlug && correspondingSlug in rawDomains;
        if (isLegacyKey(k) || (isFirestoreHash(k) && slugAlreadyInDomains)) {
          removedDomainKeys.push(k);
        } else {
          cleanedDomains[k] = v;
        }
      }

      // ── Clean progression.tracks ─────────────────────────────────────────
      const rawTracks = raw?.progression?.tracks ?? {};
      const cleanedTracks: Record<string, any> = {};
      const removedTrackKeys: string[] = [];
      for (const [k, v] of Object.entries(rawTracks)) {
        const correspondingSlug = idToSlug[k];
        const slugAlreadyInTracks = !!correspondingSlug && correspondingSlug in rawTracks;
        if (isLegacyKey(k) || (isFirestoreHash(k) && slugAlreadyInTracks)) {
          removedTrackKeys.push(k);
        } else {
          cleanedTracks[k] = v;
        }
      }

      // ── Clean progression.activePrograms (array) ─────────────────────────
      const existing: any[] = raw?.progression?.activePrograms ?? [];
      const firestoreHashRe = /^[a-zA-Z0-9]{20}$/;
      const hasEnglishLetterRe = /[a-zA-Z]/;
      const slugIds = new Set(
        existing
          .map((ap: any) => (ap.id || ap.templateId || '') as string)
          .filter((id) => !firestoreHashRe.test(id) && id.trim() !== ''),
      );
      const isLegacyEntry = (ap: any): boolean => {
        const id = (ap.id || '') as string;
        const templateId = (ap.templateId || '') as string;
        const name = (ap.name || '') as string;
        if (hasEnglishLetterRe.test(name)) return true;
        if (id === 'calisthenics' || templateId === 'calisthenics') return true;
        if (firestoreHashRe.test(id) && slugIds.size > 0) return true;
        return false;
      };
      const filtered = existing.filter((ap: any) => !isLegacyEntry(ap));
      const seen = new Set<string>();
      const cleanedActivePrograms = filtered.filter((ap: any) => {
        const key = (ap.templateId || ap.id || '').toLowerCase().trim();
        if (!key || seen.has(key)) return false;
        seen.add(key);
        return true;
      });
      const removedActivePrograms = existing.length - cleanedActivePrograms.length;

      const totalRemoved = removedDomainKeys.length + removedTrackKeys.length + removedActivePrograms;

      console.log('[AdminClean] Removed domain keys:', removedDomainKeys);
      console.log('[AdminClean] Removed track keys:', removedTrackKeys);
      console.log('[AdminClean] Removed activePrograms entries:', removedActivePrograms);
      console.log('[AdminClean] Clean domains:', Object.keys(cleanedDomains));
      console.log('[AdminClean] Clean tracks:', Object.keys(cleanedTracks));

      if (totalRemoved === 0) {
        setSyncMessage('לא נמצאו רשומות ישנות — הכל נקי ✓');
        setTimeout(() => setSyncMessage(null), 4000);
        return;
      }

      // Write all three cleaned objects back in one atomic updateDoc call
      await updateDoc(doc(db, 'users', targetUserId), {
        'progression.domains': cleanedDomains,
        'progression.tracks': cleanedTracks,
        'progression.activePrograms': cleanedActivePrograms,
      });

      // Refresh local state so the UI reflects the cleaned data immediately
      const refreshed = await getDoc(doc(db, 'users', targetUserId));
      if (refreshed.exists()) {
        setFullProfile({ id: targetUserId, ...refreshed.data() } as any);
      }

      setSyncMessage(`ניקוי הושלם: ${totalRemoved} שדות ישנים הוסרו ✓`);
      setTimeout(() => setSyncMessage(null), 4000);
    } catch (err) {
      console.error('[AdminClean] Failed to clean legacy programs:', err);
      setSyncMessage('שגיאה בניקוי');
      setTimeout(() => setSyncMessage(null), 3000);
    } finally {
      setCleaningLegacy(false);
    }
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

  const getEquipmentNames = (equipmentIds: string[]): string[] => {
    return equipmentIds
      .map((id) => {
        const gear = gearDefinitions.find((g) => g.id === id);
        return gear?.name?.he || gear?.name?.en || id;
      })
      .filter(Boolean);
  };

  // Helper to get historyFrequency label
  const getHistoryFrequencyLabel = (frequency?: string): string => {
    if (!frequency) return 'טרם סופק';
    const labels: Record<string, string> = {
      'none': 'לא התאמן בכלל',
      '1-2': 'אימונים 1-2 פעמים בשבוע',
      '3+': 'אימונים אינטנסיביים (3+ פעמים בשבוע)',
    };
    return labels[frequency] || frequency;
  };

  // Helper to get workout preference labels
  const getWorkoutPreferenceLabels = (historyTypes?: string[]): string[] => {
    if (!historyTypes || historyTypes.length === 0) return ['טרם סופק'];
    const labels: Record<string, string> = {
      'gym': 'חדר כושר',
      'street': 'פארקים ציבוריים',
      'studio': 'סטודיו / שיעורים',
      'home': 'אימון ביתי',
      'cardio': 'ריצה / אירובי בחוץ',
    };
    return historyTypes.map(type => labels[type] || type);
  };

  // Helper to get active program details — tracks are source of truth
  const getActiveProgramInfo = () => {
    const activeProgram = fullProfile?.progression?.activePrograms?.[0];
    if (!activeProgram) return null;

    const program = programs.find(p => 
      p.id === activeProgram.templateId || p.id === activeProgram.id
    );

    const programName = program?.name || activeProgram.name || 'תוכנית פעילה';

    // Source of truth: take the MAX level across all tracks
    let level = 1;
    let maxLevel = 25;

    const tracks = (fullProfile?.progression as any)?.tracks as Record<string, { currentLevel?: number; maxLevel?: number }> | undefined;
    const domains = (fullProfile?.progression as any)?.domains as Record<string, { currentLevel?: number; maxLevel?: number }> | undefined;

    // Check the active program's own track first
    const programTrack = tracks?.[activeProgram.templateId || activeProgram.id];
    if (programTrack?.currentLevel) {
      level = programTrack.currentLevel;
      maxLevel = programTrack.maxLevel || 25;
    }

    // Then check all tracks to find the true max (for effective level display)
    if (tracks) {
      const allTrackLevels = Object.values(tracks).map(t => t?.currentLevel ?? 0);
      const maxTrackLevel = Math.max(0, ...allTrackLevels);
      if (maxTrackLevel > level) level = maxTrackLevel;
    }

    // Fallback to domains if tracks are empty
    if (level <= 1 && domains) {
      const allDomainLevels = Object.values(domains).map(d => d?.currentLevel ?? 0);
      const maxDomainLevel = Math.max(0, ...allDomainLevels);
      if (maxDomainLevel > level) level = maxDomainLevel;
    }

    // Final fallback to initialFitnessTier
    if (level <= 1) {
      level = fullProfile?.core?.initialFitnessTier || 1;
    }

    return { programName, level, maxLevel };
  };

  const getUserLocation = () => {
    const raw = authority?.name
      || (fullProfile as any)?.city
      || (fullProfile as any)?.onboarding?.city;
    const city = typeof raw === 'string' ? raw
      : (raw && typeof raw === 'object' && 'name' in raw) ? String(raw.name)
      : undefined;
    const nbRaw = (fullProfile as any)?.neighborhood;
    const neighborhood = typeof nbRaw === 'string' ? nbRaw : undefined;
    return { city, neighborhood };
  };

  // Helper to get historyFrequency from user data
  const getHistoryFrequency = (): string | undefined => {
    return (fullProfile as any)?.historyFrequency || 
           (fullProfile as any)?.onboarding?.historyFrequency ||
           (fullProfile as any)?.onboarding?.pastActivityLevel;
  };

  // Helper to get historyTypes from user data
  const getHistoryTypes = (): string[] | undefined => {
    return (fullProfile as any)?.historyTypes || 
           (fullProfile as any)?.onboarding?.historyTypes;
  };

  // Helper function to get event label in Hebrew
  // Phase B fix (04.10.2026): this used to fall through to the raw English
  // eventName for anything not in the map — a real leak, not hypothetical.
  // AnalyticsEventType (AnalyticsService.ts) has 16 real values; this map
  // was missing 5 of them (onboarding_start, onboarding_step_completed —
  // the 'completed' variant, distinct from 'complete' — onboarding_completed,
  // workout_session_started, permission_location_status), which would have
  // rendered verbatim in the timeline for any user who hit those paths.
  // Fallback is now a generic Hebrew label, never the raw key.
  const getEventLabel = (eventName: string): string => {
    const labels: Record<string, string> = {
      app_open: 'פתיחת אפליקציה',
      app_close: 'סגירת אפליקציה',
      login: 'התחברות',
      logout: 'התנתקות',
      onboarding_start: 'תחילת תהליך הרשמה',
      onboarding_step_complete: 'שלב הרשמה הושלם',
      onboarding_step_completed: 'שלב הרשמה הושלם',
      onboarding_completed: 'תהליך הרשמה הושלם',
      workout_start: 'התחלת אימון',
      workout_session_started: 'התחלת אימון',
      workout_complete: 'אימון הושלם',
      workout_abandoned: 'אימון ננטש',
      profile_created: 'פרופיל נוצר',
      profile_updated: 'פרופיל עודכן',
      permission_location_status: 'הרשאת מיקום',
      error_occurred: 'שגיאה',
    };
    return labels[eventName] || 'פעילות לא מזוהה';
  };

  // Helper function to get event details
  const getEventDetails = (event: AnalyticsEvent): string => {
    const details: string[] = [];
    
    if (event.eventName === 'onboarding_step_complete' && 'step_name' in event) {
      details.push(`שלב: ${event.step_name}`);
      if (event.time_spent) {
        details.push(`זמן: ${Math.floor(event.time_spent)} שניות`);
      }
    }
    
    if (event.eventName === 'workout_start' && 'level' in event) {
      if (event.level) details.push(`רמה: ${event.level}`);
      if (event.location) details.push(`מיקום: ${event.location}`);
    }
    
    if (event.eventName === 'workout_complete' && 'duration' in event) {
      if (event.duration) details.push(`משך: ${Math.floor(event.duration / 60)} דקות`);
      if (event.calories) details.push(`קלוריות: ${event.calories}`);
      if (event.earned_coins) details.push(`מטבעות: +${event.earned_coins}`);
    }
    
    if (event.eventName === 'error_occurred' && 'error_code' in event) {
      details.push(`קוד שגיאה: ${event.error_code}`);
      if (event.screen) details.push(`מסך: ${event.screen}`);
    }

    if (event.eventName === 'permission_location_status' && 'status' in event) {
      const statusLabel = event.status === 'granted' ? 'אושרה' : event.status === 'denied' ? 'נדחתה' : 'התבקשה';
      details.push(`סטטוס: ${statusLabel}`);
    }

    if (event.eventName === 'onboarding_completed') {
      if ('total_time_spent' in event && event.total_time_spent) {
        details.push(`זמן כולל: ${Math.floor(event.total_time_spent / 60)} דקות`);
      }
      if ('steps_completed' in event && event.steps_completed) {
        details.push(`שלבים: ${event.steps_completed}`);
      }
    }

    return details.join(' • ') || 'אין פרטים נוספים';
  };

  return (
    <div className="min-h-screen bg-gray-50" dir="rtl">
      <div className="max-w-5xl mx-auto bg-white shadow-sm min-h-screen">
          {/* Header */}
          <div className="sticky top-0 z-10 bg-white border-b border-gray-200 p-6">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-4">
                {user.photoURL ? (
                  <img
                    src={user.photoURL}
                    alt={user.name}
                    className="w-16 h-16 rounded-full object-cover"
                  />
                ) : (
                  <div className="w-16 h-16 rounded-full bg-[#5BC2F2] text-white flex items-center justify-center font-black text-2xl">
                    {user.name.charAt(0).toUpperCase()}
                  </div>
                )}
                <div>
                  <h2 className="text-2xl font-black text-gray-900">{user.name}</h2>
                  <p className="text-gray-500">{user.email || 'ללא אימייל'}</p>
                  {/* Persona & Primary Goal quick-glance badges */}
                  {fullProfile && (
                    <div className="flex flex-wrap items-center gap-2 mt-2">
                      {/* Account Security Badge */}
                      {(() => {
                        const accountStatus = (fullProfile as any).accountStatus;
                        const accountMethod = (fullProfile as any).accountMethod;
                        const hasEmail = !!fullProfile.core?.email;
                        const isAnon = fullProfile.core?.isAnonymous === true;
                        
                        if (accountStatus === 'secured') {
                          if (accountMethod === 'google') {
                            return (
                              <span className="px-2.5 py-1 bg-blue-100 text-blue-700 rounded-full text-xs font-bold flex items-center gap-1">
                                <Shield size={12} />
                                חשבון מאובטח (Google)
                              </span>
                            );
                          } else if (accountMethod === 'email') {
                            return (
                              <span className="px-2.5 py-1 bg-green-100 text-green-700 rounded-full text-xs font-bold flex items-center gap-1">
                                <Mail size={12} />
                                חשבון מאובטח (Email)
                              </span>
                            );
                          } else {
                            return (
                              <span className="px-2.5 py-1 bg-green-100 text-green-700 rounded-full text-xs font-bold flex items-center gap-1">
                                <Shield size={12} />
                                חשבון מאובטח
                              </span>
                            );
                          }
                        } else if (accountStatus === 'unsecured') {
                          return (
                            <span className="px-2.5 py-1 bg-gray-100 text-gray-600 rounded-full text-xs font-bold flex items-center gap-1">
                              <AlertCircle size={12} />
                              ללא גיבוי
                            </span>
                          );
                        } else if (isAnon && !hasEmail) {
                          return (
                            <span className="px-2.5 py-1 bg-gray-100 text-gray-600 rounded-full text-xs font-bold flex items-center gap-1">
                              <User size={12} />
                              אורח (ישן)
                            </span>
                          );
                        } else if (!isAnon && hasEmail) {
                          return (
                            <span className="px-2.5 py-1 bg-green-100 text-green-700 rounded-full text-xs font-bold flex items-center gap-1">
                              <Shield size={12} />
                              רשום (ישן)
                            </span>
                          );
                        }
                        return null;
                      })()}
                      {/* Reads `personas[]` (canonical since the 01.09.2026 persona-model
                          redefinition) -- the old `onboardingAnswers.persona` field this
                          badge used to read was deleted outright from every user doc by
                          that redefinition's cleanup script, so this badge would otherwise
                          silently stop rendering for every user, forever. Renders one badge
                          per entry -- multi-persona is real product intent, not an edge case. */}
                      {((fullProfile as any).personas as Array<{ id: string }> | undefined)?.map((persona) => (
                        <span key={persona.id} className="px-2.5 py-1 bg-purple-100 text-purple-700 rounded-full text-xs font-bold flex items-center gap-1">
                          <User size={12} />
                          {(() => {
                            const personaLabels: Record<string, string> = {
                              parent: 'הורה', student: 'סטודנט/ית', pupil: 'תלמיד/ה',
                              office_worker: 'עובד/ת משרד', military: 'צה"ל',
                              vatikim: 'גיל הזהב', pro_athlete: 'ספורטאי/ת קצה',
                            };
                            return personaLabels[persona.id] || persona.id;
                          })()}
                        </span>
                      ))}
                      {(fullProfile as any).onboardingAnswers?.primaryGoalLabel && (
                        <span className="px-2.5 py-1 bg-cyan-100 text-cyan-700 rounded-full text-xs font-bold flex items-center gap-1">
                          <TrendingUp size={12} />
                          {(fullProfile as any).onboardingAnswers.primaryGoalLabel}
                        </span>
                      )}
                      {!(fullProfile as any).onboardingAnswers?.primaryGoalLabel && (fullProfile as any).onboardingAnswers?.primaryGoal && (
                        <span className="px-2.5 py-1 bg-cyan-100 text-cyan-700 rounded-full text-xs font-bold flex items-center gap-1">
                          <TrendingUp size={12} />
                          {(() => {
                            const goalLabels: Record<string, string> = {
                              routine: 'שגרה קבועה', aesthetics: 'חיטוב ואסתטיקה',
                              fitness: 'כושר ובריאות', performance: 'שיפור ביצועים',
                              skills: 'מיומנות מתקדמת', community: 'קהילה',
                            };
                            return goalLabels[(fullProfile as any).onboardingAnswers.primaryGoal] || (fullProfile as any).onboardingAnswers.primaryGoal;
                          })()}
                        </span>
                      )}
                      {/* Growth Hub — Lifecycle KPI badges (lastActive, pushEnabled, fcmTokenCount) */}
                      {user.lastActive && (
                        <span
                          className="px-2.5 py-1 bg-slate-100 text-slate-700 rounded-full text-xs font-bold flex items-center gap-1"
                          title={user.lastActive.toLocaleString('he-IL')}
                        >
                          <Clock size={12} />
                          פעיל לאחרונה: {user.lastActive.toLocaleDateString('he-IL')}
                        </span>
                      )}
                      {user.pushEnabled ? (
                        <span className="px-2.5 py-1 bg-emerald-100 text-emerald-700 rounded-full text-xs font-bold flex items-center gap-1">
                          <Bell size={12} />
                          התראות פעילות
                        </span>
                      ) : (
                        <span className="px-2.5 py-1 bg-gray-100 text-gray-500 rounded-full text-xs font-bold flex items-center gap-1">
                          <BellOff size={12} />
                          התראות כבויות
                        </span>
                      )}
                      <span
                        className={`px-2.5 py-1 rounded-full text-xs font-bold flex items-center gap-1 ${
                          user.fcmTokenCount > 0
                            ? 'bg-blue-100 text-blue-700'
                            : 'bg-gray-100 text-gray-500'
                        }`}
                        title={`${user.fcmTokenCount} מכשיר${user.fcmTokenCount === 1 ? '' : 'ים'} רשומ${user.fcmTokenCount === 1 ? '' : 'ים'} ל-FCM`}
                      >
                        <Smartphone size={12} />
                        {user.fcmTokenCount} מכשירים
                      </span>
                      {/*
                        Growth Hub — Tier 3 Marketing Attribution badges.
                        Three render branches, in priority order:
                          1. user.marketingAttribution missing entirely
                             → legacy user, render nothing.
                          2. source === 'organic'
                             → single calm gray chip — no paid acquisition.
                          3. source is a real platform string
                             → triple chip set (campaign · source · medium),
                               each guarded with a ?? 'לא ידוע' fallback so
                               partial attribution docs still render cleanly.
                      */}
                      {user.marketingAttribution && (
                        user.marketingAttribution.source === 'organic' ? (
                          <span
                            className="px-2.5 py-1 bg-gray-100 text-gray-700 rounded-full text-xs font-bold flex items-center gap-1"
                            title="המשתמש הגיע ישירות (ללא קמפיין שיווקי)"
                          >
                            <span aria-hidden="true">🟢</span>
                            הגעה: אורגני
                          </span>
                        ) : (
                          <>
                            <span
                              className="px-2.5 py-1 bg-indigo-100 text-indigo-700 rounded-full text-xs font-bold flex items-center gap-1"
                              title={`קמפיין שיווקי: ${user.marketingAttribution.campaign ?? 'ללא'}`}
                            >
                              <span aria-hidden="true">📢</span>
                              קמפיין: {user.marketingAttribution.campaign ?? 'ללא'}
                            </span>
                            <span
                              className="px-2.5 py-1 bg-sky-100 text-sky-700 rounded-full text-xs font-bold flex items-center gap-1"
                              title={`מקור תנועה: ${user.marketingAttribution.source ?? 'לא ידוע'}`}
                            >
                              <span aria-hidden="true">📍</span>
                              מקור: {user.marketingAttribution.source ?? 'לא ידוע'}
                            </span>
                            <span
                              className="px-2.5 py-1 bg-slate-100 text-slate-700 rounded-full text-xs font-bold flex items-center gap-1"
                              title={`מדיה: ${user.marketingAttribution.medium ?? 'לא ידוע'}`}
                            >
                              <span aria-hidden="true">📱</span>
                              מדיה: {user.marketingAttribution.medium ?? 'לא ידוע'}
                            </span>
                          </>
                        )
                      )}
                    </div>
                  )}
                </div>
              </div>
              <button
                onClick={() => router.push('/admin/users/all')}
                className="flex items-center gap-1.5 px-3 py-2 hover:bg-gray-100 rounded-lg transition-colors text-sm font-bold text-gray-600"
              >
                <ArrowRight size={18} />
                חזרה לרשימה
              </button>
            </div>

            {/* KPI tiles — Phase B (04.10.2026). Proposed set: effective
                level, coins, total workouts (user.workoutCount — the real
                count from the `workouts` collection, same field PR #107's
                ghost/protection logic uses, not capped like workoutHistory's
                50-doc fetch), current streak, last-activity recency (reuses
                Phase A's formatLastActivity for a consistent color language
                across both the table and this screen). Flagged for David's
                confirmation per the brief — easy to swap/extend. */}
            {user && (
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 mb-4">
                <div className="bg-blue-50 border border-blue-100 rounded-xl p-3 text-center">
                  <div className="text-[11px] text-blue-600 font-bold mb-0.5">רמה כוללת</div>
                  <div className="text-xl font-black text-blue-800">{(user as any).effectiveLevel ?? user.level}</div>
                </div>
                <div className="bg-yellow-50 border border-yellow-100 rounded-xl p-3 text-center">
                  <div className="text-[11px] text-yellow-700 font-bold mb-0.5 flex items-center justify-center gap-1">
                    <Coins size={11} /> מטבעות
                  </div>
                  <div className="text-xl font-black text-yellow-800">{user.coins}</div>
                </div>
                <div className="bg-cyan-50 border border-cyan-100 rounded-xl p-3 text-center">
                  <div className="text-[11px] text-cyan-700 font-bold mb-0.5">סה"כ אימונים</div>
                  <div className="text-xl font-black text-cyan-800">{(user as any).workoutCount ?? 0}</div>
                </div>
                <div className="bg-orange-50 border border-orange-100 rounded-xl p-3 text-center">
                  <div className="text-[11px] text-orange-700 font-bold mb-0.5 flex items-center justify-center gap-1">
                    <Flame size={11} /> רצף
                  </div>
                  <div className="text-xl font-black text-orange-800">{(fullProfile?.progression as any)?.currentStreak ?? 0}</div>
                </div>
                <div className="bg-gray-50 border border-gray-100 rounded-xl p-3 text-center">
                  <div className="text-[11px] text-gray-500 font-bold mb-0.5">פעילות אחרונה</div>
                  {(() => {
                    const recency = formatLastActivity(user.lastActive);
                    return (
                      <div className={`text-xs font-black inline-flex items-center gap-1 ${recency.textClass}`}>
                        <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${recency.dotColor}`} />
                        {recency.label}
                      </div>
                    );
                  })()}
                </div>
              </div>
            )}

            {/* Tabs */}
            <div className="flex gap-2 border-b border-gray-200 overflow-x-auto">
              {(['profile', 'stats', 'progression', 'onboarding', 'history', 'timeline', 'pushHistory'] as const).map((tab) => (
                <button
                  key={tab}
                  onClick={() => setActiveTab(tab)}
                  className={`px-4 py-2 font-bold transition-colors relative whitespace-nowrap ${
                    activeTab === tab
                      ? 'text-[#5BC2F2]'
                      : 'text-gray-500 hover:text-gray-700'
                  }`}
                >
                  {tab === 'profile' && 'פרופיל'}
                  {tab === 'stats' && 'סטטיסטיקה'}
                  {tab === 'progression' && 'התקדמות'}
                  {tab === 'onboarding' && 'נתוני הקליטה'}
                  {tab === 'history' && 'היסטוריה'}
                  {tab === 'timeline' && (
                    <span className="flex items-center gap-1.5">
                      <Clock size={14} />
                      ציר זמן
                    </span>
                  )}
                  {tab === 'pushHistory' && (
                    <span className="flex items-center gap-1.5">
                      <Bell size={14} />
                      היסטוריית פוש
                    </span>
                  )}
                  {activeTab === tab && (
                    <motion.div
                      layoutId="activeTab"
                      className="absolute bottom-0 left-0 right-0 h-0.5 bg-[#5BC2F2]"
                    />
                  )}
                </button>
              ))}
            </div>
          </div>

          {/* Content */}
          <div className="p-6">
            {loading ? (
              <div className="flex items-center justify-center py-12">
                <div className="text-gray-500">טוען...</div>
              </div>
            ) : (
              <>
                {/* Profile Tab - Comprehensive User Identity & Strategy Dashboard */}
                {activeTab === 'profile' && fullProfile && (
                  <div className="space-y-6">
                    {/* 1. User Identity & Location */}
                      <div>
                        <h3 className="text-lg font-black text-gray-900 mb-4 flex items-center gap-2">
                          <MapPin size={20} className="text-blue-500" />
                        זהות ומקום מגורים
                        </h3>
                      <div className="bg-gradient-to-br from-blue-50 to-indigo-50 border border-blue-200 rounded-xl p-5 space-y-4">
                        {(() => {
                          const location = getUserLocation();
                          return (
                            <>
                              {location.city && (
                                <div>
                                  <div className="text-sm text-gray-600 mb-1">עיר</div>
                                  <div className="font-bold text-gray-900 text-lg">{location.city}</div>
                                </div>
                              )}
                              {location.neighborhood && (
                                <div>
                                  <div className="text-sm text-gray-600 mb-1">שכונה</div>
                                  <div className="font-bold text-gray-900 text-lg">{location.neighborhood}</div>
                                </div>
                              )}
                              {!location.city && !location.neighborhood && (
                                <div className="text-sm text-gray-500 italic">טרם סופק</div>
                              )}
                            </>
                          );
                        })()}
                        {authority && (
                          <div className="pt-3 border-t border-blue-200">
                          <div className="flex items-center gap-2 mb-2">
                            <Building2 size={18} className="text-blue-600" />
                            <div className="text-sm text-gray-600">רשות משויכת</div>
                          </div>
                            <div className="font-bold text-gray-900 text-base">
                            {safeRenderText(authority.name)}
                            {authority.type === 'city' && ' (עירייה)'}
                            {authority.type === 'regional_council' && ' (מועצה אזורית)'}
                            {authority.type === 'local_council' && ' (מועצה מקומית)'}
                          </div>
                            {authority.id && (
                              <div className="text-xs text-gray-500 mt-1">ID: {authority.id}</div>
                            )}
                      </div>
                    )}
                      </div>
                    </div>

                    {/* 1.5. Passive Activity (HealthKit / Health Connect step sync) —
                         separate from the workout-session distance shown in the
                         "history" tab: this is passive daily step-counting, reads
                         dailyActivity/{uid}_{date} via getStepsTrend(). */}
                    <div>
                      <h3 className="text-lg font-black text-gray-900 mb-4 flex items-center gap-2">
                        <Footprints size={20} className="text-emerald-500" />
                        פעילות (סנכרון בריאות)
                      </h3>
                      {stepsHistory.length === 0 ? (
                        <div className="bg-gray-50 border border-gray-200 rounded-xl p-4 text-sm text-gray-500 italic">
                          אין נתוני צעדים מסונכרנים
                        </div>
                      ) : (() => {
                        const today = stepsHistory[stepsHistory.length - 1];
                        const last7 = stepsHistory.slice(-7);
                        const last7Total = last7.reduce((sum, s) => sum + s.steps, 0);
                        const last7Avg = last7.length > 0 ? Math.round(last7Total / last7.length) : 0;
                        const last30Total = stepsHistory.reduce((sum, s) => sum + s.steps, 0);
                        const last30Avg = stepsHistory.length > 0 ? Math.round(last30Total / stepsHistory.length) : 0;
                        return (
                          <div className="grid grid-cols-3 gap-3">
                            <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4">
                              <div className="text-xs text-gray-600 mb-1">היום ({today.date})</div>
                              <div className="font-black text-2xl text-emerald-700">{today.steps.toLocaleString('he-IL')}</div>
                              <div className="text-[11px] text-gray-500 mt-1">צעדים</div>
                            </div>
                            <div className="bg-gray-50 border border-gray-200 rounded-xl p-4">
                              <div className="text-xs text-gray-600 mb-1">7 ימים אחרונים</div>
                              <div className="font-black text-2xl text-gray-900">{last7Total.toLocaleString('he-IL')}</div>
                              <div className="text-[11px] text-gray-500 mt-1">ממוצע: {last7Avg.toLocaleString('he-IL')}/יום</div>
                            </div>
                            <div className="bg-gray-50 border border-gray-200 rounded-xl p-4">
                              <div className="text-xs text-gray-600 mb-1">30 ימים אחרונים</div>
                              <div className="font-black text-2xl text-gray-900">{last30Total.toLocaleString('he-IL')}</div>
                              <div className="text-[11px] text-gray-500 mt-1">ממוצע: {last30Avg.toLocaleString('he-IL')}/יום</div>
                            </div>
                          </div>
                        );
                      })()}
                      {/* Distance row — real synced distanceMeters (HealthKit
                          distanceWalkingRunning / Health Connect DistanceRecord),
                          same 30-day stepsHistory window. Omitted entirely (not
                          shown as 0) when no day in the window has synced
                          distance yet — most users pre-native-release. */}
                      {stepsHistory.some((s) => (s.distanceMeters ?? 0) > 0) && (() => {
                        const last30DistanceKm = stepsHistory.reduce((sum, s) => sum + (s.distanceMeters ?? 0), 0) / 1000;
                        return (
                          <div className="mt-3 bg-cyan-50 border border-cyan-200 rounded-xl p-4 flex items-center justify-between">
                            <span className="text-xs text-gray-600">מרחק הליכה/ריצה — 30 יום אחרונים</span>
                            <span className="font-black text-lg text-cyan-700">{last30DistanceKm.toFixed(1)} ק״מ</span>
                          </div>
                        );
                      })()}
                    </div>

                    {/* 2. Workout Profile - The "Gold" Data */}
                      <div>
                        <h3 className="text-lg font-black text-gray-900 mb-4 flex items-center gap-2">
                        <Activity size={20} className="text-amber-500" />
                        פרופיל אימונים (נתוני השפעה)
                        </h3>
                      <div className="space-y-4">
                        {/* Initial State - Critical for Impact Reports */}
                        <div className="bg-amber-50 border-2 border-amber-200 rounded-xl p-5">
                          <div className="text-sm font-bold text-amber-900 mb-2">📍 מצב התחלתי</div>
                          <div className="text-base font-bold text-gray-900">
                            {getHistoryFrequencyLabel(getHistoryFrequency())}
                          </div>
                          <div className="text-xs text-amber-700 mt-2">
                            תשובה לשאלה: "איך נראת שגרת האימונים שלך בחודש שעבר?"
                          </div>
                        </div>

                        {/* Workout Preferences */}
                        <div className="bg-gray-50 border border-gray-200 rounded-xl p-4">
                          <div className="text-sm text-gray-600 mb-2">העדפות אימון</div>
                          <div className="flex flex-wrap gap-2">
                            {getWorkoutPreferenceLabels(getHistoryTypes()).map((pref, idx) => (
                              <span
                                key={idx}
                                className="px-3 py-1.5 bg-white border border-gray-300 text-gray-700 rounded-full text-sm font-medium"
                              >
                                {pref}
                              </span>
                            ))}
                            </div>
                          </div>

                        {/* Sync Message */}
                        {syncMessage && (
                          <div className="bg-green-50 border border-green-200 rounded-xl p-3 text-sm text-green-700 font-bold flex items-center gap-2">
                            <CheckCircle2 size={16} />
                            {syncMessage}
                          </div>
                        )}

                        {/* Active Program */}
                        {(() => {
                          const programInfo = getActiveProgramInfo();
                          if (!programInfo) {
                            return (
                              <div className="bg-gray-50 border border-gray-200 rounded-xl p-4">
                                <div className="text-sm text-gray-600 mb-1">תוכנית פעילה</div>
                                <div className="text-sm text-gray-500 italic mb-3">טרם סופק</div>
                                <button
                                  onClick={() => setShowProgramPicker(true)}
                                  className="flex items-center gap-2 px-3 py-2 bg-cyan-500 text-white rounded-lg text-sm font-bold hover:bg-cyan-600 transition-colors"
                                >
                                  <Plus size={14} />
                                  הקצה תוכנית
                                </button>
                              </div>
                            );
                          }
                          return (
                            <div className="bg-gradient-to-br from-cyan-50 to-blue-50 border-2 border-cyan-200 rounded-xl p-5">
                              <div className="flex items-center justify-between mb-2">
                                <div className="text-sm text-gray-600">תוכנית פעילה</div>
                                <button
                                  onClick={() => setShowProgramPicker(true)}
                                  className="flex items-center gap-1 px-2 py-1 text-xs font-bold text-cyan-700 bg-cyan-100 hover:bg-cyan-200 rounded-lg transition-colors"
                                >
                                  <ArrowRightLeft size={12} />
                                  שנה / הוסף תוכנית
                                </button>
                              </div>
                              <div className="font-black text-xl text-cyan-700 mb-3">{programInfo.programName}</div>
                              <div className="flex items-baseline gap-2">
                                <span className="font-black text-3xl text-cyan-600">רמה {programInfo.level}</span>
                                <span className="text-sm text-gray-500 font-bold">/ {programInfo.maxLevel}</span>
                              </div>
                            </div>
                          );
                        })()}

                        {/* Program Picker Modal */}
                        {showProgramPicker && (
                          <div className="bg-white border-2 border-cyan-300 rounded-xl p-5 shadow-lg">
                            <div className="flex items-center justify-between mb-4">
                              <h4 className="font-black text-gray-900">בחר תוכנית חדשה</h4>
                              <button onClick={() => setShowProgramPicker(false)} className="p-1 hover:bg-gray-100 rounded-full">
                                <X size={16} />
                              </button>
                            </div>
                            <div className="grid grid-cols-1 gap-2 max-h-60 overflow-y-auto">
                              {programs.filter(p => (p as any).isMaster).length > 0
                                ? programs.filter(p => (p as any).isMaster).map(prog => {
                                    const pName = typeof prog.name === 'string' ? prog.name : (prog.name as any)?.he ?? prog.id;
                                    return (
                                      <button
                                        key={prog.id}
                                        onClick={() => assignProgramToUser(prog)}
                                        disabled={savingLevels}
                                        className="flex items-center justify-between p-3 bg-gray-50 hover:bg-cyan-50 border border-gray-200 hover:border-cyan-300 rounded-lg transition-colors text-right disabled:opacity-50"
                                      >
                                        <div className="flex items-center gap-2">
                                          <span className="text-cyan-600">{getProgramIcon(resolveIconKey(prog.id), 'w-5 h-5')}</span>
                                          <div>
                                            <div className="font-bold text-gray-900">{pName}</div>
                                            <div className="text-xs text-gray-500">{prog.id}</div>
                                          </div>
                                        </div>
                                        <Plus size={16} className="text-cyan-600" />
                                      </button>
                                    );
                                  })
                                : programs.map(prog => {
                                    const pName = typeof prog.name === 'string' ? prog.name : (prog.name as any)?.he ?? prog.id;
                                    return (
                                      <button
                                        key={prog.id}
                                        onClick={() => assignProgramToUser(prog)}
                                        disabled={savingLevels}
                                        className="flex items-center justify-between p-3 bg-gray-50 hover:bg-cyan-50 border border-gray-200 hover:border-cyan-300 rounded-lg transition-colors text-right disabled:opacity-50"
                                      >
                                        <div>
                                          <div className="font-bold text-gray-900">{pName}</div>
                                          <div className="text-xs text-gray-500">{prog.id}</div>
                                        </div>
                                        <Plus size={16} className="text-cyan-600" />
                                      </button>
                                    );
                                  })
                              }
                            </div>
                          </div>
                        )}

                        {/* Schedule Days */}
                        {fullProfile.lifestyle?.scheduleDays && fullProfile.lifestyle.scheduleDays.length > 0 ? (
                          <div className="bg-gray-50 border border-gray-200 rounded-xl p-4">
                            <div className="text-sm text-gray-600 mb-3">ימי אימון</div>
                              <div className="flex flex-wrap gap-2">
                                {fullProfile.lifestyle.scheduleDays.map((day, idx) => (
                                  <span
                                    key={idx}
                                    className="w-10 h-10 rounded-2xl bg-[#00E5FF] text-white shadow-lg shadow-[#00E5FF]/30 flex items-center justify-center font-bold text-lg"
                                  >
                                    {day}
                                  </span>
                                ))}
                              </div>
                              {fullProfile.lifestyle.trainingTime && (
                              <div className="mt-3 flex items-center gap-1 text-xs text-gray-600">
                                  <Clock size={12} />
                                  שעה מועדפת: {fullProfile.lifestyle.trainingTime}
                                </div>
                              )}
                            </div>
                        ) : (
                          <div className="bg-gray-50 border border-gray-200 rounded-xl p-4">
                            <div className="text-sm text-gray-600 mb-1">ימי אימון</div>
                            <div className="text-sm text-gray-500 italic">טרם סופק</div>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* 3. Biometrics & Progress */}
                    <div>
                      <h3 className="text-lg font-black text-gray-900 mb-4 flex items-center gap-2">
                        <TrendingUp size={20} className="text-purple-500" />
                        ביומטריה והתקדמות
                      </h3>
                      <div className="grid grid-cols-2 gap-4 mb-4">
                        {((fullProfile.core as any).height) ? (
                          <div className="bg-purple-50 border border-purple-200 rounded-xl p-4">
                            <div className="text-sm text-gray-600 mb-1">גובה</div>
                            <div className="font-bold text-gray-900">{(fullProfile.core as any).height} ס"מ</div>
                          </div>
                        ) : (
                          <div className="bg-gray-50 border border-gray-200 rounded-xl p-4">
                            <div className="text-sm text-gray-600 mb-1">גובה</div>
                            <div className="text-sm text-gray-500 italic">טרם סופק</div>
                          </div>
                        )}
                        <div className="bg-purple-50 border border-purple-200 rounded-xl p-4">
                          <div className="text-sm text-gray-600 mb-1">משקל</div>
                          <div className="font-bold text-gray-900">{fullProfile?.core?.weight || 'טרם סופק'} ק"ג</div>
                        </div>
                        {(() => {
                          // Robust birthDate parsing — handles Date objects, Firestore Timestamps, ISO strings
                          const rawBirthDate = fullProfile?.core?.birthDate;
                          let parsedDate: Date | null = null;
                          if (rawBirthDate) {
                            if (rawBirthDate instanceof Date && !isNaN(rawBirthDate.getTime())) {
                              parsedDate = rawBirthDate;
                            } else if (typeof (rawBirthDate as any)?.toDate === 'function') {
                              parsedDate = (rawBirthDate as any).toDate();
                            } else if (typeof rawBirthDate === 'string') {
                              const d = new Date(rawBirthDate);
                              if (!isNaN(d.getTime())) parsedDate = d;
                            } else if (typeof (rawBirthDate as any)?.seconds === 'number') {
                              parsedDate = new Date((rawBirthDate as any).seconds * 1000);
                            }
                          }
                          return parsedDate ? (
                            <div className="bg-purple-50 border border-purple-200 rounded-xl p-4">
                              <div className="text-sm text-gray-600 mb-1">תאריך לידה</div>
                              <div className="font-bold text-gray-900">
                                {parsedDate.toLocaleDateString('he-IL')}
                              </div>
                            </div>
                          ) : (
                            <div className="bg-gray-50 border border-gray-200 rounded-xl p-4">
                              <div className="text-sm text-gray-600 mb-1">תאריך לידה</div>
                              <div className="text-sm text-gray-500 italic">טרם סופק</div>
                            </div>
                          );
                        })()}
                      </div>
                      
                      {/* Progress Bar — from active program track percent (single source of truth) */}
                      {(() => {
                        const tracks = (fullProfile.progression as any)?.tracks || {};
                        const activeProgId =
                          fullProfile.progression?.activePrograms?.[0]?.templateId ||
                          fullProfile.progression?.activePrograms?.[0]?.id ||
                          Object.keys(tracks)[0];
                        const activeTrack = activeProgId ? tracks[activeProgId] : null;
                        const trackPercent = typeof activeTrack?.percent === 'number' ? activeTrack.percent : 0;
                        const trackLevel = activeTrack?.currentLevel ?? 1;
                        const progName = programs.find(p => p.id === activeProgId)?.name || activeProgId || '—';

                        return (
                          <div className="bg-gray-50 border border-gray-200 rounded-xl p-4">
                            <div className="flex items-center justify-between mb-2">
                              <span className="text-sm text-gray-600">התקדמות לרמה הבאה</span>
                              <span className="text-xs text-gray-400">{progName} • רמה {trackLevel}</span>
                            </div>
                            <div className="flex items-center gap-3">
                              <div className="flex-1 h-3 bg-gray-200 rounded-full overflow-hidden">
                                <div
                                  className="h-full bg-gradient-to-r from-cyan-400 to-blue-500 rounded-full transition-all duration-1000"
                                  style={{ width: `${Math.min(Math.round(trackPercent), 100)}%` }}
                                />
                              </div>
                              <span className="text-sm font-bold text-gray-700 min-w-[3rem] text-left tabular-nums">
                                {Math.round(trackPercent)}%
                              </span>
                            </div>
                          </div>
                        );
                      })()}
                    </div>

                    {/* 4. Equipment Inventory */}
                    <div>
                      <h3 className="text-lg font-black text-gray-900 mb-4 flex items-center gap-2">
                        <Package size={20} className="text-purple-500" />
                        ציוד מפורט
                      </h3>
                      <div className="space-y-3">
                        {(fullProfile?.equipment?.home?.length || 0) > 0 && (
                          <div className="bg-purple-50 border border-purple-200 rounded-xl p-4">
                            <div className="text-sm font-bold text-purple-700 mb-2">ציוד בית</div>
                            <div className="flex flex-wrap gap-2">
                              {getEquipmentNames(fullProfile.equipment.home).map((name, idx) => (
                                <span
                                  key={idx}
                                  className="px-3 py-1.5 bg-white border border-purple-300 text-purple-700 rounded-full text-sm font-medium shadow-sm"
                                >
                                  {name}
                                </span>
                              ))}
                            </div>
                          </div>
                        )}
                        {(fullProfile?.equipment?.office?.length || 0) > 0 && (
                          <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
                            <div className="text-sm font-bold text-blue-700 mb-2">ציוד משרד</div>
                            <div className="flex flex-wrap gap-2">
                              {getEquipmentNames(fullProfile.equipment.office).map((name, idx) => (
                                <span
                                  key={idx}
                                  className="px-3 py-1.5 bg-white border border-blue-300 text-blue-700 rounded-full text-sm font-medium shadow-sm"
                                >
                                  {name}
                                </span>
                              ))}
                            </div>
                          </div>
                        )}
                        {(fullProfile?.equipment?.outdoor?.length || 0) > 0 && (
                          <div className="bg-green-50 border border-green-200 rounded-xl p-4">
                            <div className="text-sm font-bold text-green-700 mb-2">ציוד חוץ</div>
                            <div className="flex flex-wrap gap-2">
                              {getEquipmentNames(fullProfile.equipment.outdoor).map((name, idx) => (
                                <span
                                  key={idx}
                                  className="px-3 py-1.5 bg-white border border-green-300 text-green-700 rounded-full text-sm font-medium shadow-sm"
                                >
                                  {name}
                                </span>
                              ))}
                            </div>
                          </div>
                        )}
                        {fullProfile?.core?.hasGymAccess && (
                          <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
                            <div className="flex items-center gap-2">
                              <CheckCircle2 size={18} className="text-amber-600" />
                              <span className="text-sm font-bold text-amber-700">גישה לחדר כושר</span>
                            </div>
                          </div>
                        )}
                        {(fullProfile?.equipment?.home?.length || 0) === 0 && 
                         (fullProfile?.equipment?.office?.length || 0) === 0 &&
                         (fullProfile?.equipment?.outdoor?.length || 0) === 0 &&
                         !fullProfile?.core?.hasGymAccess && (
                          <div className="text-gray-500 text-sm bg-gray-50 rounded-xl p-4 text-center">
                            אין ציוד רשום
                          </div>
                        )}
                      </div>
                    </div>

                    {/* 4.5 Sports & Location Preferences (BI) */}
                    {(() => {
                      const oa = (fullProfile as any).onboardingAnswers;
                      const prefLocation: string[] | undefined = oa?.preferredLocation;
                      const prefSports: string[] | undefined = oa?.preferredSports || oa?.sportsPreferences;
                      if (!prefLocation?.length && !prefSports?.length) return null;

                      // Human-readable location labels
                      const LOCATION_LABELS: Record<string, { he: string; icon: string }> = {
                        studio: { he: 'סטודיו / חוגים', icon: '🏢' },
                        park:   { he: 'גינת כושר', icon: '🌳' },
                        home:   { he: 'אימון ביתי', icon: '🏠' },
                        gym:    { he: 'חדר כושר', icon: '🏋️' },
                        none:   { he: 'אחר', icon: '✨' },
                      };

                      // Human-readable sport labels
                      const SPORT_LABELS: Record<string, string> = {
                        running: 'ריצה',
                        walking: 'הליכה',
                        cycling: 'אופניים',
                        calisthenics: 'קליסטניקס',
                        crossfit: 'קרוספיט',
                        functional: 'אימון פונקציונלי',
                        movement: 'מובמנט',
                        basketball: 'כדורסל',
                        football: 'כדורגל',
                        tennis_padel: 'טניס ופאדל',
                        yoga: 'יוגה',
                        pilates: 'פילאטיס',
                        stretching: 'מתיחות',
                        boxing: 'איגרוף',
                        kickboxing: 'קיקבוקסינג',
                        mma: 'MMA',
                        jiu_jitsu: 'ג\'יו ג\'יטסו',
                        climbing: 'טיפוס',
                        hiking: 'הליכות שטח',
                        strength: 'כוח',
                        cardio: 'קרדיו',
                      };

                      return (
                        <div>
                          <h3 className="text-lg font-black text-gray-900 mb-4 flex items-center gap-2">
                            <Dumbbell size={20} className="text-blue-500" />
                            העדפות ספורט ומיקום
                          </h3>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {/* Preferred Locations */}
                            {prefLocation && prefLocation.length > 0 && (
                              <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
                                <div className="text-sm font-bold text-blue-700 mb-3">מיקום אימון מועדף</div>
                                <div className="flex flex-wrap gap-2">
                                  {prefLocation.map((loc, idx) => {
                                    const info = LOCATION_LABELS[loc] || { he: loc, icon: '📍' };
                                    return (
                                      <span
                                        key={idx}
                                        className="px-3 py-1.5 bg-white border border-blue-300 text-blue-700 rounded-full text-sm font-medium shadow-sm flex items-center gap-1.5"
                                      >
                                        <span>{info.icon}</span>
                                        <span>{info.he}</span>
                                      </span>
                                    );
                                  })}
                                </div>
                              </div>
                            )}

                            {/* Preferred Sports (ranked) */}
                            {prefSports && prefSports.length > 0 && (
                              <div className="bg-purple-50 border border-purple-200 rounded-xl p-4">
                                <div className="text-sm font-bold text-purple-700 mb-3">ענפי ספורט (לפי סדר העדפה)</div>
                                <div className="flex flex-wrap gap-2">
                                  {prefSports.map((sport, idx) => (
                                    <span
                                      key={idx}
                                      className="px-3 py-1.5 bg-white border border-purple-300 text-purple-700 rounded-full text-sm font-medium shadow-sm flex items-center gap-1.5"
                                    >
                                      <span className="bg-purple-200 text-purple-800 text-xs w-5 h-5 rounded-full flex items-center justify-center font-bold">
                                        {idx + 1}
                                      </span>
                                      <span>{SPORT_LABELS[sport] || sport}</span>
                                    </span>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                        </div>
                      );
                    })()}

                    {/* 5. Legal & Compliance */}
                    <div>
                      <h3 className="text-lg font-black text-gray-900 mb-4 flex items-center gap-2">
                        <Shield size={20} className="text-green-500" />
                        הצהרות וחתימות
                      </h3>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {/* Health Declaration Status */}
                        {(() => {
                          const healthAccepted = (fullProfile as any).healthDeclarationAccepted === true;
                          const pdfUrl = healthDeclarationPdfUrl;
                          const hasInjuries = fullProfile.health?.injuries && fullProfile.health.injuries.length > 0;
                          return (
                            <div className={`rounded-xl p-5 border-2 ${
                              healthAccepted
                                ? hasInjuries
                                  ? 'bg-yellow-50 border-yellow-300'
                                  : 'bg-green-50 border-green-300'
                                : 'bg-gray-50 border-gray-300'
                            }`}>
                              <div className="flex items-center justify-between mb-3">
                                <span className="text-base font-black text-gray-900">הצהרת בריאות</span>
                                {healthAccepted ? (
                                  hasInjuries ? (
                                    <div className="flex items-center gap-2 text-yellow-700">
                                      <AlertCircle size={24} className="text-yellow-600" />
                                      <span className="font-bold">חתום</span>
                                    </div>
                                  ) : (
                                    <div className="flex items-center gap-2 text-green-700">
                                      <CheckCircle2 size={24} className="text-green-600" />
                                      <span className="font-bold">חתום</span>
                                    </div>
                                  )
                                ) : (
                                  <div className="flex items-center gap-2 text-gray-500">
                                    <X size={24} className="text-gray-400" />
                                    <span className="font-bold">לא חתום</span>
                                  </div>
                                )}
                              </div>
                              <div className="text-sm text-gray-700 mt-2">
                                {healthAccepted
                                  ? hasInjuries
                                    ? `⚠ יש ${fullProfile.health!.injuries.length} פציעות/בעיות רשומות`
                                    : '✓ הושלם - ללא בעיות רפואיות'
                                  : 'לא הושלם'}
                              </div>
                              {hasInjuries && (
                                <div className="mt-3 flex flex-wrap gap-1">
                                  {fullProfile.health!.injuries.map((injury, idx) => (
                                    <span
                                      key={idx}
                                      className="px-2 py-1 bg-yellow-100 text-yellow-800 rounded text-xs font-medium"
                                    >
                                      {injury}
                                    </span>
                                  ))}
                                </div>
                              )}
                              {/* View Signed PDF Button */}
                              {pdfUrl && (
                                <a
                                  href={pdfUrl}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="mt-3 inline-flex items-center gap-2 px-4 py-2 bg-[#5BC2F2] hover:bg-[#4AADE3] text-white rounded-lg text-sm font-bold transition-colors"
                                >
                                  <FileText size={16} />
                                  <span>צפה בהצהרה חתומה (PDF)</span>
                                  <ExternalLink size={14} />
                                </a>
                              )}
                            </div>
                          );
                        })()}

                        {/* Terms of Use Status */}
                        {(() => {
                          const hasSignedTerms = (fullProfile as any).healthTermsAccepted === true;
                          const healthTimestamp = (fullProfile as any).healthTimestamp as string | undefined;
                          const termsVersion = (fullProfile as any).termsVersion as string | undefined;
                          return (
                            <div className={`rounded-xl p-5 border-2 ${
                              hasSignedTerms
                                ? 'bg-green-50 border-green-300'
                                : 'bg-gray-50 border-gray-300'
                            }`}>
                              <div className="flex items-center justify-between mb-3">
                                <span className="text-base font-black text-gray-900">תנאי שימוש</span>
                                {hasSignedTerms ? (
                                  <div className="flex items-center gap-2 text-green-700">
                                    <CheckCircle2 size={24} className="text-green-600" />
                                    <span className="font-bold">חתום</span>
                                  </div>
                                ) : (
                                  <div className="flex items-center gap-2 text-gray-500">
                                    <X size={24} className="text-gray-400" />
                                    <span className="font-bold">לא חתום</span>
                                  </div>
                                )}
                              </div>
                              <div className="text-sm text-gray-700 mt-2">
                                {hasSignedTerms
                                  ? '✓ הושלם - חתום ואושר'
                                  : 'לא הושלם'}
                              </div>
                              {hasSignedTerms && (
                                <div className="mt-3 space-y-1">
                                  {healthTimestamp && (
                                    <div className="text-xs text-gray-600">
                                      תאריך חתימה: {new Date(healthTimestamp).toLocaleDateString('he-IL')}
                                    </div>
                                  )}
                                  {termsVersion && (
                                    <div className="text-xs text-gray-500">
                                      גרסת תנאים: v{termsVersion}
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                          );
                        })()}
                      </div>
                    </div>

                    {/* 8. Active Running Program */}
                    <div>
                      <h3 className="text-lg font-black text-gray-900 mb-4 flex items-center gap-2">
                        <Footprints size={20} className="text-[#5BC2F2]" />
                        תוכנית ריצה פעילה
                      </h3>
                      {fullProfile.running?.activeProgram ? (() => {
                        const prog = fullProfile.running.activeProgram;
                        const schedule = Array.isArray((prog as any).schedule) ? (prog as any).schedule as Array<{
                          week: number;
                          day: number;
                          workoutId: string;
                          status: string;
                          category?: string;
                          workoutName?: string;
                        }> : [];
                        const STATUS_LABELS: Record<string, { label: string; color: string }> = {
                          pending: { label: 'ממתין', color: 'bg-gray-100 text-gray-700' },
                          completed: { label: 'הושלם', color: 'bg-green-100 text-green-700' },
                          skipped: { label: 'דולג', color: 'bg-yellow-100 text-yellow-700' },
                          swapped: { label: 'הוחלף', color: 'bg-blue-100 text-blue-700' },
                        };
                        const weekGroups = schedule.reduce<Record<number, typeof schedule>>((acc, item) => {
                          (acc[item.week] ??= []).push(item);
                          return acc;
                        }, {});

                        return (
                          <div className="space-y-4">
                            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                              <div className="bg-gray-50 rounded-xl p-4">
                                <div className="text-xs text-gray-500 mb-1">מזהה תוכנית</div>
                                <div className="font-bold text-sm text-gray-900 break-all">{(prog as any).programId ?? '—'}</div>
                              </div>
                              <div className="bg-gray-50 rounded-xl p-4">
                                <div className="text-xs text-gray-500 mb-1">שבוע נוכחי</div>
                                <div className="font-black text-2xl text-[#5BC2F2]">{(prog as any).currentWeek ?? '—'}</div>
                              </div>
                              <div className="bg-gray-50 rounded-xl p-4">
                                <div className="text-xs text-gray-500 mb-1">תאריך התחלה</div>
                                <div className="font-bold text-sm text-gray-900">
                                  {(prog as any).startDate
                                    ? new Date((prog as any).startDate).toLocaleDateString('he-IL')
                                    : '—'}
                                </div>
                              </div>
                            </div>

                            {schedule.length > 0 ? (
                              <div className="border rounded-xl overflow-hidden">
                                <div className="max-h-[400px] overflow-y-auto">
                                  <table className="w-full text-sm" dir="rtl">
                                    <thead className="bg-gray-50 sticky top-0">
                                      <tr>
                                        <th className="px-3 py-2 text-right font-bold text-gray-700">שבוע</th>
                                        <th className="px-3 py-2 text-right font-bold text-gray-700">יום</th>
                                        <th className="px-3 py-2 text-right font-bold text-gray-700">אימון</th>
                                        <th className="px-3 py-2 text-right font-bold text-gray-700">סטטוס</th>
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {Object.entries(weekGroups)
                                        .sort(([a], [b]) => Number(a) - Number(b))
                                        .map(([week, items]) =>
                                          items
                                            .sort((a, b) => a.day - b.day)
                                            .map((entry, idx) => {
                                              const st = STATUS_LABELS[entry.status] ?? { label: entry.status, color: 'bg-gray-100 text-gray-600' };
                                              const isCurrent = Number(week) === (prog as any).currentWeek;
                                              return (
                                                <tr
                                                  key={`${week}-${entry.day}-${idx}`}
                                                  className={`border-t ${isCurrent ? 'bg-blue-50/40' : ''}`}
                                                >
                                                  {idx === 0 ? (
                                                    <td
                                                      rowSpan={items.length}
                                                      className={`px-3 py-2 font-bold text-gray-900 align-top ${isCurrent ? 'text-[#5BC2F2]' : ''}`}
                                                    >
                                                      {week}{isCurrent ? ' ←' : ''}
                                                    </td>
                                                  ) : null}
                                                  <td className="px-3 py-2 text-gray-700">{entry.day}</td>
                                                  <td className="px-3 py-2 text-gray-700">
                                                    <div className="font-medium">{entry.workoutName || entry.workoutId}</div>
                                                    {entry.category && (
                                                      <div className="text-xs text-gray-400 mt-0.5">{entry.category}</div>
                                                    )}
                                                  </td>
                                                  <td className="px-3 py-2">
                                                    <span className={`px-2 py-0.5 rounded-full text-xs font-bold ${st.color}`}>
                                                      {st.label}
                                                    </span>
                                                  </td>
                                                </tr>
                                              );
                                            })
                                        )}
                                    </tbody>
                                  </table>
                                </div>
                                <div className="bg-gray-50 px-3 py-2 text-xs text-gray-500 border-t">
                                  סה״כ {schedule.length} אימונים ב-{Object.keys(weekGroups).length} שבועות
                                </div>
                              </div>
                            ) : (
                              <div className="text-sm text-gray-500 bg-gray-50 rounded-xl p-4">
                                לוח אימונים ריק — לא נוצרו אימונים בתוכנית.
                              </div>
                            )}
                          </div>
                        );
                      })() : (
                        <div className="bg-gray-50 rounded-xl p-6 text-center">
                          <Footprints size={32} className="mx-auto text-gray-300 mb-2" />
                          <div className="text-sm text-gray-500 font-medium">
                            לא נוצרה תוכנית ריצה פעילה
                          </div>
                          <div className="text-xs text-gray-400 mt-1">
                            No active running program generated
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Stats Tab */}
                {activeTab === 'stats' && fullProfile && (
                  <div className="space-y-6">
                    {syncMessage && (
                      <div className="bg-green-50 border border-green-200 rounded-xl p-3 text-sm text-green-700 font-bold flex items-center gap-2">
                        <CheckCircle2 size={16} />
                        {syncMessage}
                      </div>
                    )}
                    <div>
                      <div className="flex items-center justify-between mb-4">
                        <h3 className="text-lg font-black text-gray-900">רמות נוכחיות (Domains)</h3>
                        {!editingDomains ? (
                          <div className="flex gap-2">
                            {/* Clean legacy / duplicate activePrograms entries */}
                            <button
                              onClick={cleanLegacyActivePrograms}
                              disabled={savingLevels || cleaningLegacy}
                              className="flex items-center gap-1 px-3 py-1.5 text-sm font-bold text-orange-600 bg-orange-50 hover:bg-orange-100 rounded-lg transition-colors disabled:opacity-40"
                              title="הסר רשומות activePrograms ישנות באנגלית וכפילויות"
                            >
                              <Shuffle size={14} />
                              {cleaningLegacy ? 'מנקה...' : 'נקה Legacy'}
                            </button>
                            {/* Randomize: random L1-15 + 0-100% for every non-master domain */}
                            <button
                              onClick={() => {
                                const tracks = (fullProfile.progression as any)?.tracks as Record<string, { currentLevel?: number; percent?: number }> | undefined;
                                const domains = (fullProfile.progression as any)?.domains as Record<string, { currentLevel?: number }> | undefined;
                                const allKeys = new Set([
                                  ...Object.keys(domains ?? {}),
                                  ...Object.keys(tracks ?? {}),
                                ]);
                                const randomLevels: Record<string, number> = {};
                                const randomPcts: Record<string, number> = {};
                                for (const k of allKeys) {
                                  const isMasterKey = programs.find(p => p.id === k)?.isMaster === true;
                                  if (!isMasterKey) {
                                    randomLevels[k] = Math.floor(Math.random() * 15) + 1;
                                    randomPcts[k] = Math.floor(Math.random() * 101);
                                  }
                                }
                                setEditLevels(randomLevels);
                                setEditPercents(randomPcts);
                                setEditingDomains(true);
                              }}
                              className="flex items-center gap-1 px-3 py-1.5 text-sm font-bold text-purple-600 bg-purple-50 hover:bg-purple-100 rounded-lg transition-colors"
                            >
                              <Shuffle size={14} />
                              ערבב
                            </button>
                            <button
                              onClick={() => {
                                const tracks = (fullProfile.progression as any)?.tracks as Record<string, { currentLevel?: number; percent?: number }> | undefined;
                                const domains = (fullProfile.progression as any)?.domains as Record<string, { currentLevel?: number }> | undefined;
                                const merged: Record<string, number> = {};
                                const mergedPcts: Record<string, number> = {};
                                if (domains) {
                                  for (const [k, v] of Object.entries(domains)) {
                                    const trackLevel = tracks?.[k]?.currentLevel ?? 0;
                                    merged[k] = Math.max(v?.currentLevel ?? 0, trackLevel);
                                  }
                                }
                                if (tracks) {
                                  for (const [k, v] of Object.entries(tracks)) {
                                    if (!merged[k]) merged[k] = v?.currentLevel ?? 0;
                                    mergedPcts[k] = (v as any)?.percent ?? 0;
                                  }
                                }
                                setEditLevels(merged);
                                setEditPercents(mergedPcts);
                                setEditingDomains(true);
                              }}
                              className="flex items-center gap-1 px-3 py-1.5 text-sm font-bold text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-lg transition-colors"
                            >
                              <Edit3 size={14} />
                              ערוך
                            </button>
                          </div>
                        ) : (
                          <div className="flex gap-2">
                            <button
                              onClick={() => { setEditingDomains(false); setEditPercents({}); }}
                              className="px-3 py-1.5 text-sm font-bold text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-lg"
                            >
                              ביטול
                            </button>
                            <button
                              disabled={savingLevels}
                              onClick={() => saveManualLevelOverrides(editLevels, 'both', editPercents)}
                              className="flex items-center gap-1 px-3 py-1.5 text-sm font-bold text-white bg-green-500 hover:bg-green-600 rounded-lg disabled:opacity-50"
                            >
                              <Save size={14} />
                              {savingLevels ? 'שומר...' : 'שמור'}
                            </button>
                          </div>
                        )}
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        {(() => {
                          const tracks = (fullProfile.progression as any)?.tracks as Record<string, { currentLevel?: number; maxLevel?: number }> | undefined;
                          const domains = (fullProfile.progression as any)?.domains as Record<string, { currentLevel?: number; maxLevel?: number }> | undefined;

                          // Build set of IDs that belong to the user's active programs
                          const activeProgramIds = new Set<string>();
                          for (const ap of fullProfile.progression?.activePrograms ?? []) {
                            const tid = ap.templateId || ap.id;
                            if (tid) activeProgramIds.add(tid);
                            const prog = programs.find(p => p.id === tid);
                            if (prog?.subPrograms) prog.subPrograms.forEach(s => activeProgramIds.add(s));
                          }

                          const allKeys = new Set([
                            ...Object.keys(domains ?? {}),
                            ...Object.keys(tracks ?? {}),
                          ]);

                          // Filter: only show domains where level > 1 OR belonging to active programs
                          const relevantKeys = Array.from(allKeys).filter(key => {
                            const domainLevel = domains?.[key]?.currentLevel ?? 0;
                            const trackLevel = tracks?.[key]?.currentLevel ?? 0;
                            const effectiveLevel = Math.max(domainLevel, trackLevel);
                            return effectiveLevel > 1 || activeProgramIds.has(key);
                          });

                          if (relevantKeys.length === 0) {
                            return <div className="col-span-2 text-gray-500 text-sm">אין רמות רשומות</div>;
                          }
                          return relevantKeys.map(domain => {
                            const domainLevel = domains?.[domain]?.currentLevel ?? 0;
                            const trackLevel = tracks?.[domain]?.currentLevel ?? 0;
                            const effectiveLevel = Math.max(domainLevel, trackLevel);
                            const maxLevel = domains?.[domain]?.maxLevel ?? tracks?.[domain]?.maxLevel ?? 25;
                            const currentPct = (tracks?.[domain] as any)?.percent ?? 0;
                            const isDesynced = domainLevel > 0 && trackLevel > 0 && domainLevel !== trackLevel;
                            const prog = programs.find(p => p.id === domain);
                            const isMaster = prog?.isMaster === true;
                            const displayName = prog?.name
                              ? (typeof prog.name === 'string' ? prog.name : (prog.name as any)?.he ?? domain)
                              : domain;
                            return (
                              <div key={domain} className={`rounded-xl p-4 ${isDesynced ? 'bg-amber-50 border border-amber-200' : 'bg-gray-50'}`}>
                                <div className="flex items-center gap-2 text-sm text-gray-500 mb-2">
                                  <span className="text-[#5BC2F2]">{getProgramIcon(resolveIconKey(domain), 'w-4 h-4')}</span>
                                  {displayName}
                                  {isMaster && <span className="text-xs text-gray-400">(נגזר)</span>}
                                </div>
                                {editingDomains && !isMaster ? (
                                  <div className="space-y-2">
                                    <div className="flex items-center gap-2">
                                      <span className="text-xs text-gray-400 w-10">רמה</span>
                                      <input
                                        type="number"
                                        min={1}
                                        max={maxLevel}
                                        value={editLevels[domain] ?? effectiveLevel}
                                        onChange={e => setEditLevels(prev => ({ ...prev, [domain]: parseInt(e.target.value) || 1 }))}
                                        className="w-20 px-2 py-1 text-lg font-black text-[#5BC2F2] border-2 border-blue-300 rounded-lg focus:outline-none focus:border-blue-500"
                                      />
                                    </div>
                                    <div className="flex items-center gap-2">
                                      <span className="text-xs text-gray-400 w-10">אחוז</span>
                                      <input
                                        type="number"
                                        min={0}
                                        max={100}
                                        value={editPercents[domain] ?? currentPct}
                                        onChange={e => setEditPercents(prev => ({ ...prev, [domain]: Math.min(100, Math.max(0, parseInt(e.target.value) || 0)) }))}
                                        className="w-20 px-2 py-1 text-lg font-black text-purple-600 border-2 border-purple-300 rounded-lg focus:outline-none focus:border-purple-500"
                                      />
                                    </div>
                                  </div>
                                ) : (
                                  <div>
                                    <div className="font-black text-2xl text-[#5BC2F2]">
                                      רמה {effectiveLevel}
                                    </div>
                                    <div className="mt-1">
                                      <div className="flex items-center gap-2">
                                        <div className="flex-1 bg-gray-200 rounded-full h-1.5">
                                          <div
                                            className="bg-[#5BC2F2] h-1.5 rounded-full transition-all"
                                            style={{ width: `${Math.min(100, currentPct)}%` }}
                                          />
                                        </div>
                                        <span className="text-xs text-gray-500 font-medium w-9 text-left">{currentPct}%</span>
                                      </div>
                                    </div>
                                  </div>
                                )}
                                <div className="text-xs text-gray-400 mt-1">מתוך {maxLevel}</div>
                                {isDesynced && !editingDomains && (
                                  <div className="text-xs text-amber-600 mt-1 font-medium">
                                    ⚠ domain={domainLevel} track={trackLevel}
                                  </div>
                                )}
                              </div>
                            );
                          });
                        })()}
                      </div>
                    </div>

                    {/* ── Active Programs ─────────────────────────────── */}
                    <div>
                      <div className="flex items-center justify-between mb-4">
                        <h3 className="text-lg font-black text-gray-900">תוכניות פעילות</h3>
                        <button
                          onClick={() => setShowProgramPicker(true)}
                          className="flex items-center gap-1 px-3 py-1.5 text-sm font-bold text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-lg transition-colors"
                        >
                          <Plus size={14} />
                          הוסף
                        </button>
                      </div>
                      {(fullProfile.progression?.activePrograms ?? []).length === 0 ? (
                        <div className="bg-gray-50 rounded-xl p-4 text-sm text-gray-500 text-center">
                          אין תוכניות פעילות
                        </div>
                      ) : (
                        <div className="space-y-2">
                          {(fullProfile.progression?.activePrograms ?? []).map((ap, idx) => {
                            const tid = ap.templateId || ap.id;
                            const prog = programs.find(p => p.id === tid);
                            const name = prog?.name
                              ? (typeof prog.name === 'string' ? prog.name : (prog.name as any)?.he ?? tid)
                              : (ap.name || tid);
                            const tracks = (fullProfile.progression as any)?.tracks as Record<string, { currentLevel?: number }> | undefined;
                            const level = tracks?.[tid]?.currentLevel ?? (fullProfile.progression as any)?.domains?.[tid]?.currentLevel ?? '—';
                            return (
                              <div key={idx} className="flex items-center justify-between bg-gray-50 rounded-xl px-4 py-3">
                                <div className="flex items-center gap-3">
                                  <span className="text-[#5BC2F2]">
                                    {getProgramIcon(resolveIconKey(tid), 'w-5 h-5')}
                                  </span>
                                  <div>
                                    <div className="font-bold text-sm text-gray-900">{name}</div>
                                    <div className="text-xs text-gray-500">
                                      {tid} · רמה {level}
                                    </div>
                                  </div>
                                </div>
                                <button
                                  disabled={savingLevels}
                                  onClick={() => removeActiveProgram(tid)}
                                  className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-40"
                                  title="הסר תוכנית"
                                >
                                  <X size={16} />
                                </button>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>

                    <div>
                      <h3 className="text-lg font-black text-gray-900 mb-4">כלכלה</h3>
                      <div className="bg-gradient-to-br from-yellow-50 to-yellow-100 rounded-xl p-6">
                        <div className="flex items-center gap-3 mb-2">
                          <Coins size={24} className="text-yellow-600" />
                          <div className="text-sm text-gray-600">מטבעות</div>
                        </div>
                        <div className="font-black text-4xl text-yellow-700">
                          {fullProfile?.progression?.coins || 0}
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Progression Details Tab */}
                {activeTab === 'progression' && fullProfile && (
                  <div className="space-y-6">
                    {/* Global XP & Lemur */}
                    <div>
                      <h3 className="text-lg font-black text-gray-900 mb-4">XP והתפתחות למור</h3>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                        <div className="bg-blue-50 rounded-xl p-4 text-center">
                          <p className="text-xs text-blue-600 font-medium">Global XP</p>
                          <p className="text-2xl font-black text-blue-700">{fullProfile.progression?.globalXP ?? 0}</p>
                        </div>
                        <div className="bg-purple-50 rounded-xl p-4 text-center">
                          <p className="text-xs text-purple-600 font-medium">Lemur Stage</p>
                          <p className="text-2xl font-black text-purple-700">{(fullProfile.progression as any)?.lemurStage ?? 0}</p>
                        </div>
                        <div className="bg-green-50 rounded-xl p-4 text-center">
                          <p className="text-xs text-green-600 font-medium">ימים פעילים</p>
                          <p className="text-2xl font-black text-green-700">{(fullProfile.progression as any)?.daysActive ?? 0}</p>
                        </div>
                        <div className="bg-orange-50 rounded-xl p-4 text-center">
                          <p className="text-xs text-orange-600 font-medium">רצף נוכחי</p>
                          <p className="text-2xl font-black text-orange-700">{(fullProfile.progression as any)?.currentStreak ?? 0}</p>
                        </div>
                      </div>
                    </div>

                    {/* Economy — Phase B (04.10.2026). Coins balance already
                        lives on the table row (user.coins); the two trend
                        numbers here are new, derived from workoutHistory
                        (already fetched, up to 50 most recent) — no new
                        Firestore read. */}
                    <div>
                      <h3 className="text-lg font-black text-gray-900 mb-4 flex items-center gap-2">
                        <Coins size={20} className="text-yellow-500" />
                        כלכלה
                      </h3>
                      <div className="grid grid-cols-3 gap-3">
                        <div className="bg-yellow-50 rounded-xl p-4 text-center">
                          <p className="text-xs text-yellow-700 font-medium">יתרת מטבעות</p>
                          <p className="text-2xl font-black text-yellow-800">{user?.coins ?? fullProfile.progression?.coins ?? 0}</p>
                        </div>
                        <div className="bg-yellow-50 rounded-xl p-4 text-center">
                          <p className="text-xs text-yellow-700 font-medium">הורווחו ב-7 ימים</p>
                          <p className="text-2xl font-black text-yellow-800">
                            {workoutHistory
                              .filter((w) => Date.now() - w.date.getTime() <= 7 * 86_400_000)
                              .reduce((sum, w) => sum + (w.earnedCoins || 0), 0)}
                          </p>
                        </div>
                        <div className="bg-yellow-50 rounded-xl p-4 text-center">
                          <p className="text-xs text-yellow-700 font-medium">ממוצע לאימון (50 אחרונים)</p>
                          <p className="text-2xl font-black text-yellow-800">
                            {workoutHistory.length > 0
                              ? Math.round(workoutHistory.reduce((sum, w) => sum + (w.earnedCoins || 0), 0) / workoutHistory.length)
                              : 0}
                          </p>
                        </div>
                      </div>
                    </div>

                    {/* Program Hierarchy — Phase B (04.10.2026), read-only.
                        Adds a clearer אב→בן view of the SAME tracks data the
                        editable "Program Tracks" list below already shows —
                        extends, doesn't replace that editor. See
                        buildProgramHierarchy()'s own comment for why this is
                        a 2-level tree (master→children), not 3 — the design
                        reference's skill-under-domain nesting isn't backed
                        by a real stored relationship in this data model. */}
                    <div>
                      <h3 className="text-lg font-black text-gray-900 mb-4">היררכיית תוכניות</h3>
                      {(() => {
                        const hierarchy = buildProgramHierarchy(fullProfile, programs);
                        if (hierarchy.length === 0) {
                          return <p className="text-gray-500 text-sm">אין תוכניות פעילות</p>;
                        }
                        return (
                          <div className="space-y-3">
                            {hierarchy.map((master) => (
                              <div key={master.idOrSlug} className="bg-cyan-50 border border-cyan-200 rounded-xl p-4">
                                <div className="flex items-center justify-between">
                                  <p className="font-black text-cyan-900 flex items-center gap-2">
                                    <span className="text-[10px] font-bold text-cyan-500 bg-white px-1.5 py-0.5 rounded">אב</span>
                                    {!master.resolved && <span title={`לא זוהה: ${master.idOrSlug}`}><AlertCircle size={14} className="text-amber-500" /></span>}
                                    {master.name}
                                  </p>
                                  <span className="px-3 py-1 bg-cyan-600 text-white rounded-full text-sm font-bold">רמה {master.level}</span>
                                </div>
                                {master.children.length > 0 && (
                                  <div className="mt-3 mr-6 space-y-1.5 border-r-2 border-cyan-200 pr-3">
                                    {master.children.map((child) => (
                                      <div key={child.idOrSlug} className="flex items-center justify-between bg-white rounded-lg px-3 py-2">
                                        <p className="text-sm font-bold text-gray-800 flex items-center gap-1.5">
                                          <span className="text-[10px] font-bold text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded">בן</span>
                                          {!child.resolved && <span title={`לא זוהה: ${child.idOrSlug}`}><AlertCircle size={12} className="text-amber-500" /></span>}
                                          {child.name}
                                        </p>
                                        <span className="px-2 py-0.5 bg-blue-100 text-blue-800 rounded-full text-xs font-bold">רמה {child.level}</span>
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                        );
                      })()}
                      {/* Skills tracked but not covered by a static master's
                          children (e.g. front_lever/planche progress for a
                          full_body/upper_body enrollee, whose static children
                          are strictly the 4/2 domains) — surfaced flat rather
                          than silently dropped. */}
                      {(() => {
                        const hierarchy = buildProgramHierarchy(fullProfile, programs);
                        const tracks = (fullProfile.progression as any)?.tracks as Record<string, { currentLevel?: number }> | undefined;
                        if (!tracks) return null;
                        const coveredKeys = new Set<string>();
                        hierarchy.forEach((m) => {
                          coveredKeys.add(m.idOrSlug);
                          m.children.forEach((c) => coveredKeys.add(c.idOrSlug));
                        });
                        const extraSkills = Object.entries(tracks)
                          .filter(([key, v]) => (v?.currentLevel ?? 0) > 0 && !coveredKeys.has(key))
                          .map(([key]) => ({ key, ...programDisplayName(key, programs), level: getTrackLevel(key, tracks, programs) }));
                        if (extraSkills.length === 0) return null;
                        return (
                          <div className="mt-3">
                            <p className="text-xs text-gray-500 font-bold mb-2">סקילים נוספים במעקב (לא תחת תוכנית אב סטטית)</p>
                            <div className="flex flex-wrap gap-2">
                              {extraSkills.map((s) => (
                                <span key={s.key} className="px-3 py-1.5 bg-purple-50 border border-purple-200 text-purple-800 rounded-lg text-xs font-bold flex items-center gap-1.5">
                                  {!s.resolved && <span title={`לא זוהה: ${s.raw}`}><AlertCircle size={11} className="text-amber-500" /></span>}
                                  {s.name} · רמה {s.level}
                                </span>
                              ))}
                            </div>
                          </div>
                        );
                      })()}
                    </div>

                    {/* Program Tracks */}
                    <div>
                      <div className="flex items-center justify-between mb-4">
                        <h3 className="text-lg font-black text-gray-900">מסלולי תוכנית (Tracks)</h3>
                        {!editingTracks ? (
                          <button
                            onClick={() => {
                              const tracks = (fullProfile.progression as any)?.tracks as Record<string, { currentLevel?: number }> | undefined;
                              const levels: Record<string, number> = {};
                              if (tracks) {
                                for (const [k, v] of Object.entries(tracks)) {
                                  levels[k] = v?.currentLevel ?? 1;
                                }
                              }
                              setEditTrackLevels(levels);
                              setEditingTracks(true);
                            }}
                            className="flex items-center gap-1 px-3 py-1.5 text-sm font-bold text-blue-600 bg-blue-50 hover:bg-blue-100 rounded-lg transition-colors"
                          >
                            <Edit3 size={14} />
                            ערוך
                          </button>
                        ) : (
                          <div className="flex gap-2">
                            <button
                              onClick={() => setEditingTracks(false)}
                              className="px-3 py-1.5 text-sm font-bold text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-lg"
                            >
                              ביטול
                            </button>
                            <button
                              disabled={savingLevels}
                              onClick={() => saveManualLevelOverrides(editTrackLevels, 'both')}
                              className="flex items-center gap-1 px-3 py-1.5 text-sm font-bold text-white bg-green-500 hover:bg-green-600 rounded-lg disabled:opacity-50"
                            >
                              <Save size={14} />
                              {savingLevels ? 'שומר...' : 'שמור'}
                            </button>
                          </div>
                        )}
                      </div>
                      {syncMessage && activeTab === 'progression' && (
                        <div className="bg-green-50 border border-green-200 rounded-xl p-3 text-sm text-green-700 font-bold flex items-center gap-2 mb-3">
                          <CheckCircle2 size={16} />
                          {syncMessage}
                        </div>
                      )}
                      {(fullProfile.progression as any)?.tracks && Object.keys((fullProfile.progression as any).tracks).length > 0 ? (
                        <div className="space-y-2">
                          {Object.entries((fullProfile.progression as any).tracks).map(([programId, track]: [string, any]) => {
                            const prog = programs.find(p => p.id === programId);
                            const isMaster = prog?.isMaster === true;
                            const pName = prog?.name
                              ? (typeof prog.name === 'string' ? prog.name : (prog.name as any)?.he ?? programId)
                              : programId;

                            // For master programs, derive level from child tracks.
                            // full_body: Avg(push, pull, legs) — core excluded, capped at 15.
                            const MASTER_EXCLUDED_DISPLAY: Record<string, string[]> = { full_body: ['core'] };
                            const MASTER_CAP_DISPLAY: Record<string, number> = { full_body: 15 };
                            let displayLevel = track?.currentLevel ?? 0;
                            if (isMaster && prog?.subPrograms?.length) {
                              const allTracks = (fullProfile.progression as any)?.tracks as Record<string, { currentLevel?: number }> | undefined;
                              const excludedSubs = MASTER_EXCLUDED_DISPLAY[programId] ?? [];
                              const childLevels = prog.subPrograms
                                .filter(s => !excludedSubs.includes(s))
                                .map(s => allTracks?.[s]?.currentLevel ?? 0)
                                .filter(l => l > 0);
                              if (childLevels.length > 0) {
                                const cap = MASTER_CAP_DISPLAY[programId] ?? Infinity;
                                displayLevel = Math.min(cap, Math.round(childLevels.reduce((a, b) => a + b, 0) / childLevels.length));
                              }
                            }

                            return (
                              <div key={programId} className={`rounded-xl p-4 flex items-center justify-between ${isMaster ? 'bg-cyan-50 border border-cyan-200' : 'bg-gray-50'}`}>
                                <div>
                                  <p className="font-bold text-gray-900 flex items-center gap-2">
                                    <span className="text-[#5BC2F2]">{getProgramIcon(resolveIconKey(programId), 'w-5 h-5')}</span>
                                    {pName}
                                    {isMaster && <span className="text-xs font-medium text-cyan-600 mr-2">(תוכנית ראשית)</span>}
                                  </p>
                                  <p className="text-xs text-gray-500">ID: {programId}</p>
                                  {isMaster && editingTracks && (
                                    <p className="text-xs text-cyan-600 mt-1">ממוצע מסלולים — לא ניתן לעריכה ישירה</p>
                                  )}
                                </div>
                                <div className="flex items-center gap-4 text-sm">
                                  {editingTracks && !isMaster ? (
                                    <input
                                      type="number"
                                      min={1}
                                      max={track?.maxLevel ?? 25}
                                      value={editTrackLevels[programId] ?? track?.currentLevel ?? 1}
                                      onChange={e => setEditTrackLevels(prev => ({ ...prev, [programId]: parseInt(e.target.value) || 1 }))}
                                      className="w-16 px-2 py-1 text-sm font-bold border-2 border-blue-300 rounded-lg focus:outline-none focus:border-blue-500"
                                    />
                                  ) : (
                                    <span className={`px-3 py-1 rounded-full font-bold ${isMaster ? 'bg-cyan-100 text-cyan-800' : 'bg-blue-100 text-blue-800'}`}>
                                      רמה {displayLevel}
                                    </span>
                                  )}
                                  <span className="bg-green-100 text-green-800 px-3 py-1 rounded-full font-bold">
                                    {typeof track?.percent === 'number' ? `${track.percent.toFixed(1)}%` : '0%'}
                                  </span>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      ) : (
                        <p className="text-gray-500 text-sm">אין מסלולים פעילים</p>
                      )}
                    </div>

                    {/* Adaptive Goals */}
                    <div>
                      <h3 className="text-lg font-black text-gray-900 mb-4">יעדים אדפטיביים</h3>
                      <div className="grid grid-cols-2 gap-3">
                        <div className="bg-gray-50 rounded-xl p-4">
                          <p className="text-xs text-gray-500 mb-1">יעד צעדים יומי</p>
                          <p className="font-bold text-gray-900">{(fullProfile.progression as any)?.dailyStepGoal ?? 'לא הוגדר'}</p>
                        </div>
                        <div className="bg-gray-50 rounded-xl p-4">
                          <p className="text-xs text-gray-500 mb-1">יעד קומות יומי</p>
                          <p className="font-bold text-gray-900">{(fullProfile.progression as any)?.dailyFloorGoal ?? 'לא הוגדר'}</p>
                        </div>
                      </div>
                    </div>

                    {/* Ready for Split */}
                    {(fullProfile.progression as any)?.readyForSplit && (
                      <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
                        <h3 className="text-sm font-bold text-amber-800 mb-2">Ready for Split</h3>
                        <pre className="text-xs text-amber-700 bg-white/50 rounded p-2 overflow-x-auto">
                          {JSON.stringify((fullProfile.progression as any).readyForSplit, null, 2)}
                        </pre>
                      </div>
                    )}

                    {/* Gamification */}
                    <div>
                      <h3 className="text-lg font-black text-gray-900 mb-4">גיימיפיקציה</h3>
                      <div className="grid grid-cols-2 gap-3">
                        <div className="bg-gray-50 rounded-xl p-4">
                          <p className="text-xs text-gray-500 mb-1">Avatar ID</p>
                          <p className="font-bold text-gray-900">{(fullProfile.progression as any)?.avatarId || 'ברירת מחדל'}</p>
                        </div>
                        <div className="bg-gray-50 rounded-xl p-4">
                          <p className="text-xs text-gray-500 mb-1">תגים שנפתחו</p>
                          <p className="font-bold text-gray-900">{(fullProfile.progression as any)?.unlockedBadges?.length ?? 0} תגים</p>
                        </div>
                        <div className="bg-gray-50 rounded-xl p-4">
                          <p className="text-xs text-gray-500 mb-1">תרגילי בונוס</p>
                          <p className="font-bold text-gray-900">{(fullProfile.progression as any)?.unlockedBonusExercises?.length ?? 0} תרגילים</p>
                        </div>
                        <div className="bg-gray-50 rounded-xl p-4">
                          <p className="text-xs text-gray-500 mb-1">קלוריות כוללות</p>
                          <p className="font-bold text-gray-900">{(fullProfile.progression as any)?.totalCaloriesBurned ?? 0}</p>
                        </div>
                      </div>
                    </div>

                    {/* Level Goal Progress */}
                    {(fullProfile.progression as any)?.levelGoalProgress && (fullProfile.progression as any).levelGoalProgress.length > 0 && (
                      <div>
                        <h3 className="text-lg font-black text-gray-900 mb-4">התקדמות יעדי רמה</h3>
                        <div className="space-y-2">
                          {(fullProfile.progression as any).levelGoalProgress.map((goal: any, i: number) => (
                            <div key={i} className="bg-gray-50 rounded-xl p-3 flex items-center justify-between">
                              <span className="font-medium text-gray-900">{goal.exerciseName || goal.exerciseId}</span>
                              <span className="text-sm font-bold">
                                {goal.bestPerformance ?? 0} / {goal.targetValue ?? 0} {goal.unit === 'reps' ? 'חזרות' : 'שניות'}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* Onboarding Metadata Tab */}
                {activeTab === 'onboarding' && fullProfile && (
                  <div className="space-y-6">
                    {/* Core Assessment */}
                    <div>
                      <h3 className="text-lg font-black text-gray-900 mb-4">הערכה ראשונית</h3>
                      <div className="grid grid-cols-3 gap-3">
                        <div className="bg-blue-50 rounded-xl p-4 text-center">
                          <p className="text-xs text-blue-600 font-medium">Fitness Tier</p>
                          <p className="text-2xl font-black text-blue-700">{fullProfile.core?.initialFitnessTier ?? '?'}</p>
                        </div>
                        <div className="bg-purple-50 rounded-xl p-4 text-center">
                          <p className="text-xs text-purple-600 font-medium">Tracking Mode</p>
                          <p className="text-lg font-black text-purple-700">{fullProfile.core?.trackingMode ?? '?'}</p>
                        </div>
                        <div className="bg-green-50 rounded-xl p-4 text-center">
                          <p className="text-xs text-green-600 font-medium">יעד עיקרי</p>
                          <p className="text-lg font-black text-green-700">{fullProfile.core?.mainGoal ?? '?'}</p>
                        </div>
                      </div>
                    </div>

                    {/* Assigned Results (from dynamic questionnaire) */}
                    <div>
                      <h3 className="text-lg font-black text-gray-900 mb-4">תוצאות שאלון דינמי</h3>
                      {(() => {
                        const results = (fullProfile as any)?.assignedResults || (fullProfile as any)?.onboardingAnswers?.assignedResults;
                        if (!results || results.length === 0) {
                          return <p className="text-gray-500 text-sm">אין תוצאות שאלון</p>;
                        }
                        return (
                          <div className="space-y-2">
                            {results.map((r: any, i: number) => {
                              const prog = programs.find(p => p.id === r.programId);
                              return (
                                <div key={i} className="bg-indigo-50 border border-indigo-200 rounded-xl p-3 flex items-center justify-between">
                                  <div>
                                    <p className="font-bold text-indigo-900">{prog?.name || r.programId}</p>
                                    {r.nextQuestionnaireId && (
                                      <p className="text-xs text-indigo-500">שאלון הבא: {r.nextQuestionnaireId}</p>
                                    )}
                                  </div>
                                  <span className="bg-indigo-100 text-indigo-800 px-3 py-1 rounded-full font-bold text-sm">
                                    רמה {r.levelId}
                                  </span>
                                </div>
                              );
                            })}
                          </div>
                        );
                      })()}
                    </div>

                    {/* Lifestyle & Persona */}
                    <div>
                      <h3 className="text-lg font-black text-gray-900 mb-4">אורח חיים ופרסונה</h3>
                      <div className="grid grid-cols-2 gap-3">
                        <div className="bg-gray-50 rounded-xl p-4">
                          <p className="text-xs text-gray-500 mb-1">פרסונה</p>
                          <p className="font-bold text-gray-900">{(fullProfile as any)?.personas?.[0]?.id || '?'}</p>
                        </div>
                        <div className="bg-gray-50 rounded-xl p-4">
                          <p className="text-xs text-gray-500 mb-1">Dashboard Mode</p>
                          <p className="font-bold text-gray-900">{fullProfile.lifestyle?.dashboardMode || 'ברירת מחדל'}</p>
                        </div>
                        <div className="bg-gray-50 rounded-xl p-4">
                          <p className="text-xs text-gray-500 mb-1">כלב</p>
                          <p className="font-bold text-gray-900">{fullProfile.lifestyle?.hasDog ? 'כן' : 'לא'}</p>
                        </div>
                        <div className="bg-gray-50 rounded-xl p-4">
                          <p className="text-xs text-gray-500 mb-1">פרסונות</p>
                          <p className="font-bold text-gray-900">
                            {(fullProfile as any)?.personas?.length
                              ? (fullProfile as any).personas.map((p: any) => p.id).join(', ')
                              : 'אין'}
                          </p>
                        </div>
                      </div>
                      {fullProfile.lifestyle?.lifestyleTags && fullProfile.lifestyle.lifestyleTags.length > 0 && (
                        <div className="mt-3">
                          <p className="text-xs text-gray-500 mb-2">Lifestyle Tags</p>
                          <div className="flex flex-wrap gap-2">
                            {fullProfile.lifestyle.lifestyleTags.map((tag, i) => (
                              <span key={i} className="px-3 py-1 bg-blue-100 text-blue-800 rounded-full text-xs font-bold">
                                {tag}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Goals */}
                    <div>
                      <h3 className="text-lg font-black text-gray-900 mb-4">יעדים שנבחרו</h3>
                      {(() => {
                        const goals = (fullProfile as any)?.selectedGoals || (fullProfile as any)?.onboardingAnswers?.allGoals || [];
                        const primary = (fullProfile as any)?.onboardingAnswers?.primaryGoal;
                        return (
                          <div>
                            {primary && (
                              <div className="mb-2 inline-flex items-center gap-2 px-3 py-1.5 bg-green-100 text-green-800 rounded-lg text-sm font-bold">
                                יעד ראשי: {(fullProfile as any)?.onboardingAnswers?.primaryGoalLabel || primary}
                              </div>
                            )}
                            {goals.length > 0 ? (
                              <div className="flex flex-wrap gap-2 mt-2">
                                {goals.map((g: string, i: number) => (
                                  <span key={i} className="px-3 py-1 bg-gray-100 text-gray-800 rounded-full text-xs font-bold">
                                    {g}
                                  </span>
                                ))}
                              </div>
                            ) : (
                              <p className="text-gray-500 text-sm">אין יעדים רשומים</p>
                            )}
                          </div>
                        );
                      })()}
                    </div>

                    {/* Commute */}
                    {fullProfile.lifestyle?.commute && (
                      <div>
                        <h3 className="text-lg font-black text-gray-900 mb-4">נסיעות</h3>
                        <div className="grid grid-cols-2 gap-3">
                          <div className="bg-gray-50 rounded-xl p-4">
                            <p className="text-xs text-gray-500 mb-1">אמצעי תחבורה</p>
                            <p className="font-bold text-gray-900">{fullProfile.lifestyle.commute.method || '?'}</p>
                          </div>
                          <div className="bg-gray-50 rounded-xl p-4">
                            <p className="text-xs text-gray-500 mb-1">אתגרי נסיעה</p>
                            <p className="font-bold text-gray-900">{fullProfile.lifestyle.commute.enableChallenges ? 'מופעל' : 'כבוי'}</p>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Account Security */}
                    <div>
                      <h3 className="text-lg font-black text-gray-900 mb-4">אבטחת חשבון</h3>
                      <div className="grid grid-cols-2 gap-3">
                        <div className="bg-gray-50 rounded-xl p-4">
                          <p className="text-xs text-gray-500 mb-1">אימייל מאובטח</p>
                          <p className="font-bold text-gray-900">{(fullProfile as any)?.securedEmail || 'לא הוגדר'}</p>
                        </div>
                        <div className="bg-gray-50 rounded-xl p-4">
                          <p className="text-xs text-gray-500 mb-1">טלפון מאובטח</p>
                          <p className="font-bold text-gray-900">{(fullProfile as any)?.securedPhone || 'לא הוגדר'}</p>
                        </div>
                      </div>
                    </div>

                    {/* Raw Onboarding Data (expandable) */}
                    <details className="bg-gray-50 rounded-xl p-4">
                      <summary className="text-sm font-bold text-gray-700 cursor-pointer">נתונים גולמיים (JSON)</summary>
                      <pre className="text-xs text-gray-600 mt-3 bg-white rounded-lg p-3 overflow-x-auto max-h-96 overflow-y-auto">
                        {JSON.stringify({
                          onboardingAnswers: (fullProfile as any)?.onboardingAnswers,
                          assignedResults: (fullProfile as any)?.assignedResults,
                          lifestyle: fullProfile.lifestyle,
                          health: fullProfile.health,
                          running: fullProfile.running,
                        }, null, 2)}
                      </pre>
                    </details>
                  </div>
                )}

                {/* History Tab */}
                {activeTab === 'history' && (
                  <div className="space-y-6">
                    {/* Analytics Events Section */}
                    <div>
                      <h3 className="text-lg font-black text-gray-900 mb-4">היסטוריית פעילות (Analytics)</h3>
                      {analyticsEvents.length === 0 ? (
                        <div className="text-center py-8 text-gray-500 text-sm font-simpler">
                          אין אירועי analytics רשומים
                        </div>
                      ) : (
                        <div className="space-y-2 max-h-96 overflow-y-auto">
                          {analyticsEvents.map((event) => (
                            <div
                              key={event.id}
                              className="bg-gray-50 rounded-xl p-3 hover:bg-gray-100 transition-colors"
                            >
                              <div className="flex items-center justify-between mb-1">
                                <div className="font-bold text-gray-900 text-sm font-simpler">
                                  {getEventLabel(event.eventName)}
                                </div>
                                <div className="text-xs text-gray-500 font-simpler">
                                  {new Date(event.timestamp).toLocaleString('he-IL')}
                                </div>
                              </div>
                              <div className="text-xs text-gray-600 font-simpler">
                                {getEventDetails(event)}
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Workout History Section */}
                    <div>
                      <h3 className="text-lg font-black text-gray-900 mb-4">אימונים שבוצעו</h3>
                      {workoutHistory.length === 0 ? (
                        <div className="text-center py-8 text-gray-500 text-sm font-simpler">
                          אין אימונים רשומים
                        </div>
                      ) : (
                        <div className="space-y-3">
                          {workoutHistory.map((workout) => {
                            // Get workout type icon
                            const getWorkoutIcon = () => {
                              const iconProps = { size: 20, className: 'text-gray-600' };
                              switch (workout.workoutType) {
                                case 'running':
                                  return <Footprints {...iconProps} />;
                                case 'walking':
                                  return <Move {...iconProps} />;
                                case 'cycling':
                                  return <Bike {...iconProps} />;
                                case 'strength':
                                  return <Dumbbell {...iconProps} />;
                                case 'hybrid':
                                  return <Activity {...iconProps} />;
                                case 'recovery':
                                  return <Moon {...iconProps} />;
                                default:
                                  return <Activity {...iconProps} />;
                              }
                            };

                            // Get workout type label
                            const getWorkoutTypeLabel = () => {
                              switch (workout.workoutType) {
                                case 'running':
                                  return 'ריצה חופשית';
                                case 'walking':
                                  return 'הליכה';
                                case 'cycling':
                                  return 'רכיבה';
                                case 'strength':
                                  return 'אימון כוח';
                                case 'hybrid':
                                  return 'אימון משולב';
                                case 'recovery':
                                  return 'אימון התאוששות';
                                default:
                                  return workout.activityType || 'פעילות';
                              }
                            };

                            // Format duration as MM:SS
                            const formatDuration = (seconds: number): string => {
                              if (!seconds || seconds < 0) return '00:00';
                              const mins = Math.floor(seconds / 60);
                              const secs = Math.floor(seconds % 60);
                              return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
                            };

                            // Format completion time (HH:MM)
                            const formatCompletionTime = (date: Date): string => {
                              const hours = date.getHours().toString().padStart(2, '0');
                              const minutes = date.getMinutes().toString().padStart(2, '0');
                              return `${hours}:${minutes}`;
                            };

                            // Convert routePath to number[][] for RunMapBlock
                            const routeCoords: number[][] = (() => {
                              if (!workout.routePath || !Array.isArray(workout.routePath) || workout.routePath.length === 0) {
                                return [];
                              }
                              
                              try {
                                return workout.routePath
                                  .map((coord: any) => {
                                    // New format: {lat, lng}
                                    if (coord && typeof coord === 'object' && 'lat' in coord && 'lng' in coord) {
                                      return [Number(coord.lng), Number(coord.lat)]; // Mapbox expects [lng, lat]
                                    }
                                    // Old format: [lat, lng] or [lng, lat]
                                    if (Array.isArray(coord) && coord.length >= 2) {
                                      return [Number(coord[0]), Number(coord[1])];
                                    }
                                    return null;
                                  })
                                  .filter((coord: number[] | null): coord is number[] => 
                                    coord !== null && !isNaN(coord[0]) && !isNaN(coord[1])
                                  );
                              } catch (error) {
                                console.error('[Admin] Error parsing routePath:', error);
                                return [];
                              }
                            })();

                            const workoutDate = workout.date instanceof Date ? workout.date : new Date(workout.date);
                            const completionTime = formatCompletionTime(workoutDate);
                            const isExpanded = expandedWorkoutId === workout.id;

                            return (
                            <div
                              key={workout.id}
                              onClick={() => setExpandedWorkoutId(isExpanded ? null : (workout.id ?? null))}
                              className="bg-gray-50 rounded-xl p-4 hover:bg-gray-100 transition-colors cursor-pointer"
                            >
                                <div className="flex items-start gap-4">
                                  {/* Left: Mini Map (for running workouts) */}
                                  {(workout.workoutType === 'running' || workout.workoutType === 'walking' || workout.workoutType === 'cycling') && routeCoords.length > 1 && (
                                    <div className="w-32 h-32 rounded-lg overflow-hidden bg-gray-100 flex-shrink-0">
                                      <RunMapBlock
                                        routeCoords={routeCoords}
                                        startCoord={routeCoords[0]}
                                        endCoord={routeCoords[routeCoords.length - 1]}
                                      />
                                    </div>
                                  )}

                                  {/* Right: Workout Details */}
                                  <div className="flex-1 min-w-0">
                              <div className="flex items-center justify-between mb-2">
                                      <div className="flex items-center gap-2">
                                        {getWorkoutIcon()}
                                <div className="font-bold text-gray-900 font-simpler">
                                          {getWorkoutTypeLabel()}
                                </div>
                                </div>
                                      <div className="flex items-center gap-2">
                                        <div className="flex items-center gap-1 text-sm text-gray-500 font-simpler">
                                          <Clock size={12} />
                                          <span>{new Date(workout.date).toLocaleDateString('he-IL')} • {completionTime}</span>
                                        </div>
                                        {isExpanded ? (
                                          <ChevronUp size={16} className="text-gray-400" />
                                        ) : (
                                          <ChevronDown size={16} className="text-gray-400" />
                                        )}
                                      </div>
                                    </div>
                                    
                                    <div className="flex items-center gap-4 text-sm text-gray-600 font-simpler flex-wrap">
                                      {/* Show stats based on workout type */}
                                      {workout.workoutType === 'running' || workout.workoutType === 'walking' || workout.workoutType === 'cycling' ? (
                                        <>
                                          {workout.distance > 0 && (
                                            <span className="flex items-center gap-1">
                                              <MapPin size={14} />
                                              <span className="font-bold">{workout.distance.toFixed(2)} ק"מ</span>
                                            </span>
                                          )}
                                {workout.duration > 0 && (
                                            <span className="flex items-center gap-1">
                                              <Clock size={14} />
                                              <span className="font-bold">{formatDuration(workout.duration)}</span>
                                            </span>
                                          )}
                                          {workout.pace > 0 && (
                                            <span className="flex items-center gap-1">
                                              ⚡ {formatPace(workout.pace)} /ק"מ
                                            </span>
                                )}
                                        </>
                                      ) : workout.workoutType === 'strength' ? (
                                        <>
                                          {workout.duration > 0 && (
                                            <span className="flex items-center gap-1">
                                              <Clock size={14} />
                                              <span className="font-bold">{formatDuration(workout.duration)}</span>
                                            </span>
                                          )}
                                        </>
                                      ) : (
                                        <>
                                          {workout.duration > 0 && (
                                            <span className="flex items-center gap-1">
                                              <Clock size={14} />
                                              <span className="font-bold">{formatDuration(workout.duration)}</span>
                                            </span>
                                          )}
                                        </>
                                )}
                                {workout.calories > 0 && (
                                        <span className="flex items-center gap-1">
                                          <Activity size={14} className="text-orange-500" />
                                          {workout.calories} קלוריות
                                        </span>
                                )}
                                {workout.earnedCoins > 0 && (
                                  <span className="flex items-center gap-1">
                                    <Coins size={14} className="text-yellow-600" />
                                          <span className="font-bold">+{workout.earnedCoins} מטבעות</span>
                                  </span>
                                )}
                              </div>

                                    {/* Expanded detail panel — exercises/sets for strength workouts */}
                                    {isExpanded && (
                                      <div
                                        className="mt-3 pt-3 border-t border-gray-200"
                                        onClick={(e) => e.stopPropagation()}
                                      >
                                        {(() => {
                                          const exerciseLog = workout.segments?.[0]?.actual?.exerciseLog;
                                          if (workout.workoutType !== 'strength' || !exerciseLog || exerciseLog.length === 0) {
                                            return (
                                              <div className="text-center py-3 text-gray-400 text-xs font-simpler">
                                                אין פירוט תרגילים זמין לאימון זה
                                              </div>
                                            );
                                          }
                                          return (
                                          <div className="space-y-2">
                                            {exerciseLog.map((ex, exIdx) => (
                                              <div
                                                key={`${workout.id}-${ex.exerciseId}-${exIdx}`}
                                                className="flex items-center justify-between bg-white rounded-lg px-3 py-2 border border-gray-100"
                                              >
                                                <span className="text-sm font-bold text-gray-800 font-simpler">
                                                  {ex.exerciseName}
                                                </span>
                                                <div className="flex items-center gap-1 flex-wrap justify-end">
                                                  {ex.confirmedReps.map((reps, setIdx) => (
                                                    <span
                                                      key={setIdx}
                                                      className="bg-gray-100 rounded px-2 py-0.5 text-xs font-bold text-gray-700 font-simpler"
                                                    >
                                                      {reps}/{ex.targetReps}
                                                    </span>
                                                  ))}
                                                </div>
                                              </div>
                                            ))}
                                          </div>
                                          );
                                        })()}
                                      </div>
                                    )}
                            </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* ─────────────────────────────────────────────────────
                    Growth Hub — Timeline Tab (Tier 1)
                    Renders the user's full chronological event stream
                    (analytics_events already loaded into analyticsEvents
                    state during loadUserDetails(), sorted timestamp desc
                    by getUserEvents). Onboarding step events are
                    humanized via ONBOARDING_STEP_LABELS.
                   ───────────────────────────────────────────────────── */}
                {activeTab === 'timeline' && (
                  <div className="space-y-6">
                    {/* Lifecycle KPI summary strip — recapped here for
                        instant context when an operator opens the timeline */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                      <div className="bg-slate-50 border border-slate-200 rounded-xl p-3">
                        <div className="text-[11px] text-slate-500 font-bold mb-1">פעיל לאחרונה</div>
                        <div className="text-sm font-black text-slate-800">
                          {user.lastActive
                            ? user.lastActive.toLocaleDateString('he-IL')
                            : 'ללא נתון'}
                        </div>
                      </div>
                      <div
                        className={`border rounded-xl p-3 ${
                          user.pushEnabled
                            ? 'bg-emerald-50 border-emerald-200'
                            : 'bg-gray-50 border-gray-200'
                        }`}
                      >
                        <div
                          className={`text-[11px] font-bold mb-1 ${
                            user.pushEnabled ? 'text-emerald-600' : 'text-gray-500'
                          }`}
                        >
                          התראות פוש
                        </div>
                        <div
                          className={`text-sm font-black ${
                            user.pushEnabled ? 'text-emerald-800' : 'text-gray-700'
                          }`}
                        >
                          {user.pushEnabled ? 'מופעל' : 'כבוי'}
                        </div>
                      </div>
                      <div
                        className={`border rounded-xl p-3 ${
                          user.fcmTokenCount > 0
                            ? 'bg-blue-50 border-blue-200'
                            : 'bg-gray-50 border-gray-200'
                        }`}
                      >
                        <div
                          className={`text-[11px] font-bold mb-1 ${
                            user.fcmTokenCount > 0 ? 'text-blue-600' : 'text-gray-500'
                          }`}
                        >
                          מכשירים רשומים (FCM)
                        </div>
                        <div
                          className={`text-sm font-black ${
                            user.fcmTokenCount > 0 ? 'text-blue-800' : 'text-gray-700'
                          }`}
                        >
                          {user.fcmTokenCount}
                        </div>
                      </div>
                      <div className="bg-purple-50 border border-purple-200 rounded-xl p-3">
                        <div className="text-[11px] text-purple-600 font-bold mb-1">סה״כ אירועים</div>
                        <div className="text-sm font-black text-purple-800">
                          {analyticsEvents.length}
                        </div>
                      </div>
                    </div>

                    {/* Retention signals — Phase B (04.10.2026). Reuses
                        Phase A's formatLastActivity for the same recency
                        language as the table, plus two numbers derived from
                        already-fetched data (workoutHistory, fullProfile) —
                        no new Firestore reads. */}
                    {user && (
                      <div>
                        <h3 className="text-lg font-black text-gray-900 mb-4 flex items-center gap-2">
                          <TrendingUp size={20} className="text-[#5BC2F2]" />
                          אותות שימור
                        </h3>
                        <div className="grid grid-cols-3 gap-3">
                          {(() => {
                            const recency = formatLastActivity(user.lastActive);
                            return (
                              <div className={`rounded-xl p-4 text-center border ${recency.dotColor === 'bg-red-500' ? 'bg-red-50 border-red-200' : 'bg-gray-50 border-gray-100'}`}>
                                <p className="text-xs text-gray-500 font-medium mb-1">סטטוס פעילות</p>
                                <p className={`text-sm font-black inline-flex items-center gap-1 ${recency.textClass}`}>
                                  <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${recency.dotColor}`} />
                                  {recency.label}
                                </p>
                              </div>
                            );
                          })()}
                          <div className="bg-orange-50 border border-orange-100 rounded-xl p-4 text-center">
                            <p className="text-xs text-orange-600 font-medium mb-1">רצף נוכחי</p>
                            <p className="text-sm font-black text-orange-800">{(fullProfile?.progression as any)?.currentStreak ?? 0} ימים</p>
                          </div>
                          <div className="bg-cyan-50 border border-cyan-100 rounded-xl p-4 text-center">
                            <p className="text-xs text-cyan-600 font-medium mb-1">אימונים ב-7 ימים</p>
                            <p className="text-sm font-black text-cyan-800">
                              {workoutHistory.filter((w) => Date.now() - w.date.getTime() <= 7 * 86_400_000).length}
                            </p>
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Vertical Stepper */}
                    <div>
                      <h3 className="text-lg font-black text-gray-900 mb-4 flex items-center gap-2">
                        <Clock size={20} className="text-[#5BC2F2]" />
                        ציר זמן כרונולוגי (חדש → ישן)
                      </h3>

                      {analyticsEvents.length === 0 ? (
                        <div className="text-center py-12 bg-gray-50 rounded-xl border border-dashed border-gray-200">
                          <Activity size={32} className="mx-auto text-gray-300 mb-2" />
                          <div className="text-gray-500 text-sm font-simpler">
                            אין אירועים מתועדים למשתמש זה
                          </div>
                        </div>
                      ) : (
                        <div className="relative">
                          {/* Vertical line — RTL: line sits on the right edge */}
                          <div className="absolute top-2 bottom-2 right-[11px] w-px bg-gray-200" />

                          <div className="space-y-4 max-h-[600px] overflow-y-auto pe-2">
                            {analyticsEvents.map((event) => {
                              const style =
                                EVENT_TIMELINE_STYLE[event.eventName] ??
                                EVENT_TIMELINE_STYLE.default;

                              // Humanize onboarding step events using the
                              // module-level dictionary. Falls back to the
                              // generic label helper for non-onboarding events.
                              const isOnboardingStep =
                                event.eventName === 'onboarding_step_complete' ||
                                event.eventName === 'onboarding_step_completed';

                              const rawStepName =
                                isOnboardingStep && 'step_name' in event
                                  ? (event as { step_name?: string }).step_name
                                  : undefined;

                              const title = isOnboardingStep && rawStepName
                                ? `שלב Onboarding: ${
                                    ONBOARDING_STEP_LABELS[rawStepName] ?? rawStepName
                                  }`
                                : getEventLabel(event.eventName);

                              // Optional payload chips: time_spent + step_index
                              // for onboarding, plus the generic detail string
                              // for non-onboarding events.
                              const stepIndex =
                                isOnboardingStep && 'step_index' in event
                                  ? (event as { step_index?: number }).step_index
                                  : undefined;
                              const timeSpent =
                                isOnboardingStep && 'time_spent' in event
                                  ? (event as { time_spent?: number }).time_spent
                                  : undefined;

                              return (
                                <div
                                  key={event.id}
                                  className="relative pe-8"
                                >
                                  {/* Stepper dot */}
                                  <div
                                    className={`absolute top-1.5 right-[5px] w-3.5 h-3.5 rounded-full ring-4 ring-white ${style.dot}`}
                                  />

                                  <div className="bg-white border border-gray-200 rounded-xl p-3 hover:shadow-sm transition-shadow">
                                    <div className="flex items-start justify-between gap-2 mb-1">
                                      <div className={`font-bold text-sm font-simpler ${style.text}`}>
                                        {title}
                                      </div>
                                      <div className="text-[11px] text-gray-400 font-simpler whitespace-nowrap">
                                        {new Date(event.timestamp).toLocaleString('he-IL', {
                                          dateStyle: 'short',
                                          timeStyle: 'short',
                                        })}
                                      </div>
                                    </div>

                                    {/* Onboarding payload chips */}
                                    {isOnboardingStep && (stepIndex !== undefined || timeSpent !== undefined) && (
                                      <div className="flex flex-wrap gap-1.5 mt-2">
                                        {stepIndex !== undefined && (
                                          <span className="text-[10px] bg-green-50 text-green-700 px-2 py-0.5 rounded-full font-bold border border-green-200">
                                            שלב #{stepIndex + 1}
                                          </span>
                                        )}
                                        {typeof timeSpent === 'number' && timeSpent > 0 && (
                                          <span className="text-[10px] bg-blue-50 text-blue-700 px-2 py-0.5 rounded-full font-bold border border-blue-200">
                                            {Math.floor(timeSpent)} שניות
                                          </span>
                                        )}
                                      </div>
                                    )}

                                    {/* Generic details for non-onboarding events */}
                                    {!isOnboardingStep && (
                                      <div className="text-xs text-gray-600 font-simpler mt-1">
                                        {getEventDetails(event)}
                                      </div>
                                    )}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {activeTab === 'pushHistory' && (() => {
                  const totalSent = pushHistory.length;
                  const openedCount = pushHistory.filter((e) => e.openedAt).length;
                  const openRate = totalSent > 0 ? Math.round((openedCount / totalSent) * 100) : null;
                  const lastSent = pushHistory[0]?.sentAt; // already sorted newest-first
                  const bestHour = mostCommonOpenHourIsrael(pushHistory);

                  return (
                    <div className="space-y-6">
                      {/* Per-user summary strip */}
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                        <div className="bg-slate-50 border border-slate-200 rounded-xl p-3">
                          <div className="text-[11px] text-slate-500 font-bold mb-1">סה״כ נשלחו</div>
                          <div className="text-sm font-black text-slate-800">{totalSent}</div>
                        </div>
                        <div
                          className={`border rounded-xl p-3 ${
                            openRate !== null && openRate > 0 ? 'bg-emerald-50 border-emerald-200' : 'bg-gray-50 border-gray-200'
                          }`}
                        >
                          <div className="text-[11px] text-gray-500 font-bold mb-1">אחוז פתיחה</div>
                          <div className="text-sm font-black text-gray-800">
                            {openRate !== null ? `${openRate}% (${openedCount}/${totalSent})` : 'ללא נתון'}
                          </div>
                        </div>
                        <div className="bg-blue-50 border border-blue-200 rounded-xl p-3">
                          <div className="text-[11px] text-blue-600 font-bold mb-1">פוש אחרון שנשלח</div>
                          <div className="text-sm font-black text-blue-800">
                            {lastSent ? lastSent.toLocaleString('he-IL') : 'ללא נתון'}
                          </div>
                        </div>
                        <div className="bg-purple-50 border border-purple-200 rounded-xl p-3">
                          <div className="text-[11px] text-purple-600 font-bold mb-1">שעת פתיחה שכיחה</div>
                          <div className="text-sm font-black text-purple-800">
                            {bestHour !== null ? `${String(bestHour).padStart(2, '0')}:00` : 'אין מספיק נתונים'}
                          </div>
                        </div>
                      </div>

                      <div className="text-[11px] text-gray-400 font-simpler" dir="rtl">
                        מכיל רק פושים שנשלחו ע״י הסנדרים ששולבו במדידה (step-goal, planned-activity) — לא כל סוגי הפוש.
                        ראו .claude/knowledge/push-notifications-audit-2026-10-04.md.
                      </div>

                      {/* Reverse-chronological push list */}
                      <div>
                        <h3 className="text-lg font-black text-gray-900 mb-4 flex items-center gap-2">
                          <Bell size={20} className="text-[#5BC2F2]" />
                          היסטוריית פוש (חדש → ישן)
                        </h3>

                        {pushHistory.length === 0 ? (
                          <div className="text-center py-12 bg-gray-50 rounded-xl border border-dashed border-gray-200">
                            <Bell size={32} className="mx-auto text-gray-300 mb-2" />
                            <div className="text-gray-500 text-sm font-simpler">
                              אין פושים מתועדים למשתמש זה
                            </div>
                          </div>
                        ) : (
                          <div className="space-y-3 max-h-[600px] overflow-y-auto pe-2">
                            {pushHistory.map((entry) => (
                              <div key={entry.pushId} className="bg-white border border-gray-200 rounded-xl p-3">
                                <div className="flex items-start justify-between gap-2 mb-1">
                                  <div className="font-bold text-sm font-simpler text-gray-900">
                                    {entry.category ?? 'ללא קטגוריה'}
                                    {entry.channel && <span className="text-gray-400"> · {entry.channel}</span>}
                                  </div>
                                  <div className="text-xs text-gray-400 whitespace-nowrap">
                                    {entry.sentAt ? entry.sentAt.toLocaleString('he-IL') : '—'}
                                  </div>
                                </div>

                                {entry.copyText && (
                                  <div className="text-xs text-gray-600 font-simpler mb-2 bg-gray-50 rounded-lg p-2" dir="rtl">
                                    {entry.copyText}
                                  </div>
                                )}

                                <div className="flex flex-wrap items-center gap-2 text-[11px]">
                                  <span
                                    className={`px-2 py-0.5 rounded-full font-bold ${
                                      entry.delivered ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-100 text-gray-500'
                                    }`}
                                  >
                                    {entry.delivered ? 'נמסר' : 'לא נמסר'}
                                  </span>
                                  <span
                                    className={`px-2 py-0.5 rounded-full font-bold ${
                                      entry.openedAt ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-500'
                                    }`}
                                  >
                                    {entry.openedAt ? `נפתח ${entry.openedAt.toLocaleString('he-IL')}` : 'לא נפתח'}
                                  </span>
                                  {entry.landingPath && (
                                    <span className="px-2 py-0.5 rounded-full font-bold bg-cyan-100 text-cyan-700">
                                      נחת: {entry.landingPath}
                                    </span>
                                  )}
                                  {entry.outcomeChecked && (
                                    <span
                                      className={`px-2 py-0.5 rounded-full font-bold ${
                                        entry.outcomeAchieved ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'
                                      }`}
                                    >
                                      {entry.outcomeAchieved ? '✓' : '✗'} תוצאה ({entry.outcomeType ?? '—'})
                                    </span>
                                  )}
                                  {!entry.outcomeChecked && entry.openedAt && (
                                    <span className="px-2 py-0.5 rounded-full font-bold bg-gray-100 text-gray-500">
                                      תוצאה: ממתין לבדיקה
                                    </span>
                                  )}
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })()}
              </>
            )}
          </div>
      </div>
    </div>
  );
}
