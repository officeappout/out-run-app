"use client";

export const dynamic = 'force-dynamic';

import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useUserStore } from '@/features/user';
import { useGPSStore } from '@/features/parks/core/store/useGPSStore';
import AlertModal from '@/features/home/components/AlertModal';
import WorkoutPreviewDrawer from '@/features/workouts/components/WorkoutPreviewDrawer';
import { useSmartSchedule } from '@/features/home/hooks/useSmartSchedule';
import { MOCK_STATS } from '@/features/home/data/mock-schedule-data';
import BlurryBridgeOverlay from '@/features/user/onboarding/components/BlurryBridgeOverlay';
import LifestyleWizard from '@/features/user/onboarding/components/LifestyleWizard';
import { calculateProfileCompletion, type CompletionItem } from '@/features/user/identity/services/profile-completion.service';
import { motion, AnimatePresence, type PanInfo } from 'framer-motion';
import { type CompletionData } from '@/features/home/components/HeroWorkoutCard';
import { useSmartMessage } from '@/features/messages/hooks/useSmartGreeting';
import { useGoalCelebration } from '@/features/home/hooks/useGoalCelebration';
import { useDailyProgress } from '@/features/home/hooks/useDailyProgress';
import { useTodayStrengthVolume } from '@/features/home/hooks/useTodayStrengthVolume';
import { useDailyStrengthTarget } from '@/features/home/hooks/useDailyStrengthTarget';
import { FRAGMENTER_MINUTES_PER_SET } from '@/features/home/utils/setsToMinutes';
import { isTodayTrainingDay } from '@/features/home/utils/dailyStrengthTarget';
import { useCommunitySessionBanner } from '@/features/arena/hooks/useCommunitySessionBanner';
import CommunitySessionBanner from '@/features/arena/components/CommunitySessionBanner';
import GroupDetailsDrawer from '@/features/arena/components/GroupDetailsDrawer';
import PostJoinSuccessDrawer from '@/features/arena/components/PostJoinSuccessDrawer';
import type { CommunityGroup, ScheduleSlot } from '@/types/community.types';

import {
  Shield, CheckCircle2, Circle, ChevronDown, X, Plus,
} from 'lucide-react';
import { auth, db } from '@/lib/firebase';
import { UserFullProfile } from '@/types/user-profile';
import { GeneratedWorkout } from '@/features/workout-engine/logic/WorkoutGenerator';
import { resolveExerciseMedia } from '@/features/workout-engine/shared/utils/media-resolution.utils';
import { normalizeGearId } from '@/features/workout-engine/shared/utils/gear-mapping.utils';
import { partitionByTabataBlock } from '@/features/workout-engine/logic/protocols/tabata.block';
import { getUserFromFirestore } from '@/lib/firestore.service';
import { doc as firestoreDoc, getDoc, updateDoc, setDoc } from 'firebase/firestore';
import { isAdminEmailAllowed, STRENGTH_RING_ENABLED, HOME_ANCHOR_V2_ENABLED, HOME_RECOVERY_START_SHORTCUT_ENABLED, POST_WORKOUT_SUGGESTION_CAROUSEL_ENABLED, HOME_PRE_WORKOUT_SUGGESTION_CAROUSEL_ENABLED } from '@/config/feature-flags';
import { setOnboardingPref } from '@/lib/onboardingPrefs';
import { hasAcceptedHealthDeclaration } from '@/lib/health-declaration';
import StatsOverview, { type BuilderContext, type TrioSelector } from '@/features/home/components/StatsOverview';
import SmartWeeklySchedule from '@/features/home/components/SmartWeeklySchedule';
import ProgramProgressRow from '@/features/home/components/rows/ProgramProgressRow';
import ConsistencyWidget from '@/features/home/components/rows/ConsistencyWidget';
import { useWeeklyProgress, useDailyActivity } from '@/features/activity';
import type { ActivityCategory } from '@/features/activity/types/activity.types';
import TodayActivityStrip from '@/features/home/components/TodayActivityStrip';
import type { TodayActivityCardData } from '@/features/home/components/TodayActivityCard';
import StepsSummaryCard from '@/features/home/components/widgets/StepsSummaryCard';
import TrainingPlannerOverlay from '@/features/home/components/TrainingPlannerOverlay';
import AddWorkoutModal from '@/features/home/components/AddWorkoutModal';
import WorkoutBuilderSheet, { type WorkoutBuilderSheetProps, type LocationId } from '@/features/home/components/WorkoutBuilderSheet';
import AnchorLocationChip from '@/features/home/components/AnchorLocationChip';
import { useSwapAll } from '@/features/workouts/components/workout-preview-drawer/hooks/useSwapAll';
import { useExercisePool } from '@/features/workouts/components/workout-preview-drawer/hooks/useExercisePool';
import type { ExecutionLocation } from '@/features/content/exercises/core/exercise.types';
import PlannedActivityComposeSheet from '@/features/parks/client/components/planned-activity/PlannedActivityComposeSheet';
import UnifiedPlusDrawer from '@/features/parks/client/components/planned-activity/UnifiedPlusDrawer';
import { SOCIAL_COMPOSE_UI_ENABLED } from '@/config/feature-flags';
import { useUserLocationSync } from '@/features/parks/core/hooks/useUserLocationSync';
import ContributionWizard from '@/features/parks/client/components/contribution-wizard';
import QuickReportSheet from '@/features/parks/client/components/contribution-wizard/QuickReportSheet';
import { DaySchedule } from '@/features/home/data/mock-schedule-data';
import type { UserScheduleEntry } from '@/features/user/scheduling/types/schedule.types';
import { getScheduleEntries } from '@/features/user/scheduling/services/userSchedule.service';

import { toISODate, getHebrewDayLetter, stepSelectedDate } from '@/features/user/scheduling/utils/dateUtils';
import { getWorkoutsForDate, type WorkoutHistoryEntry } from '@/features/workout-engine/core/services/storage.service';
import { useDashboardMode } from '@/hooks/useDashboardMode';
import { useFeatureFlags } from '@/hooks/useFeatureFlags';
import WorkoutLocationSuggestions from '@/features/home/components/WorkoutLocationSuggestions';
import NearbyGroupsRow from '@/features/home/components/NearbyGroupsRow';
import AppHeader from '@/components/ui/AppHeader';
import { useRequiredSetup } from '@/features/user/onboarding/hooks/useRequiredSetup';
import { JITSetupModal } from '@/features/user/onboarding/components/JITSetupModal';
import { useWorkoutSession } from '@/features/workouts/components/workout-preview-drawer/hooks/useWorkoutSession';
import type { Suggestion } from '@/features/workout-engine/core/types/suggestion.types';
import type { UserContext } from '@/features/workout-engine/core/types/user-context.types';
import { runSuggestionEngine, runSuggestionEngineStreaming } from '@/features/workout-engine/core/engine/suggestion-engine';
import { buildHomeUserContext } from '@/features/workout-engine/core/context/build-home-user-context';
import { suggestionToGeneratedWorkout } from '@/features/workout-engine/core/engine/pick-post-workout-suggestion';
import { suggestionToHomeGeneratedWorkout } from '@/features/workout-engine/core/engine/pick-home-suggestion';
import { resolveFullStrengthWorkout, resolveFullStrengthWorkoutAtIndex } from '@/features/workout-engine/core/generators/full-strength.generator';
import { resolveRouteWorkout } from '@/features/workout-engine/core/generators/route.generator';
import { SuggestionCarousel } from '@/features/workout-engine/core/components/SuggestionCarousel';
import { PostWorkoutCardRenderer } from '@/features/home/components/PostWorkoutCardRenderer';
import { PreWorkoutCardRenderer, resolveHeroWorkout, hasHeroCardTreatment } from '@/features/home/components/PreWorkoutCardRenderer';
import { BuildCustomButton, CarouselSkeleton } from '@/features/home/components/WorkoutSelectionCarousel';

const GROUP_VERB: Record<string, string> = {
  walking:      'ילך',
  running:      'ירוץ',
  yoga:         'יתאמן',
  calisthenics: 'יתאמן',
  cycling:      'ירכב',
  other:        'יתאמן',
};


// ════════════════════════════════════════════════════════════════════
// 1. PROFILE PROGRESS BAR — Slim bar below header, expandable drawer
// ════════════════════════════════════════════════════════════════════

function ProfileProgressBar({ profile }: { profile: UserFullProfile }) {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);

  // calculateProfileCompletion now excludes the strength bucket from
  // completion.items itself for a user without a strength track (same
  // profile.progression.domains check this component used to duplicate
  // locally as `hasProgram` to filter a separate `visibleItems` list) — the
  // percentage and the displayed checklist are computed from the same
  // filtered set, so they can no longer disagree the way they used to
  // (a running-only user seeing every displayed item checked, but the
  // percentage still short because strength items counted against them
  // invisibly). completion.items is now correct to render directly.
  const completion = useMemo(
    () => calculateProfileCompletion(profile),
    [profile],
  );

  if (completion.isVerified || completion.percentage >= 100) return null;

  const handleGoToStep = async (item: CompletionItem) => {
    if (item.jitPath) {
      // Running items have no OnboardingWizard step — route into the dynamic
      // questionnaire directly, seeding the same track signal Gateway sets.
      setOnboardingPref('gateway_track', item.bucket === 'running' ? 'RUNNING' : 'STRENGTH');
      router.push(item.jitPath);
      return;
    }
    if (item.id === 'gpsAccess') {
      // Explicit checklist tap → prompt via the shared store action. On grant,
      // persist the completion flag; on denial the store records it and we no-op.
      const coords = await useGPSStore.getState().requestPermissionNow();
      if (coords) {
        const uid = auth.currentUser?.uid;
        if (uid) {
          await setDoc(
            firestoreDoc(db, 'users', uid),
            { core: { gpsEnabled: true } },
            { merge: true },
          );
        }
      }
      return;
    }
    router.push(`/onboarding-new/setup?step=${item.step}&jit=true`);
  };

  return (
    <div dir="rtl">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center gap-3 px-4 py-2.5 bg-white/80 backdrop-blur-sm"
      >
        <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden">
          <motion.div
            className="h-full rounded-full bg-gradient-to-l from-[#00C9F2] to-[#5BC2F2]"
            initial={{ width: 0 }}
            animate={{ width: `${completion.percentage}%` }}
            transition={{ duration: 0.8, ease: 'easeOut' }}
          />
        </div>
        <span className="text-xs font-bold text-slate-500 min-w-[36px] text-left">
          {completion.percentage}%
        </span>
        <motion.div
          animate={{ rotate: isOpen ? 180 : 0 }}
          transition={{ duration: 0.2 }}
        >
          <ChevronDown size={16} className="text-slate-400" />
        </motion.div>
      </button>

      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: 'easeInOut' }}
            className="overflow-hidden bg-white border-b border-slate-100"
          >
            <div className="px-4 py-3 space-y-1.5">
              {completion.items.map((item) => (
                <div key={item.id} className="flex items-center gap-2.5 py-1.5">
                  {item.completed ? (
                    <CheckCircle2 size={16} className="text-emerald-500 flex-shrink-0" />
                  ) : (
                    <Circle size={16} className="text-slate-300 flex-shrink-0" />
                  )}
                  <span className={`flex-1 text-xs ${item.completed ? 'text-slate-400 line-through' : 'text-slate-700 font-medium'}`}>
                    {item.label}
                  </span>
                  {!item.completed && (item.step || item.jitPath) && (
                    <button
                      onClick={() => handleGoToStep(item)}
                      className="text-[11px] text-[#00C9F2] font-bold hover:underline"
                    >
                      השלם
                    </button>
                  )}
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════
// 2. HERO GLASS CARD — for users without a program yet
// ════════════════════════════════════════════════════════════════════

// ════════════════════════════════════════════════════════════════════
// Health tab cards — dedicated simple metric cards (no ring)
// ════════════════════════════════════════════════════════════════════

const HEALTH_CARD_STYLE: React.CSSProperties = {
  borderRadius: 12,
  border: '0.5px solid #E0E9FF',
  boxShadow: '0 1px 4px 0 rgba(0,0,0,0.04)',
};

const WHO_WEEKLY_TARGET = 150;

// Stage D+E (19.08.2026) — Hebrew label for a today-activity card representing
// a category with no richer per-completion data available (see
// buildTodayActivityCards' isRich distinction below).
const TODAY_ACTIVITY_CATEGORY_LABEL: Record<ActivityCategory, string> = {
  strength: 'אימון כוח',
  cardio: 'אימון אירובי',
  maintenance: 'גמישות ותנועתיות',
};

/** Weekly activity minutes card */
function ActivityCard() {
  const { summary } = useWeeklyProgress();
  const weeklyMinutes = Math.round(
    (summary?.categoryTotals?.strength ?? 0) +
    (summary?.categoryTotals?.cardio ?? 0) +
    (summary?.categoryTotals?.maintenance ?? 0),
  );
  const barPct = Math.min(100, (weeklyMinutes / WHO_WEEKLY_TARGET) * 100);

  return (
    <div
      className="bg-white dark:bg-[#1E1E1E] w-full h-full p-4 flex flex-col justify-between"
      style={HEALTH_CARD_STYLE}
      dir="rtl"
    >
      <div>
        <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1">
          פעילות שבועית
        </p>
        <p style={{ fontSize: 28, fontWeight: 500, lineHeight: 1.1 }} className="text-gray-900 dark:text-white tabular-nums">
          {weeklyMinutes} <span className="text-base font-normal">דק׳</span>
        </p>
        <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
          מתוך {WHO_WEEKLY_TARGET} דק׳
        </p>
      </div>
      <div
        className="w-full bg-gray-100 dark:bg-gray-700 overflow-hidden"
        style={{ height: 4, borderRadius: 2, marginTop: 10 }}
      >
        <div
          style={{
            width: `${barPct}%`,
            height: '100%',
            borderRadius: 2,
            backgroundColor: '#00C9F2',
            transition: 'width 0.4s ease',
          }}
        />
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════
// MAIN HOME PAGE — Clean Execution Zone
// ════════════════════════════════════════════════════════════════════

export default function HomePage() {
  const router = useRouter();
  const { profile, _hasHydrated, refreshProfile } = useUserStore();
  const isSuperAdmin = !!(profile?.core as any)?.isSuperAdmin;
  const { flags: featureFlags } = useFeatureFlags(isSuperAdmin);
  const resolvedDashboardMode = useDashboardMode(profile, featureFlags.enableRunningPrograms);
  const scheduleState = useSmartSchedule();
  const { interceptWorkoutStart, jitState, dismissJIT, cancelJIT } = useRequiredSetup();
  const [showAlert, setShowAlert] = useState<string | null>(null);
  const [selectedWorkout, setSelectedWorkout] = useState<any | null>(null);
  // True from the instant a new workout card is tapped until the engine
  // delivers fresh data — drives the skeleton shimmer inside the drawer.
  const [isWorkoutLoading, setIsWorkoutLoading] = useState(false);

  // Entry context for the WorkoutPreviewDrawer pencil button
  const [previewEntry, setPreviewEntry] = useState<UserScheduleEntry | null>(null);
  // Synchronous mirror of previewEntry (Section L+M fix, 01.09.2026): AgendaDayCard's
  // activate() calls onPreviewEntry(entry) then onTap(entry.date) -> handleHeroPress, both
  // in the same synchronous tick -- but setPreviewEntry's state update doesn't commit until
  // the next render, so handleHeroPress can't read the just-tapped entry via previewEntry
  // itself without seeing a stale value. This ref updates in lockstep (same wrapper, same
  // tick) so handleHeroPress can synchronously identify which entry was tapped and build
  // real generation from it, mirroring what handleCalendarEntryTap already does with its own
  // directly-passed entry parameter.
  const previewEntryRef = useRef<UserScheduleEntry | null>(null);
  // Entry data for the edit modal (triggered by drawer pencil or directly)
  const [editEntry, setEditEntry] = useState<UserScheduleEntry | null>(null);

  // Workout builder sheet
  const [builderOpen, setBuilderOpen] = useState(false);
  const [builderProps, setBuilderProps] = useState<Omit<WorkoutBuilderSheetProps, 'onClose'>>({});

  // Phase 3 (social-activities plan): opportunistically refresh the
  // userLocations/{uid} geohash index while home has a GPS fix. Feeds
  // onPlannedActivityCreated's radius push targeting.
  useUserLocationSync();

  // Unified "+" — promoted top-level entry point (Phase 1 of the
  // social-activities build plan). Opens the same UnifiedPlusDrawer the
  // map "+" opens, which in turn opens one of these 3 sheets.
  const [composeOpen, setComposeOpen] = useState(false);
  const [wizardOpen, setWizardOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [plusDrawerOpen, setPlusDrawerOpen] = useState(false);
  const gpsCoords = useGPSStore((s) => s.coords);

  // Handle "pencil" tap from WorkoutPreviewDrawer — close drawer and open edit modal
  const handleEditFromDrawer = useCallback(() => {
    if (!previewEntry?.entryId) return;
    setSelectedWorkout(null);
    setEditEntry(previewEntry);
  }, [previewEntry]);

  // Selected date drives SmartWeeklySchedule highlight + StatsOverview workout gen
  const [selectedDate, setSelectedDate] = useState(() => toISODate(new Date()));

  // R day-swipe — moved off the schedule strip to the central workout anchor: a
  // horizontal pan on the workout card steps the selected day within the current week.
  // RTL-aware: the anchor renders right-to-left, so swipe RIGHT → next (later) day and
  // swipe LEFT → previous — mirroring the LTR convention (the strip's old handler used
  // the raw LTR sign, which read inverted in the RTL layout).
  const handleAnchorDayPan = useCallback((_: unknown, info: PanInfo) => {
    if (Math.abs(info.offset.x) <= 60 || Math.abs(info.offset.x) <= Math.abs(info.offset.y)) return;
    const dir = info.offset.x > 0 ? 1 : -1; // RTL: swipe right → next day
    const next = stepSelectedDate(selectedDate, dir);
    if (next) setSelectedDate(next);
  }, [selectedDate]);

  // Training Planner Overlay (calendar icon → full-screen planner)
  const [showPlanner, setShowPlanner] = useState(false);

  // Reopen the planner after a round-trip navigation away from it (23.08.2026,
  // AGENDA_UNPLANNED_COMPLETION_FIX). showPlanner is plain React state, not
  // URL-synced — router.push to /workouts/[id]/history (e.g. tapping a
  // reconstructed completed-workout card from inside the planner) fully
  // unmounts this page; router.back() then remounts it fresh, resetting
  // showPlanner to false and silently dropping the user back at bare /home
  // instead of where they tapped from. AgendaDayCard sets this flag right
  // before that specific push (only ever true when the planner was
  // genuinely open, by construction — the card can't be tapped otherwise).
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (sessionStorage.getItem('reopen_training_planner') !== 'true') return;
    sessionStorage.removeItem('reopen_training_planner');
    setShowPlanner(true);
  }, []);

  // Incremented whenever a schedule entry is added/moved/removed in the planner,
  // so StatsOverview and SmartWeeklySchedule re-derive their data immediately.
  const [scheduleVersion, setScheduleVersion] = useState(0);

  // Lifestyle Wizard State
  const [showLifestyleWizard, setShowLifestyleWizard] = useState(false);

  // Home page tabs ("כוח" / "בריאות") — below the schedule strip
  const [homeTab, setHomeTab] = useState<'strength' | 'health'>('strength');

  // ── Gear Toast (one-time after onboarding) ──
  const [showGearToast, setShowGearToast] = useState(false);
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const flag = sessionStorage.getItem('show_gear_toast');
    if (!flag) return;
    sessionStorage.removeItem('show_gear_toast');
    const timer = setTimeout(() => setShowGearToast(true), 1200);
    return () => clearTimeout(timer);
  }, []);
  useEffect(() => {
    if (!showGearToast) return;
    const timer = setTimeout(() => setShowGearToast(false), 5000);
    return () => clearTimeout(timer);
  }, [showGearToast]);

  // ── Completed-workout lookup failure toast (fix-round #6, 19-21.08.2026) ──
  // Surfaces tryOpenCompletedWorkout's real query failures — distinct from
  // "genuinely no workout that day," which stays a silent, correct fallback.
  const [completedWorkoutLookupFailed, setCompletedWorkoutLookupFailed] = useState(false);
  useEffect(() => {
    if (!completedWorkoutLookupFailed) return;
    const timer = setTimeout(() => setCompletedWorkoutLookupFailed(false), 5000);
    return () => clearTimeout(timer);
  }, [completedWorkoutLookupFailed]);

  // ── Post-Workout Celebration Mode ──
  const [postWorkoutData, setPostWorkoutData] = useState<{
    workoutType: string; durationMinutes: number; completedAt: string;
    workoutTitle?: string; streak?: number; thumbnailUrl?: string; programId?: string;
  } | null>(null);
  // Persistent completion gate — reads Firestore `dailyProgress/{uid}_{today}`.
  // Survives page refreshes / re-mounts and elapsed time within the same
  // calendar day, so the workout generator stays hidden until midnight once
  // the user has logged a session.
  const todayProgress = useDailyProgress();
  const todayWorkoutDone = !!todayProgress?.workoutCompleted;

  // F2.2 (19.08.2026, "unified workout summary" plan): resolves a tapped
  // schedule day to its real completed workout doc (if any) and navigates
  // to /workouts/[id]/history. Returns true when it navigated — callers
  // should skip their own start-a-new-workout fallback in that case.
  //
  // No existing link from a schedule entry/calendar cell to a real workout
  // doc id existed before this (confirmed during F2's investigation —
  // schedule entries come from userSchedule/planned data, completion
  // coloring comes from dailyProgress, neither carries a workout id), so
  // this queries the workouts collection directly via getWorkoutsForDate
  // (storage.service.ts) — deliberately uses only the EXISTING
  // {userId, date} composite index (see that function's own doc comment),
  // no new index needed. A day can have >1 real workout doc; picks the
  // most recent, matching the same "one consistent destination, no
  // session-picker" principle already used for the home entry point.
  //
  // Cost-aware: future dates are skipped outright (can never have a real
  // workout). For TODAY specifically, also skipped unless todayWorkoutDone
  // is already true (declared just above — an existing, zero-cost signal)
  // — the common "tap today's not-yet-done workout" path stays exactly as
  // fast as before this diff, no added network round-trip. Past dates
  // always query: there was no existing fast path to preserve there
  // (AgendaDayCard's own past-day tap was a hard no-op before this diff —
  // see its activate()).
  //
  // In-flight guard (adversarial review, 19.08.2026): this does a real
  // Firestore round-trip before router.push, with no debounce anywhere else
  // in this file to reuse. Without a guard, rapidly tapping two different
  // schedule entries could resolve out of order — whichever query finishes
  // last wins the navigation, even if the user tapped it first. A plain
  // ref (not state — no re-render needed) drops any tap that starts while
  // a previous one is still resolving; the common case (same entry tapped
  // twice) is already idempotent regardless.
  const isResolvingCompletedTapRef = useRef(false);
  const tryOpenCompletedWorkout = useCallback(async (dateISO: string): Promise<boolean> => {
    const todayISO = toISODate(new Date());
    if (dateISO > todayISO) return false;
    if (dateISO === todayISO && !todayWorkoutDone) return false;
    if (!profile?.id) return false;
    if (isResolvingCompletedTapRef.current) return false;
    isResolvingCompletedTapRef.current = true;
    try {
      const existing = await getWorkoutsForDate(profile.id, dateISO);
      if (existing.length > 0 && existing[0].id) {
        router.push(`/workouts/${existing[0].id}/history`);
        return true;
      }
      return false;
    } catch (error) {
      // getWorkoutsForDate now throws instead of swallowing (fix-round #6,
      // 19-21.08.2026) — a real query failure must NOT fall through to the
      // caller's normal "genuinely no workout that day" fallback (that used
      // to open a start-new-workout drawer, silently pretending nothing
      // happened). Returning true here tells the caller "handled, stop" —
      // the toast below is what actually surfaces this to the user.
      console.error('[tryOpenCompletedWorkout] Failed to check for a completed workout on', dateISO, error);
      setCompletedWorkoutLookupFailed(true);
      return true;
    } finally {
      isResolvingCompletedTapRef.current = false;
    }
  }, [profile?.id, router, todayWorkoutDone]);

  // Open WorkoutPreviewDrawer from a MonthlyCalendarGrid cell tap (via TrainingPlannerOverlay)
  const handleCalendarEntryTap = useCallback(async (entry: UserScheduleEntry) => {
    // Community entries have their own separate handling elsewhere
    // (AgendaDayCard's onCommunityTap) — group-session history isn't in
    // scope here, so this redirect only ever applies to personal entries.
    if (entry.source !== 'community' && (await tryOpenCompletedWorkout(entry.date))) return;
    setPreviewEntry(entry);
    const cats = entry.scheduledCategories ?? [];
    const title = cats.length > 0
      ? cats.map(c => c === 'strength' ? 'כוח' : c === 'cardio' ? 'ריצה' : c === 'walking' ? 'הליכה' : 'גמישות').join(' + ')
      : 'אימון מתוזמן';
    setSelectedWorkout({
      id: entry.entryId ?? entry.date,
      title,
      description: '',
      level: 'medium',
      difficulty: 'medium',
      duration: 45,
      coverImage: '',
      segments: [],
    });

    // Fix (31.08.2026, Section I — "drawer shows a stale/ghost workout, 'start' gives one
    // warmup exercise then ends"): this function used to only build the title-only stub
    // above and stop — it never called handleWorkoutGenerated or cleared generatedWorkout,
    // so the drawer (which renders generatedWorkout as its real content, not the stub — see
    // its own generatedWorkout prop below) kept showing whatever content was left over from
    // a completely unrelated previous action, or null on a fresh session (which the drawer's
    // own "start" flow then falls back to building a plan from the empty stub's segments:[],
    // producing exactly the one-warmup-then-done symptom).
    //
    // Scoped to strength (or uncategorized, same default the title fallback above already
    // treats as a generic "אימון מתוזמן") — the same generator (full-strength) the home
    // carousel's own hero card already uses, so a tap on TODAY's entry reuses that exact
    // cache entry (full-strength-cheap-${profile.id}, the hero's own suggestion id) and shows
    // byte-identical content to what home already displays, not a second independent build
    // that could plausibly drift from it. A different date gets its own cache slot
    // (calendar-${entry.date}) — resolveFullStrengthWorkout's cache is suggestion-id-keyed
    // only, so reusing the hero's id for a non-today date would risk showing today's content
    // for a different day, or overwriting the hero's own cached entry with another day's.
    //
    // cardio/walking/maintenance-only entries are NOT covered here (no equivalent
    // real-build resolver audited for those categories yet) — generatedWorkout is still
    // cleared so they at least never show a wrong/stale workout, but the drawer will show
    // its own empty/no-content state rather than a real build. Narrower, known scope —
    // not silently pretended to be solved.
    if (!profile) return;
    generatedWorkoutRef.current = null;
    generatedWorkoutForDateRef.current = entry.date;
    workoutGenerationRef.current += 1;
    setGeneratedWorkout(null);
    if (cats.length === 0 || cats.includes('strength')) {
      setIsWorkoutLoading(true);
      try {
        const todayISO = toISODate(new Date());
        const context = buildHomeUserContext({
          profile,
          location: null,
          surface: 'home',
          date: new Date(entry.date + 'T00:00:00'),
        });
        const suggestionId = entry.date === todayISO
          ? `full-strength-cheap-${profile.id}`
          : `calendar-${entry.date}`;
        const workout = await resolveFullStrengthWorkout(suggestionId, profile, context);
        // null = needs-assessment or a genuine generation failure — leave generatedWorkout
        // null (already cleared above) so the drawer shows its own empty state rather than
        // inventing content; same documented degrade the rest of this file already uses for
        // "no real Tier-2 resolver yet" cases (route/safety-net).
        if (workout) handleWorkoutGenerated(workout);
      } catch (error) {
        console.error('[home] resolveFullStrengthWorkout failed for calendar entry tap', error);
      } finally {
        setIsWorkoutLoading(false);
      }
    }
    // handleWorkoutGenerated deliberately omitted below — it's defined later in this
    // component (const), so adding it to this deps array hits a real TypeScript TDZ error
    // ("used before declaration"), not just a lint warning. It's stable ([] deps, confirmed)
    // so omitting it is safe; matches the same pre-existing forward-reference pattern this
    // file already tolerates elsewhere (e.g. the post_workout ranking effect's own
    // eslint-disable, a few lines above this function).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tryOpenCompletedWorkout, profile]);

  // Stage B (18.08.2026, "completion-loop" plan) — allGoalsMet drives the
  // post-workout carousel header's "finished everything" copy variant below.
  // Pre-existing, already-computed signal (useDailyActivity.ts:226-229,
  // .every(cat => cat.isGoalMet) over today.categories) — not a new
  // computation. No local duplicate of this existed in this file to
  // consolidate (checked before adding this call).
  //
  // Adversarial review (18.08.2026): this hook's data comes from the shared
  // useActivityStore, but its subscribeToChanges/loadFromServer effects are
  // NOT deduped across call sites — this is the 4th independent
  // useDailyActivity() call on this page (AppHeader, SmartWeeklySchedule,
  // StatsOverview already call it), each mounting its own onSnapshot pair.
  // Consistent with this page's existing convention (not a new pattern this
  // diff introduces), but a real modest listener cost, not a free read.
  const { allGoalsMet } = useDailyActivity();
  // Daily Strength Ring (Layer A). The target hook is gated by the flag so no
  // Firestore read fires while STRENGTH_RING_ENABLED is off (byte-identical).
  const todayStrengthVolume = useTodayStrengthVolume();
  const dailyStrengthTarget = useDailyStrengthTarget(STRENGTH_RING_ENABLED);
  const postWorkoutMsg = useSmartMessage('post_workout');
  const { celebrate } = useGoalCelebration();
  const [showMotivationBanner, setShowMotivationBanner] = useState(false);
  const { sessions: communitySessions, dismiss: dismissSession } = useCommunitySessionBanner();
  const [bannerGroup, setBannerGroup] = useState<CommunityGroup | null>(null);
  const [joinSuccessData, setJoinSuccessData] = useState<{
    name: string;
    verb: string;
    scheduleSlots?: ScheduleSlot[];
    category?: string;
    address?: string;
    group: CommunityGroup;
  } | null>(null);

  const handleOpenGroupFromBanner = useCallback(async (groupId: string) => {
    try {
      const snap = await getDoc(firestoreDoc(db, 'community_groups', groupId));
      if (snap.exists()) {
        setBannerGroup({ id: snap.id, ...snap.data() } as CommunityGroup);
      }
    } catch (err) {
      console.error('[Home] failed to load group for drawer:', err);
    }
  }, []);

  // Bug fix (22.08.2026, David caught on-device — "swallows the second
  // workout"): this used to be a mount-only effect ([] deps), so a SECOND
  // workout completed while home stays mounted (no remount in between) was
  // never picked up — its fresh sessionStorage payload just sat unread.
  // sessionStorage has no same-tab 'storage' event to react to, so
  // completion-sync.service.ts now dispatches a 'post-workout-completed'
  // CustomEvent right after writing the key; this listens for it in
  // addition to the original mount-time read, so every completion during
  // this page's lifetime — not just the first — updates postWorkoutData.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const readPostWorkoutData = () => {
      const raw = sessionStorage.getItem('post_workout_completed');
      if (!raw) return;
      try {
        const data = JSON.parse(raw);
        const elapsed = Date.now() - new Date(data.completedAt).getTime();
        if (elapsed < 30 * 60 * 1000) {
          setPostWorkoutData(data);
          setShowMotivationBanner(true);
        }
      } catch { /* ignore parse errors */ }
      sessionStorage.removeItem('post_workout_completed');
    };
    readPostWorkoutData();
    window.addEventListener('post-workout-completed', readPostWorkoutData);
    return () => window.removeEventListener('post-workout-completed', readPostWorkoutData);
  }, []);

  useEffect(() => {
    if (postWorkoutData) {
      celebrate('home_post_workout', 500);
    }
  }, [postWorkoutData, celebrate]);

  // Celebration data has two sources, in priority order:
  //   1. `postWorkoutData` — fresh sessionStorage payload from the workout
  //      summary screen (rich: title, streak, thumbnail). Used for the first
  //      30-min window right after completion.
  //   2. `todayProgress` (Firestore) — persistent fallback that survives
  //      refreshes / re-mounts / >30 min elapsed. Carries only `workoutType`,
  //      so the card renders in a minimal "done for today" state.
  // Ring payload — only populated when the flag is on, so completionData.ring is
  // absent (and the card byte-identical) while STRENGTH_RING_ENABLED is off.
  const strengthRingData = STRENGTH_RING_ENABLED
    ? {
        completedSets: todayStrengthVolume.setsCompleted,
        targetSets: dailyStrengthTarget.targetSets,
        avgMinutesPerSet: FRAGMENTER_MINUTES_PER_SET,
      }
    : undefined;

  const completionData: CompletionData | undefined = postWorkoutData
    ? {
        workoutType: postWorkoutData.workoutType,
        durationMinutes: postWorkoutData.durationMinutes,
        workoutTitle: postWorkoutData.workoutTitle,
        streak: postWorkoutData.streak,
        thumbnailUrl: postWorkoutData.thumbnailUrl,
        programId: postWorkoutData.programId,
        ring: strengthRingData,
      }
    : todayWorkoutDone
      ? {
          workoutType: todayProgress?.workoutType ?? 'strength',
          durationMinutes: 0,
          ring: strengthRingData,
        }
      : undefined;

  // Stage D+E (19.08.2026) — the card list TodayActivityStrip renders, REPLACING
  // HeroWorkoutCard's old single completion card (locked decision, documented in
  // adaptive-snacking-valiant.md). Empty array = the strip renders null = the
  // exact "no visible empty state on a rest day" behavior the plan calls for —
  // no separate empty-state branch needed, this array being empty already is one.
  //
  // Which workout gets the "rich" (real title/thumbnail/duration) card: only
  // the most recently saved doc for today (index 0 below) — every OTHER
  // workout today (e.g. an earlier walk, same day as today's strength
  // session) gets a generic category-labeled card instead, since no title/
  // thumbnail data exists for anything but the most recent completion
  // (completionData's fields all trace back to a single 30-min-TTL
  // sessionStorage payload — see completion-sync.service.ts).
  //
  // Dependency array below reads completionData's individual primitive fields
  // (workoutType/workoutTitle/thumbnailUrl/streak/durationMinutes), not the
  // completionData object itself — completionData is a plain ternary
  // expression (not its own useMemo), so it's a fresh object reference every
  // render; depending on the object directly would make THIS memo recompute
  // every render too, same as not memoizing at all (caught by
  // react-hooks/exhaustive-deps). The primitives are what actually determine
  // the output, and they only change when the underlying data really changes.
  // Card-per-workout (22.08.2026, David-directed — the old one-card-per-
  // CATEGORY design was swallowing a second same-day workout of the same
  // category into a single card, showing the day's cumulative minutes
  // instead of that specific session's own duration, and never gave
  // SuggestionCarousel more than 1 item so it never scrolled). Every
  // real workout doc for today, most recent first — same query
  // handleTodayActivityCardTap already ran at tap time (F2.2), now run
  // earlier, at card-build time, and reused (not re-run) at tap time too.
  // Refetches on profile.id AND on postWorkoutData change (not just
  // profile.id) — a new completion writes a new doc, and this needs to
  // pick it up without waiting for a remount. Stays null (cards render
  // empty, same as an unresolved rest day) until it resolves, or forever
  // on a genuine query failure — logged, not thrown, so one failed refetch
  // doesn't crash the home screen.
  const [todaysWorkouts, setTodaysWorkouts] = useState<WorkoutHistoryEntry[] | null>(null);
  useEffect(() => {
    if (!profile?.id) return;
    let cancelled = false;
    getWorkoutsForDate(profile.id, toISODate(new Date()))
      .then((workouts) => {
        if (cancelled) return;
        setTodaysWorkouts(workouts);
      })
      .catch((error) => {
        console.error('[home] Failed to load today\'s workouts for the activity strip:', error);
      });
    return () => {
      cancelled = true;
    };
  }, [profile?.id, postWorkoutData]);

  const todayActivityCards: TodayActivityCardData[] = useMemo(() => {
    if (!profile) return [];
    // todaysWorkouts is null until the fetch above resolves (or forever on a
    // genuine query failure) — empty strip meanwhile, same as a rest day.
    // No "safety nets" needed here anymore (unlike the old category-bucketed
    // version below, now removed): every real doc for today is already in
    // this list regardless of duration, so a short/express or hybrid
    // completion is never at risk of vanishing — there's no 10-min floor or
    // category-collapse to work around in the first place.
    if (!todaysWorkouts || todaysWorkouts.length === 0) return [];

    // getWorkoutsForDate already orders desc by date — the most recently
    // SAVED doc is index 0. sessionStorage's postWorkoutData always holds
    // the latest completion (each save overwrites the key), so "index 0" and
    // "the workout completionData describes" are the same doc by
    // construction — no id-matching needed, and correct even for a hybrid
    // completion (its own doc's category is genuinely 'hybrid', no more
    // guessing which raw-category bucket it landed in).
    return todaysWorkouts.map((w, i) => {
      const isRich = i === 0 && !!completionData;
      // Real saved category ('cardio'|'strength'|'hybrid'|'recovery') vs. the
      // 3-way ActivityCategory the card's fill color/label need. hybrid and
      // recovery both style as 'strength' here — a styling-only choice
      // (mirrors the activity store's own bucketing: useActivitySync.ts logs
      // every trainingType!=='cardio' case, recovery included, under
      // activityCategory:'strength'), never surfaced as fact in the card's
      // text (the real title wins whenever one exists; the category label is
      // only a generic fallback).
      const displayCategory: ActivityCategory =
        w.category === 'hybrid' || w.category === 'recovery' ? 'strength' : w.category;
      const label = isRich
        ? (completionData!.workoutTitle || TODAY_ACTIVITY_CATEGORY_LABEL[displayCategory])
        : TODAY_ACTIVITY_CATEGORY_LABEL[displayCategory];
      return {
        key: w.id ?? `${w.category}-${w.date.getTime()}-${i}`,
        category: displayCategory,
        title: label,
        // completionData.durationMinutes is this specific workout's own real
        // duration (not a daily total) — prefer it for the rich card; every
        // other card (including the rich one once completionData's 30-min
        // TTL has lapsed) falls back to its OWN doc's duration (seconds →
        // minutes), never another workout's or the day's cumulative total.
        minutes: Math.round(isRich && completionData!.durationMinutes > 0
          ? completionData!.durationMinutes
          : w.duration / 60),
        thumbnailUrl: isRich ? completionData!.thumbnailUrl : undefined,
        streak: completionData?.streak ?? 1,
        programId: isRich ? completionData!.programId : undefined,
        // Real workoutType for every card now (not just the rich one) — lets
        // icon resolution distinguish walking/running/cycling for older
        // same-day cards too, not only the just-finished one.
        workoutType: isRich ? completionData!.workoutType : w.workoutType,
      };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- see the primitive-deps note above
  }, [
    profile,
    todaysWorkouts,
    completionData?.workoutType,
    completionData?.workoutTitle,
    completionData?.thumbnailUrl,
    completionData?.streak,
    completionData?.durationMinutes,
    completionData?.programId,
  ]);

  // Gap 1 fix (30.08.2026, home/page.tsx 3-gap audit): mirrors pastDayStepGoalCard exactly
  // (below, near pastDayActivityCards), just for TODAY's own goalHistory entry instead of
  // selectedDate's. Without this, a day where only the step goal was met (no workout) showed
  // nothing at all in the top activity strip — todayActivityCards only ever reflects real
  // workout docs, and today's own goalHistory entry was never read anywhere in this file.
  const todayISO = toISODate(new Date());
  // Gap 3 fix (30.08.2026, David: full symmetry — hide on both past AND future, not past
  // only): shared by the top activity strip and the post-workout carousel gates below, both
  // of which describe real TODAY regardless of which day selectedDate points at.
  const isSelectedDateToday = selectedDate === todayISO;
  const todayGoalEntry = useMemo(
    () => profile?.progression?.goalHistory?.find((entry) => entry.date === todayISO) ?? null,
    [profile?.progression?.goalHistory, todayISO],
  );
  const todayStepGoalMet = !!todayGoalEntry?.stepGoalMet;
  const todayStepGoalCard: TodayActivityCardData | null = todayStepGoalMet
    ? {
        key: `stepgoal-${todayISO}`,
        category: 'steps',
        title: 'יעד הצעדים הושג',
        minutes: 0,
        stepsAchieved: todayGoalEntry?.stepsAchieved,
        streak: 1,
        workoutType: 'walking',
      }
    : null;

  // Gap 2 fix (30.08.2026): hoisted out of the anchor's own inner IIFE below (where it was
  // previously declared locally) so the widgets/continue-activity reorder decision can use
  // the exact same value — not a second copy of the same expression that could silently
  // drift from this one.
  const isTodayWorkoutDone = !!postWorkoutData || todayWorkoutDone;

  // F2.3 (19.08.2026, "unified workout summary" plan): tapping a
  // TodayActivityCard opens the real workout it represents.
  //
  // Simplified (22.08.2026, card-per-workout): card.key IS the real
  // Firestore doc id now — every card is built directly from one
  // getWorkoutsForDate doc (see todayActivityCards above), so there's no
  // more re-querying + category-matching at tap time, and no more
  // ambiguity about WHICH same-category doc a tap means (each card already
  // points at its own specific doc, not a category it happens to share with
  // others). The synthetic fallback key (used only when a doc genuinely has
  // no `.id`, not expected in practice — every other real-doc call site in
  // this file extends the same trust) is not a valid doc id; the history
  // route already renders its own "not found" state for that case (see
  // /workouts/[id]/history/page.tsx), so no special-casing is needed here.
  const handleTodayActivityCardTap = useCallback((card: TodayActivityCardData) => {
    // Mirrors handlePastDayActivityCardTap's guard below — the synthetic step-goal card (key
    // starts with 'stepgoal-') has no backing workout doc to open (Gap 1 fix, 30.08.2026).
    if (card.key.startsWith('stepgoal-')) return;
    router.push(`/workouts/${card.key}/history`);
  }, [router]);

  // Section 2 (17.8 build-plan, adaptive-snacking-valiant.md — scope closed 29.08.2026):
  // past-day activity summary, mounted in the SAME slot the pre-workout carousel/old anchor
  // already occupy (see the big IIFE below). Reuses getWorkoutsForDate exactly like
  // tryOpenCompletedWorkout/todaysWorkouts above, just parameterized by selectedDate instead
  // of "always today" — same primitive, no new query shape.
  const isViewingPastDate = selectedDate < toISODate(new Date());

  const [pastDayWorkouts, setPastDayWorkouts] = useState<WorkoutHistoryEntry[] | null>(null);
  useEffect(() => {
    if (!profile?.id || !isViewingPastDate) {
      setPastDayWorkouts(null);
      return;
    }
    let cancelled = false;
    getWorkoutsForDate(profile.id, selectedDate)
      .then((workouts) => {
        if (!cancelled) setPastDayWorkouts(workouts);
      })
      .catch((error) => {
        console.error('[home] Failed to load past-day workouts for', selectedDate, error);
        if (!cancelled) setPastDayWorkouts([]);
      });
    return () => {
      cancelled = true;
    };
  }, [profile?.id, selectedDate, isViewingPastDate]);

  // No completionData equivalent for a past day (that's a 30-min-TTL sessionStorage payload,
  // today-only by construction) — every card here is the plain, non-"rich" shape
  // todayActivityCards above already falls back to for every workout past the rich one.
  const pastDayActivityCards: TodayActivityCardData[] = useMemo(() => {
    if (!isViewingPastDate || !pastDayWorkouts || pastDayWorkouts.length === 0) return [];
    return pastDayWorkouts.map((w, i) => {
      const displayCategory: ActivityCategory =
        w.category === 'hybrid' || w.category === 'recovery' ? 'strength' : w.category;
      return {
        key: w.id ?? `${w.category}-${w.date.getTime()}-${i}`,
        category: displayCategory,
        title: TODAY_ACTIVITY_CATEGORY_LABEL[displayCategory],
        minutes: Math.round(w.duration / 60),
        streak: 1,
        workoutType: w.workoutType,
      };
    });
  }, [isViewingPastDate, pastDayWorkouts]);

  // Step-goal achievement for the viewed date — bounded by design to goalHistory's own
  // rolling 3-entry window (closed decision, 29.08.2026): there is no live persistence path
  // for a past day's stepGoalMet/stepsAchieved outside that window (confirmed via audit —
  // dailyProgress never carries these fields; they exist only on
  // profile.progression.goalHistory, capped at the 3 most recent days), so a date outside
  // the window is treated exactly like "no step data available" rather than inventing a new
  // storage mechanism.
  const pastDayGoalEntry = useMemo(
    () => profile?.progression?.goalHistory?.find((entry) => entry.date === selectedDate) ?? null,
    [profile?.progression?.goalHistory, selectedDate],
  );
  const pastDayStepGoalMet = isViewingPastDate && !!pastDayGoalEntry?.stepGoalMet;
  // Reuses TodayActivityCardData/TodayActivityCard as-is (David's explicit call, 29.08.2026 —
  // no new card design). Follow-up fix (29.08.2026): the first pass forced this through the
  // workout-shaped copy template ("אימון {label} בוצע" + "{minutes} דק' · {category}") with a
  // fabricated `minutes: 0`, flagged as a known rough edge. TodayActivityCard now has a small
  // additive `category: 'steps'` branch for exactly this case (real `stepsAchieved` shown
  // instead of a fake duration) — closes the gap without touching any other card's rendering.
  const pastDayStepGoalCard: TodayActivityCardData | null = pastDayStepGoalMet
    ? {
        key: `stepgoal-${selectedDate}`,
        category: 'steps',
        title: 'יעד הצעדים הושג',
        minutes: 0,
        stepsAchieved: pastDayGoalEntry?.stepsAchieved,
        streak: 1,
        workoutType: 'walking',
      }
    : null;

  // null (not []) while the fetch above hasn't settled yet — distinguishes "still loading"
  // from "confirmed nothing happened", same as todaysWorkouts's own null-until-resolved
  // contract, so the empty-day text below never flashes before real data has a chance to load.
  const pastDayDataReady = pastDayWorkouts !== null;
  const pastDayHasAnyAchievement = pastDayActivityCards.length > 0 || pastDayStepGoalMet;

  // Two-copy empty-day text (closed decision, 27.08.2026) — only shown once pastDayDataReady
  // AND neither a real workout nor the step goal was achieved on the viewed day.
  // isTodayTrainingDay is a pure read of the profile's own schedule config (recurringTemplate/
  // scheduleDays) — no Firestore round-trip, no hydration-timing question — see this file's
  // own audit note above resolveTodayCompletedDomains-style callers for why that matters.
  const pastDayWasScheduled = useMemo(
    () => isTodayTrainingDay(
      profile?.lifestyle?.scheduleDays,
      profile?.lifestyle?.recurringTemplate as Record<string, string[] | undefined> | undefined,
      new Date(selectedDate + 'T00:00:00'),
    ),
    [profile?.lifestyle?.scheduleDays, profile?.lifestyle?.recurringTemplate, selectedDate],
  );
  const pastDayEmptyCopy = pastDayWasScheduled
    ? 'לא הסתדר הפעם — מחכה לך אימון הבא'
    : 'רגוע, נחת — איזה כיף';

  const handlePastDayActivityCardTap = useCallback((card: TodayActivityCardData) => {
    // The synthetic step-goal card (key starts with 'stepgoal-') has no backing workout doc —
    // no history page to open, so this is a deliberate no-op for it, not a broken link.
    if (card.key.startsWith('stepgoal-')) return;
    router.push(`/workouts/${card.key}/history`);
  }, [router]);

  // ── post_workout suggestion carousel (home-generator-v2 plan, step 6) ──
  // Eager-compute the moment a completed workout is detected (mirrors the celebration
  // effect above).
  //
  // Phase B (18.08.2026, David-approved — "לולאת השלמת-אימון" plan, stage A): the carousel
  // now auto-reveals the moment postWorkoutSuggestions resolves — no tap required. Phase A's
  // tap-gate (handleRequestMore revealing a hidden carousel) is gone; the render condition
  // below is driven purely by data-readiness. Superseded the former
  // showPostWorkoutSuggestions boolean entirely — removed, not left dead.
  const [postWorkoutSuggestions, setPostWorkoutSuggestions] = useState<Suggestion[] | null>(null);
  const [startingSuggestionId, setStartingSuggestionId] = useState<string | null>(null);
  // POST_WORKOUT_SUGGESTION_CAROUSEL_ENABLED flipped true (22.08.2026) — the admin-email OR
  // this carried while the flag was off for everyone is gone; it was the actual gate keeping
  // this off for non-admin accounts (confirmed via device debugging), not just a local dev aid.
  const postWorkoutCarouselEnabled = POST_WORKOUT_SUGGESTION_CAROUSEL_ENABLED;
  // True only once the carousel has something real to show — NOT just "the flag is on".
  // Adversarial review (18.08.2026) caught a real gap: runSuggestionEngine's post_workout
  // generators do genuine Firestore-backed work (generateHomeWorkoutTrio), so there's a
  // real (not instant) window after completion where the flag is on but
  // postWorkoutSuggestions is still null — the carousel is expected to auto-reveal on its
  // own once it resolves.
  //
  // Stage B (18.08.2026): also the single source of truth for the header directly above the
  // carousel (see the render site below) — postWorkoutCarouselReady already means exactly
  // "is the carousel itself showing right now," so the header re-uses it as-is instead of a
  // separate postWorkoutCarouselVisible boolean (that boolean existed only because this file
  // didn't have postWorkoutCarouselReady yet at the time Stage B was first built against a
  // stale pre-Stage-A main — removed once rebased on top of Stage A).
  const postWorkoutCarouselReady =
    postWorkoutCarouselEnabled && !!postWorkoutSuggestions && postWorkoutSuggestions.length > 0;
  // A stalled generator (e.g. a Firestore call stuck on a bad connection right after an
  // outdoor workout) can leave postWorkoutSuggestions null forever even with the .catch()
  // below (rejection isn't the only way to hang — an unresolved promise is another). This
  // used to be tracked via postWorkoutCarouselTimedOut and surfaced through
  // TodayActivityStrip's "תציעו לי עוד אימון" CTA as a close-card-and-start-fresh escape
  // hatch — removed 21.08.2026 ("ארכיטקטורת הבית ומנוע-ההמלצות" doc redesign; David: that
  // CTA was a temporary mechanism, superseded by the real post-workout suggestions
  // carousel) along with the timeout tracking itself, since the CTA was its only remaining
  // consumer. Net effect: a stalled fetch in this narrow case now leaves the completion
  // card showing with no in-app escape hatch — flagged to David as a known tradeoff of
  // this removal, not silently dropped.

  useEffect(() => {
    if (!postWorkoutCarouselEnabled) return;
    if (!(postWorkoutData || todayWorkoutDone) || !profile) return;
    let cancelled = false;
    // Fix (31.08.2026, Section E — "no real route/walking suggestion post-workout"):
    // location used to be hardcoded null here because none of the post_workout generators
    // read it. That's no longer true — route.generator.ts now has 'post_workout' in its
    // surfaces (David's explicit choice among 3 options) and its own eligible() requires
    // a non-null location. gpsCoords (component-level, subscribed above) is a SILENT read —
    // same mechanism StatsOverview.tsx's own resolveWorkoutContext call already uses — never
    // triggers a permission prompt itself, so the original "skip an unnecessary GPS prompt
    // right after a workout" intent is preserved: users who already granted GPS access
    // elsewhere get the real route suggestion, everyone else falls back to null exactly like
    // before (David's explicit choice over the alternative — a soft-ask/requestPermissionIfAllowed
    // call here, which would reintroduce a real prompt right after finishing a workout).
    // gpsCoords deliberately stays out of the deps array below (same existing
    // eslint-disable as profile's own full object) — this effect fires once per completed
    // workout, not on every GPS position update; it reads whatever fix is available at that
    // moment, it doesn't re-rank as the user's location drifts while viewing the carousel.
    // Fix (31.08.2026, "edited today to strength, still recommends recovery"): a real
    // per-day userSchedule override for today (e.g. "add workout for today" in the planner)
    // is invisible to todayGoal unless fetched and passed in explicitly — see
    // BuildHomeUserContextInput.todayScheduleEntries's own doc comment (build-home-user-
    // context.ts) for why this builder doesn't fetch it internally.
    getScheduleEntries(profile.id, toISODate(new Date())).then((todayScheduleEntries) => {
      if (cancelled) return;
      const context = buildHomeUserContext({ profile, location: gpsCoords, surface: 'post_workout', todayScheduleEntries });
      return runSuggestionEngine(context).then((ranked) => {
        if (!cancelled) setPostWorkoutSuggestions(ranked);
      });
    }).catch((error) => {
      // Without this, a rejection left postWorkoutSuggestions null forever with
      // no visible error — confirmed 22.08.2026 (this was NOT what actually
      // caused the missing-cards-after-hybrid bug, which was the flag itself
      // being off for non-admin accounts, but the silent-rejection gap is real
      // regardless and worth closing here now that it's been found).
      console.error('[home] runSuggestionEngine failed for post_workout surface', error);
    });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [postWorkoutData, todayWorkoutDone, profile?.id]);

  // ── pre-workout suggestion carousel (17.8 build-plan, Section 1, commit 4/4) ──
  // Mirrors the post_workout effect above, one surface over, PLUS the Tier-1/Tier-2 split
  // full-strength.generator.ts now supports: runSuggestionEngineStreaming (not the plain
  // runSuggestionEngine Stage 3 used) lets full-strength's own suggestion (fast — the existing
  // IS_CHEAP_SUGGESTION_RANKING_ENABLED placeholder) kick off its real Tier-2 build the moment
  // it's known, instead of waiting for the slowest eligible generator (recovery-follow-up always
  // awaits a real generateHomeWorkoutTrio call inside its own generate()) to settle first.
  //
  // Only full-strength has a Tier-2 resolver today, so there's no "wasted build on a candidate
  // that gets dropped" risk in resolving unconditionally on discovery: with at most 4 home-
  // eligible generators, its suggestion either lands in the top 3 (kept below) or is the one
  // suggestion excluded — either way the resolved content isn't wasted, since a second Tier-2
  // generator doesn't exist yet to compete against it for priority. Revisit (prioritize the
  // eventual top-ranked suggestion, defer the rest) once a second one does.
  const [preWorkoutSuggestions, setPreWorkoutSuggestions] = useState<Suggestion[] | null>(null);
  const [startingPreWorkoutSuggestionId, setStartingPreWorkoutSuggestionId] = useState<string | null>(null);
  // Parity fix (27.08.2026): which suggestion the new carousel is currently centered on — the
  // old anchor's own header (title/description/location chip) always described exactly ONE
  // workout because it never showed more than one at a time; the carousel replaced that single
  // slot with 3 scrollable cards, so the header needs to know which one is "current" the same
  // way SuggestionCarousel itself does. Updated by handlePreWorkoutSettle below (the carousel's
  // own onSettle, already firing once per settle — including the initial mount settle at
  // index 0, so this is never left null once suggestions exist).
  const [activePreWorkoutSuggestion, setActivePreWorkoutSuggestion] = useState<Suggestion | null>(null);
  // Parity fix (27.08.2026), location-chip swap: per-suggestion swap results, kept OUTSIDE
  // full-strength.generator.ts's/recovery-follow-up.generator.ts's own Tier-2 caches on
  // purpose — this stays a pure, additive rendering-layer change with zero touches to
  // generator/cache internals. Mirrors StatsOverview.tsx's writeSwappedOption (lines 588-599),
  // but keyed by suggestion.id instead of "the one and only trio option index", since the
  // carousel can hold 3 independent workouts, each swappable on its own. Once a suggestion.id
  // is swapped it STAYS swapped (its own stamped executionLocation becomes that card's new
  // source of truth) even after the carousel settles on a different card — see
  // resolveHeroWorkout's overrideWorkout param.
  const [swappedWorkoutById, setSwappedWorkoutById] = useState<Record<string, GeneratedWorkout>>({});
  // Bumped after each Tier-2 resolve — getCachedFullStrengthWorkout's cache lives outside React
  // state, so nothing else would trigger a re-render of PreWorkoutCardRenderer (which reads that
  // cache directly at render time) once a background/on-settle resolve populates it. Only the
  // setter is needed — any state update re-renders this component's children regardless of
  // whether the new value itself is read anywhere.
  const [, setTier2ResolvedTick] = useState(0);

  // route joined full-strength with a Tier-2 resolver (26.08.2026, David's device-test
  // follow-up) — resolveRouteWorkout reuses useStepDeficitRoute.ts's own stepsToTargetKm
  // formula, not a second/competing distance computation. Dormant under TODAY's wiring though:
  // route.generator.ts's eligible() requires context.location!==null, and this effect always
  // passes location:null (see the comment on the effect below) — kept that way deliberately
  // (unrelated decision, not reopened here), so this resolver simply never fires yet. Left
  // wired in so the plumbing is ready and testable the moment home starts passing a real
  // location.
  const resolveHomeTier2 = useCallback((suggestion: Suggestion, context: UserContext, currentProfile: UserFullProfile) => {
    if (suggestion.generatorId === 'full-strength') {
      resolveFullStrengthWorkout(suggestion.id, currentProfile, context)
        .then(() => setTier2ResolvedTick((t) => t + 1))
        .catch((error) => console.error('[home] resolveFullStrengthWorkout failed', error));
      return;
    }
    if (suggestion.generatorId === 'route') {
      resolveRouteWorkout(suggestion.id, context)
        .then(() => setTier2ResolvedTick((t) => t + 1))
        .catch((error) => console.error('[home] resolveRouteWorkout failed', error));
    }
  }, []);

  useEffect(() => {
    if (!HOME_PRE_WORKOUT_SUGGESTION_CAROUSEL_ENABLED) return;
    if (!profile) return;
    // Section 1 (17.8 build-plan next-phase, 27.08.2026): only ever rank for the REAL
    // current day — a past/future selectedDate gets its own separate content (Sections 2/3),
    // not a re-run of this generator competition. NOT just a render-time filter:
    // resolveHomeTier2's full-strength branch resolves into a cache keyed ONLY by userId
    // (`full-strength-cheap-${userId}`, full-strength.generator.ts — confirmed NOT
    // date-scoped, no invalidation hook), so letting this effect actually run for a
    // future/past day would silently overwrite today's already-cached Tier-2 workout with
    // that other day's content.
    if (selectedDate !== toISODate(new Date())) {
      setPreWorkoutSuggestions(null);
      return;
    }
    let cancelled = false;
    // location: null — same reasoning as the post_workout call site above: skip an
    // unnecessary GPS prompt. route.generator.ts (surfaces:['map','home']) requires a real
    // location in its own eligible(), so it's naturally excluded here, not specially filtered.
    // date (Section 0 date-awareness fix, 27.08.2026): the day being VIEWED, not always "now" —
    // without this, todayGoal/todayCompletedDomains (and the alreadyTrained ranking factor they
    // feed) were silently computed against the real calendar date regardless of which day the
    // user was actually looking at. selectedDate is now also a dependency below for the same
    // reason — switching days previously didn't even re-run this effect at all.
    // Fix (31.08.2026) — see the post_workout ranking effect's own comment, above, and
    // BuildHomeUserContextInput.todayScheduleEntries's doc comment (build-home-user-
    // context.ts): selectedDate IS today's ISO string here (guaranteed by the early return
    // above), so this is the same real per-day override fetch, for the same reason.
    getScheduleEntries(profile.id, selectedDate).then((todayScheduleEntries) => {
      if (cancelled) return;
      const context = buildHomeUserContext({
        profile,
        location: null,
        surface: 'home',
        date: new Date(selectedDate + 'T00:00:00'),
        todayScheduleEntries,
      });
      return runSuggestionEngineStreaming(context, (suggestion) => {
        // TEMPORARY diagnostic (26.08.2026, per David's request) — understand why one suggestion
        // outranks another on a real device; remove once ranking behavior is understood/tuned.
        console.log(
          `[home] scoreBreakdown "${suggestion.generatorId}" (score=${suggestion.score}):`,
          suggestion.scoreBreakdown,
        );
        if (!cancelled) resolveHomeTier2(suggestion, context, profile);
      }).then((ranked) => {
        if (!cancelled) setPreWorkoutSuggestions(ranked.slice(0, 3));
      });
    }).catch((error) => {
      console.error('[home] runSuggestionEngine failed for home surface', error);
    });
    return () => { cancelled = true; };
  }, [profile, resolveHomeTier2, selectedDate]);

  // Parity fix (27.08.2026) — location/program-icon context for the new carousel's header and
  // HeroWorkoutCard props (workoutLocation/programIconKey), copied verbatim from
  // StatsOverview.tsx's own seed derivations: the "ADVANCED LOCATION CHAIN" (lines 694-706)
  // and primaryDomainId (lines 442-452). Deliberately two separate copies, not one shared
  // extraction — StatsOverview's version also feeds its own reactive "engine echo"
  // (currentWorkoutLocation, rewritten every trio generation) that this carousel has no
  // equivalent of; sharing the util now would mean threading that extra concept through for
  // no behavioral gain. Same fallback order either way, so no drift risk in practice.
  const carouselSeedLocation = useMemo((): string => {
    if (!profile) return 'home';
    const storedLocation = typeof window !== 'undefined'
      ? sessionStorage.getItem('currentWorkoutLocation')
      : null;
    // locationPreference isn't in UserFullProfile's typed shape (same untyped runtime field
    // StatsOverview.tsx's own chain reads) — narrowed via `unknown`, not `any`, so this stays
    // eslint-clean without inventing a new type for a field this file doesn't otherwise touch.
    const lifestyleLocation = (profile.lifestyle as Record<string, unknown> | undefined)
      ?.locationPreference as string | undefined;
    return storedLocation || lifestyleLocation || profile.firstWorkoutLocation || 'home';
  }, [profile]);

  const carouselProgramIconKey = useMemo((): string | null => {
    if (!profile) return null;
    const activeProgram = profile.progression?.activePrograms?.[0];
    if (activeProgram?.templateId) return activeProgram.templateId;
    const isHashKey = (k: string) => k.length > 15 && !k.includes('_');
    const domainsKeys = profile.progression?.domains ? Object.keys(profile.progression.domains) : [];
    const slugDomainKeys = domainsKeys.filter((k) => !isHashKey(k));
    if (slugDomainKeys.length > 0) return slugDomainKeys[0];
    if (domainsKeys.length > 0) return domainsKeys[0];
    const tracksKeys = profile.progression?.tracks ? Object.keys(profile.progression.tracks) : [];
    return tracksKeys.length > 0 ? tracksKeys[0] : null;
  }, [profile]);

  // Parity fix (27.08.2026), location-chip swap: the active suggestion's real workout, WITH
  // any prior swap override applied — computed at the top level (not inside the render IIFE
  // further below) because useExercisePool/useSwapAll right after need it, and hooks must run
  // unconditionally every render, not nested inside a render-time closure.
  const activeCarouselOverride = activePreWorkoutSuggestion
    ? swappedWorkoutById[activePreWorkoutSuggestion.id]
    : undefined;
  const activeCarouselWorkout = activePreWorkoutSuggestion
    ? resolveHeroWorkout(activePreWorkoutSuggestion, activeCarouselOverride)
    : null;
  // Effective location for the active suggestion: its own stamped executionLocation once
  // swapped (useSwapAll.ts:294 stamps this on every swap result), else the profile-seed
  // default — same fallback chain StatsOverview.tsx's own anchorShownLocation uses (lines
  // 602-605).
  const activeCarouselLocation = (activeCarouselWorkout?.executionLocation
    || carouselSeedLocation
    || 'park') as ExecutionLocation;
  const isActiveSuggestionHeroTreated = !!activePreWorkoutSuggestion
    && hasHeroCardTreatment(activePreWorkoutSuggestion.generatorId);

  // item 2 — reuse the drawer's pool hook so the swap does 0 per-exercise reads. Gated on
  // isActiveSuggestionHeroTreated too: safety-net/route have no swappable content, no reason
  // to fetch the full exercise catalogue while one of those is focused.
  const { exercisePool: carouselExercisePool } = useExercisePool({
    isOpen: HOME_PRE_WORKOUT_SUGGESTION_CAROUSEL_ENABLED && isActiveSuggestionHeroTreated,
    generatedWorkout: activeCarouselWorkout,
    workoutId: undefined,
  });

  // Writeback: keyed by the suggestion that was ACTIVE when the swap was requested (captured
  // via this callback's own closure/dependency, not re-read after the async swap resolves) —
  // correct even if the carousel settles on a different card while a swap is still in flight.
  const writeSwappedCarouselOption = useCallback((gw: GeneratedWorkout) => {
    if (!activePreWorkoutSuggestion) return;
    setSwappedWorkoutById((prev) => ({ ...prev, [activePreWorkoutSuggestion.id]: gw }));
  }, [activePreWorkoutSuggestion]);

  const { swapAll: carouselSwapAll } = useSwapAll({
    generatedWorkout: activeCarouselWorkout,
    onGeneratedWorkoutUpdate: writeSwappedCarouselOption,
    userProfile: profile,
    currentLocation: activeCarouselLocation,
    exercisePool: carouselExercisePool,
  });

  /** Carousel location chip → swap methods/exercises in place (NOT a regen) — same pattern as
   *  StatsOverview.tsx's own handleAnchorLocationChange (lines 632-639), minus pinnedLocation:
   *  the chip's displayed value and each card's workoutLocation both already derive from
   *  swappedWorkoutById's own stamped executionLocation once a swap lands (see
   *  activeCarouselLocation above and the render section below), so a separate "pin" state
   *  would just duplicate that. */
  const handleCarouselLocationChange = useCallback((id: LocationId) => {
    if (typeof window !== 'undefined') {
      sessionStorage.setItem('currentWorkoutLocation', id);
    }
    void carouselSwapAll('location', id);
  }, [carouselSwapAll]);

  // Defensive backstop, not the primary mechanism: by the time streaming above has discovered
  // every eligible generator, full-strength's Tier-2 build is already resolved or in flight.
  // This only matters if that build somehow never started or was dropped — settling on it here
  // re-triggers resolveFullStrengthWorkout, which is cache-first and de-dupes concurrent calls
  // for the same id, so this can never cause a redundant generateHomeWorkoutTrio call.
  const handlePreWorkoutSettle = useCallback((suggestion: Suggestion) => {
    setActivePreWorkoutSuggestion(suggestion);
    if (!profile) return;
    const context = buildHomeUserContext({
      profile,
      location: null,
      surface: 'home',
      date: new Date(selectedDate + 'T00:00:00'),
    });
    resolveHomeTier2(suggestion, context, profile);
  }, [profile, resolveHomeTier2, selectedDate]);
  // handlePreWorkoutCardTap (the pre-workout carousel's onStart handler) is declared further
  // below, right after handleWorkoutGenerated — it depends on that setter, which itself depends
  // on state declared later in this file.

  // Dedicated useWorkoutSession instance for post_workout suggestion starts — always fed via
  // handleStartWorkout's overrideGeneratedWorkout argument (see its own JSDoc: "for callers
  // holding a fresher value than this hook's own closed-over React-state prop"), so the
  // hook-captured workout/generatedWorkout props below are deliberately static/unused.
  const { handleStartWorkout: handlePostWorkoutStart } = useWorkoutSession({
    workout: { id: 'post-workout-suggestion', title: '', segments: [] },
    workoutPlan: null,
    generatedWorkout: null,
    isWarmupActive: true,
    workoutLocation: undefined,
  });

  const handlePostWorkoutSuggestionStart = useCallback(async (suggestion: Suggestion) => {
    if (!profile) return;
    setStartingSuggestionId(suggestion.id);
    try {
      // Fix (31.08.2026, Section E) — see the post_workout ranking effect's own comment,
      // above, for why this is now a silent gpsCoords read instead of hardcoded null: a
      // tapped route suggestion needs the real location to resolve its actual route, not
      // just to rank it.
      const context = buildHomeUserContext({ profile, location: gpsCoords, surface: 'post_workout' });
      const workout = await suggestionToGeneratedWorkout(context, suggestion);
      if (!workout) return;
      handlePostWorkoutStart(workout);
    } finally {
      setStartingSuggestionId(null);
    }
  }, [profile, handlePostWorkoutStart, gpsCoords]);

  // Check for query params from post-workout CTA, JIT return, or join landing
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      if (params.get('openWizard') === 'true') {
        setShowLifestyleWizard(true);
        window.history.replaceState({}, '', '/home');
      }
      if (params.get('startWorkout') === 'true') {
        window.history.replaceState({}, '', '/home');
        // Defer so the page finishes mounting before triggering the workout flow
        setTimeout(() => handleHeroPress(), 300);
      }
      // ?openGroupDrawer=<groupId>&joined=true — navigate here after a group join
      // so the home page opens the group drawer (or post-join celebration) instead
      // of the community tab. Clears the params immediately to avoid re-opening on refresh.
      const openGroupId = params.get('openGroupDrawer');
      if (openGroupId) {
        window.history.replaceState({}, '', '/home');
        const justJoined = params.get('joined') === 'true';
        getDoc(firestoreDoc(db, 'community_groups', openGroupId))
          .then((snap) => {
            if (!snap.exists()) return;
            const group = { id: snap.id, ...snap.data() } as CommunityGroup;
            if (justJoined) {
              const allSlots: ScheduleSlot[] = group.scheduleSlots?.length
                ? group.scheduleSlots
                : group.schedule
                  ? [group.schedule]
                  : [];
              setJoinSuccessData({
                name:          group.name,
                verb:          GROUP_VERB[group.category] ?? 'יתאמן',
                scheduleSlots: allSlots,
                category:      group.category,
                address:       group.meetingLocation?.address,
                group,
              });
              // Refresh so profile.social.groupIds picks up the membership
              // written by /api/join/confirm before navigating here.
              refreshProfile().catch(() => {});
            } else {
              setBannerGroup(group);
            }
          })
          .catch((err) => {
            console.error('[Home] failed to open group drawer from query param:', err);
          });
      }
    }
  }, []);


  // Lifestyle Bridge Logic
  const shouldShowBridge =
    profile?.onboardingStatus === 'PENDING_LIFESTYLE' &&
    !profile?.lifestyle?.scheduleDays &&
    !showLifestyleWizard;

  const handleStartWizard = useCallback(() => {
    setShowLifestyleWizard(true);
  }, []);

  const handleSkipBridge = useCallback(() => {
    if (typeof window !== 'undefined') {
      sessionStorage.setItem('skipped_bridge', 'true');
    }
  }, []);

  const handleWizardComplete = useCallback(async () => {
    setShowLifestyleWizard(false);
    await refreshProfile();
  }, [refreshProfile]);

  // Dashboard mode flags
  const hasProgram = !!(
    profile?.progression?.domains && Object.keys(profile.progression.domains).length > 0
  );
  // absent=absent (⑨): the strength hero-gate needs an ASSESSED strength domain (level > 0), not
  // merely "any domain key". A user with no filled strength domain is routed to the questionnaire
  // instead of composing an invented/generic workout. Non-strength (running/flexibility) excluded.
  const hasStrengthProgram = (() => {
    const NON_STRENGTH = new Set(['running', 'flexibility']);
    const readLvl = (v: any) => (v == null ? 0 : (v.currentLevel ?? v.level ?? 0));
    const anyAssessed = (obj: Record<string, any> = {}) =>
      Object.entries(obj).some(([k, v]) => !NON_STRENGTH.has(k) && readLvl(v) > 0);
    return anyAssessed(profile?.progression?.domains as any) || anyAssessed(profile?.progression?.tracks as any);
  })();
  const isMapOnlyUser = profile?.onboardingPath === 'MAP_ONLY' && !hasProgram;
  // Map path vs Assessment path: tracks/domains with level > 1 = assessment done
  const hasCompletedAssessment = (() => {
    const tracks = profile?.progression?.tracks ?? {};
    const domains = profile?.progression?.domains ?? {};
    const hasLevelAbove1 = (obj: Record<string, { currentLevel?: number } | undefined>) =>
      Object.values(obj).some((v) => (v?.currentLevel ?? 1) > 1);
    return (
      hasLevelAbove1(tracks) ||
      hasLevelAbove1(domains) ||
      profile?.onboardingStatus === 'COMPLETED'
    );
  })();
  // Health declaration check
  const isHealthMissing = (() => {
    if (!profile) return false;
    return !hasAcceptedHealthDeclaration(profile as any);
  })();

  // Dev Mode
  const [showDevPanel, setShowDevPanel] = useState(false);
  const userEmail = auth.currentUser?.email || profile?.core?.email;
  const isDevModeAvailable = isAdminEmailAllowed(userEmail ?? null);
  const currentTier = profile?.core?.accessLevel ?? 1;
  const handleSetTier = async (tier: 1 | 2 | 3) => {
    if (!profile?.id) return;
    try {
      await updateDoc(firestoreDoc(db, 'users', profile.id), { 'core.accessLevel': tier });
      refreshProfile();
    } catch (e) {
      console.error('[DevMode] Failed to set tier:', e);
    }
  };

  // Dynamic workout state
  const generatedWorkoutRef = useRef<GeneratedWorkout | null>(null);
  const [generatedWorkout, setGeneratedWorkout] = useState<GeneratedWorkout | null>(null);
  // Which date generatedWorkoutRef's current content actually belongs to (NaN-opacity/
  // stale-drawer bug, 01.09.2026): handleHeroPress used to gate its stale-workout flush on
  // `explicitDate !== selectedDate` — a proxy that assumes "same selected date = ref still
  // valid," which breaks the moment a day's schedule content changes (e.g. a drag-reschedule)
  // without selectedDate itself changing. Tracking the ref's own owning date directly fixes
  // that at the source. Set alongside every explicit clear/target of generatedWorkoutRef;
  // deliberately NOT touched by handleWorkoutGenerated itself or handleIntensityToggleSelect
  // (an in-drawer intensity swap doesn't change which date is being previewed).
  const generatedWorkoutForDateRef = useRef<string | null>(null);
  // Generation counter, appended to uniqueWorkoutId/recoveryShortcutWorkoutId below (stale-
  // drawer bug, second finding, 01.09.2026): those ids were purely date+profile-derived, so
  // WorkoutPreviewDrawer's own dynamicContent-regeneration effect (keyed on workout.id) never
  // re-fired for a genuinely new schedule situation on the SAME date -- it kept serving a
  // stale title from an earlier, unrelated interaction even after generatedWorkoutRef itself
  // was correctly flushed. Bumped at the exact same 2 sites as generatedWorkoutForDateRef
  // above, so both id-building sites (openWorkoutPreview and recoveryShortcutWorkoutId) stay
  // "provably the same value" for the same tap, exactly as recoveryShortcutWorkoutId's own
  // comment already documents for the date component. Audited: nothing outside this file
  // reconstructs this id format or compares it against a separately-computed identity (the
  // home-page generation pipeline -- StatsOverview/generateHomeWorkoutTrio -- never produces
  // or touches this id at all; GeneratedWorkout has no id field), so a new suffix here cannot
  // desync anything else.
  const workoutGenerationRef = useRef(0);

  // Trio intensity selector — mirrored out of StatsOverview (see TrioSelector's
  // own doc comment) so WorkoutPreviewDrawer can render the inline toggle row
  // (Part א, "ארכיטקטורת הבית ומנוע-ההמלצות" doc) once the preview opens.
  const [trioSelector, setTrioSelector] = useState<TrioSelector | null>(null);

  const handleWorkoutGenerated = useCallback((workout: GeneratedWorkout) => {
    generatedWorkoutRef.current = workout;
    setGeneratedWorkout(workout);
    setIsWorkoutLoading(false);
  }, []);

  // Regression fix (30.08.2026, "3 intensity toggles disappeared from the workout preview
  // drawer"): the old StatsOverview anchor was always mounted and ran generateHomeWorkoutTrio
  // in the background regardless of whether its preview was even open, mirroring all 3 trio
  // slots out via onTrioSelectorChange into this same trioSelector state. The new pre-workout
  // carousel replaces that anchor outright for today (readyPreWorkoutSuggestions ternary,
  // below) — nothing in handlePreWorkoutCardTap ever touched trioSelector, so it stayed null
  // forever and WorkoutPreviewDrawer's own `intensityOptions && intensityOptions.length > 1`
  // gate never had anything to render. Scope: full-strength suggestions only —
  // recovery-follow-up's own trio options are content-type flavors at one fixed difficulty
  // (REST_DAY_CONFIGS, home-workout.service.ts), not difficulty levels, so it never showed a
  // toggle before this regression either and isn't touched here.
  //
  // Remembers which suggestion+context the currently-open drawer's toggle belongs to, so a tap
  // on a different difficulty knows what to (lazily) recompute — cleared on the drawer's
  // onClose below so it can never leak into the next preview (a different suggestion, a
  // calendar-tap preview, or StatsOverview on a past/future date, none of which use this).
  const preWorkoutTrioSuggestionRef = useRef<{ suggestion: Suggestion; context: UserContext } | null>(null);

  // Regression fix (30.08.2026): lazily recomputes ONE specific difficulty slot for the
  // carousel's full-strength hero card, on an actual toggle tap only — no background
  // pre-generation of all 3 like the old anchor did (David's explicit call).
  const handleIntensityToggleSelect = useCallback(async (index: number) => {
    const remembered = preWorkoutTrioSuggestionRef.current;
    if (!remembered || !profile) return;
    const optionIndex = index as 0 | 1 | 2;
    const previousIndex = trioSelector?.selectedIndex ?? 1;
    // Optimistic selection — the pill highlights immediately, matching the old anchor's own
    // toggle feel, even though the real workout for this slot may still need a real fetch.
    setTrioSelector((prev) => (prev ? { ...prev, selectedIndex: optionIndex } : prev));
    setIsWorkoutLoading(true);
    // Clearing generatedWorkout (not just isWorkoutLoading) is what actually makes
    // WorkoutPreviewDrawer show a loading skeleton BELOW the toggle row — verified directly in
    // WorkoutPreviewDrawer.tsx before writing this: its branching is `isGeneratingWorkout &&
    // !generatedWorkout ? <Skeleton> : generatedWorkout ? (...isRecomputing ? <Skeleton> :
    // <ExerciseList>) : ...` — that second branch's skeleton (isRecomputing) is drawer-internal
    // (swap-only), with no way to know about this fetch, so leaving generatedWorkout non-null
    // during this await would silently keep showing the PREVIOUS difficulty's exercises with
    // no loading indication at all.
    setGeneratedWorkout(null);
    try {
      const workout = await resolveFullStrengthWorkoutAtIndex(
        remembered.suggestion.id,
        profile,
        remembered.context,
        optionIndex,
      );
      if (!workout) {
        // Assessment-gated or a genuine generation failure — restore the previous workout
        // rather than leave the drawer stuck on an empty skeleton with nothing to show.
        setGeneratedWorkout(generatedWorkoutRef.current);
        setTrioSelector((prev) => (prev ? { ...prev, selectedIndex: previousIndex } : prev));
        return;
      }
      handleWorkoutGenerated(workout);
      setTrioSelector((prev) => (prev ? {
        ...prev,
        selectedIndex: optionIndex,
        options: prev.options.map((opt, i) => (i === optionIndex ? { ...opt, duration: workout.estimatedDuration } : opt)),
      } : prev));
    } catch (error) {
      console.error('[home] resolveFullStrengthWorkoutAtIndex failed', error);
      setGeneratedWorkout(generatedWorkoutRef.current);
      setTrioSelector((prev) => (prev ? { ...prev, selectedIndex: previousIndex } : prev));
    } finally {
      setIsWorkoutLoading(false);
    }
  }, [profile, handleWorkoutGenerated, trioSelector]);
  // handlePreWorkoutCardTap (the pre-workout carousel's onStart handler) is declared further
  // below, right after handleRecoveryShortcutStartRef — it needs that ref for its
  // recovery-follow-up direct-start branch (26.08.2026 follow-up), which is declared later in
  // this file than the carousel wiring itself.

  // ── Recovery-video-trio direct-start hand-off (HOME_RECOVERY_START_SHORTCUT_ENABLED) ──
  // Same useWorkoutSession hook WorkoutPreviewDrawer's own "Start" button uses
  // (see hooks/useWorkoutSession.ts) — called here at HomePage's top level so
  // handleHeroPress can hand off straight to the active player, bypassing
  // setSelectedWorkout(...) (which is what opens the drawer) for the
  // discriminator-matched case. Every input mirrors what openWorkoutPreview
  // already builds for the SAME tap:
  //   - id: identical scheme to openWorkoutPreview's uniqueWorkoutId
  //     (`workout-${date}-${uid8}-g${generation}`), keyed on `selectedDate`
  //     rather than the tap-local `dateToUse`, and reading the SAME
  //     workoutGenerationRef counter — provably the same value here: the only
  //     case where handleHeroPress's `dateToUse` differs from `selectedDate`
  //     is an explicitDate-driven different-date tap, which unconditionally
  //     clears generatedWorkoutRef.current (see the block below) BEFORE this hook's
  //     discriminator can ever match, so the shortcut never fires with a
  //     mismatched id.
  //   - workoutPlan: always null — this shortcut only ever targets the
  //     generatedWorkout-sourced trio, never the legacy favorites-flow plan.
  //   - generatedWorkout: the React state, passed here only to satisfy
  //     useWorkoutSession's shape (WorkoutPreviewDrawer is wired the same
  //     way). This closed-over state CAN be stale at the exact instant the
  //     shortcut fires (same-tap synchronous re-entrancy — see the race
  //     explained at the call site below, inside handleHeroPress), so the
  //     actual start call never trusts it: it passes
  //     generatedWorkoutRef.current explicitly as handleStartWorkout's
  //     override argument, which always wins over this closed-over value
  //     when provided.
  //   - isWarmupActive: true, matching the drawer's own initial default. A
  //     pure recovery-video-trio plan never has a seg-warmup segment, so this
  //     flag has nothing to gate either way.
  //   - workoutLocation: undefined — home/page.tsx does not pass this prop to
  //     <WorkoutPreviewDrawer/> today either; unchanged.
  const recoveryShortcutWorkoutId = `workout-${selectedDate}-${profile?.id?.slice(0, 8) || 'guest'}-g${workoutGenerationRef.current}`;
  const { handleStartWorkout: handleRecoveryShortcutStart } = useWorkoutSession({
    workout: {
      id: recoveryShortcutWorkoutId,
      title: generatedWorkout?.title || 'שיקום',
      segments: [],
    },
    workoutPlan: null,
    generatedWorkout,
    isWarmupActive: true,
    workoutLocation: undefined,
    onStartWorkout: (workoutId) => router.push(`/workouts/${workoutId}/active`),
  });
  // Latest-ref indirection purely so handleHeroPress does not need
  // handleRecoveryShortcutStart in its own dependency array. The function
  // above already gets a new identity on every HomePage render regardless
  // (its onStartWorkout is an inline closure recreated each render, and
  // generatedWorkout is also one of its deps, needed for the drawer's own
  // no-arg use case) — that churn is harmless here now that the call site
  // below always passes the fresh workout explicitly as an argument rather
  // than relying on this closure's captured state. Assigning `.current`
  // directly in the render body (not inside an effect) keeps it current
  // before any subsequent tap can invoke it — the same pattern already used
  // by generatedWorkoutRef above.
  const handleRecoveryShortcutStartRef = useRef(handleRecoveryShortcutStart);
  handleRecoveryShortcutStartRef.current = handleRecoveryShortcutStart;

  // Tapping a pre-workout card (17.8 build-plan, Section 1 follow-up, 26.08.2026) opens the
  // SAME shared WorkoutPreviewDrawer instance the anchor card already uses below (David's
  // explicit call: "exactly like the old card's behavior today" — a preview first, never
  // straight into a live workout) — EXCEPT recovery-follow-up, scoped narrowly (26.08.2026
  // follow-up #1) to reuse the SAME "pure recovery video trio" direct-start shortcut
  // handleHeroPress already uses above (HOME_RECOVERY_START_SHORTCUT_ENABLED): structurally
  // just one continuous follow-along video, nothing meaningful to preview. Branching on
  // suggestion.generatorId directly here — rather than re-deriving handleHeroPress's own
  // isPureRecoveryVideoTrioGenerated shape-check on the resolved `workout` — is a safe,
  // equivalent simplification for this one generator specifically: recovery-follow-up's
  // buildRecoveryFollowUpWorkout always routes through the same recovery-video-trio content
  // pool (isRecoveryDay:true), so every suggestion it produces already has that exact shape by
  // construction. full-strength (and anything else) keeps the drawer-first flow below,
  // unchanged (1ddd3df4, approved). interceptWorkoutStart still gates this branch — the health
  // declaration must never be bypassable by this shortcut, exactly like handleHeroPress's own
  // comment on the same guard above.
  //
  // No dedicated useWorkoutSession instance needed for the drawer-first branch: the drawer's OWN
  // internal "Start" button already instantiates useWorkoutSession itself
  // (WorkoutPreviewDrawer.tsx), reading directly from the SAME `workout`/`generatedWorkout`
  // props/state populated here — handleWorkoutGenerated above is the same setter StatsOverview's
  // own generation effect already calls (onWorkoutGenerated), and setSelectedWorkout's minimal
  // stub shape (segments: []) mirrors handleCalendarEntryTap's own established pattern earlier
  // in this file: the drawer renders real exercise/media content from `generatedWorkout`, not
  // from this stub's segments.
  const handlePreWorkoutCardTap = useCallback(async (suggestion: Suggestion) => {
    if (!profile) return;
    setStartingPreWorkoutSuggestionId(suggestion.id);
    try {
      const context = buildHomeUserContext({
        profile,
        location: null,
        surface: 'home',
        date: new Date(selectedDate + 'T00:00:00'),
      });
      const workout = await suggestionToHomeGeneratedWorkout(context, suggestion);
      // No real GeneratedWorkout to preview (e.g. safety-net/route, which have no Tier-2
      // resolver yet) — same documented degrade pick-post-workout-suggestion.ts already
      // established for safety-net: no-op rather than opening an empty/broken drawer.
      if (!workout) return;

      if (suggestion.generatorId === 'recovery-follow-up' && HOME_RECOVERY_START_SHORTCUT_ENABLED) {
        // No activityType arg (defaults to 'unknown') — a recovery video is neither of the two
        // documented categories ('running' strips equipment from the requirements list;
        // 'strength' keeps it), so 'unknown' is the honest default rather than mislabeling it
        // 'strength'. Functionally identical either way today: useRequiredSetup.ts's
        // checkRequirements only branches on 'running'.
        interceptWorkoutStart(() => {
          // handleRecoveryShortcutStartRef is the SAME useWorkoutSession instance the anchor
          // card's own recovery-video-trio shortcut uses (handleHeroPress below) — its
          // `workout.id` is recoveryShortcutWorkoutId (date+profile-scoped), not derived from
          // this suggestion.id. Sharing that id with the anchor's shortcut is safe, not
          // accidental: useWorkoutSession's handleStartWorkout builds `currentWorkoutPlan`
          // fresh from the EXPLICIT override argument passed here (`workout`, this
          // suggestion's own resolved GeneratedWorkout) every time — the id is only a
          // sessionStorage key / URL segment / last-resort Firestore-lookup key, never the
          // source of which content gets shown. Both entry points also genuinely target the
          // same underlying thing (today's rest-day recovery video, same profile, same
          // generateHomeWorkoutTrio({isRecoveryDay:true}) pipeline) — a shared id reflects
          // that correctly rather than colliding two unrelated sessions. In a single browser
          // tab, whichever card the user taps last simply overwrites sessionStorage and
          // navigates immediately after, so there is no concurrent-write race either.
          handleRecoveryShortcutStartRef.current(workout);
        });
        return;
      }

      handleWorkoutGenerated(workout);
      setSelectedWorkout({
        id: `pre-workout-${suggestion.id}`,
        title: workout.title,
        description: workout.description,
        level: 'medium',
        difficulty: String(workout.difficulty),
        duration: workout.estimatedDuration,
        coverImage: '',
        segments: [],
      });

      // Regression fix (30.08.2026) — only full-strength has real difficulty-level trio
      // options (see handleIntensityToggleSelect's own doc comment for why
      // recovery-follow-up/route/safety-net are excluded). Static placeholder labels/
      // durations so the toggle row appears the instant the drawer opens, matching David's
      // explicit call — not fetched, not awaited; durations mirror BOLT_DURATION_CAPS
      // (home-workout.service.ts) exactly. selectedIndex starts at 1/Balanced because
      // `workout` above already IS that exact slot (suggestionToHomeGeneratedWorkout ->
      // resolveHeroWorkout -> resolveFullStrengthWorkout, always index 1) — no extra
      // computation needed to show the initially-selected pill correctly.
      if (suggestion.generatorId === 'full-strength') {
        preWorkoutTrioSuggestionRef.current = { suggestion, context };
        setTrioSelector({
          options: [
            { label: 'קלה', difficulty: 1, duration: 30 },
            { label: 'מאוזנת', difficulty: 2, duration: 45 },
            { label: 'אינטנסיבית', difficulty: 3, duration: 60 },
          ],
          selectedIndex: 1,
          onSelect: handleIntensityToggleSelect,
        });
      } else {
        // Clear any toggle state left over from a previous full-strength preview — this
        // suggestion (recovery-follow-up/route/safety-net) never had toggles before this
        // regression fix either, so it must not inherit stale ones now.
        preWorkoutTrioSuggestionRef.current = null;
        setTrioSelector(null);
      }
    } finally {
      setStartingPreWorkoutSuggestionId(null);
    }
  }, [profile, handleWorkoutGenerated, handleIntensityToggleSelect, interceptWorkoutStart, selectedDate]);

  // Active program icon key — derived dynamically from today's recurring
  // template entry first so that a `calisthenics_upper` (UPPER_CALISTHENICS)
  // schedule day renders the correct muscle icon everywhere, rather than
  // leaking the profile-level specialist track (e.g. 'front_lever' → 'pullup').
  //
  // Priority:
  //   1. Today's recurring template primary program ID  (e.g. 'UPPER_CALISTHENICS')
  //   2. activePrograms[0].templateId fallback
  const programIconKey = useMemo(() => {
    const todayLetter = getHebrewDayLetter(new Date());
    const todayTemplateId =
      profile?.lifestyle?.recurringTemplate?.[todayLetter]?.[0] ?? null;
    return todayTemplateId ?? profile?.progression?.activePrograms?.[0]?.templateId;
  }, [profile?.lifestyle?.recurringTemplate, profile?.progression?.activePrograms]);

  // Alerts
  useEffect(() => {
    if (scheduleState.showMissedAlert) setShowAlert('missed');
    else if (scheduleState.showComebackAlert) setShowAlert('comeback');
  }, [scheduleState.showMissedAlert, scheduleState.showComebackAlert]);

  // Refresh profile from Firestore
  useEffect(() => {
    if (_hasHydrated && profile?.id) {
      refreshProfile().catch((e) => console.error('[HomePage] Error refreshing profile:', e));
    }
  }, [_hasHydrated, profile?.id, refreshProfile]);

  // ── Inner "open preview" logic extracted so it can be called with OR without JIT ──
  // `targetDate` is the ISO date the user tapped — passed synchronously from
  // handleHeroPress so the workout ID and any downstream resolution use the
  // clicked date rather than the stale `selectedDate` state value.
  const openWorkoutPreview = useCallback((targetDate?: string) => {
    const today = targetDate ?? new Date().toISOString().split('T')[0];
    const uniqueWorkoutId = `workout-${today}-${profile?.id?.slice(0, 8) || 'guest'}-g${workoutGenerationRef.current}`;
    const gw = generatedWorkoutRef.current;

    if (gw?.exercises && typeof window !== 'undefined') {
      const { getLocalizedText: glt } = require('@/features/content/exercises');
      const exercises = gw.exercises.map((ex) => {
        const resolveHighlights = (): string[] => {
          const methodHighlights = ex.method?.highlights;
          if (Array.isArray(methodHighlights) && methodHighlights.length > 0) {
            return methodHighlights.map((h: any) =>
              typeof h === 'string' ? h : (h?.male || h?.female || ''),
            ).filter(Boolean);
          }
          const contentHighlights = ex.exercise.content?.highlights;
          if (Array.isArray(contentHighlights) && contentHighlights.length > 0) {
            return contentHighlights;
          }
          const instr = ex.exercise.content?.instructions;
          if (instr) {
            const txt = typeof instr === 'string' ? instr : (instr as any)?.he || (instr as any)?.en || '';
            if (txt) return txt.split(/[.\n]/).map((s: string) => s.trim()).filter(Boolean);
          }
          return [];
        };

        const resolveGoal = (): string => {
          if (ex.exercise.content?.goal) return ex.exercise.content.goal;
          const desc = ex.exercise.content?.description;
          if (desc) {
            return typeof desc === 'string' ? desc : (desc as any)?.he || (desc as any)?.en || '';
          }
          return '';
        };

        const primaryMuscle = ex.exercise.primaryMuscle;
        const secondaryMuscles = ex.exercise.secondaryMuscles;
        const legacyMuscleGroups = ex.exercise.muscleGroups || [];
        const muscleGroups = legacyMuscleGroups.length > 0
          ? legacyMuscleGroups
          : [primaryMuscle, ...(secondaryMuscles || [])].filter(Boolean);

        // Unit priority: respect the admin's explicit type field first, then generator's isTimeBased
        const actuallyTimeBased = ex.exercise.type === 'time' || ex.isTimeBased;

        const { videoUrl: resolvedVideoUrl, imageUrl: resolvedImageUrl, fullTutorial: resolvedFullTutorial, bunnyVideoId: resolvedBunnyVideoId } =
          resolveExerciseMedia(ex.exercise as any, ex.method as any);

        if (!resolvedImageUrl && !resolvedVideoUrl) {
          const allMethods = ex.exercise.execution_methods || ex.exercise.executionMethods || [];
          console.error(`[Media FAIL] No media found for exercise: ${glt(ex.exercise.name)} (${ex.exercise.id}), method: ${ex.method?.methodName || 'none'}, allMethods: ${allMethods.length}`);
        }

        // Hebrew grammar: '1 חזרה' not '1 חזרות'
        const fmtReps = (n: number) => (n === 1 ? 'חזרה אחת' : `${n} חזרות`);
        const fmtSecs = (n: number) => (n === 1 ? 'שנייה אחת' : `${n} שניות`);
        // Follow-along VIDEO items carry their real length on the execution method
        // (media.videoDurationSeconds). Their `reps` is a placeholder — the recovery
        // trio builder hardcodes reps:1 — so deriving the duration text from reps
        // renders "שנייה אחת" for a 14-minute clip. Parity with the builder path
        // (buildRunnerWorkoutPlanFromGenerated). Rep-based exercises untouched.
        const fmtClip = (s: number) => (s >= 60 ? `${Math.round(s / 60)} דקות` : fmtSecs(s));
        const clipSeconds = Number((ex.method as any)?.media?.videoDurationSeconds) || 0;
        const useClipDuration = Boolean(ex.exercise.isFollowAlong) && clipSeconds > 0;

        return {
          id: ex.exercise.id,
          name: glt(ex.exercise.name),
          reps: actuallyTimeBased ? undefined : (
            ex.repsRange && ex.repsRange.min !== ex.repsRange.max
              ? `${ex.repsRange.min}-${ex.repsRange.max} חזרות`
              : fmtReps(ex.reps)
          ),
          duration: actuallyTimeBased ? (
            useClipDuration
              ? fmtClip(clipSeconds)
              : ex.repsRange && ex.repsRange.min !== ex.repsRange.max
                ? `${ex.repsRange.min}-${ex.repsRange.max} שניות`
                : fmtSecs(ex.reps)
          ) : undefined,
          videoUrl: resolvedVideoUrl,
          imageUrl: resolvedImageUrl,
          // Engine-selected method's Bunny id — carried so the runner does not
          // re-derive it from execution_methods[0] (wrong method → wrong video).
          // Parity with the builder path (buildRunnerWorkoutPlanFromGenerated) and
          // the Firestore path (enrichExercise). Hero card is the main entry.
          bunnyVideoId: resolvedBunnyVideoId,
          fullTutorial: resolvedFullTutorial ?? null,
          exerciseType: actuallyTimeBased ? 'time' as const : 'reps' as const,
          exerciseRole: (ex.exercise.exerciseRole as 'main' | 'warmup' | 'cooldown' | 'recovery') || 'main' as const,
          isFollowAlong: ex.exercise.isFollowAlong ?? false,
          hasAudio: false,
          highlights: resolveHighlights(),
          muscleGroups,
          goal: resolveGoal(),
          description: resolveGoal(),
          equipment: (() => {
            const raw = [
              ...(ex.method?.equipmentIds || []),
              ...(ex.method?.gearIds || []),
              ...(ex.method?.gearId ? [ex.method.gearId] : []),
              ...(ex.method?.equipmentId ? [ex.method.equipmentId] : []),
            ].filter(Boolean);
            const seen = new Set<string>();
            const finalEquipment: string[] = [];
            for (const id of raw) {
              const norm = normalizeGearId(id);
              if (norm !== 'none' && norm !== 'bodyweight' && !seen.has(norm)) {
                seen.add(norm);
                finalEquipment.push(norm);
              }
            }
            console.log('[Final Equipment Flow]', glt(ex.exercise.name), finalEquipment);
            return finalEquipment;
          })(),
          restSeconds: ex.restSeconds,
          repsRange: ex.repsRange,
          isGoalExercise: ex.isGoalExercise,
          rampedTarget: ex.rampedTarget,
          isTimeBased: actuallyTimeBased,
          sets: ex.sets,
          execution_methods: ex.exercise.execution_methods || ex.exercise.executionMethods || [],
          reasoning: ex.reasoning,
          pairedWith: ex.pairedWith ?? null,
          symmetry: ex.exercise.symmetry ?? null,
          programIds: (() => {
            const fromTargets = (ex.exercise.targetPrograms ?? [])
              .map((tp: any) => tp.programId)
              .filter((id: unknown): id is string => typeof id === 'string' && id.length > 0);
            const fromIds = (ex.exercise.programIds ?? [])
              .filter((id: unknown): id is string => typeof id === 'string' && id.length > 0);
            return Array.from(new Set([...fromTargets, ...fromIds]));
          })(),
          pyramidSequence: (ex as any).pyramidSequence ?? undefined,
          repsSequence: (ex as any).repsSequence ?? undefined,
        };
      });

      const warmupExercises = exercises.filter((ex: any) => ex.exerciseRole === 'warmup');
      const allMainExercises = exercises.filter((ex: any) => ex.exerciseRole === 'main' || !ex.exerciseRole);
      const cooldownExercises = exercises.filter((ex: any) => ex.exerciseRole === 'cooldown');
      const recoveryExercises = exercises.filter((ex: any) => ex.exerciseRole === 'recovery');

      // Tabata graft (David 26.07): split the injected conditioning finisher into
      // its own seg-tabata so the runner runs the interval format (parity with
      // buildRunnerWorkoutPlanFromGenerated). Degenerate (<2) dissolves back.
      const { tabata: tabataExercises, rest: mainExercises } =
        partitionByTabataBlock(allMainExercises, gw.tabataBlock);

      const segments: any[] = [];
      if (warmupExercises.length > 0) {
        segments.push({
          id: 'seg-warmup',
          type: 'station' as const,
          title: 'חימום',
          icon: '🔥',
          target: { type: 'reps' as const, value: 12 },
          exercises: warmupExercises,
          isCompleted: false,
          restBetweenExercises: 5,
        });
      }
      if (mainExercises.length > 0) {
        segments.push({
          id: 'seg-main',
          type: 'station' as const,
          title: gw.title || 'אימון כוח',
          icon: '💪',
          target: { type: 'reps' as const, value: 12 },
          exercises: mainExercises,
          isCompleted: false,
          restBetweenExercises: 10,
        });
      }
      if (tabataExercises.length > 0 && gw.tabataBlock) {
        const tabataCfg = gw.tabataBlock.config;
        console.log(
          `[TabataBlock] 🔥 seg-tabata built (home): ${tabataExercises.length} exercises, ` +
          `${tabataCfg.workSec}/${tabataCfg.restSec}×${tabataCfg.rounds}`,
        );
        segments.push({
          id: 'seg-tabata',
          type: 'station' as const,
          title: 'טבטה — פיניש',
          icon: '🔥',
          target: { type: 'time' as const, value: (tabataCfg.workSec + tabataCfg.restSec) * tabataCfg.rounds },
          exercises: tabataExercises,
          isCompleted: false,
          restBetweenExercises: 0,
          protocol: 'tabata' as const,
          protocolConfig: tabataCfg,
        });
      }
      if (cooldownExercises.length > 0) {
        segments.push({
          id: 'seg-cooldown',
          type: 'station' as const,
          title: 'מתיחות',
          icon: '🧘',
          target: { type: 'reps' as const, value: 12 },
          exercises: cooldownExercises,
          isCompleted: false,
          restBetweenExercises: 5,
        });
      }
      if (recoveryExercises.length > 0) {
        segments.push({
          id: 'seg-recovery',
          type: 'station' as const,
          title: gw.title || 'שיקום',
          icon: '🌙',
          target: { type: 'time' as const, value: 600 },
          exercises: recoveryExercises,
          isCompleted: false,
          restBetweenExercises: 0,
        });
      }
      if (segments.length === 0) {
        segments.push({
          id: 'seg-all',
          type: 'station' as const,
          title: gw.title || 'אימון כוח',
          icon: '💪',
          target: { type: 'reps' as const, value: 12 },
          exercises,
          isCompleted: false,
          restBetweenExercises: 10,
        });
      }

      const workoutPlan = {
        id: uniqueWorkoutId,
        name: gw.title || 'אימון כוח',
        description: gw.description || '',
        logicCue: gw.logicCue || '',
        segments,
        totalDuration: gw.estimatedDuration || 30,
        difficulty: gw.difficulty === 1 ? 'easy' as const : gw.difficulty === 3 ? 'hard' as const : 'medium' as const,
        trainingType: 'strength' as const,
        pipelineLog: gw.pipelineLog,
        // Protocol fields — preserved across the GeneratedWorkout → WorkoutPlan
        // boundary so the active workout state machine can adapt execution flow.
        appliedProtocol: gw.appliedProtocol,
        blastMode: gw.blastMode,
        // Recovery flag — carried so the active runner + summary skip strength
        // progression (level% / strength-XP / weekly volume) for rest-day videos.
        isRecovery: gw.isRecovery ?? false,
        // Fix (30.08.2026) — see WorkoutPlan.totalPlannedSets's own doc comment
        // (route.types.ts): without this, StrengthSummaryPage/useActivitySync
        // can never tell a partial session from a complete one, so
        // partial-completion.generator.ts's "finish your remaining sets"
        // follow-up suggestion could never become eligible.
        totalPlannedSets: gw.totalPlannedSets,
      };

      sessionStorage.setItem('active_workout_data', JSON.stringify(workoutPlan));
      sessionStorage.setItem('currentWorkoutPlanId', uniqueWorkoutId);
    }

    setSelectedWorkout({
      id: uniqueWorkoutId,
      title: gw?.title || scheduleState.currentWorkout?.title || 'אימון כוח',
      description: gw?.description || scheduleState.currentWorkout?.description || 'אימון מותאם אישית',
      level: profile?.progression?.domains?.full_body?.currentLevel?.toString() || 'medium',
      difficulty: gw ? String(gw.difficulty) : (scheduleState.currentWorkout?.difficulty || 'medium'),
      duration: gw?.estimatedDuration || scheduleState.currentWorkout?.duration || 45,
      // No park context in this (pure-strength) flow, so there is nothing for
      // resolveParkImage to resolve — leave coverImage empty and let the drawer
      // fall through to the real exercise Bunny thumbnail (heroMedia) instead of
      // a foreign stock gym photo. (The genuine hybrid park photo is fixed at its
      // source — find-station-park.service / park-out-and-back.)
      coverImage: '',
      segments: [],
    });
  }, [profile, scheduleState]);

  // Hero Card Press Handler — goes through JIT equipment/health check.
  //
  // `explicitDate` is passed synchronously by AgendaDayCard's StrengthCard tap
  // handler (via onTap → onStartWorkout → here).  It short-circuits the async
  // state-batching race: we resolve the target date immediately and call
  // setSelectedDate before React's next render cycle so StatsOverview starts
  // generating the correct workout trio in parallel with the preview opening.
  const handleHeroPress = useCallback(async (explicitDate?: string, skipCompletedLookup?: boolean) => {
    const dateToUse = (typeof explicitDate === 'string') ? explicitDate : selectedDate;

    // F2.2 (19.08.2026): a day that already has a real completed workout
    // opens its summary instead of the start-a-new-workout flow below —
    // checked FIRST, before any of that flow's logic (health gate,
    // map-only-user redirect, generated-workout resets), none of which
    // applies once we're navigating away. See tryOpenCompletedWorkout's own
    // doc comment for the cost-aware date gating.
    //
    // skipCompletedLookup (23.08.2026, AGENDA_UNPLANNED_COMPLETION_FIX):
    // tryOpenCompletedWorkout resolves purely by {userId, date} — it has no
    // way to know WHICH card was tapped, just "does this date have a real
    // completion at all." That's fine when a date maps to at most one
    // relevant thing, but AgendaDayCard can now render a planned (not-done)
    // card AND a separate reconstructed card for an unrelated completion on
    // the SAME date — tapping the planned one must not hijack to the
    // unrelated completion, which already has its own dedicated card and
    // its own direct tap route. AgendaDayCard passes this true only for
    // that specific case; every other caller of this function is unaffected
    // (parameter defaults to undefined/false, preserving today's lookup).
    if (!skipCompletedLookup && await tryOpenCompletedWorkout(dateToUse)) return;
    const todayISO = toISODate(new Date());
    if (dateToUse < todayISO) {
      // Past + nothing real found → no-op, matches this card's pre-existing
      // dead-tap behavior for past days. Must still reset previewEntry
      // (adversarial review, must-fix, 19.08.2026): AgendaDayCard's
      // activate() calls onPreviewEntry(entry) — setPreviewEntry — BEFORE
      // onTap(date) reaches this function, so a past-day tap with nothing
      // completed leaves a stale entry sitting in previewEntry with no
      // drawer open to consume/clear it. Left alone, a LATER, unrelated
      // drawer open (e.g. tapping the main hero card for today) would
      // inherit that stale entry's id via WorkoutPreviewDrawer's
      // onEditEntry gate, silently pointing its pencil/edit button at the
      // wrong day's schedule entry. Cancels out the just-queued
      // setPreviewEntry(entry) in the same batch (both calls land in the
      // same synchronous tick), so this is a true no-op for the
      // already-null case (main hero card path) too. previewEntryRef mirrors
      // previewEntry (Section L+M fix) — same staleness exposure, same reset here.
      setPreviewEntry(null);
      previewEntryRef.current = null;
      return;
    }

    // Sync the selected-date highlight immediately — StatsOverview will begin
    // generating for dateToUse before the preview drawer finishes mounting.
    if (typeof explicitDate === 'string' && explicitDate !== selectedDate) {
      setSelectedDate(explicitDate);
    }

    if (!profile?.core?.name) {
      router.push('/onboarding-new/profile');
      return;
    }

    // Future-date launches are intentionally allowed (premium ahead-of-time
    // training). The completion-sync pipeline anchors all writes to the
    // device's current calendar day via `new Date()` / `serverTimestamp()`,
    // so credit lands on today's slot even when a future card is tapped.

    if (hasStrengthProgram) {
      // absent=absent (⑨): compose only when a strength domain is assessed; else fall to the
      // questionnaire route below (never an invented/generic strength workout).
      // When the tapped date's content doesn't match what generatedWorkoutRef currently
      // holds, flush the stale cached workout immediately — before the async generator
      // evaluates the new date. This guarantees the drawer rises with the skeleton shimmer
      // rather than a frame of the previous workout's exercises.
      //
      // Compares against generatedWorkoutForDateRef, NOT selectedDate (fixed 01.09.2026 —
      // stale-drawer-after-drag bug). The old `explicitDate !== selectedDate` comparison
      // assumed "same selected date = the ref is still valid for it," which breaks the
      // moment a day's schedule content changes without selectedDate itself changing (e.g.
      // dragging a card to reschedule it onto whatever day is already selected) — the ref
      // never gets flushed, and openWorkoutPreview below builds the drawer from stale,
      // unrelated content that happened to be sitting in the ref from an earlier interaction.
      if (typeof explicitDate === 'string' && explicitDate !== generatedWorkoutForDateRef.current) {
        generatedWorkoutRef.current = null;
        generatedWorkoutForDateRef.current = explicitDate;
        workoutGenerationRef.current += 1;
        setGeneratedWorkout(null);
        setIsWorkoutLoading(true);
        if (typeof window !== 'undefined') {
          sessionStorage.removeItem('active_workout_data');
        }

        // Agenda-card-tap real generation (Section L+M fix, 01.09.2026): the flush above
        // only clears stale state — nothing else repopulates generatedWorkoutRef for this
        // path (StatsOverview, the only thing that otherwise fills it, isn't even mounted
        // for "today" once the pre-workout carousel has real content). Mirrors
        // handleCalendarEntryTap's own Section I fix exactly (same resolver, same cache-id
        // scheme) — scoped to the SPECIFIC entry that was tapped (previewEntryRef, set
        // synchronously by AgendaDayCard's onPreviewEntry just before onTap reaches this
        // function), not to scheduleState.currentWorkout (mock/demo data, unaware of manual
        // drag-and-drop scheduling — see Section M's own fix in openWorkoutPreview below).
        // Guarded by entry.date === explicitDate so a stale previewEntryRef left over from
        // an unrelated earlier tap (e.g. the plain hero-card button or week-strip tap,
        // neither of which populate this ref) can never leak into this generation. Fire-
        // and-forget (not awaited) — interceptWorkoutStart/openWorkoutPreview below must
        // still run immediately so the drawer rises with its loading skeleton right away,
        // exactly as the comment above already establishes; this fills generatedWorkout in
        // reactively once resolved, same as handleWorkoutGenerated always does.
        const entryForThisTap = previewEntryRef.current;
        if (entryForThisTap && entryForThisTap.date === explicitDate && profile) {
          const cats = entryForThisTap.scheduledCategories ?? [];
          // cardio/walking-only entries are NOT covered here (no equivalent real-build
          // resolver audited for those categories yet, matching Section I's own documented
          // scope) — generatedWorkout is already cleared above, so they at least never show
          // wrong/mock content, but the drawer won't show real content either. Known,
          // narrower scope, not silently pretended to be solved.
          if (cats.length === 0 || cats.includes('strength')) {
            const requestedGeneration = workoutGenerationRef.current;
            (async () => {
              try {
                const todayISO = toISODate(new Date());
                const context = buildHomeUserContext({
                  profile,
                  location: null,
                  surface: 'home',
                  date: new Date(entryForThisTap.date + 'T00:00:00'),
                });
                const suggestionId = entryForThisTap.date === todayISO
                  ? `full-strength-cheap-${profile.id}`
                  : `calendar-${entryForThisTap.date}`;
                const workout = await resolveFullStrengthWorkout(suggestionId, profile, context);
                // Stale-guard: if a newer tap already bumped workoutGenerationRef past what
                // this request started with, this result is for a superseded tap — drop it
                // rather than overwriting content that already belongs to a later request.
                if (workout && workoutGenerationRef.current === requestedGeneration) {
                  handleWorkoutGenerated(workout);
                }
              } catch (error) {
                console.error('[home] resolveFullStrengthWorkout failed for agenda card tap', error);
              } finally {
                if (workoutGenerationRef.current === requestedGeneration) {
                  setIsWorkoutLoading(false);
                }
              }
            })();
          } else {
            setIsWorkoutLoading(false);
          }
        }
      }

      // Health declaration hard-block (first start only). Passes through
      // synchronously once the user has accepted or on repeat taps — for
      // EVERY path below, including the recovery-video-trio shortcut, so the
      // gate can never be bypassed by the shortcut.
      interceptWorkoutStart(() => {
        // HOME_RECOVERY_START_SHORTCUT_ENABLED: skip the preview drawer's
        // 3-tap chain (hero → exercise card → Start) for a "pure recovery
        // video trio" session — structurally just one continuous follow-along
        // video, so there is nothing meaningful to preview. Flag checked
        // FIRST (short-circuits before the discriminator read) so flag-off
        // tap handling is byte-identical to before this diff for every
        // workout type.
        if (HOME_RECOVERY_START_SHORTCUT_ENABLED) {
          // Pre-flatten equivalent of isPureRecoveryVideoTrioWorkout (which
          // takes a post-flatten WorkoutPlan, not available yet at this
          // point). Reads generatedWorkoutRef.current directly (NOT the
          // `generatedWorkout` state) — this callback can run synchronously
          // inside the SAME tap that just wrote the ref (StatsOverview's
          // handleTrioStart calls onWorkoutGenerated → this component's
          // handleWorkoutGenerated → generatedWorkoutRef.current = workout,
          // all BEFORE onStartWorkout() fires) — the ref update lands
          // immediately, while the `generatedWorkout` state update from that
          // same call is still batched/pending at this exact instant.
          //
          // Provably equivalent to running buildRunnerWorkoutPlanFromGenerated
          // + isPureRecoveryVideoTrioWorkout on the result: the recovery-
          // video-trio producer (tryBuildRecoveryVideoTrio,
          // home-workout.service.ts) always emits isRecovery:true with
          // EXACTLY one exercise tagged exercise.exerciseRole === 'recovery'.
          // Mirroring the same role-filters the flatten below (and
          // buildRunnerWorkoutPlanFromGenerated) uses: when a single
          // recovery-role exercise is the ONLY exercise present, every other
          // role-filter (warmup/main/cooldown) is necessarily empty, so the
          // flatten always yields exactly one seg-recovery segment — the
          // exact shape isPureRecoveryVideoTrioWorkout requires. The OTHER
          // two isRecovery:true producers never match this check: the Budget
          // Floor cooldown workout (generateRecoveryWorkout) always tags its
          // exercises exerciseRole: 'main', and the standard rest-day
          // generator (REST_DAY_CONFIGS) produces a normal multi-exercise,
          // warmup/cooldown-shaped workout.
          const gw = generatedWorkoutRef.current;
          const isPureRecoveryVideoTrioGenerated =
            !!gw &&
            gw.isRecovery === true &&
            gw.exercises.length === 1 &&
            gw.exercises[0].exercise.exerciseRole === 'recovery';
          if (isPureRecoveryVideoTrioGenerated) {
            // Pass `gw` (generatedWorkoutRef.current, just read above)
            // explicitly as the override — never rely on handleStartWorkout's
            // closed-over `generatedWorkout` REACT STATE, which can still be
            // the PREVIOUS option at this exact synchronous instant (the
            // state update queued by this same tap's onWorkoutGenerated call
            // is batched/pending, not yet committed — see the comment above
            // `gw`). This guarantees the runner plan is built from the
            // identical fresh workout the discriminator above just matched.
            handleRecoveryShortcutStartRef.current(gw);
            return;
          }
        }
        openWorkoutPreview(dateToUse);
      }, 'strength');
    } else {
      if (typeof window !== 'undefined') {
        // onboarding_path persists via onboardingPrefs so a hard close
        // mid-onboarding resumes on the correct path branch.
        setOnboardingPref('onboarding_path', isMapOnlyUser ? 'UPGRADE_FROM_MAP' : 'FULL_PROGRAM');
        if (profile?.core?.name && !sessionStorage.getItem('onboarding_personal_name')) {
          sessionStorage.setItem('onboarding_personal_name', profile.core.name);
        }
        if (profile?.core?.gender && !sessionStorage.getItem('onboarding_personal_gender')) {
          sessionStorage.setItem('onboarding_personal_gender', profile.core.gender);
        }
        if (profile?.core?.birthDate && !sessionStorage.getItem('onboarding_personal_dob')) {
          const bd = profile.core.birthDate;
          const dobStr = bd instanceof Date ? bd.toISOString().split('T')[0] : String(bd);
          sessionStorage.setItem('onboarding_personal_dob', dobStr);
        }
      }
      router.push('/onboarding-new/assessment-visual');
    }
  }, [hasStrengthProgram, handleWorkoutGenerated, isMapOnlyUser, openWorkoutPreview, profile, router, selectedDate, tryOpenCompletedWorkout]);

  const handleBuildCustom = useCallback((ctx?: BuilderContext) => {
    const props: Omit<WorkoutBuilderSheetProps, 'onClose'> = {};
    if (ctx?.location) {
      const locMap: Record<string, string> = {
        park: 'park', outdoor: 'park', outside: 'park',
        gym: 'gym', indoor: 'gym',
        home: 'home',
      };
      const mapped = locMap[ctx.location];
      if (mapped) props.defaultLocation = mapped;
    }
    if (ctx?.programIds?.length) {
      props.defaultProgramIds = ctx.programIds.join(',');
    }
    if (ctx?.duration) {
      const options = [15, 30, 45, 60];
      const nearest = options.reduce((prev, curr) =>
        Math.abs(curr - ctx.duration!) < Math.abs(prev - ctx.duration!) ? curr : prev,
      );
      props.defaultDuration = String(nearest);
    }
    if (ctx?.difficulty) {
      const diffMap: Record<number, string> = { 1: 'easy', 2: 'medium', 3: 'hard' };
      props.defaultIntensity = diffMap[ctx.difficulty] ?? 'medium';
    }
    setBuilderProps(props);
    setBuilderOpen(true);
  }, []);

  // Direct start — from UserWorkoutAdjuster, bypasses equipment JIT popup
  const handleDirectStart = useCallback(() => {
    if (!profile?.core?.name) { router.push('/onboarding-new/profile'); return; }
    if (hasStrengthProgram) openWorkoutPreview(); // absent=absent (⑨): no invented strength start
  }, [hasStrengthProgram, openWorkoutPreview, profile, router]);

  const handleAlertAction = () => { setShowAlert(null); handleHeroPress(); };

  // Firestore fallback
  const [isCheckingFirestore, setIsCheckingFirestore] = useState(false);
  useEffect(() => {
    if (!_hasHydrated || profile || isCheckingFirestore) return;
    const checkFirestore = async () => {
      setIsCheckingFirestore(true);
      try {
        // Wait for Firebase auth to complete its initial async state resolution
        // from IndexedDB persistence before declaring "no user". On a cold boot
        // auth.currentUser is null for up to ~500 ms while IndexedDB restores the
        // session; checking it synchronously here would cause a false redirect to
        // /onboarding-new/profile every time a returning user reopens the app.
        let uid = auth.currentUser?.uid;
        if (!uid) {
          try {
            await (auth as any).authStateReady?.();
          } catch { /* not available in older SDK versions, ignore */ }
          uid = auth.currentUser?.uid;
        }
        if (!uid) { router.replace('/onboarding-new/profile'); return; }
        const snap = await getDoc(firestoreDoc(db, 'users', uid));
        if (snap.exists()) {
          const d = snap.data();
          const s = d?.onboardingStatus;
          if (s === 'COMPLETED' || s === 'PENDING_LIFESTYLE' || d?.onboardingComplete || s === 'MAP_ONLY') {
            const fp = await getUserFromFirestore(uid);
            if (fp) { useUserStore.getState().initializeProfile(fp); setIsCheckingFirestore(false); return; }
          }
        }
        router.replace('/onboarding-new/profile');
      } catch { router.replace('/onboarding-new/profile'); }
      finally { setIsCheckingFirestore(false); }
    };
    checkFirestore();
  }, [_hasHydrated, profile, router, isCheckingFirestore]);

  // Loading states
  if (!_hasHydrated) {
    return (
      <div className="h-[100dvh] flex items-center justify-center bg-[#F8FAFC]">
        <p className="text-slate-400 animate-pulse text-sm">טוען...</p>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="h-[100dvh] flex items-center justify-center bg-[#F8FAFC]">
        <p className="text-slate-400 text-sm">{isCheckingFirestore ? 'בודק פרופיל...' : 'מעביר להרשמה...'}</p>
      </div>
    );
  }

  // Build week schedule data
  const lifestyleScheduleDays = (profile?.lifestyle?.scheduleDays as string[]) || [];
  const runningScheduleDays = (profile?.running?.scheduleDays as string[]) ?? [];
  const isRunningMode = resolvedDashboardMode === 'RUNNING' || resolvedDashboardMode === 'HYBRID';
  const userScheduleDays = isRunningMode && runningScheduleDays.length > 0
    ? runningScheduleDays
    : lifestyleScheduleDays;
  const hasSchedule = userScheduleDays.length > 0;
  const WEEK_DAYS = ['א', 'ב', 'ג', 'ד', 'ה', 'ו', 'ש'] as const;
  const todayIndex = new Date().getDay();
  const realSchedule: DaySchedule[] = WEEK_DAYS.map((day, i) => {
    const isToday = i === todayIndex;
    const isTrainingDay = userScheduleDays.includes(day);
    // Past training days are NOT auto-marked 'completed'. The real
    // completion state is resolved downstream by `useDayStatus`, which
    // reads `weekActivities` (Zustand/Firestore) + `dailyProgress.workoutCompleted`.
    // Hard-coding 'completed' here would force a flame icon for any past
    // scheduled day, regardless of whether the user actually trained.
    const status: DaySchedule['status'] = isToday
      ? 'today'
      : isTrainingDay
        ? 'scheduled'
        : 'rest';
    return { day, date: i + 1, status };
  });
  const primaryTrack = (profile?.lifestyle as any)?.primaryTrack;

  return (
    <div className="min-h-[100dvh] bg-[#F8FAFC]">
      {/* ── Shared App Header (avatar + flame, logo, bell + chat + search) ── */}
      <AppHeader />

      {/* ── Profile Progress Bar ── */}
      <ProfileProgressBar profile={profile} />

      {/* ── Global Motivation Banner (post-workout) ── */}
      <AnimatePresence>
        {showMotivationBanner && postWorkoutMsg && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ duration: 0.3 }}
            className="max-w-md mx-auto px-4 pt-3"
          >
            <div
              className="relative flex items-center gap-3 px-4 py-3"
              dir="rtl"
              style={{
                background: '#F0FBFF',
                border: '1px solid #B8E8F5',
                borderRadius: 14,
              }}
            >
              <div className="flex-1 text-center text-[14px] font-semibold text-gray-800 leading-relaxed">
                {postWorkoutMsg.text}
                {postWorkoutMsg.subText ? ` ${postWorkoutMsg.subText}` : ''}
              </div>
              <button
                onClick={() => setShowMotivationBanner(false)}
                className="flex-shrink-0 p-1 rounded-full text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
              >
                <X size={18} />
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Community Session Banner (single closest session, dismiss persists across refreshes) ── */}
      {communitySessions.length > 0 && (
        <div className="max-w-md mx-auto px-4 pt-3">
          <AnimatePresence>
            {communitySessions.slice(0, 1).map((session) => (
              <CommunitySessionBanner
                key={`${session.groupId}_${session.date}_${session.time}`}
                session={session}
                onDismiss={() => dismissSession(session)}
                onOpenGroup={handleOpenGroupFromBanner}
              />
            ))}
          </AnimatePresence>
        </div>
      )}

      {/* ── Main Content: Clean Execution Zone ── */}
      <div className="max-w-md mx-auto px-4 pt-2 space-y-2" style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 16px) + 1.5rem)' }}>

        {/* Today Activity Strip — Stage D+E (19.08.2026, "completion-loop" plan),
            relocated to the very top of the page (21.08.2026, "ארכיטקטורת הבית
            ומנוע-ההמלצות" doc — compact top-of-page carousel redesign): first
            thing on the page, above the week strip, instead of below the tabbed
            stats section. REPLACES the old single HeroWorkoutCard completion
            card entirely (locked product decision — see
            adaptive-snacking-valiant.md's Stage C/D section): this is not an
            addition alongside it. Gate base — (postWorkoutData ||
            todayWorkoutDone), the exact compound confirmed load-bearing
            (postWorkoutData can go true before todayWorkoutDone's Firestore
            round-trip catches up; relying on either alone reintroduces that
            race). todayActivityCards.length>0 replaces the old `&&
            completionData` check — empty array (rest day / nothing done yet)
            means TodayActivityStrip renders null on its own; no separate
            visible empty-state needed, an absent strip already IS the empty
            state the plan calls for.

            Gap 1 fix (30.08.2026): `|| todayStepGoalMet` / `|| todayStepGoalCard` added —
            a day where only the step goal was met (no workout at all) previously showed
            nothing here, even though the mirrored past-day branch already handles this
            exact case (pastDayHasAnyAchievement, above).

            Gap 3 fix (30.08.2026, David: full symmetry): `isSelectedDateToday &&` added —
            this strip describes real TODAY's own completion state, unrelated to whichever
            day selectedDate points at (todaysWorkouts/todayProgress are both hardcoded to
            toISODate(new Date()), never selectedDate) — without this it kept showing while
            scrolling to a past or future day, clashing with Section 2's own past-day summary
            rendered further down this same page for that other date. */}
        {isSelectedDateToday && (postWorkoutData || todayWorkoutDone || todayStepGoalMet) && (todayActivityCards.length > 0 || todayStepGoalCard) && (
          <motion.div
            initial={{ opacity: 0, scale: 0.97 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.4, ease: 'easeOut' }}
          >
            <TodayActivityStrip
              cards={todayStepGoalCard ? [...todayActivityCards, todayStepGoalCard] : todayActivityCards}
              onCardTap={handleTodayActivityCardTap}
            />
          </motion.div>
        )}

        {/* Week Strip — hidden until user has completed assessment (schedule is useless without a program) */}
        {hasCompletedAssessment && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4 }}
            className="relative overflow-hidden rounded-3xl"
          >
            <SmartWeeklySchedule
              schedule={realSchedule}
              currentTrack={isRunningMode ? 'running' : (primaryTrack === 'performance' ? 'performance' : 'wellness')}
              scheduleDays={userScheduleDays}
              programIconKey={programIconKey}
              selectedDate={selectedDate}
              onDaySelect={setSelectedDate}
              userId={profile?.id}
              recurringTemplate={profile?.lifestyle?.recurringTemplate}
              calendarMode="week"
              hideMonthToggle
              onSwipeDown={() => setShowPlanner(true)}
              onOpenPlanner={() => setShowPlanner(true)}
              hasCompletedAssessment={hasCompletedAssessment}
              hasSchedule={hasSchedule}
              onStartAssessment={handleHeroPress}
              onSetSchedule={() => setShowLifestyleWizard(true)}
              runningSchedule={profile?.running?.activeProgram?.schedule as any}
              runningCurrentWeek={profile?.running?.activeProgram?.currentWeek}
              runningProgramStartDate={profile?.running?.activeProgram?.startDate as any}
              runningBasePace={profile?.running?.paceProfile?.basePace}
              runningProgramId={profile?.running?.activeProgram?.programId}
              scheduleVersion={scheduleVersion}
              activityView={homeTab === 'health'}
            />
          </motion.div>
        )}

        {/* ════════════════════════════════════════════════════════════════
            Dashboard Restructure — 5-Row Hierarchy (Apr 2026 spec)
            ────────────────────────────────────────────────────────────────
            Row 1: SmartWeeklySchedule (rendered above this block).
            Row 2: 65/35 RTL grid (matches the legacy "Power Row" model):
                     • RIGHT 65% — ProgramProgressCard (full size, large
                       80px ring + level + remaining %).
                     • LEFT 35%  — ConsistencyWidget mini-bars (כוח / ריצה
                       captions + segmented bars, per StatsOverview's
                       legacy strength tile).
                   Both halves share the same card chrome (`WIDGET_CARD_STYLE`
                   — same border, shadow, radius) and stretch to matching
                   heights via `items-stretch` so the row reads as one
                   cohesive unit. Incomplete surveys blur the bars in place
                   via `<GhostUpsell variant="silent">` — no "Add Run" copy.
            Row 3: Daily Workout Hero — `StatsOverview` trimmed to its
                   action zone so the workout trio sits in the "Thumb Zone".
            Rows 4 & 5: COMPACT (CompactMetricTile) tiles inside
                   SideBySideRow, with Hebrew section headers
                   ("מדדי בריאות" / "מדדי ביצועים"). Conditional swap by
                   `dashboardMode`:
                     - DEFAULT (Health Track)         → Health, then Performance
                     - RUNNING / PERFORMANCE / HYBRID → Performance, then Health
                   PerformanceMetricsRow returns null until the strength
                   survey is complete (goals are derived from active strength
                   programs, so the section is meaningless beforehand).

            Gap 2 fix (30.08.2026, home/page.tsx 3-gap audit): Rows 2/4/5 (the tabs +
            their content — "widgetsBlock" below) and the post-workout carousel
            ("continueActivityBlock" below, previously a separate sibling further down
            this file) now swap relative order once today's workout is done —
            widgetsBlock moves to sit AFTER "המשך הפעילות של היום" instead of always
            before it. The anchor/Daily Workout Hero (Row 3, "anchorBlock" below) is
            deliberately NOT part of this reorder — it stays exactly where it already
            renders (David's explicit instruction on this fix): with
            HOME_ANCHOR_V2_ENABLED, StatsOverview's own hideWorkoutSection=true state
            (the exact state active whenever the anchor's slot would otherwise need
            hiding) renders empty in all 3 dashboard modes except one narrow,
            pre-existing, unrelated case — LoadAdvisorBanner (PERFORMANCE/HYBRID modes
            only) can still show a real coaching banner independent of
            hideWorkoutSection, if the weekly-volume store has genuine push/pull-
            imbalance or budget-exhaustion advice to give. That banner's own visibility
            has nothing to do with this reorder and isn't fixed here — flagging it as a
            pre-existing nuance found while reading StatsOverview.tsx before touching
            this layout (CLAUDE.md §6), not a new gap introduced by this change.
            ════════════════════════════════════════════════════════════════ */}
        {(() => {
          const TAB_LABELS: Record<'strength' | 'health', string> = {
            strength: 'התקדמות שבועית',
            health: 'מדדי בריאות',
          };

          // Pre-registration users (no strength program yet) see only "מדדי בריאות"
          // + the always-visible Hero. The strength tab ("התקדמות שבועית") is all
          // ghost-upsell entries into the strength questionnaire the Hero already
          // covers — hidden until a program exists, then it returns.
          const tabs: Array<'strength' | 'health'> = hasProgram
            ? ['strength', 'health']
            : ['health'];
          const effectiveTab: 'strength' | 'health' = hasProgram ? homeTab : 'health';

          // Gap 2 fix (30.08.2026): widgetsBlock is now its own value (previously inline
          // JSX sharing one flex-col div with the anchor below) so it can independently
          // swap order with continueActivityBlock further down, based on
          // isTodayWorkoutDone. Internal tabs/content logic is completely untouched, only
          // extracted into a variable — same JSX, same behavior when nothing has changed.
          const widgetsBlock = (
            <div className="flex flex-col gap-4 mt-0">
              {/* ── Tabs bar ─────────────────────────────────────────── */}
              <div
                className="w-full max-w-[358px] mx-auto flex border-b border-gray-100"
                dir="rtl"
              >
                {tabs.map((tab) => {
                  const isActive = effectiveTab === tab;
                  return (
                    <button
                      key={tab}
                      type="button"
                      onClick={() => setHomeTab(tab)}
                      className={[
                        'flex-1 py-2.5 text-sm font-bold transition-colors',
                        isActive
                          ? 'text-[#00C9F2] border-b-2 border-[#00C9F2] -mb-px'
                          : 'text-gray-400',
                      ].join(' ')}
                    >
                      {TAB_LABELS[tab]}
                    </button>
                  );
                })}
              </div>

              {/* ── Tab content ──────────────────────────────────────── */}
              {effectiveTab === 'strength' ? (
                /* התקדמות שבועית — program ring (minmax(0,1fr)) + consistency bars (111px).
                   Grid (not flex) so each cell has an explicit physical boundary —
                   no item can bleed into the neighbouring cell regardless of its
                   internal width. Mirrors the "health" tab grid below. */
                <div
                  className="w-full grid gap-4 items-stretch"
                  style={{ gridTemplateColumns: 'minmax(0, 1fr) 111px', direction: 'rtl' }}
                >
                  <ProgramProgressRow />
                  <ConsistencyWidget />
                </div>
              ) : (
                /* מדדי בריאות — activity minutes (right) + steps (left) */
                <div
                  className="w-full grid gap-4 items-stretch"
                  style={{ gridTemplateColumns: '1fr 1fr', direction: 'rtl' }}
                >
                  <ActivityCard />
                  <StepsSummaryCard variant="compact" />
                </div>
              )}
            </div>
          );

          // Gap 2 fix (30.08.2026): the anchor/Daily Workout Hero now renders in its own
          // div, no longer sharing one flex-col container with widgetsBlock above —
          // deliberately left in this exact position, unmoved (see the Dashboard
          // Restructure comment above for why). `order-first` a few lines down is now a
          // no-op (this div's only child, nothing left to reorder against) — harmless to
          // leave; removing it isn't needed for correctness and isn't part of this fix.
          const anchorBlock = (
            <div className="flex flex-col gap-4 mt-0">
              {/* ── Daily Workout Hero — always visible ───────────────
                  R-1.5 (order B, workout-first): with HOME_ANCHOR_V2_ENABLED the
                  anchor is pulled ABOVE the tabs/metrics via flex `order-first`,
                  giving schedule → anchor → metrics. A single wrapper is reused across
                  branches (no prop duplication); while the flag is off it is rendered
                  bare, last, exactly as before → byte-identical DOM.

                  Section 1 (17.8 build-plan next-phase, 27.08.2026): this slot now also
                  decides between the OLD anchor (StatsOverview) and the NEW pre-workout
                  suggestion carousel, in place — not a sibling below the whole block
                  anymore. The new carousel only ever wins when viewing TODAY
                  (isViewingToday, matches the effect's own gate above) with real ranked
                  suggestions ready; a past/future selectedDate — or today before ranking
                  resolves — falls back to the old anchor exactly as it renders now.
                  Section 2 (29.08.2026) gives a past selectedDate its own dedicated
                  past-day summary branch (pastDayActivityCards/pastDayEmptyCopy, declared
                  above near todayActivityCards) instead of falling back to the old anchor.
                  Section 3 (future days) is not yet built; a future selectedDate still
                  falls back to the old anchor exactly as it renders today — a safe,
                  behavior-preserving choice, not a gap. `onPanEnd` is suppressed outright
                  whenever the new carousel OR the new past-day branch is showing (Section 1
                  decision: the day-swipe gesture is retired for the new experience, not
                  carried over; extended to the past-day branch since it can also contain a
                  horizontally-swipeable SuggestionCarousel, same reasoning) — the SAME
                  motion.div wrapper is reused for all three so the order-first positioning
                  above still applies, rather than a second wrapper that would silently lose
                  it. */}
              {(() => {
                const isViewingToday = selectedDate === toISODate(new Date());
                // Parity fix (29.08.2026): same condition StatsOverview's own
                // hideWorkoutSection already uses (line ~2287 below, unconditional on
                // which branch renders) — a completed day should look identical whether
                // the carousel flag is on or off. Without this, the new carousel had no
                // equivalent check at all (confirmed: zero references to
                // postWorkoutData/todayWorkoutDone anywhere in this branch), so it kept
                // showing a redundant "start a workout" carousel underneath
                // TodayActivityStrip's completion card. Folding it into
                // readyPreWorkoutSuggestions itself (rather than a separate check) means
                // the existing `: (<StatsOverview ... hideWorkoutSection={...} />)` fallback
                // below does the actual hiding — no new UI, reusing what already works.
                // isTodayWorkoutDone itself moved to the outer component scope (Gap 2 fix,
                // 30.08.2026) — read via closure here, not redeclared, so the widgets/
                // continue-activity reorder decision further down uses this exact same value.
                const readyPreWorkoutSuggestions = (
                  HOME_PRE_WORKOUT_SUGGESTION_CAROUSEL_ENABLED
                  && isViewingToday
                  && !isTodayWorkoutDone
                  && preWorkoutSuggestions
                  && preWorkoutSuggestions.length > 0
                ) ? preWorkoutSuggestions : null;

                // Fix (30.08.2026, "no loading state, widgets jump then get pushed down"):
                // preWorkoutSuggestions is null BOTH while the fetch is still in flight AND
                // is genuinely resolved-empty — readyPreWorkoutSuggestions above collapses
                // both into the same falsy value, which used to fall straight through to the
                // `: (<StatsOverview .../>)` branch below even during the initial load. That
                // branch runs its OWN independent trio-generation with its own CarouselSkeleton
                // (StatsOverview.tsx, sized for the OLD single-card anchor: header+chip+one
                // 260-wide card), a different height than this carousel's real resolved
                // content (header+description+3 300-wide/330-tall cards+build-custom button) —
                // the gap between those two heights is the reflow David saw. Distinguishing
                // "still loading" (this) from "resolved empty" (falls through to StatsOverview
                // same as before, unchanged) fixes it without touching StatsOverview at all.
                const preWorkoutSuggestionsLoading =
                  HOME_PRE_WORKOUT_SUGGESTION_CAROUSEL_ENABLED
                  && isViewingToday
                  && !isTodayWorkoutDone
                  && preWorkoutSuggestions === null;

                // Parity fix (27.08.2026): description text for whichever suggestion is
                // centered — activeCarouselWorkout (computed at the top level, above, since
                // useExercisePool/useSwapAll need it there) already IS this suggestion's real
                // GeneratedWorkout with any swap override applied; reused here rather than a
                // second, independently-drifting resolveHeroWorkout call.
                const preWorkoutDescription =
                  activeCarouselWorkout?.description
                  || activePreWorkoutSuggestion?.subtitle
                  || 'מוכן להתחיל?';

                const content = readyPreWorkoutSuggestions ? (
                  <div>
                    {/* Header + chip + description — parity fix (27.08.2026), mirrors
                        StatsOverview.tsx's own renderWorkoutSection (lines 1075-1114):
                        the old anchor always paired its single workout with this exact
                        heading + location chip + a real description paragraph above the
                        card. The carousel replaced that single slot with 3 scrollable
                        suggestions, so both the chip and the description now track
                        whichever one is centered (activePreWorkoutSuggestion, set by
                        handlePreWorkoutSettle — already fires on the initial mount settle
                        too, so this is never stuck on a stale/empty value). Chip only shows
                        for Hero-treated suggestions (isActiveSuggestionHeroTreated) —
                        safety-net/route have no swappable content, so there's nothing for
                        it to control. */}
                    <div className="px-5" dir="rtl">
                      <div className="relative mb-1 flex items-center justify-between gap-2">
                        <h3 className="text-2xl font-extrabold text-gray-900 dark:text-white">
                          האימון היומי שלך
                        </h3>
                        {isActiveSuggestionHeroTreated && (
                          <AnchorLocationChip
                            value={
                              activeCarouselLocation === 'park' || activeCarouselLocation === 'home'
                                ? activeCarouselLocation
                                : 'park'
                            }
                            onSelect={handleCarouselLocationChange}
                          />
                        )}
                      </div>
                      <p className="text-sm text-gray-500 dark:text-gray-400 font-medium mb-4 leading-relaxed text-right">
                        {preWorkoutDescription}
                      </p>
                    </div>

                    {/* maxCardWidthPx/maxCardWidthVw (26.08.2026, David's device-test
                        feedback): matches the OLD anchor's real, static rendered size —
                        HeroWorkoutCard's `active` variant is a fixed, unconditional 300x330
                        (CARD_VARIANTS in HeroWorkoutCard.tsx, no viewport scaling of its own),
                        not the carousel shell's own default 260px/68vw cap (that default would
                        shrink PreWorkoutCardRenderer's HeroWorkoutCard via ScaledHeroSlot,
                        making the new focused card visibly smaller than the anchor it
                        replaces). 100vw as the vw ceiling ensures the px cap (300) is what
                        actually binds on any real device width, mirroring the old card's own
                        unconditional sizing. Same per-instance override mechanism
                        TodayActivityStrip already uses for its own wider-card case. */}
                    <SuggestionCarousel<Suggestion>
                      items={readyPreWorkoutSuggestions}
                      keyExtractor={(s) => s.id}
                      cardHeight={330}
                      maxCardWidthPx={300}
                      maxCardWidthVw={100}
                      onSettle={handlePreWorkoutSettle}
                      renderCard={(s) => (
                        <PreWorkoutCardRenderer
                          suggestion={s}
                          onStart={() => handlePreWorkoutCardTap(s)}
                          isStarting={startingPreWorkoutSuggestionId === s.id}
                          userGender={profile?.core?.gender}
                          // Per-card location: THIS suggestion's own stamped location once
                          // swapped (persists independently of which card is active), else the
                          // shared profile-seed default — never the active card's pin bleeding
                          // into a suggestion the user hasn't touched the chip for.
                          workoutLocation={swappedWorkoutById[s.id]?.executionLocation ?? carouselSeedLocation}
                          programIconKey={carouselProgramIconKey}
                          overrideWorkout={swappedWorkoutById[s.id]}
                        />
                      )}
                    />

                    {/* Build-custom CTA — parity fix (27.08.2026), mirrors StatsOverview.tsx:1144
                        (always shown below the workout, independent of which one is focused —
                        the old anchor never conditioned this on workout type either). Reuses
                        handleBuildCustom as-is (home/page.tsx's own, already shared with the old
                        anchor) — no new builder-context logic. */}
                    <div className="flex flex-col items-center px-4 mt-3">
                      {/* TODO(programIds): StatsOverview.tsx's own handleBuildCustomWrapped
                          (lines 1006-1017) also pre-fills programIds from
                          scheduledProgramIdsRef.current — a ref private to StatsOverview, with
                          no equivalent resolved here. Effect of the gap: the builder still opens
                          correctly, just without the day's scheduled program pre-selected. Not
                          wired here — flagged, not blocking. */}
                      <BuildCustomButton
                        onTap={() => handleBuildCustom({
                          location: activeCarouselLocation,
                          duration: activeCarouselWorkout?.estimatedDuration,
                          difficulty: activeCarouselWorkout?.difficulty,
                        })}
                        userGender={profile?.core?.gender}
                      />
                    </div>
                  </div>
                ) : preWorkoutSuggestionsLoading ? (
                  // Sized to match the resolved carousel above exactly (same 330px card
                  // height / 300px max width the real <SuggestionCarousel> uses, not
                  // StatsOverview's own CarouselSkeleton which is sized for its old
                  // 260px anchor card) — header + description + one card-width placeholder
                  // (real carousel shows 3, but only one is on-screen at a time) + button,
                  // so the widgets below never see a height jump when this resolves.
                  <div>
                    <div className="px-5" dir="rtl">
                      <div className="h-8 w-40 rounded-lg bg-gray-100 dark:bg-slate-800 animate-pulse mb-1" />
                      <div className="h-4 w-56 rounded-lg bg-gray-100 dark:bg-slate-800 animate-pulse mb-4" />
                    </div>
                    <div className="w-full flex justify-center" style={{ height: 330 + 24, paddingTop: 8 }}>
                      <div
                        className="bg-gray-100 dark:bg-slate-800 animate-pulse"
                        style={{ width: 'min(300px, 100vw)', height: 330, borderRadius: 16 }}
                      />
                    </div>
                    <div className="flex flex-col items-center px-4 mt-3">
                      <div className="w-full h-[52px] rounded-full bg-gray-100 dark:bg-slate-800 animate-pulse" />
                    </div>
                  </div>
                ) : isViewingPastDate ? (
                  // Section 2 (29.08.2026) — past-day branch. pastDayDataReady mirrors
                  // todaysWorkouts's own null-until-resolved contract above: render nothing
                  // while the fetch is in flight, rather than flashing the empty-day text
                  // before real data has a chance to load.
                  !pastDayDataReady ? null : pastDayHasAnyAchievement ? (
                    <TodayActivityStrip
                      cards={pastDayStepGoalCard ? [...pastDayActivityCards, pastDayStepGoalCard] : pastDayActivityCards}
                      onCardTap={handlePastDayActivityCardTap}
                      // Follow-up fix (29.08.2026): TodayActivityStrip's hardcoded default
                      // header ("הפעילות שלי היום") was flagged as wrong for a past date —
                      // now overridden via the strip's new optional `title` prop.
                      title="מה עשית ביום הזה"
                    />
                  ) : (
                    <div className="px-5 py-8 text-center" dir="rtl">
                      <p className="text-sm font-medium text-gray-500 dark:text-gray-400">
                        {pastDayEmptyCopy}
                      </p>
                    </div>
                  )
                ) : (
                  <StatsOverview
                    stats={MOCK_STATS}
                    onStartWorkout={handleHeroPress}
                    onDirectStart={handleDirectStart}
                    onWorkoutGenerated={handleWorkoutGenerated}
                    selectedDate={selectedDate}
                    hasCompletedAssessment={hasCompletedAssessment}
                    hideWorkoutSection={!!postWorkoutData || todayWorkoutDone}
                    enableRunningPrograms={featureFlags.enableRunningPrograms}
                    scheduleVersion={scheduleVersion}
                    onBuildCustom={handleBuildCustom}
                    generateSingleOption={isWorkoutLoading}
                    isViewingFutureDate={selectedDate > toISODate(new Date())}
                    onTrioSelectorChange={setTrioSelector}
                  />
                );
                return HOME_ANCHOR_V2_ENABLED
                  ? (
                    <motion.div
                      className="order-first"
                      onPanEnd={!readyPreWorkoutSuggestions && !isViewingPastDate && hasCompletedAssessment ? handleAnchorDayPan : undefined}
                    >
                      {content}
                    </motion.div>
                  )
                  : content;
              })()}
            </div>
          );

          // Gap 2 fix (30.08.2026): continueActivityBlock extracted the same way as
          // widgetsBlock above — a value, not inline JSX — so it can render either before
          // or after widgetsBlock depending on isTodayWorkoutDone, below. Gap 3 fix
          // (30.08.2026, David: full symmetry — hide on both past AND future): also gated
          // on `isSelectedDateToday &&` now — this describes real TODAY's own
          // post-workout suggestions (postWorkoutCarouselReady itself has no date-
          // awareness at all, only the flag + whether postWorkoutSuggestions resolved),
          // unrelated to whichever day selectedDate points at — without this it kept
          // showing while scrolling to a past or future day.
          // Fix (30.08.2026, "no loading state going from workout summary back to home,
          // suddenly appears"): mirrors the pre-workout carousel's own loading distinction
          // above (preWorkoutSuggestionsLoading) — this effect's real trigger condition
          // (postWorkoutCarouselEnabled && (postWorkoutData || todayWorkoutDone) && profile,
          // see the useEffect this mirrors, above) is known here, so "a completed workout
          // exists but suggestions haven't resolved yet" is distinguishable from "nothing
          // to show at all" (flag off, or no completed workout today). CarouselSkeleton is
          // WorkoutSelectionCarousel's own existing export — its default sizing (260px/
          // 68vw, 330 tall) already matches this carousel's own SuggestionCarousel call
          // below exactly (neither overrides width, both use cardHeight 330), so it's
          // reused as-is rather than a second bespoke skeleton like the pre-workout one
          // needed (that carousel overrides to 300px/100vw, CarouselSkeleton does not).
          const postWorkoutCarouselLoading =
            isSelectedDateToday
            && postWorkoutCarouselEnabled
            && (postWorkoutData || todayWorkoutDone)
            && postWorkoutSuggestions === null;

          const continueActivityBlock = isSelectedDateToday && postWorkoutCarouselLoading ? (
            <div>
              <div className="h-4 w-40 rounded-lg bg-gray-100 dark:bg-slate-800 animate-pulse mb-3" dir="rtl" />
              <CarouselSkeleton />
            </div>
          ) : isSelectedDateToday && postWorkoutCarouselReady ? (
            /* post_workout suggestion carousel (home-generator-v2 plan, step 6) — Phase B
               (18.08.2026): auto-reveals the moment postWorkoutSuggestions resolves,
               directly below the same completion card, same vertical slot. No tap
               required. Stage B (18.08.2026, "completion-loop" plan, requirement 5):
               header above the carousel, same visibility gate (postWorkoutCarouselReady)
               so it never shows without the carousel or vice versa. Copy variant driven
               by allGoalsMet — condition explicitly confirmed by David before this
               shipped, not decided unilaterally (per his instruction on this stage). */
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, ease: 'easeOut' }}
            >
              <h3 className="text-right text-[16px] font-bold text-gray-900 mb-3" dir="rtl">
                {allGoalsMet ? 'סיימת הכל, מגיע לך מנוחה' : 'המשך הפעילות של היום'}
              </h3>
              <SuggestionCarousel<Suggestion>
                items={postWorkoutSuggestions}
                keyExtractor={(s) => s.id}
                cardHeight={330}
                renderCard={(s) => (
                  <PostWorkoutCardRenderer
                    suggestion={s}
                    onStart={() => handlePostWorkoutSuggestionStart(s)}
                    isStarting={startingSuggestionId === s.id}
                    userGender={profile?.core?.gender}
                  />
                )}
              />
            </motion.div>
          ) : null;

          // Gap 2 fix (30.08.2026): anchorBlock's own JSX position is now what controls
          // its visual placement (always first — see the Dashboard Restructure comment
          // above for why it doesn't move), not flex `order` against siblings it no
          // longer shares a container with. widgetsBlock/continueActivityBlock swap
          // relative order based on isTodayWorkoutDone (hoisted near todayActivityCards,
          // above) — a completed day shows "המשך הפעילות של היום" before these widgets,
          // instead of always-widgets-first.
          return (
            <>
              {anchorBlock}
              {isTodayWorkoutDone ? (
                <>
                  {continueActivityBlock}
                  {widgetsBlock}
                </>
              ) : (
                <>
                  {widgetsBlock}
                  {continueActivityBlock}
                </>
              )}
            </>
          );
        })()}

        {/* Nearby community groups discovery carousel */}
        <NearbyGroupsRow />

        {/* Nearby Workout Locations — context-aware carousel (below the 5 rows) */}
        <WorkoutLocationSuggestions
          workoutType={isRunningMode ? 'running' : 'strength'}
        />

        {/* Lifestyle Bridge Overlay */}
        <AnimatePresence>
          {shouldShowBridge && (
            <BlurryBridgeOverlay
              onStartWizard={handleStartWizard}
              onSkip={handleSkipBridge}
            />
          )}
        </AnimatePresence>
      </div>

      {/* ── Unified "+" FAB — promoted home entry point, opens the SAME
          UnifiedPlusDrawer the map "+" opens (Phase 1 revision — one
          unified drawer, not a home-only shortcut straight to compose).
          Hidden while any full-screen home overlay is active (same
          guarding discipline the map screen already applies to its own
          FAB). z-[55]: above BottomNavbar/TrainingPlannerOverlay (z-50) so
          it's tappable when idle, but every gating state below covers it
          anyway before z-order would matter. */}
      {SOCIAL_COMPOSE_UI_ENABLED && !showPlanner && !showLifestyleWizard && !builderOpen && !editEntry && !selectedWorkout && (
        <button
          onClick={() => setPlusDrawerOpen(true)}
          className="fixed z-[55] w-14 h-14 rounded-full shadow-xl flex items-center justify-center bg-[#00E5FF] text-white active:scale-95 transition-all"
          style={{ bottom: 'calc(84px + env(safe-area-inset-bottom, 0px))', right: '16px' }}
          title="הוסף"
        >
          <Plus size={22} />
        </button>
      )}
      <UnifiedPlusDrawer
        isOpen={plusDrawerOpen}
        onClose={() => setPlusDrawerOpen(false)}
        onGoTrain={() => setComposeOpen(true)}
        onCreateGroup={() => router.push('/community?openCreate=true')}
        onAddLocation={() => setWizardOpen(true)}
        onReport={() => setReportOpen(true)}
      />
      <PlannedActivityComposeSheet
        isOpen={composeOpen}
        onClose={() => setComposeOpen(false)}
      />
      <ContributionWizard
        isOpen={wizardOpen}
        onClose={() => setWizardOpen(false)}
        initialLocation={gpsCoords}
      />
      <QuickReportSheet
        isOpen={reportOpen}
        onClose={() => setReportOpen(false)}
        userLocation={gpsCoords ?? null}
      />

      {/* ── Training Planner Full-Screen Overlay ── */}
      <TrainingPlannerOverlay
        isOpen={showPlanner}
        onClose={() => setShowPlanner(false)}
        userId={profile.id}
        recurringTemplate={profile.lifestyle?.recurringTemplate}
        scheduleDays={userScheduleDays}
        programIconKey={programIconKey}
        selectedDate={selectedDate}
        onDaySelect={setSelectedDate}
        onStartWorkout={handleHeroPress}
        onScheduleChanged={() => {
          setScheduleVersion((v) => v + 1);
          // Fix (31.08.2026, "edit schedule to strength, home still recommends recovery
          // until leaving and re-entering the page"): scheduleVersion only re-fetches the
          // calendar-entry batch for MonthlyCalendarGrid — it never touched the `profile`
          // object in useUserStore, which is what buildHomeUserContext reads `lifestyle`
          // from to compute todayGoal (7cb1cfa9's own fix). Without a fresh profile, that
          // computation keeps using the pre-edit lifestyle snapshot, so rank-suggestions.ts
          // keeps handing recovery-follow-up its goalMatch bonus. refreshProfile() pulls the
          // real doc from Firestore and replaces `profile` with a new object reference,
          // which the pre-workout ranking effect (deps: [profile, resolveHomeTier2,
          // selectedDate]) already re-runs on — no other change needed for the ranking
          // itself to pick up the edit immediately.
          refreshProfile().catch((e) => console.error('[HomePage] Error refreshing profile after schedule edit:', e));
        }}
        onCommunityTap={handleOpenGroupFromBanner}
        onPreviewEntry={(entry) => {
          previewEntryRef.current = entry;
          setPreviewEntry(entry);
        }}
        onEntryTap={handleCalendarEntryTap}
        onOpenBuilder={(params) => {
          setBuilderProps({ mode: params.mode, date: params.date, defaultDuration: params.defaultDuration, defaultProgramIds: params.defaultProgramIds });
          setBuilderOpen(true);
        }}
      />

      {/* ── Lifestyle Wizard (Full Screen) ── */}
      <AnimatePresence>
        {showLifestyleWizard && (
          <LifestyleWizard
            onComplete={handleWizardComplete}
            onSkip={() => {
              handleSkipBridge();
              setShowLifestyleWizard(false);
            }}
          />
        )}
      </AnimatePresence>

      {/* ── Modals & Drawers ── */}

      {showAlert && (
        <AlertModal
          type={showAlert as 'missed' | 'comeback'}
          onClose={() => setShowAlert(null)}
          onAction={handleAlertAction}
        />
      )}

      <WorkoutPreviewDrawer
        key="workout-preview-drawer"
        isOpen={selectedWorkout !== null}
        onClose={() => {
          setSelectedWorkout(null);
          setPreviewEntry(null);
          previewEntryRef.current = null;
          setIsWorkoutLoading(false);
          // Regression fix (30.08.2026) — clear any full-strength toggle state left over
          // from this preview so the next-opened suggestion (of any type) never inherits it.
          preWorkoutTrioSuggestionRef.current = null;
          setTrioSelector(null);
        }}
        workout={selectedWorkout}
        generatedWorkout={generatedWorkout}
        isGeneratingWorkout={isWorkoutLoading}
        onStartWorkout={(workoutId) => router.push(`/workouts/${workoutId}/active`)}
        onGeneratedWorkoutUpdate={handleWorkoutGenerated}
        onEditEntry={previewEntry?.entryId ? handleEditFromDrawer : undefined}
        intensityOptions={trioSelector?.options}
        selectedIntensityIndex={trioSelector?.selectedIndex}
        onSelectIntensity={trioSelector?.onSelect}
      />

      {/* Edit modal — opened by drawer pencil or directly from other entry points */}
      {editEntry && (() => {
        const cat = editEntry.scheduledCategories?.[0] ?? 'strength';
        const entryType = (cat === 'walking' ? 'walking' : cat === 'cardio' ? 'running' : 'strength') as 'strength' | 'running' | 'walking';
        return (
          <AddWorkoutModal
            isOpen={!!editEntry}
            onClose={() => setEditEntry(null)}
            targetDate={editEntry.date}
            userId={profile?.id}
            onSaved={() => { setEditEntry(null); setScheduleVersion((v) => v + 1); }}
            initialEntryId={editEntry.entryId}
            initialType={entryType}
            initialProgramId={editEntry.programIds?.[0]}
            initialStartTime={editEntry.startTime}
            initialTitle={editEntry.title}
            onOpenBuilder={(params) => {
              setEditEntry(null);
              setBuilderProps({ mode: params.mode, date: params.date, defaultDuration: params.defaultDuration, defaultProgramIds: params.defaultProgramIds });
              setBuilderOpen(true);
            }}
          />
        );
      })()}

      {builderOpen && (
        <WorkoutBuilderSheet
          {...builderProps}
          onClose={() => setBuilderOpen(false)}
        />
      )}

      {/* ── Dev Mode ── */}
      {isDevModeAvailable && (
        <>
          <button
            onClick={() => setShowDevPanel(!showDevPanel)}
            className="fixed bottom-20 left-4 z-50 w-10 h-10 flex items-center justify-center bg-amber-500 hover:bg-amber-600 text-white rounded-full shadow-lg transition-all active:scale-95"
          >
            <Shield size={18} />
          </button>
          {showDevPanel && (
            <div className="fixed bottom-32 left-4 z-50 bg-gray-900 border border-gray-700 rounded-xl p-4 shadow-2xl w-56" dir="rtl">
              <p className="text-xs font-bold text-amber-400 mb-3 flex items-center gap-1.5">
                <Shield size={14} /> Dev Mode — Tier Toggle
              </p>
              <p className="text-[10px] text-gray-500 mb-3">
                רמה נוכחית: <span className="text-white font-bold">Tier {currentTier}</span>
              </p>
              <div className="space-y-2">
                {([1, 2, 3] as const).map((tier) => (
                  <button
                    key={tier}
                    onClick={() => handleSetTier(tier)}
                    className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-bold transition-all ${
                      currentTier === tier
                        ? tier === 1 ? 'bg-green-600 text-white' : tier === 2 ? 'bg-blue-600 text-white' : 'bg-violet-600 text-white'
                        : 'bg-gray-800 text-gray-300 hover:bg-gray-700'
                    }`}
                  >
                    {tier === 1 ? '🟢' : tier === 2 ? '🔵' : '🟣'}
                    <span>Tier {tier} — {tier === 1 ? 'Starter' : tier === 2 ? 'Community' : 'Elite'}</span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {/* Gear Toast — one-time after completing onboarding */}
      <AnimatePresence>
        {showGearToast && (
          <motion.div
            initial={{ y: 80, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 80, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 300, damping: 28 }}
            className="fixed bottom-24 inset-x-0 z-50 flex justify-center px-4"
          >
            <button
              onClick={() => { setShowGearToast(false); router.push('/profile'); }}
              className="flex items-center gap-3 bg-slate-900 text-white px-5 py-3.5 rounded-2xl shadow-xl max-w-sm w-full"
              dir="rtl"
            >
              <span className="text-lg">🎒</span>
              <div className="flex-1 text-right">
                <p className="text-sm font-bold leading-snug">הציוד עודכן!</p>
                <p className="text-xs text-slate-300">תמיד אפשר לערוך אותו בפרופיל האישי</p>
              </div>
              <ChevronDown size={16} className="text-slate-400 rotate-[-90deg]" />
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Completed-workout lookup failure toast (fix-round #6, 19-21.08.2026) */}
      <AnimatePresence>
        {completedWorkoutLookupFailed && (
          <motion.div
            initial={{ y: 80, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: 80, opacity: 0 }}
            transition={{ type: 'spring', stiffness: 300, damping: 28 }}
            className="fixed bottom-24 inset-x-0 z-50 flex justify-center px-4"
          >
            <button
              onClick={() => setCompletedWorkoutLookupFailed(false)}
              className="flex items-center gap-3 bg-slate-900 text-white px-5 py-3.5 rounded-2xl shadow-xl max-w-sm w-full"
              dir="rtl"
            >
              <span className="text-lg">⚠️</span>
              <div className="flex-1 text-right">
                <p className="text-sm font-bold leading-snug">לא הצלחנו לבדוק את האימון</p>
                <p className="text-xs text-slate-300">נסו ללחוץ שוב בעוד רגע</p>
              </div>
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      <GroupDetailsDrawer
        isOpen={!!bannerGroup}
        onClose={() => setBannerGroup(null)}
        group={bannerGroup}
        isJoined={true}
        liveSession={communitySessions.find((s) => s.groupId === bannerGroup?.id)}
      />

      <PostJoinSuccessDrawer
        isOpen={!!joinSuccessData}
        onClose={() => {
          // Chain: celebration → group details drawer so user lands in group context.
          const g = joinSuccessData?.group ?? null;
          setJoinSuccessData(null);
          if (g) setBannerGroup(g);
        }}
        name={joinSuccessData?.name ?? ''}
        verb={joinSuccessData?.verb ?? 'יתאמן'}
        scheduleSlots={joinSuccessData?.scheduleSlots}
        category={joinSuccessData?.category}
        address={joinSuccessData?.address}
      />

      {/* Health declaration hard-block — fires on first workout start */}
      <JITSetupModal
        isOpen={jitState.isModalOpen}
        requirements={jitState.requirements}
        onComplete={jitState.onComplete}
        onDismiss={dismissJIT}
        onCancel={cancelJIT}
      />
    </div>
  );
}
