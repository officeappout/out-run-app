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
import { calculateProfileCompletion } from '@/features/user/identity/services/profile-completion.service';
import { motion, AnimatePresence, type PanInfo } from 'framer-motion';
import { type CompletionData } from '@/features/home/components/HeroWorkoutCard';
import { useSmartMessage } from '@/features/messages/hooks/useSmartGreeting';
import { useGoalCelebration } from '@/features/home/hooks/useGoalCelebration';
import { useDailyProgress } from '@/features/home/hooks/useDailyProgress';
import { useTodayStrengthVolume } from '@/features/home/hooks/useTodayStrengthVolume';
import { useDailyStrengthTarget } from '@/features/home/hooks/useDailyStrengthTarget';
import { FRAGMENTER_MINUTES_PER_SET } from '@/features/home/utils/setsToMinutes';
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
import { isAdminEmailAllowed, STRENGTH_RING_ENABLED, HOME_ANCHOR_V2_ENABLED, HOME_RECOVERY_START_SHORTCUT_ENABLED, POST_WORKOUT_SUGGESTION_CAROUSEL_ENABLED } from '@/config/feature-flags';
import { setOnboardingPref } from '@/lib/onboardingPrefs';
import StatsOverview, { type BuilderContext, type TrioSelector } from '@/features/home/components/StatsOverview';
import DailyGoalRingsCard from '@/features/home/components/DailyGoalRingsCard';
import SmartWeeklySchedule from '@/features/home/components/SmartWeeklySchedule';
import ProgramProgressRow from '@/features/home/components/rows/ProgramProgressRow';
import ConsistencyWidget from '@/features/home/components/rows/ConsistencyWidget';
import { useWeeklyProgress, useDailyActivity, useDayStatus } from '@/features/activity';
import type { ActivityCategory } from '@/features/activity/types/activity.types';
import TodayActivityStrip from '@/features/home/components/TodayActivityStrip';
import type { TodayActivityCardData } from '@/features/home/components/TodayActivityCard';
import StepsSummaryCard from '@/features/home/components/widgets/StepsSummaryCard';
import TrainingPlannerOverlay from '@/features/home/components/TrainingPlannerOverlay';
import AddWorkoutModal from '@/features/home/components/AddWorkoutModal';
import WorkoutBuilderSheet, { type WorkoutBuilderSheetProps } from '@/features/home/components/WorkoutBuilderSheet';
import PlannedActivityComposeSheet from '@/features/parks/client/components/planned-activity/PlannedActivityComposeSheet';
import UnifiedPlusDrawer from '@/features/parks/client/components/planned-activity/UnifiedPlusDrawer';
import { SOCIAL_COMPOSE_UI_ENABLED } from '@/config/feature-flags';
import { useUserLocationSync } from '@/features/parks/core/hooks/useUserLocationSync';
import ContributionWizard from '@/features/parks/client/components/contribution-wizard';
import QuickReportSheet from '@/features/parks/client/components/contribution-wizard/QuickReportSheet';
import { DaySchedule } from '@/features/home/data/mock-schedule-data';
import type { UserScheduleEntry } from '@/features/user/scheduling/types/schedule.types';

import { toISODate, getHebrewDayLetter, stepSelectedDate } from '@/features/user/scheduling/utils/dateUtils';
import { getWorkoutsForDate } from '@/features/workout-engine/core/services/storage.service';
import { useDashboardMode } from '@/hooks/useDashboardMode';
import { useFeatureFlags } from '@/hooks/useFeatureFlags';
import WorkoutLocationSuggestions from '@/features/home/components/WorkoutLocationSuggestions';
import NearbyGroupsRow from '@/features/home/components/NearbyGroupsRow';
import AppHeader from '@/components/ui/AppHeader';
import { useRequiredSetup } from '@/features/user/onboarding/hooks/useRequiredSetup';
import { JITSetupModal } from '@/features/user/onboarding/components/JITSetupModal';
import { useWorkoutSession } from '@/features/workouts/components/workout-preview-drawer/hooks/useWorkoutSession';
import type { Suggestion } from '@/features/workout-engine/core/types/suggestion.types';
import { runSuggestionEngine } from '@/features/workout-engine/core/engine/suggestion-engine';
import { buildHomeUserContext } from '@/features/workout-engine/core/context/build-home-user-context';
import { suggestionToGeneratedWorkout } from '@/features/workout-engine/core/engine/pick-post-workout-suggestion';
import { SuggestionCarousel } from '@/features/workout-engine/core/components/SuggestionCarousel';
import { PostWorkoutCardRenderer } from '@/features/home/components/PostWorkoutCardRenderer';

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

  const completion = useMemo(
    () => calculateProfileCompletion(profile),
    [profile],
  );

  // Pre-registration users (no strength program yet) shouldn't see the strength
  // setup items — they're redundant entries into the questionnaire the always-
  // visible Hero already offers. Hide the strength bucket; keep basic-info items.
  // They return once a program exists.
  const hasProgram = !!(
    profile.progression?.domains && Object.keys(profile.progression.domains).length > 0
  );
  const visibleItems = hasProgram
    ? completion.items
    : completion.items.filter((i) => i.bucket !== 'strength');

  if (completion.isVerified || completion.percentage >= 100) return null;

  const handleGoToStep = async (step: string) => {
    if (step === 'GPS_PERMISSION') {
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
    router.push(`/onboarding-new/setup?step=${step}&jit=true`);
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
              {visibleItems.map((item) => (
                <div key={item.id} className="flex items-center gap-2.5 py-1.5">
                  {item.completed ? (
                    <CheckCircle2 size={16} className="text-emerald-500 flex-shrink-0" />
                  ) : (
                    <Circle size={16} className="text-slate-300 flex-shrink-0" />
                  )}
                  <span className={`flex-1 text-xs ${item.completed ? 'text-slate-400 line-through' : 'text-slate-700 font-medium'}`}>
                    {item.label}
                  </span>
                  {!item.completed && item.step && (
                    <button
                      onClick={() => handleGoToStep(item.step!)}
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

// How long the post_workout completion card waits for runSuggestionEngine before giving up
// and letting handleRequestMore's CTA close the card / start a fresh workout instead of
// staying a permanent no-op (adversarial review, 18.08.2026 — see postWorkoutCarouselTimedOut).
// Not tuned against real network data; a conservative bound safely longer than the generators'
// normal (non-instant but sub-second-to-low-seconds) resolve time.
const POST_WORKOUT_CAROUSEL_TIMEOUT_MS = 8000;

// Stage D+E (19.08.2026) — Hebrew label for a today-activity card representing
// a category with no richer per-completion data available (see
// buildTodayActivityCards' isRich distinction below).
const TODAY_ACTIVITY_CATEGORY_LABEL: Record<ActivityCategory, string> = {
  strength: 'אימון כוח',
  cardio: 'אימון אירובי',
  maintenance: 'גמישות ותנועתיות',
};

/**
 * CompletionWorkoutType ('strength'|'running'|'walking'|'cycling'|'hybrid',
 * from completion-sync.service.ts) → the 3-way ActivityCategory bucket
 * useDayStatus().sessions is keyed by. 'hybrid' deliberately maps to null —
 * a hybrid completion can touch multiple categories at once, and there's no
 * existing signal for which one to attribute the rich (title/thumbnail)
 * completion data to, so it's left to fall back to the generic per-category
 * cards rather than guessing.
 */
function workoutTypeToCategory(workoutType: string | undefined): ActivityCategory | null {
  if (workoutType === 'strength') return 'strength';
  if (workoutType === 'running' || workoutType === 'walking' || workoutType === 'cycling') return 'cardio';
  return null;
}

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
    workoutTitle?: string; streak?: number; thumbnailUrl?: string;
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
  }, [tryOpenCompletedWorkout]);

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
  // Stage D+E (19.08.2026) — real, already-live per-category minutes for
  // today (strength/cardio/maintenance, >=10 real logged min each), sorted
  // desc. Drives the today-activity strip below: one card per category
  // actually present today. Investigated before using it: this is
  // category-bucketed (max 3 entries, one per category), not a raw
  // per-workout-event count — two separate same-category sessions today
  // still collapse into one bucket here. That's a deliberate, confirmed
  // choice, not an oversight: a true per-instance count exists
  // (activity.categories[cat].sessions, currently unread anywhere) but
  // would only ever produce visually-identical duplicate cards for the
  // same category (no per-instance title/thumbnail data exists to tell
  // "session 1" apart from "session 2" of the same category) — it doesn't
  // buy more useful information, just more cards, so it's not used here.
  const getDayStatus = useDayStatus();
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

  useEffect(() => {
    if (typeof window === 'undefined') return;
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
  // Which category gets the "rich" (real title/thumbnail/duration) card: only
  // the just-completed workout's own category, via workoutTypeToCategory —
  // every other category present today (e.g. an earlier walk, same day as
  // today's strength session) gets a generic category-labeled card instead,
  // since no title/thumbnail data exists for anything but the most recent
  // completion (completionData's fields all trace back to a single 30-min-TTL
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
  const todayActivityCards: TodayActivityCardData[] = useMemo(() => {
    if (!profile) return [];
    const todayISO = toISODate(new Date());
    const dayStatus = getDayStatus(todayISO);
    const richCategory = completionData ? workoutTypeToCategory(completionData.workoutType) : null;

    const cards: TodayActivityCardData[] = dayStatus.sessions.map((s) => {
      const isRich = s.category === richCategory && !!completionData;
      return {
        key: s.category,
        category: s.category,
        // F2.3: matches `category` here — dayStatus.sessions is bucketed by
        // ActivityCategory with no hybrid-attribution available at this
        // layer, so a hybrid workout that happens to cross the 10-min floor
        // in exactly one category is a known, narrower, deferred gap (not
        // the confirmed bug the adversarial review found — that was Safety
        // Net 2 below, fixed). Flagged, not fixed: fixing this path would
        // need dayStatus.sessions itself to carry hybrid-attribution, which
        // it doesn't today.
        matchCategory: s.category,
        title: isRich
          ? (completionData!.workoutTitle || TODAY_ACTIVITY_CATEGORY_LABEL[s.category])
          : TODAY_ACTIVITY_CATEGORY_LABEL[s.category],
        minutes: Math.round(s.minutes),
        thumbnailUrl: isRich ? completionData!.thumbnailUrl : undefined,
        streak: completionData?.streak ?? 1,
      };
    });

    // Safety net 1: dayStatus.sessions only includes categories that crossed the
    // 10-min STREAK_MINIMUM_MINUTES floor. A short/express completion under
    // that floor would otherwise vanish from the strip entirely even though
    // completionData proves a real workout just finished — add it explicitly
    // if its category isn't already represented above.
    //
    // Minutes come from dayStatus.categories (the real per-category total
    // logged today), not completionData.durationMinutes — the latter is
    // hardcoded to 0 on the persistent Firestore-only fallback branch of
    // completionData (no postWorkoutData sessionStorage payload — e.g. any
    // home revisit after the first post-workout mount, confirmed to be the
    // steady state on remount), which would otherwise show a fabricated
    // "0 min" for a real completed workout (adversarial review, 19.08.2026).
    if (completionData && richCategory && !cards.some((c) => c.category === richCategory)) {
      cards.unshift({
        key: richCategory,
        category: richCategory,
        // F2.3: richCategory is guaranteed non-null and non-hybrid inside
        // this `if` (workoutTypeToCategory never returns 'hybrid'), so this
        // genuinely matches the real doc's category — no mismatch risk here.
        matchCategory: richCategory,
        title: completionData.workoutTitle || TODAY_ACTIVITY_CATEGORY_LABEL[richCategory],
        minutes: Math.round(dayStatus.categories[richCategory] || completionData.durationMinutes || 0),
        thumbnailUrl: completionData.thumbnailUrl,
        streak: completionData.streak ?? 1,
      });
    }

    // Safety net 2: a hybrid completion (richCategory === null, so safety net 1
    // can't attribute it to one category) that also logged under 10 min in
    // every category would otherwise still show nothing — the one invariant
    // that matters most here is "never regress to showing NOTHING in a case
    // where the old HeroWorkoutCard-based code would have shown something."
    //
    // fallbackCategory is a styling-only choice (fill color) here, not a
    // factual claim — TodayActivityCard's headline text is category-agnostic
    // ("האימון בוצע בהצלחה!", matching the old HeroWorkoutCard wording
    // exactly) specifically so a genuine hybrid completion never gets
    // mislabeled in words as "strength" (adversarial review, 19.08.2026).
    // Minutes sum every category's real total when richCategory is null
    // (hybrid splits its duration across categories — see useHybridRun.ts's
    // categorySplits — so summing is a closer estimate of total duration
    // than picking one category alone).
    if (completionData && cards.length === 0) {
      const fallbackCategory: ActivityCategory = richCategory ?? 'strength';
      const fallbackMinutes = richCategory
        ? dayStatus.categories[richCategory]
        : dayStatus.categories.strength + dayStatus.categories.cardio + dayStatus.categories.maintenance;
      cards.push({
        key: 'completion-fallback',
        category: fallbackCategory,
        // F2.3 (adversarial review, must-fix, 19.08.2026): fallbackCategory
        // above is a STYLING choice only ('strength' when richCategory is
        // null, i.e. exactly the hybrid case) — matching a tap against it
        // would compare 'strength' against a real hybrid doc's category:
        // 'hybrid' and never find it (silent no-op, or worse, a wrong-doc
        // match against an unrelated real strength session). matchCategory
        // carries the REAL category instead: richCategory when set, else
        // 'hybrid' (the only reason this branch's richCategory is ever null).
        matchCategory: richCategory ?? 'hybrid',
        title: completionData.workoutTitle || 'האימון היומי שלך',
        minutes: Math.round(fallbackMinutes || completionData.durationMinutes || 0),
        thumbnailUrl: completionData.thumbnailUrl,
        streak: completionData.streak ?? 1,
      });
    }

    return cards;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- see the primitive-deps note above
  }, [
    profile,
    getDayStatus,
    completionData?.workoutType,
    completionData?.workoutTitle,
    completionData?.thumbnailUrl,
    completionData?.streak,
    completionData?.durationMinutes,
  ]);

  // F2.3 (19.08.2026, "unified workout summary" plan): tapping a
  // TodayActivityCard opens the real workout it represents. Its data
  // (TodayActivityCardData) carries only `category` — no per-instance
  // workout id, since useDayStatus().sessions is category-bucketed
  // (confirmed during F2's investigation) — so this resolves to the MOST
  // RECENT real workout doc for that category today, via getWorkoutsForDate
  // (already built for F2.2's schedule entry point, reused here as-is — no
  // category filter in the query itself, since that would need a new
  // Firestore index; filtered client-side instead, cheap given a single day
  // realistically has 1-3 docs). No session-picker, matching David's own
  // stated principle for this exact ambiguity (19.08.2026): "לחיצה על כרטיס
  // תמיד מובילה ליעד סיכום אחד עקבי לאותה קטגוריה... אין צורך במנגנון
  // בחירה בין sessions."
  //
  // In-flight guard (adversarial review, must-fix, 19.08.2026): a separate
  // ref from F2.2's tryOpenCompletedWorkout (that one lives in a different
  // closure) — without it, tapping two different cards in quick succession
  // fires two independent Firestore queries whose RESOLUTION order isn't
  // guaranteed to match tap order, so the wrong one could win the
  // navigation. Matches `card.matchCategory`, not `card.category` — see
  // TodayActivityCardData's own doc comment for why those differ for the
  // hybrid-fallback card specifically (also an adversarial-review must-fix:
  // matching on `category` there would compare a styling-only 'strength'
  // against a real hybrid doc's category:'hybrid' and never find it).
  const isResolvingCardTapRef = useRef(false);
  const handleTodayActivityCardTap = useCallback(async (card: TodayActivityCardData) => {
    if (!profile?.id) return;
    if (isResolvingCardTapRef.current) return;
    isResolvingCardTapRef.current = true;
    try {
      const todayISO = toISODate(new Date());
      const todaysWorkouts = await getWorkoutsForDate(profile.id, todayISO);
      const match = todaysWorkouts.find((w) => w.category === card.matchCategory);
      // No real doc found for a card that's already showing — a rare
      // data-race edge case (e.g. a doc write still in flight), not expected
      // in practice — silent no-op rather than an error UI.
      if (match?.id) router.push(`/workouts/${match.id}/history`);
    } catch (error) {
      // getWorkoutsForDate now throws instead of swallowing (fix-round #6,
      // 19-21.08.2026). This call site's own no-match case is already a
      // deliberate silent no-op (above) — a genuine query failure gets the
      // same treatment here (nothing to navigate to either way), just
      // logged instead of silently caught two layers down.
      console.error('[handleTodayActivityCardTap] Failed to resolve a workout for tap:', error);
    } finally {
      isResolvingCardTapRef.current = false;
    }
  }, [profile?.id, router]);

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
  // TEMPORARY (David, 16.08.2026): while the flag is off for everyone, let an admin email
  // see it live in production — real device verification needs real prod data, not local.
  // Remove this OR once POST_WORKOUT_SUGGESTION_CAROUSEL_ENABLED itself flips true for real.
  const postWorkoutCarouselEnabled =
    POST_WORKOUT_SUGGESTION_CAROUSEL_ENABLED ||
    isAdminEmailAllowed(auth.currentUser?.email || profile?.core?.email || null);
  // True only once the carousel has something real to show — NOT just "the flag is on".
  // Adversarial review (18.08.2026) caught a real gap: runSuggestionEngine's post_workout
  // generators do genuine Firestore-backed work (generateHomeWorkoutTrio), so there's a
  // real (not instant) window after completion where the flag is on but
  // postWorkoutSuggestions is still null. The CTA stays mounted (onRequestMore below) during
  // this window rather than hiding immediately — but per the Stage-A bugfix (18.08.2026,
  // see handleRequestMore + postWorkoutCarouselTimedOut below), it's a no-op tap during a
  // normal short wait, not a functioning "start something" fallback — the carousel is
  // expected to auto-reveal on its own moments later. It only becomes closeable again if
  // the fetch actually stalls past POST_WORKOUT_CAROUSEL_TIMEOUT_MS.
  //
  // Stage B (18.08.2026): also the single source of truth for the header directly above the
  // carousel (see the render site below) — postWorkoutCarouselReady already means exactly
  // "is the carousel itself showing right now," so the header re-uses it as-is instead of a
  // separate postWorkoutCarouselVisible boolean (that boolean existed only because this file
  // didn't have postWorkoutCarouselReady yet at the time Stage B was first built against a
  // stale pre-Stage-A main — removed once rebased on top of Stage A).
  const postWorkoutCarouselReady =
    postWorkoutCarouselEnabled && !!postWorkoutSuggestions && postWorkoutSuggestions.length > 0;
  // Guards against a real dead-end (adversarial review, 18.08.2026): runSuggestionEngine's
  // .then() below has no .catch/timeout, so a stalled generator (e.g. a Firestore call stuck
  // on a bad connection right after an outdoor workout) can leave postWorkoutSuggestions null
  // forever. HeroWorkoutCard's celebration mode has no other interactive element in that
  // state (onDismissCelebration is accepted as a prop but never actually invoked inside
  // HeroWorkoutCard.tsx) — without this, a permanent no-op handleRequestMore would strand the
  // user on the completion card with nothing tappable that does anything.
  const [postWorkoutCarouselTimedOut, setPostWorkoutCarouselTimedOut] = useState(false);

  useEffect(() => {
    if (!postWorkoutCarouselEnabled) return;
    if (!(postWorkoutData || todayWorkoutDone) || !profile) return;
    let cancelled = false;
    setPostWorkoutCarouselTimedOut(false);
    // location: null — none of the registered post_workout generators (recovery-follow-up,
    // complementary-short, safety-net) read UserContext.location; skips an unnecessary GPS
    // permission prompt right after a workout, unlike the pull-surface builders.
    const context = buildHomeUserContext({ profile, location: null, surface: 'post_workout' });
    runSuggestionEngine(context).then((ranked) => {
      if (!cancelled) setPostWorkoutSuggestions(ranked);
    });
    const timeoutId = setTimeout(() => {
      if (!cancelled) setPostWorkoutCarouselTimedOut(true);
    }, POST_WORKOUT_CAROUSEL_TIMEOUT_MS);
    return () => { cancelled = true; clearTimeout(timeoutId); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [postWorkoutData, todayWorkoutDone, profile?.id]);

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
      const context = buildHomeUserContext({ profile, location: null, surface: 'post_workout' });
      const workout = await suggestionToGeneratedWorkout(context, suggestion);
      if (!workout) return;
      handlePostWorkoutStart(workout);
    } finally {
      setStartingSuggestionId(null);
    }
  }, [profile, handlePostWorkoutStart]);

  // Phase B (18.08.2026): the CTA that calls this stays mounted (and wired to this handler)
  // whenever postWorkoutCarouselReady is false — which includes BOTH "flag off entirely" AND
  // "flag on, but postWorkoutSuggestions hasn't resolved yet" (the real, non-instant loading
  // window; see postWorkoutCarouselReady above). Those two cases need different behavior, so
  // this can no longer be a single unconditional body:
  //   - flag off → unchanged: close the celebration card, start a fresh workout.
  //   - flag on, still within the normal wait → no-op. Closing the card / starting a new
  //     workout here would yank the user out from under the carousel that's about to
  //     auto-reveal on its own — the whole point of Phase B is that no tap is needed once
  //     it resolves.
  //   - flag on, but postWorkoutCarouselTimedOut (the fetch stalled past
  //     POST_WORKOUT_CAROUSEL_TIMEOUT_MS) → falls through to the same close+start-fresh
  //     path as flag-off. Without this branch a stalled fetch makes this a PERMANENT no-op
  //     (adversarial review, 18.08.2026) — the completion card has no other interactive
  //     element (onDismissCelebration is never actually invoked inside HeroWorkoutCard.tsx).
  const handleRequestMore = useCallback(() => {
    if (postWorkoutCarouselEnabled && !postWorkoutCarouselTimedOut) return;
    setPostWorkoutData(null);
    setShowMotivationBanner(false);
    setTimeout(() => handleHeroPress(), 200);
  }, [postWorkoutCarouselEnabled, postWorkoutCarouselTimedOut]);

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
    const healthAccepted =
      (profile as any)?.healthDeclarationAccepted ||
      (profile.health as any)?.healthDeclarationAccepted;
    return !healthAccepted;
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

  // Trio intensity selector — mirrored out of StatsOverview (see TrioSelector's
  // own doc comment) so WorkoutPreviewDrawer can render the inline toggle row
  // (Part א, "ארכיטקטורת הבית ומנוע-ההמלצות" doc) once the preview opens.
  const [trioSelector, setTrioSelector] = useState<TrioSelector | null>(null);

  const handleWorkoutGenerated = useCallback((workout: GeneratedWorkout) => {
    generatedWorkoutRef.current = workout;
    setGeneratedWorkout(workout);
    setIsWorkoutLoading(false);
  }, []);

  // ── Recovery-video-trio direct-start hand-off (HOME_RECOVERY_START_SHORTCUT_ENABLED) ──
  // Same useWorkoutSession hook WorkoutPreviewDrawer's own "Start" button uses
  // (see hooks/useWorkoutSession.ts) — called here at HomePage's top level so
  // handleHeroPress can hand off straight to the active player, bypassing
  // setSelectedWorkout(...) (which is what opens the drawer) for the
  // discriminator-matched case. Every input mirrors what openWorkoutPreview
  // already builds for the SAME tap:
  //   - id: identical scheme to openWorkoutPreview's uniqueWorkoutId
  //     (`workout-${date}-${uid8}`), keyed on `selectedDate` rather than the
  //     tap-local `dateToUse` — provably the same value here: the only case
  //     where handleHeroPress's `dateToUse` differs from `selectedDate` is an
  //     explicitDate-driven different-date tap, which unconditionally clears
  //     generatedWorkoutRef.current (see the block below) BEFORE this hook's
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
  const recoveryShortcutWorkoutId = `workout-${selectedDate}-${profile?.id?.slice(0, 8) || 'guest'}`;
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
    const uniqueWorkoutId = `workout-${today}-${profile?.id?.slice(0, 8) || 'guest'}`;
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
  const handleHeroPress = useCallback(async (explicitDate?: string) => {
    const dateToUse = (typeof explicitDate === 'string') ? explicitDate : selectedDate;

    // F2.2 (19.08.2026): a day that already has a real completed workout
    // opens its summary instead of the start-a-new-workout flow below —
    // checked FIRST, before any of that flow's logic (health gate,
    // map-only-user redirect, generated-workout resets), none of which
    // applies once we're navigating away. See tryOpenCompletedWorkout's own
    // doc comment for the cost-aware date gating.
    if (await tryOpenCompletedWorkout(dateToUse)) return;
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
      // already-null case (main hero card path) too.
      setPreviewEntry(null);
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
      // When a different date is tapped, flush the stale cached workout
      // immediately — before the async generator evaluates the new date.
      // This guarantees the drawer rises with the skeleton shimmer rather
      // than a frame of the previous workout's exercises.
      if (typeof explicitDate === 'string' && explicitDate !== selectedDate) {
        generatedWorkoutRef.current = null;
        setGeneratedWorkout(null);
        setIsWorkoutLoading(true);
        if (typeof window !== 'undefined') {
          sessionStorage.removeItem('active_workout_data');
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
  }, [hasStrengthProgram, isMapOnlyUser, openWorkoutPreview, profile, router, selectedDate, tryOpenCompletedWorkout]);

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

        {/* Daily Goal Rings — Stage G (18.08.2026, "completion-loop" plan).
            Placed right after the week strip, before the tabbed Row 2/3 block —
            a self-contained card, no interaction with the tab-switching grid
            below. Renders null while both goal hooks are still resolving, so
            no empty-card flash on mount. Gated on hasCompletedAssessment
            (David caught this, 18.08.2026) — same gate as the week strip
            above; a schedule-derived goal % is meaningless before the user
            has a program, consistent with the rest of this section. */}
        {hasCompletedAssessment && <DailyGoalRingsCard />}

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

          return (
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

              {/* ── Daily Workout Hero — always visible ───────────────
                  R-1.5 (order B, workout-first): with HOME_ANCHOR_V2_ENABLED the
                  anchor is pulled ABOVE the tabs/metrics via flex `order-first`,
                  giving schedule → anchor → metrics. A single element is reused for
                  both branches (no prop duplication); while the flag is off it is
                  rendered bare, last, exactly as before → byte-identical DOM. */}
              {(() => {
                const anchor = (
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
                  ? <motion.div className="order-first" onPanEnd={hasCompletedAssessment ? handleAnchorDayPan : undefined}>{anchor}</motion.div>
                  : anchor;
              })()}
            </div>
          );
        })()}

        {/* Today Activity Strip — Stage D+E (19.08.2026, "completion-loop" plan).
            REPLACES the old single HeroWorkoutCard completion card entirely (locked
            product decision — see adaptive-snacking-valiant.md's Stage C/D section):
            this is not an addition alongside it. Rendered here so it occupies the
            same vertical slot the old card did (above NearbyGroupsRow), same gate
            as before — (postWorkoutData || todayWorkoutDone), the exact compound
            confirmed load-bearing (postWorkoutData can go true before
            todayWorkoutDone's Firestore round-trip catches up; relying on either
            alone reintroduces that race). todayActivityCards.length>0 replaces the
            old `&& completionData` check — empty array (rest day / nothing done
            yet) means TodayActivityStrip renders null on its own; no separate
            visible empty-state needed, an absent strip already IS the empty state
            the plan calls for. */}
        {(postWorkoutData || todayWorkoutDone) && todayActivityCards.length > 0 && (
          <motion.div
            initial={{ opacity: 0, scale: 0.97 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.4, ease: 'easeOut' }}
          >
            <TodayActivityStrip
              cards={todayActivityCards}
              // Same CTA-visibility logic the old completion card used: hides only
              // once the post_workout carousel is actually ready to show.
              onRequestMore={postWorkoutCarouselReady ? undefined : handleRequestMore}
              onCardTap={handleTodayActivityCardTap}
            />
          </motion.div>
        )}

        {/* post_workout suggestion carousel (home-generator-v2 plan, step 6) — Phase B
            (18.08.2026): auto-reveals the moment postWorkoutSuggestions resolves, directly
            below the same completion card, same vertical slot. No tap required.
            Stage B (18.08.2026, "completion-loop" plan, requirement 5): header above the
            carousel, same visibility gate (postWorkoutCarouselReady) so it never shows
            without the carousel or vice versa. Copy variant driven by allGoalsMet —
            condition explicitly confirmed by David before this shipped, not decided
            unilaterally (per his instruction on this stage). */}
        {postWorkoutCarouselReady && (
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
        )}

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
        onScheduleChanged={() => setScheduleVersion((v) => v + 1)}
        onCommunityTap={handleOpenGroupFromBanner}
        onPreviewEntry={setPreviewEntry}
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
        onClose={() => { setSelectedWorkout(null); setPreviewEntry(null); setIsWorkoutLoading(false); }}
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
