"use client";

export const dynamic = 'force-dynamic';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowRight, X, ChevronLeft, Pencil, Check, Loader2, Crown, Users2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import nextDynamic from 'next/dynamic';
import { useUserStore } from '@/features/user';
import { useMyGroups } from '@/features/arena/hooks/useMyGroups';
import DashboardTab from '@/features/profile/components/DashboardTab';
import HistorySheet from '@/features/profile/components/HistorySheet';
import SettingsModal from '@/features/home/components/SettingsModal';
import AppHeader from '@/components/ui/AppHeader';

const CreatorManagementDrawer = nextDynamic(
  () => import('@/features/arena/components/CreatorManagementDrawer'),
  { ssr: false },
);
const CreateGroupWizard = nextDynamic(
  () => import('@/features/arena/components/CreateGroupWizard'),
  { ssr: false },
);
import FreeRunSummary from '@/features/workout-engine/players/running/components/FreeRun/FreeRunSummary';
import StrengthHistoryDetail from '@/features/profile/components/StrengthHistoryDetail';
import { useWorkoutHistory } from '@/features/profile/hooks/useWorkoutHistory';
import { WorkoutHistoryEntry } from '@/features/workout-engine/core/services/storage.service';
import { WORKOUT_DELETE_EXPANDED_ENABLED } from '@/config/feature-flags';
import DeleteWorkoutConfirmModal from '@/components/ui/DeleteWorkoutConfirmModal';
import { deleteWorkoutWithReversal } from '@/lib/workoutDeletion';
import type { OnboardingStepId } from '@/features/user/onboarding/types';
import { getAllGearDefinitions, type GearDefinition } from '@/features/content/equipment/gear';
import { doc as firestoreDoc, updateDoc, setDoc, addDoc, collection, serverTimestamp, getDoc } from 'firebase/firestore';
import { db, auth } from '@/lib/firebase';
import { getUserFromFirestore } from '@/lib/firestore.service';
import AccessCodeGate from '@/components/ui/AccessCodeGate';
import { useToast } from '@/components/ui/Toast';
import type { AccessCodeResult } from '@/features/user/onboarding/services/access-code.service';

function formatBirthDate(raw: unknown): string | null {
  if (!raw) return null;
  const str = String(raw);
  const match = str.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (match) return `${match[3]}/${match[2]}/${match[1]}`;
  return str;
}

// Hebrew label for DeleteWorkoutConfirmModal's `activityLabel` prop — same
// workoutType set ActivityHistoryCard/HistoryTab already switch on, extended
// to cover 'running' and 'strength' since a delete can be triggered from
// either read-only detail screen (FreeRunSummary or StrengthHistoryDetail).
function workoutActivityLabel(workoutType: WorkoutHistoryEntry['workoutType']): string {
  switch (workoutType) {
    case 'running':
      return 'ריצה';
    case 'walking':
      return 'הליכה';
    case 'cycling':
      return 'רכיבה';
    case 'hybrid':
      return 'אימון משולב';
    case 'strength':
      return 'אימון כוח';
    case 'recovery':
      return 'אימון התאוששות';
    default:
      return 'אימון';
  }
}

// DeleteWorkoutConfirmModal's `dateLabel` prop wants an already-formatted,
// human string (its own doc comment example: "12.08.2026"). dot-separated,
// zero-padded day/month.
function workoutDateLabel(date: Date): string {
  const d = date instanceof Date && !isNaN(date.getTime()) ? date : new Date();
  const day = d.getDate().toString().padStart(2, '0');
  const month = (d.getMonth() + 1).toString().padStart(2, '0');
  return `${day}.${month}.${d.getFullYear()}`;
}

const EQUIPMENT_SVG_MAP: Record<string, string> = {
  rings: '/assets/icons/equipment/rings.svg',
  gymnastic_rings: '/assets/icons/equipment/rings.svg',
  bands: '/assets/icons/equipment/bands.svg',
  resistance_band: '/assets/icons/equipment/bands.svg',
  resistance_bands: '/assets/icons/equipment/bands.svg',
  pull_up_bar: '/assets/icons/equipment/pullupbar.svg',
  pullup_bar: '/assets/icons/equipment/pullupbar.svg',
  pullUpBar: '/assets/icons/equipment/pullupbar.svg',
  dip_station: '/assets/icons/equipment/parallelbars.svg',
  parallettes: '/assets/icons/equipment/parallelbars.svg',
  trx: '/assets/icons/equipment/trx.svg',
};

function gearIconSrc(gearId: string, gearDefs: GearDefinition[]): string | null {
  if (EQUIPMENT_SVG_MAP[gearId]) return EQUIPMENT_SVG_MAP[gearId];
  const def = gearDefs.find(g => g.id === gearId);
  if (!def) return null;
  const en = (def.name?.en || '').toLowerCase();
  const he = (def.name?.he || '').toLowerCase();
  if (en.includes('ring') || he.includes('טבעות')) return EQUIPMENT_SVG_MAP.rings;
  if (en.includes('band') || he.includes('גומי')) return EQUIPMENT_SVG_MAP.bands;
  if ((en.includes('pull') && en.includes('bar')) || he.includes('מתח')) return EQUIPMENT_SVG_MAP.pull_up_bar;
  if (en.includes('parallel') || en.includes('dip') || he.includes('מקביל')) return EQUIPMENT_SVG_MAP.dip_station;
  if (en.includes('trx')) return EQUIPMENT_SVG_MAP.trx;
  return null;
}

function gearDisplayName(gearId: string, gearDefs: GearDefinition[]): string {
  const def = gearDefs.find(g => g.id === gearId);
  return def?.name?.he || def?.name?.en || gearId;
}

const CATEGORY_LABELS: Record<string, string> = {
  running: 'ריצה', walking: 'הליכה', yoga: 'יוגה',
  calisthenics: 'קליסתניקס', cycling: 'רכיבה', other: 'אחר',
};
const CATEGORY_ICONS: Record<string, string> = {
  running: '🏃', walking: '🚶', yoga: '🧘',
  calisthenics: '💪', cycling: '🚴', other: '⭐',
};

export default function ProfilePage() {
  const router = useRouter();
  const { profile, _hasHydrated } = useUserStore();
  const { groups: myGroups } = useMyGroups();
  const managedGroups = myGroups.filter((g) => g.createdBy === profile?.id);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [historySheetOpen, setHistorySheetOpen] = useState(false);

  // ── Creator Hub drawers ──
  const [managementGroupId, setManagementGroupId] = useState<string | null>(null);
  const [editGroupId, setEditGroupId] = useState<string | null>(null);
  const [selectedWorkout, setSelectedWorkout] = useState<WorkoutHistoryEntry | null>(null);
  // Delete-confirm state for the FreeRunSummary read-only (historical) path.
  // Only ever opened when WORKOUT_DELETE_EXPANDED_ENABLED is true — see the
  // onDelete wiring below.
  const [showWorkoutDeleteConfirm, setShowWorkoutDeleteConfirm] = useState(false);

  // Owned here (not inside HistoryTab) so the list + removeWorkout survive
  // the swap below to StrengthHistoryDetail/FreeRunSummary: that swap is a
  // top-level `if (selectedWorkout) return ...` early-return that replaces
  // ProfilePage's ENTIRE returned subtree, which fully unmounts HistorySheet
  // → HistoryTab (and would destroy a hook-local list there) every time a
  // workout is opened, then remounts it fresh on close. ProfilePage itself
  // never unmounts across that swap, so state kept here does. `enabled`
  // defers the fetch until the history sheet has actually been opened (or a
  // workout is already selected, e.g. StrengthHistoryDetail's delete path),
  // matching HistoryTab's previous on-open-only fetch instead of reading on
  // every profile page load.
  const { workouts: historyWorkouts, isLoading: historyLoading, removeWorkout } =
    useWorkoutHistory(50, historySheetOpen || !!selectedWorkout);

  const [gearDefs, setGearDefs] = useState<GearDefinition[]>([]);
  const [showUpdateToast, setShowUpdateToast] = useState(false);
  const { showToast } = useToast();

  // ── Feedback form ──
  const [feedbackText, setFeedbackText] = useState('');
  const [feedbackSending, setFeedbackSending] = useState(false);
  const [feedbackSent, setFeedbackSent] = useState(false);

  const handleSendFeedback = useCallback(async () => {
    const text = feedbackText.trim();
    if (!text || feedbackSending) return;
    const uid = auth.currentUser?.uid;
    setFeedbackSending(true);
    try {
      await addDoc(collection(db, 'user_feedback'), {
        content: text,
        userId: uid ?? null,
        userEmail: auth.currentUser?.email ?? null,
        isConverted: false,
        createdAt: serverTimestamp(),
      });
      setFeedbackText('');
      setFeedbackSent(true);
      setTimeout(() => setFeedbackSent(false), 4000);
    } catch {
      showToast('error', 'שגיאה בשליחת המשוב');
    } finally {
      setFeedbackSending(false);
    }
  }, [feedbackText, feedbackSending, showToast]);

  const hasTenant = !!(profile as any)?.core?.tenantId;

  const handleOrgCodeSuccess = useCallback(async (result: AccessCodeResult) => {
    const uid = auth.currentUser?.uid;
    if (!uid) return;
    try {
      await setDoc(firestoreDoc(db, 'users', uid), {
        core: {
          tenantId: result.tenantId,
          unitId: result.unitId,
          unitPath: result.unitPath,
          tenantType: result.tenantType,
        },
      }, { merge: true });
      showToast('success', 'הצטרפת לארגון בהצלחה!');
      const fresh = await getUserFromFirestore(uid);
      if (fresh) useUserStore.setState({ profile: fresh });
    } catch {
      showToast('error', 'שגיאה בהצטרפות לארגון');
    }
  }, [showToast]);

  // ── Inline edit modals ──
  const [editingField, setEditingField] = useState<'name' | 'dob' | null>(null);
  const [editName, setEditName] = useState('');
  const [editDob, setEditDob] = useState({ day: '', month: '', year: '' });
  const [editSaving, setEditSaving] = useState(false);
  const monthRef = useRef<HTMLInputElement>(null);
  const yearRef = useRef<HTMLInputElement>(null);

  const openNameEdit = useCallback(() => {
    setEditName(profile?.core?.name || '');
    setEditingField('name');
  }, [profile?.core?.name]);

  const openDobEdit = useCallback(() => {
    if (profile?.core?.birthDate) {
      const d = profile.core.birthDate instanceof Date
        ? profile.core.birthDate
        : new Date(profile.core.birthDate);
      if (!isNaN(d.getTime())) {
        setEditDob({
          day: String(d.getDate()).padStart(2, '0'),
          month: String(d.getMonth() + 1).padStart(2, '0'),
          year: String(d.getFullYear()),
        });
      } else {
        setEditDob({ day: '', month: '', year: '' });
      }
    } else {
      setEditDob({ day: '', month: '', year: '' });
    }
    setEditingField('dob');
  }, [profile?.core?.birthDate]);

  const saveInlineEdit = useCallback(async () => {
    const uid = auth.currentUser?.uid || profile?.id;
    if (!uid || editSaving) return;
    setEditSaving(true);
    try {
      if (editingField === 'name') {
        const trimmed = editName.trim();
        if (!trimmed) { setEditSaving(false); return; }
        await updateDoc(firestoreDoc(db, 'users', uid), { 'core.name': trimmed });
      } else if (editingField === 'dob') {
        const day = parseInt(editDob.day, 10);
        const month = parseInt(editDob.month, 10);
        const year = parseInt(editDob.year, 10);
        if (!day || !month || !year || month < 1 || month > 12 || day < 1 || day > 31 || year < 1900) {
          setEditSaving(false); return;
        }
        // birthDate is a server-locked field — must go through /api/user/complete-profile
        // so ageGroup is recomputed server-side and userAge/{uid} stays in sync.
        const idToken = await auth.currentUser?.getIdToken();
        if (!idToken) { setEditSaving(false); return; }
        const res = await fetch('/api/user/complete-profile', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
          body: JSON.stringify({
            name: profile?.core?.name ?? '',
            gender: profile?.core?.gender ?? 'other',
            birthDay: day,
            birthMonth: month,
            birthYear: year,
          }),
        });
        if (!res.ok) throw new Error(`complete-profile: ${res.status}`);
      }
      const fresh = await getUserFromFirestore(uid);
      if (fresh) useUserStore.getState().initializeProfile(fresh);
      setEditingField(null);
      setShowUpdateToast(true);
    } catch (e) {
      console.error('[Profile] Inline edit failed:', e);
    } finally {
      setEditSaving(false);
    }
  }, [editingField, editName, editDob, editSaving, profile?.id]);

  useEffect(() => {
    getAllGearDefinitions().then(setGearDefs).catch(() => {});
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const flag = sessionStorage.getItem('profile_update_toast');
    if (!flag) return;
    sessionStorage.removeItem('profile_update_toast');
    const t = setTimeout(() => setShowUpdateToast(true), 400);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    if (!showUpdateToast) return;
    const t = setTimeout(() => setShowUpdateToast(false), 3500);
    return () => clearTimeout(t);
  }, [showUpdateToast]);

  React.useEffect(() => {
    // Was '/onboarding' — a redirect stub into a dead-ended pre-08.2026
    // onboarding chain (intro/selection/roadmap/persona-selection). Also
    // raced logout: signOut() clears `profile`, so this effect fired at the
    // same time as SettingsModal's own router.replace('/'), and whichever
    // resolved last decided the user's landing page. Targeting the same '/'
    // destination as logout makes the race harmless either way.
    if (_hasHydrated && !profile) {
      router.replace('/');
    }
  }, [_hasHydrated, profile, router]);

  if (!_hasHydrated) {
    return (
      <div className="h-screen flex items-center justify-center bg-[#F8FAFC]">
        <p className="text-sm text-gray-500 animate-pulse">טוען...</p>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="h-screen flex items-center justify-center bg-[#F8FAFC]">
        <p className="text-sm text-gray-500">מעביר להרשמה...</p>
      </div>
    );
  }

  // Confirm-delete for the FreeRunSummary read-only path (past aerobic/hybrid
  // workouts). Only reachable while WORKOUT_DELETE_EXPANDED_ENABLED is true —
  // FreeRunSummary only renders its trash-icon trigger when it was passed a
  // real onDelete, which is itself only passed while the flag is on (see
  // below). Mirrors StrengthHistoryDetail's handleConfirmDelete shape.
  const handleConfirmDeleteWorkout = async () => {
    if (!selectedWorkout?.id) {
      // No id to delete against — dismiss and bail rather than calling
      // deleteWorkoutWithReversal with an empty string.
      setShowWorkoutDeleteConfirm(false);
      return;
    }
    await deleteWorkoutWithReversal(selectedWorkout.id);
    setShowWorkoutDeleteConfirm(false);
    setSelectedWorkout(null);
  };

  if (selectedWorkout) {
    // 'recovery' routes to the same strength-shaped detail view (StrengthHistoryDetail
    // is itself made recovery-aware — see its workoutType==='recovery' branches) —
    // otherwise a recovery session would incorrectly fall through to FreeRunSummary,
    // a GPS/pace/distance UI that doesn't fit a video session.
    const isStrength =
      selectedWorkout.workoutType === 'strength' ||
      selectedWorkout.workoutType === 'recovery' ||
      selectedWorkout.category === 'strength';
    if (isStrength) {
      return (
        <StrengthHistoryDetail
          workout={selectedWorkout}
          onClose={() => setSelectedWorkout(null)}
          onWorkoutDeleted={removeWorkout}
        />
      );
    }
    return (
      <>
        <FreeRunSummary
          workout={selectedWorkout}
          isReadOnly={true}
          onClose={() => setSelectedWorkout(null)}
          onDelete={
            WORKOUT_DELETE_EXPANDED_ENABLED
              ? () => setShowWorkoutDeleteConfirm(true)
              : undefined
          }
        />
        {WORKOUT_DELETE_EXPANDED_ENABLED && (
          <DeleteWorkoutConfirmModal
            isOpen={showWorkoutDeleteConfirm}
            activityLabel={workoutActivityLabel(selectedWorkout.workoutType)}
            dateLabel={workoutDateLabel(selectedWorkout.date)}
            xpToReverse={selectedWorkout.xpEarned ?? 0}
            onConfirm={handleConfirmDeleteWorkout}
            onCancel={() => setShowWorkoutDeleteConfirm(false)}
          />
        )}
      </>
    );
  }

  const progression = profile?.progression;
  const activeProgramName =
    progression?.activePrograms?.[0]?.name ?? progression?.currentLevel ?? null;

  const handleGoToStep = (step: OnboardingStepId) => {
    if (typeof window !== 'undefined') {
      sessionStorage.setItem('jit_return_to', 'profile');
    }
    router.push(`/onboarding-new/setup?step=${step}&jit=true`);
  };

  // Helper: build profile field rows (value | 'טרם סופק' with tap-to-complete)
  const hasName = !!profile?.core?.name && profile.core.name.trim().length > 0;
  const hasDob = !!profile?.core?.birthDate;
  const hasWeight = !!profile?.core?.weight && profile.core.weight > 0;
  const hasEquipment =
    (profile?.equipment?.home?.length ?? 0) > 0 ||
    (profile?.equipment?.outdoor?.length ?? 0) > 0;
  const hasLocation = !!profile?.core?.authorityId;
  const hasEmail = !!profile?.core?.email;
  const hasSchedule = !!(profile?.lifestyle?.scheduleDays && profile.lifestyle.scheduleDays.length > 0);

  type ProfileRow = {
    label: string;
    value: string | null;
    filled: boolean;
    step: OnboardingStepId | null;
    customRender?: React.ReactNode;
    onPress?: () => void;
  };

  // Resolve displayable city name — prefer authority object name over raw ID
  const locationDisplay = (() => {
    const auth = (profile?.core as any)?.authority;
    if (auth && typeof auth === 'object' && auth.name) return String(auth.name);
    const aff = profile?.core?.affiliations?.find(a => a.type === 'city' && a.name);
    if (aff?.name) return aff.name;
    const raw = profile?.core?.authorityId;
    if (!raw) return null;
    if (typeof raw === 'object' && raw !== null && 'name' in (raw as Record<string, unknown>)) {
      return String((raw as Record<string, unknown>).name);
    }
    if (typeof raw === 'string' && raw.length > 20) return null;
    if (typeof raw === 'string') return raw;
    return null;
  })();

  // ── Neighborhood nudge (16.08.2026) ───────────────────────────────────────
  // core.neighborhoodId has no cached display name on the profile object
  // (unlike city, which gets a resolved `authority` object or a city-type
  // affiliation) — resolve it with one light doc read when set. Deliberately
  // NOT part of calculateProfileCompletion/ProfileProgressBar: that checklist
  // hides itself entirely once the profile reaches 100% (see
  // profile-completion.service.ts), so a fully-onboarded user would never
  // see a neighborhood item there. This card is always visible on /profile
  // instead, regardless of overall completion — it's an ongoing opt-in
  // field for leagues, not a one-time onboarding gate.
  const neighborhoodId = profile?.core?.neighborhoodId ?? null;
  const [neighborhoodName, setNeighborhoodName] = useState<string | null>(null);
  useEffect(() => {
    if (!neighborhoodId) { setNeighborhoodName(null); return; }
    let cancelled = false;
    getDoc(firestoreDoc(db, 'authorities', neighborhoodId))
      .then((snap) => {
        if (!cancelled) setNeighborhoodName(snap.exists() ? ((snap.data()?.name as string) ?? null) : null);
      })
      .catch(() => { if (!cancelled) setNeighborhoodName(null); });
    return () => { cancelled = true; };
  }, [neighborhoodId]);

  // Build equipment pill list
  const allGearIds = [...(profile?.equipment?.home ?? []), ...(profile?.equipment?.outdoor ?? [])];

  const equipmentPills = hasEquipment ? (
    <div className="flex flex-wrap gap-1.5 justify-end">
      {allGearIds.slice(0, 6).map((gearId) => {
        const svgSrc = gearIconSrc(gearId, gearDefs);
        const name = gearDisplayName(gearId, gearDefs);
        return (
          <span
            key={gearId}
            className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-[#5BC2F2]/10 text-[11px] font-bold text-[#5BC2F2]"
          >
            {svgSrc ? (
              <img src={svgSrc} alt="" className="w-3.5 h-3.5 object-contain" />
            ) : null}
            {name}
          </span>
        );
      })}
      {allGearIds.length > 6 && (
        <span className="inline-flex items-center px-2 py-1 rounded-lg bg-slate-100 text-[11px] font-bold text-slate-500">
          +{allGearIds.length - 6}
        </span>
      )}
    </div>
  ) : null;

  const profileRows: ProfileRow[] = [
    { label: 'שם מלא', value: hasName ? profile!.core.name : null, filled: hasName, step: null, onPress: openNameEdit },
    { label: 'תאריך לידה', value: hasDob ? formatBirthDate(profile!.core.birthDate) : null, filled: hasDob, step: null, onPress: openDobEdit },
    { label: 'משקל', value: hasWeight ? `${profile!.core.weight} ק"ג` : null, filled: hasWeight, step: 'PERSONAL_STATS' },
    { label: 'ציוד אימון', value: hasEquipment ? '__custom__' : null, filled: hasEquipment, step: 'EQUIPMENT', customRender: equipmentPills },
    { label: 'מיקום ועיר', value: locationDisplay, filled: hasLocation, step: 'LOCATION' },
    { label: 'לוח אימונים', value: hasSchedule ? `${profile!.lifestyle!.scheduleDays!.length} ימים בשבוע` : null, filled: hasSchedule, step: 'SCHEDULE' },
    { label: 'חשבון מאובטח', value: hasEmail ? profile!.core.email! : null, filled: hasEmail, step: 'ACCOUNT_SECURE' },
  ];

  return (
    <div className="min-h-screen bg-[#F8FAFC]">
      {/* Shared AppHeader — avatar pill + OUT logo + bell/chat/search. */}
      <AppHeader />

      {/* Content — DashboardTab is the only view. History opens as a bottom
          sheet from the workout-count tap inside DashboardTab. */}
      <div className="max-w-md mx-auto px-4 py-5">
        <DashboardTab
          onOpenSettings={() => setSettingsOpen(true)}
          onNavigateToHistory={() => setHistorySheetOpen(true)}
        />

        {/* ── Neighborhood card — always visible, independent of onboarding
            completion (see the note above calculateProfileCompletion usage).
            Reuses the same JIT location flow as onboarding's LOCATION step —
            its search already supports picking a neighborhood-level result;
            this card is the missing discoverable entry point to it. */}
        <div
          dir="rtl"
          className="mt-6 bg-white rounded-2xl border border-gray-100 shadow-subtle p-4 flex items-center justify-between gap-3"
        >
          <div className="min-w-0">
            <p className="text-sm font-black text-gray-900">שכונה</p>
            <p className="text-xs text-gray-500 mt-0.5">
              {neighborhoodName ?? 'לא הוגדרה — נדרשת כדי להשתתף בליגת השכונות'}
            </p>
          </div>
          <button
            type="button"
            onClick={() => router.push('/onboarding-new/setup?step=LOCATION&jit=true')}
            className="flex-shrink-0 text-[13px] font-bold text-[#00ADEF] active:opacity-70"
          >
            {neighborhoodName ? 'ערוך' : 'הוסף שכונה'}
          </button>
        </div>

        {/* ── Feedback card ──────────────────────────────────────────────── */}
        <div
          dir="rtl"
          className="mt-6 mb-10 bg-white rounded-2xl border border-gray-100 shadow-subtle p-5 space-y-4"
        >
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-[#00C9F2]/10 flex items-center justify-center flex-shrink-0">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#00C9F2" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
              </svg>
            </div>
            <div>
              <p className="text-sm font-black text-gray-900">שלח משוב או דווח על באג</p>
              <p className="text-[11px] text-gray-400 mt-0.5">הפידבק שלך משפיע ישירות על הפיתוח</p>
            </div>
          </div>

          <textarea
            value={feedbackText}
            onChange={(e) => setFeedbackText(e.target.value)}
            placeholder="כתוב כאן את המשוב, הבאג, או הרעיון שלך..."
            rows={4}
            className="w-full resize-none rounded-xl border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-900 placeholder:text-gray-400 outline-none focus:border-[#00C9F2] focus:ring-2 focus:ring-[#00C9F2]/20 transition-all leading-relaxed"
          />

          <AnimatePresence mode="wait">
            {feedbackSent ? (
              <motion.div
                key="sent"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="h-12 flex items-center justify-center gap-2 rounded-xl bg-[#10B981]/10 text-[#10B981]"
              >
                <Check size={16} strokeWidth={3} />
                <span className="text-sm font-bold">תודה! המשוב נשלח בהצלחה</span>
              </motion.div>
            ) : (
              <motion.button
                key="btn"
                onClick={handleSendFeedback}
                disabled={!feedbackText.trim() || feedbackSending}
                className="w-full h-12 rounded-xl font-bold text-sm text-white bg-gradient-to-l from-[#00C9F2] to-[#5BC2F2] shadow-md shadow-cyan-500/20 active:scale-[0.97] transition-all flex items-center justify-center gap-2 disabled:opacity-40 disabled:cursor-not-allowed disabled:active:scale-100"
              >
                {feedbackSending ? (
                  <Loader2 size={18} className="animate-spin" />
                ) : (
                  <>
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.3" strokeLinecap="round" strokeLinejoin="round">
                      <line x1="22" y1="2" x2="11" y2="13" />
                      <polygon points="22 2 15 22 11 13 2 9 22 2" />
                    </svg>
                    שלח לעוזר ה-AI
                  </>
                )}
              </motion.button>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* History bottom sheet — opened by tapping the workouts count. */}
      <HistorySheet
        isOpen={historySheetOpen}
        onClose={() => setHistorySheetOpen(false)}
        onWorkoutClick={(workout) => setSelectedWorkout(workout)}
        workouts={historyWorkouts}
        isLoading={historyLoading}
        removeWorkout={removeWorkout}
      />

      {/* ── Inline Edit Modal: Name / DOB ── */}
      <AnimatePresence>
        {editingField && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center p-5"
            style={{ backdropFilter: 'blur(8px)', backgroundColor: 'rgba(0,0,0,0.4)' }}
            onClick={() => !editSaving && setEditingField(null)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              transition={{ type: 'spring', damping: 24, stiffness: 300 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-white dark:bg-slate-800 rounded-3xl p-6 w-full max-w-sm shadow-2xl"
              dir="rtl"
            >
              {editingField === 'name' && (
                <>
                  <h3 className="text-lg font-black text-gray-900 dark:text-white mb-4">עריכת שם</h3>
                  <input
                    autoFocus
                    type="text"
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && saveInlineEdit()}
                    placeholder="הזן שם מלא"
                    className="w-full h-14 px-4 rounded-2xl border border-gray-200 dark:border-slate-600 bg-gray-50 dark:bg-slate-700 text-base font-semibold text-gray-900 dark:text-white outline-none focus:border-[#00C9F2] transition-colors"
                  />
                </>
              )}

              {editingField === 'dob' && (
                <>
                  <h3 className="text-lg font-black text-gray-900 dark:text-white mb-4">עריכת תאריך לידה</h3>
                  <div className="flex gap-3">
                    <div className="flex-1">
                      <label className="text-[11px] font-bold text-gray-400 mb-1 block">יום</label>
                      <input
                        autoFocus
                        type="text"
                        inputMode="numeric"
                        maxLength={2}
                        value={editDob.day}
                        onChange={(e) => {
                          const v = e.target.value.replace(/\D/g, '').slice(0, 2);
                          setEditDob(prev => ({ ...prev, day: v }));
                          if (v.length === 2) monthRef.current?.focus();
                        }}
                        placeholder="DD"
                        className="w-full h-14 px-3 rounded-2xl border border-gray-200 dark:border-slate-600 bg-gray-50 dark:bg-slate-700 text-center text-lg font-bold text-gray-900 dark:text-white outline-none focus:border-[#00C9F2] transition-colors tabular-nums"
                      />
                    </div>
                    <div className="flex-1">
                      <label className="text-[11px] font-bold text-gray-400 mb-1 block">חודש</label>
                      <input
                        ref={monthRef}
                        type="text"
                        inputMode="numeric"
                        maxLength={2}
                        value={editDob.month}
                        onChange={(e) => {
                          const v = e.target.value.replace(/\D/g, '').slice(0, 2);
                          setEditDob(prev => ({ ...prev, month: v }));
                          if (v.length === 2) yearRef.current?.focus();
                        }}
                        placeholder="MM"
                        className="w-full h-14 px-3 rounded-2xl border border-gray-200 dark:border-slate-600 bg-gray-50 dark:bg-slate-700 text-center text-lg font-bold text-gray-900 dark:text-white outline-none focus:border-[#00C9F2] transition-colors tabular-nums"
                      />
                    </div>
                    <div className="flex-[1.3]">
                      <label className="text-[11px] font-bold text-gray-400 mb-1 block">שנה</label>
                      <input
                        ref={yearRef}
                        type="text"
                        inputMode="numeric"
                        maxLength={4}
                        value={editDob.year}
                        onChange={(e) => {
                          const v = e.target.value.replace(/\D/g, '').slice(0, 4);
                          setEditDob(prev => ({ ...prev, year: v }));
                        }}
                        onKeyDown={(e) => e.key === 'Enter' && saveInlineEdit()}
                        placeholder="YYYY"
                        className="w-full h-14 px-3 rounded-2xl border border-gray-200 dark:border-slate-600 bg-gray-50 dark:bg-slate-700 text-center text-lg font-bold text-gray-900 dark:text-white outline-none focus:border-[#00C9F2] transition-colors tabular-nums"
                      />
                    </div>
                  </div>
                </>
              )}

              {/* Action buttons */}
              <div className="flex gap-3 mt-6">
                <button
                  onClick={saveInlineEdit}
                  disabled={editSaving}
                  className="flex-1 h-12 rounded-2xl font-bold text-white text-sm bg-gradient-to-l from-[#00C9F2] to-[#5BC2F2] shadow-lg shadow-cyan-500/20 active:scale-[0.97] transition-transform flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {editSaving ? (
                    <Loader2 size={18} className="animate-spin" />
                  ) : (
                    <>
                      <Check size={16} strokeWidth={3} />
                      <span>שמירה</span>
                    </>
                  )}
                </button>
                <button
                  onClick={() => setEditingField(null)}
                  disabled={editSaving}
                  className="px-5 h-12 rounded-2xl font-bold text-sm text-gray-600 dark:text-gray-300 bg-gray-100 dark:bg-slate-700 active:scale-[0.97] transition-transform"
                >
                  ביטול
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Settings Modal ────────────────────────────────────────────────────── */}
      <SettingsModal isOpen={settingsOpen} onClose={() => setSettingsOpen(false)} />

      {/* ── Creator Hub: Management Drawer ───────────────────────────────────── */}
      <CreatorManagementDrawer
        isOpen={!!managementGroupId}
        onClose={() => setManagementGroupId(null)}
        groupId={managementGroupId}
        onEditGroup={(id) => {
          setManagementGroupId(null);
          setEditGroupId(id);
        }}
      />

      {/* ── Creator Hub: Edit Wizard ──────────────────────────────────────────── */}
      <CreateGroupWizard
        isOpen={!!editGroupId}
        onClose={() => setEditGroupId(null)}
        editGroupId={editGroupId ?? undefined}
        onSuccess={() => setEditGroupId(null)}
      />

      {/* Success toast after JIT profile update */}
      <AnimatePresence>
        {showUpdateToast && (
          <motion.div
            initial={{ y: 60, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 60, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 300, damping: 28 }}
            className="fixed bottom-24 inset-x-0 z-50 flex justify-center px-4"
          >
            <div
              className="flex items-center gap-3 bg-[#10B981] text-white px-5 py-3.5 rounded-2xl shadow-xl max-w-sm w-full"
              dir="rtl"
            >
              <div className="w-7 h-7 rounded-full bg-white/20 flex items-center justify-center flex-shrink-0">
                <Check size={16} strokeWidth={3} />
              </div>
              <p className="text-sm font-bold">הפרופיל עודכן בהצלחה!</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
