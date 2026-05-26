"use client";

export const dynamic = 'force-dynamic';

import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useUserStore } from '@/features/user';
import AlertModal from '@/features/home/components/AlertModal';
import WorkoutPreviewDrawer from '@/features/workouts/components/WorkoutPreviewDrawer';
import { useSmartSchedule } from '@/features/home/hooks/useSmartSchedule';
import { MOCK_STATS } from '@/features/home/data/mock-schedule-data';
import { JITSetupModal } from '@/features/user/onboarding/components/JITSetupModal';
import { useRequiredSetup } from '@/features/user/onboarding/hooks/useRequiredSetup';
import BlurryBridgeOverlay from '@/features/user/onboarding/components/BlurryBridgeOverlay';
import LifestyleWizard from '@/features/user/onboarding/components/LifestyleWizard';
import { calculateProfileCompletion } from '@/features/user/identity/services/profile-completion.service';
import { motion, AnimatePresence } from 'framer-motion';
import HeroWorkoutCard, { type CompletionData } from '@/features/home/components/HeroWorkoutCard';
import { useSmartMessage } from '@/features/messages/hooks/useSmartGreeting';
import { useGoalCelebration } from '@/features/home/hooks/useGoalCelebration';
import { useCommunitySessionBanner } from '@/features/arena/hooks/useCommunitySessionBanner';
import CommunitySessionBanner from '@/features/arena/components/CommunitySessionBanner';
import GroupDetailsDrawer from '@/features/arena/components/GroupDetailsDrawer';
import type { CommunityGroup } from '@/types/community.types';

import {
  Shield, CheckCircle2, Circle, ChevronDown, X,
} from 'lucide-react';
import { signOut } from 'firebase/auth';
import { auth, db } from '@/lib/firebase';
import { UserFullProfile } from '@/types/user-profile';
import { GeneratedWorkout } from '@/features/workout-engine/logic/WorkoutGenerator';
import { resolveExerciseMedia } from '@/features/workout-engine/shared/utils/media-resolution.utils';
import { normalizeGearId } from '@/features/workout-engine/shared/utils/gear-mapping.utils';
import { getUserFromFirestore } from '@/lib/firestore.service';
import { doc as firestoreDoc, getDoc, updateDoc, setDoc } from 'firebase/firestore';
import { isAdminEmailAllowed } from '@/config/feature-flags';
import { setOnboardingPref } from '@/lib/onboardingPrefs';
import StatsOverview, { type BuilderContext } from '@/features/home/components/StatsOverview';
import SmartWeeklySchedule from '@/features/home/components/SmartWeeklySchedule';
import ProgramProgressRow from '@/features/home/components/rows/ProgramProgressRow';
import ConsistencyWidget from '@/features/home/components/rows/ConsistencyWidget';
import { useWeeklyProgress } from '@/features/activity';
import { useLiveDailyActivity } from '@/features/activity/hooks/useLiveDailyActivity';
import TrainingPlannerOverlay from '@/features/home/components/TrainingPlannerOverlay';
import AddWorkoutModal from '@/features/home/components/AddWorkoutModal';
import WorkoutBuilderSheet, { type WorkoutBuilderSheetProps } from '@/features/home/components/WorkoutBuilderSheet';
import { DaySchedule } from '@/features/home/data/mock-schedule-data';
import type { UserScheduleEntry } from '@/features/user/scheduling/types/schedule.types';

import { toISODate, getHebrewDayLetter } from '@/features/user/scheduling/utils/dateUtils';
import { useDashboardMode } from '@/hooks/useDashboardMode';
import { useFeatureFlags } from '@/hooks/useFeatureFlags';
import WorkoutLocationSuggestions from '@/features/home/components/WorkoutLocationSuggestions';
import AppHeader from '@/components/ui/AppHeader';
import { useSettingsStore } from '@/features/home/store/useSettingsStore';
import { requestHealthPermissions } from '@/lib/healthBridge/init';

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

  if (completion.isVerified || completion.percentage >= 100) return null;

  const handleGoToStep = (step: string) => {
    if (step === 'GPS_PERMISSION') {
      if (typeof window !== 'undefined' && 'geolocation' in navigator) {
        navigator.geolocation.getCurrentPosition(
          async () => {
            const uid = auth.currentUser?.uid;
            if (uid) {
              await setDoc(
                firestoreDoc(db, 'users', uid),
                { core: { gpsEnabled: true } },
                { merge: true },
              );
            }
          },
          () => { /* denied — no-op */ },
        );
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
const FALLBACK_STEPS_GOAL = 10_000;

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

/** Today's steps card — tappable. Clicking navigates to /activity/steps.
 *  On Android the first tap checks Health Connect permission; if not yet
 *  granted it triggers the native permission flow and shows a hint toast
 *  instead of navigating away. */
function StepsCard() {
  const router = useRouter();
  const { stepsToday, todayActivity } = useLiveDailyActivity();
  const goal = todayActivity?.stepsGoal ?? FALLBACK_STEPS_GOAL;
  const barPct = goal > 0 ? Math.min(100, (stepsToday / goal) * 100) : 0;

  // Permission state — optimistic from settings store (set when the user
  // previously granted and the store was hydrated from Capacitor Prefs).
  const healthBridgeEnabled = useSettingsStore((s) => s.healthBridgeEnabled);
  const patchSettings = useSettingsStore((s) => s.patch);

  // Inline toast state (hint shown when permission is denied/pending).
  const [hint, setHint] = useState<string | null>(null);
  const hintTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showHint = (msg: string) => {
    if (hintTimer.current) clearTimeout(hintTimer.current);
    setHint(msg);
    hintTimer.current = setTimeout(() => setHint(null), 4000);
  };

  useEffect(() => () => { if (hintTimer.current) clearTimeout(hintTimer.current); }, []);

  const handlePress = useCallback(async () => {
    // If permission was previously confirmed, go straight to the detail page.
    if (healthBridgeEnabled) {
      router.push('/activity/steps');
      return;
    }

    // On web/non-native: navigate directly (no permission needed).
    const isNative =
      typeof window !== 'undefined' &&
      Boolean((window as any).Capacitor?.isNativePlatform?.());

    if (!isNative) {
      router.push('/activity/steps');
      return;
    }

    // Native Android/iOS: request Health Connect / HealthKit permissions.
    try {
      const { granted } = await requestHealthPermissions();
      if (granted) {
        patchSettings({ healthBridgeEnabled: true });
        router.push('/activity/steps');
      } else {
        showHint('כדי לראות את הצעדים שלך, אפשר גישה לבריאות בהגדרות');
      }
    } catch {
      showHint('לא ניתן לגשת לנתוני הבריאות כרגע');
    }
  }, [healthBridgeEnabled, patchSettings, router]);

  return (
    <div
      className="bg-white dark:bg-[#1E1E1E] w-full h-full flex flex-col justify-between relative overflow-hidden"
      style={{ ...HEALTH_CARD_STYLE, cursor: 'pointer' }}
      dir="rtl"
      onClick={handlePress}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') handlePress(); }}
      aria-label={`צעדים היום: ${stepsToday.toLocaleString()} מתוך ${goal.toLocaleString()}`}
    >
      <div className="p-4 flex flex-col justify-between h-full">
        <div>
          <p className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-1">
            צעדים היום
          </p>
          <p style={{ fontSize: 28, fontWeight: 500, lineHeight: 1.1 }} className="text-gray-900 dark:text-white tabular-nums">
            {stepsToday.toLocaleString()}
          </p>
          <p className="text-xs text-gray-400 dark:text-gray-500 mt-0.5">
            מתוך {goal.toLocaleString()} צעדים
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
              backgroundColor: '#1D9E75',
              transition: 'width 0.4s ease',
            }}
          />
        </div>
      </div>

      {/* Inline permission hint toast */}
      <AnimatePresence>
        {hint && (
          <motion.div
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 6 }}
            transition={{ duration: 0.2 }}
            className="absolute inset-x-0 bottom-0 px-2 pb-2"
          >
            <div
              className="text-[10px] font-medium text-center text-white rounded-xl px-2 py-1.5 leading-snug"
              style={{ background: 'rgba(0,0,0,0.72)' }}
            >
              {hint}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
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

  // Handle "pencil" tap from WorkoutPreviewDrawer — close drawer and open edit modal
  const handleEditFromDrawer = useCallback(() => {
    if (!previewEntry?.entryId) return;
    setSelectedWorkout(null);
    setEditEntry(previewEntry);
  }, [previewEntry]);

  // Open WorkoutPreviewDrawer from a MonthlyCalendarGrid cell tap (via TrainingPlannerOverlay)
  const handleCalendarEntryTap = useCallback((entry: UserScheduleEntry) => {
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
  }, []);

  // Selected date drives SmartWeeklySchedule highlight + StatsOverview workout gen
  const [selectedDate, setSelectedDate] = useState(() => toISODate(new Date()));

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

  // ── Post-Workout Celebration Mode ──
  const [postWorkoutData, setPostWorkoutData] = useState<{
    workoutType: string; durationMinutes: number; completedAt: string;
    workoutTitle?: string; streak?: number; thumbnailUrl?: string;
  } | null>(null);
  const postWorkoutMsg = useSmartMessage('post_workout');
  const { celebrate } = useGoalCelebration();
  const [showMotivationBanner, setShowMotivationBanner] = useState(false);
  const { sessions: communitySessions, dismiss: dismissSession } = useCommunitySessionBanner();
  const [bannerGroup, setBannerGroup] = useState<CommunityGroup | null>(null);

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

  const completionData: CompletionData | undefined = postWorkoutData
    ? {
        workoutType: postWorkoutData.workoutType,
        durationMinutes: postWorkoutData.durationMinutes,
        workoutTitle: postWorkoutData.workoutTitle,
        streak: postWorkoutData.streak,
        thumbnailUrl: postWorkoutData.thumbnailUrl,
      }
    : undefined;

  const handleDismissCelebration = useCallback(() => {
    setPostWorkoutData(null);
    setShowMotivationBanner(false);
  }, []);

  const handleRequestMore = useCallback(() => {
    setPostWorkoutData(null);
    setShowMotivationBanner(false);
    setTimeout(() => handleHeroPress(), 200);
  }, []);

  // Check for query params from post-workout CTA or JIT return
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
    }
  }, []);

  // JIT Setup Hook
  const { interceptWorkoutStart, jitState, dismissJIT, cancelJIT } = useRequiredSetup();

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

  const handleWorkoutGenerated = useCallback((workout: GeneratedWorkout) => {
    generatedWorkoutRef.current = workout;
    setGeneratedWorkout(workout);
    setIsWorkoutLoading(false);
  }, []);

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

        const { videoUrl: resolvedVideoUrl, imageUrl: resolvedImageUrl } =
          resolveExerciseMedia(ex.exercise as any, ex.method as any);

        if (!resolvedImageUrl && !resolvedVideoUrl) {
          const allMethods = ex.exercise.execution_methods || ex.exercise.executionMethods || [];
          console.error(`[Media FAIL] No media found for exercise: ${glt(ex.exercise.name)} (${ex.exercise.id}), method: ${ex.method?.methodName || 'none'}, allMethods: ${allMethods.length}`);
        }

        // Hebrew grammar: '1 חזרה' not '1 חזרות'
        const fmtReps = (n: number) => (n === 1 ? 'חזרה אחת' : `${n} חזרות`);
        const fmtSecs = (n: number) => (n === 1 ? 'שנייה אחת' : `${n} שניות`);

        return {
          id: ex.exercise.id,
          name: glt(ex.exercise.name),
          reps: actuallyTimeBased ? undefined : (
            ex.repsRange && ex.repsRange.min !== ex.repsRange.max
              ? `${ex.repsRange.min}-${ex.repsRange.max} חזרות`
              : fmtReps(ex.reps)
          ),
          duration: actuallyTimeBased ? (
            ex.repsRange && ex.repsRange.min !== ex.repsRange.max
              ? `${ex.repsRange.min}-${ex.repsRange.max} שניות`
              : fmtSecs(ex.reps)
          ) : undefined,
          videoUrl: resolvedVideoUrl,
          imageUrl: resolvedImageUrl,
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
      const mainExercises = exercises.filter((ex: any) => ex.exerciseRole === 'main' || !ex.exerciseRole);
      const cooldownExercises = exercises.filter((ex: any) => ex.exerciseRole === 'cooldown');
      const recoveryExercises = exercises.filter((ex: any) => ex.exerciseRole === 'recovery');

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
      coverImage: 'https://images.unsplash.com/photo-1571019613454-1cb2f99b2d8b?auto=format&fit=crop&w=800&q=80',
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
  const handleHeroPress = useCallback((explicitDate?: string) => {
    const dateToUse = (typeof explicitDate === 'string') ? explicitDate : selectedDate;

    // Sync the selected-date highlight immediately — StatsOverview will begin
    // generating for dateToUse before the preview drawer finishes mounting.
    if (typeof explicitDate === 'string' && explicitDate !== selectedDate) {
      setSelectedDate(explicitDate);
    }

    if (!profile?.core?.name) {
      router.push('/onboarding-new/profile');
      return;
    }

    if (hasProgram) {
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

      // Pass dateToUse into openWorkoutPreview so the uniqueWorkoutId and any
      // future date-aware preview logic use the synchronously resolved date.
      interceptWorkoutStart(() => openWorkoutPreview(dateToUse));
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
  }, [hasProgram, isMapOnlyUser, interceptWorkoutStart, openWorkoutPreview, profile, router, selectedDate]);

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
    if (hasProgram) openWorkoutPreview();
  }, [hasProgram, openWorkoutPreview, profile, router]);

  const handleAlertAction = () => { setShowAlert(null); handleHeroPress(); };

  // Firestore fallback
  const [isCheckingFirestore, setIsCheckingFirestore] = useState(false);
  useEffect(() => {
    if (!_hasHydrated || profile || isCheckingFirestore) return;
    const checkFirestore = async () => {
      setIsCheckingFirestore(true);
      try {
        const uid = auth.currentUser?.uid;
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
    const isPast = i < todayIndex;
    // Running mode: never auto-mark past days as completed — the running
    // schedule entries carry their own status (pending / completed / skipped).
    const status: DaySchedule['status'] = isToday
      ? 'today'
      : isPast && isTrainingDay && !isRunningMode
        ? 'completed'
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
      <div className="max-w-md mx-auto px-4 pt-2 pb-4 space-y-2">

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
              scheduleVersion={scheduleVersion}
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
            ════════════════════════════════════════════════════════════════ */}
        {(() => {
          const TAB_LABELS: Record<'strength' | 'health', string> = {
            strength: 'התקדמות שבועית',
            health: 'מדדי בריאות',
          };

          return (
            <div className="flex flex-col gap-4 mt-0">
              {/* ── Tabs bar ─────────────────────────────────────────── */}
              <div
                className="w-full max-w-[358px] mx-auto flex border-b border-gray-100"
                dir="rtl"
              >
                {(['strength', 'health'] as const).map((tab) => {
                  const isActive = homeTab === tab;
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
              {homeTab === 'strength' ? (
                /* התקדמות שבועית — program ring (right 65%) + consistency bars (left 35%) */
                <div
                  className="w-full max-w-[358px] mx-auto grid gap-3 items-stretch"
                  style={{ gridTemplateColumns: '8fr 5fr', direction: 'rtl' }}
                >
                  <ProgramProgressRow />
                  <ConsistencyWidget />
                </div>
              ) : (
                /* מדדי בריאות — activity minutes (right) + steps (left) */
                <div
                  className="w-full max-w-[358px] mx-auto grid gap-3 items-stretch"
                  style={{ gridTemplateColumns: '1fr 1fr', direction: 'rtl' }}
                >
                  <ActivityCard />
                  <StepsCard />
                </div>
              )}

              {/* ── Daily Workout Hero — always visible ─────────────── */}
              <StatsOverview
                stats={MOCK_STATS}
                onStartWorkout={handleHeroPress}
                onDirectStart={handleDirectStart}
                onWorkoutGenerated={handleWorkoutGenerated}
                selectedDate={selectedDate}
                hasCompletedAssessment={hasCompletedAssessment}
                hideWorkoutSection={!!postWorkoutData}
                enableRunningPrograms={featureFlags.enableRunningPrograms}
                scheduleVersion={scheduleVersion}
                onBuildCustom={handleBuildCustom}
                generateSingleOption={isWorkoutLoading}
              />
            </div>
          );
        })()}

        {/* Nearby Workout Locations — context-aware carousel (below the 5 rows) */}
        <WorkoutLocationSuggestions
          workoutType={isRunningMode ? 'running' : 'strength'}
        />

        {/* Post-Workout Celebration Card — replaces the workout trio when just completed */}
        {postWorkoutData && completionData && (
          <motion.div
            initial={{ opacity: 0, scale: 0.97 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.4, ease: 'easeOut' }}
          >
            <HeroWorkoutCard
              workout={{ id: 'completed', title: completionData.workoutTitle || '', duration: completionData.durationMinutes, difficulty: 2 } as any}
              onStart={handleHeroPress}
              isCompleted
              completionData={completionData}
              onRequestMore={handleRequestMore}
              onDismissCelebration={handleDismissCelebration}
              userGender={profile?.core?.gender}
            />
          </motion.div>
        )}

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

      <JITSetupModal
        isOpen={jitState.isModalOpen}
        requirements={jitState.requirements}
        onComplete={jitState.onComplete}
        onDismiss={dismissJIT}
        onCancel={cancelJIT}
      />

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

      <GroupDetailsDrawer
        isOpen={!!bannerGroup}
        onClose={() => setBannerGroup(null)}
        group={bannerGroup}
        isJoined={true}
      />
    </div>
  );
}
