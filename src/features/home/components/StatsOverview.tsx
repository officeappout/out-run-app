'use client';

import React, { useMemo, useEffect, useState, useCallback, useRef } from 'react';
import { useUserStore } from '@/features/user';
import { useGPSStore } from '@/features/parks/core/store/useGPSStore';
import { useDashboardMode } from '@/hooks/useDashboardMode';
import { SHOW_MISSED_DAYS_PROMPTS, HOME_ANCHOR_V2_ENABLED } from '@/config/feature-flags';
import HeroWorkoutCard, { pickHeroExercise, resolveHeroMedia } from './HeroWorkoutCard';
import AnchorOptionToggles from './AnchorOptionToggles';
import AnchorLocationChip from './AnchorLocationChip';
import type { LocationId } from './WorkoutBuilderSheet';
import { generatedToHeroWorkout } from '../utils/generatedToHeroWorkout';
// PR 4 (Apr 2026) — these widgets were removed from this file as part of the
// dashboard restructure. They are now mounted by the new dashboard rows in
// `src/features/home/components/rows/`. The imports remain available for
// any future re-introduction inside the action zone but are no longer used
// from this component.
//   - RunningStatsWidget        → replaced by RaceAndKmCarousel (Row 4/5)
//   - StrengthVolumeWidget      → replaced by ConsistencyWidget   (Row 2)
//   - ProgramProgressCard       → replaced by ProgramProgressRow  (Row 2)
//   - RunProgressCircle         → mounted inside RaceAndKmCarousel (Row 4/5)
//   - WeeklyExecutionCard       → replaced by ConsistencyWidget   (Row 2)
import { LoadAdvisorBanner } from './widgets/LoadAdvisorBanner';
import { RunForecastWidget } from './widgets/RunForecastWidget';
import NextRunWorkoutCard from './widgets/NextRunWorkoutCard';
import MissedWorkoutBanner from '@/features/workout-engine/players/running/components/MissedWorkoutBanner';
import { PlanRealignPopup, RebuildPopup } from '@/features/workout-engine/players/running/components/PlanAlignmentPopup';
import {
  handleProgramAlignment,
  rollBackOneWeek,
  calculateCurrentWeek,
  autoSkipMissedEntries,
  getCurrentUid,
  type AlignmentAction,
} from '@/features/workout-engine/core/services/workout-completion.service';
import { useDailyActivity, useWeeklyProgress } from '@/features/activity';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Dumbbell, Footprints, SlidersHorizontal, Lock, Clock } from 'lucide-react';
import { GeneratedWorkout, WorkoutExercise } from '@/features/workout-engine/logic/WorkoutGenerator';
import { generateHomeWorkoutTrio } from '@/features/workout-engine/services/home-workout.service';
import type { HomeWorkoutTrioResult } from '@/features/workout-engine/services/home-workout.types';
import { genPerfBegin, genPerfMark, genPerfEnd } from '@/lib/gen-perf';
import WorkoutSelectionCarousel, { CarouselSkeleton, BuildCustomButton } from './WorkoutSelectionCarousel';
import {
  useWeeklyVolumeStore,
  calculateWeeklyBudget,
} from '@/features/workout-engine/core/store/useWeeklyVolumeStore';
import { resolveActiveProgramBudget } from '@/features/workout-engine/services/lead-program.service';
import { getScheduleEntries, hydrateFromTemplate } from '@/features/user/scheduling/services/userSchedule.service';
import type { UserScheduleEntry } from '@/features/user/scheduling/types/schedule.types';
import { toISODate, isLateNightPivot, getHebrewDayLetter } from '@/features/user/scheduling/utils/dateUtils';
import UserWorkoutAdjuster from './UserWorkoutAdjuster';
import ProcessingOverlay from './ProcessingOverlay';
import { getProgramByTemplateId } from '@/features/content/programs/core/program.service';
import { useGoalsForProgram } from '@/features/user/progression/hooks/useGoalsForProgram';
import type { GoalItem } from './widgets/ProgramProgressCard';
import { getLocalizedText } from '@/features/content/exercises';
import { resolveIconKey, getProgramIcon } from '@/features/content/programs';
import { resolveWorkoutContext } from '@/features/workout-engine/services/workout-context-resolver';
import { ensureEquipmentCachesLoaded } from '@/features/workout-engine/shared/utils/gear-mapping.utils';
import { Target, ChevronDown } from 'lucide-react';


// ============================================================================
// EXERCISE PREVIEW LIST — Compact list showing exercises with range UI
// ============================================================================

function ExerciseRow({ ex, index }: { ex: WorkoutExercise; index: number }) {
  const name = getLocalizedText(ex.exercise.name);
  const isGoal = ex.isGoalExercise;
  const range = ex.repsRange;
  const perSide = ex.exercise.symmetry === 'unilateral' ? ' (לכל צד)' : '';
  const unit = (ex.isTimeBased ? 'שניות' : 'חזרות') + perSide;
  const rangeStr = range && range.min !== range.max
    ? `${range.min}-${range.max}`
    : `${ex.reps}`;

  return (
    <div
      className={`flex items-center gap-3 px-4 py-2.5 ${
        isGoal ? 'bg-cyan-50/40 dark:bg-cyan-900/10' : ''
      }`}
    >
      <div className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 text-xs font-bold ${
        isGoal
          ? 'bg-cyan-100 text-cyan-700 dark:bg-cyan-800 dark:text-cyan-300'
          : 'bg-gray-100 text-gray-500 dark:bg-slate-700 dark:text-gray-400'
      }`}>
        {isGoal ? <Target className="w-3.5 h-3.5" /> : index + 1}
      </div>
      <div className="flex-1 min-w-0">
        <p className={`text-sm font-semibold truncate ${
          isGoal ? 'text-cyan-700 dark:text-cyan-300' : 'text-gray-800 dark:text-gray-200'
        }`}>
          {name}
        </p>
        {isGoal && ex.rampedTarget && (
          <p className="text-[11px] text-cyan-500 dark:text-cyan-400 font-medium mt-0.5">
            יעד: {ex.rampedTarget} {unit}
          </p>
        )}
      </div>
      <span className={`text-xs font-bold px-2.5 py-1 rounded-lg flex-shrink-0 tabular-nums ${
        isGoal
          ? 'bg-cyan-100 text-cyan-700 dark:bg-cyan-800/60 dark:text-cyan-300'
          : 'bg-gray-100 text-gray-600 dark:bg-slate-700 dark:text-gray-300'
      }`}>
        {ex.sets}×{rangeStr} {unit}
      </span>
    </div>
  );
}

function ExercisePreviewList({ exercises }: { exercises: WorkoutExercise[] }) {
  const [expanded, setExpanded] = useState(false);
  const hasMore = exercises.length > 3;

  const warmupExercises = exercises.filter(ex => ex.exerciseRole === 'warmup');
  const mainExercises = exercises.filter(ex => ex.exerciseRole !== 'warmup' && ex.exerciseRole !== 'cooldown');
  const cooldownExercises = exercises.filter(ex => ex.exerciseRole === 'cooldown');
  const visibleMain = expanded ? mainExercises.length : Math.min(3, mainExercises.length);

  return (
    <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-gray-100 dark:border-slate-700 overflow-hidden">
      {/* Header */}
      <div className="px-4 py-3 border-b border-gray-50 dark:border-slate-700 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Dumbbell className="w-4 h-4 text-gray-400" />
          <span className="text-sm font-bold text-gray-700 dark:text-gray-300">
            תרגילים באימון ({exercises.length})
          </span>
        </div>
        {hasMore && (
          <button
            onClick={() => setExpanded(!expanded)}
            className="text-xs font-medium text-[#00C9F2] flex items-center gap-0.5"
          >
            {expanded ? 'פחות' : 'הצג הכל'}
            <motion.div animate={{ rotate: expanded ? 180 : 0 }} transition={{ duration: 0.2 }}>
              <ChevronDown className="w-3.5 h-3.5" />
            </motion.div>
          </button>
        )}
      </div>

      {/* Warmup group */}
      {warmupExercises.length > 0 && (
        <div className="bg-amber-50/50 dark:bg-amber-900/10">
          <div className="px-4 py-1.5 flex items-center gap-1.5">
            <span className="text-sm">🔥</span>
            <span className="text-xs font-bold text-amber-600 dark:text-amber-400">
              חימום · {warmupExercises.length} תרגילים
            </span>
          </div>
          <div className="divide-y divide-amber-100/60 dark:divide-amber-800/20">
            {warmupExercises.map((ex, i) => (
              <ExerciseRow key={ex.exercise.id + '-w-' + i} ex={ex} index={i} />
            ))}
          </div>
        </div>
      )}

      {/* Main exercises */}
      <div className="divide-y divide-gray-50 dark:divide-slate-700">
        {mainExercises.slice(0, visibleMain).map((ex, i) => (
          <ExerciseRow key={ex.exercise.id + '-' + i} ex={ex} index={warmupExercises.length + i} />
        ))}
      </div>

      {/* Cooldown group */}
      {cooldownExercises.length > 0 && expanded && (
        <div className="bg-emerald-50/50 dark:bg-emerald-900/10">
          <div className="px-4 py-1.5 flex items-center gap-1.5">
            <span className="text-sm">🧘</span>
            <span className="text-xs font-bold text-emerald-600 dark:text-emerald-400">
              שחרור · {cooldownExercises.length} תרגילים
            </span>
          </div>
          <div className="divide-y divide-emerald-100/60 dark:divide-emerald-800/20">
            {cooldownExercises.map((ex, i) => (
              <ExerciseRow key={ex.exercise.id + '-c-' + i} ex={ex} index={warmupExercises.length + mainExercises.length + i} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// PROGRESS RING — compact inline variant for the Power Row
// ============================================================================
function ProgressRingInline({
  percentage,
  size = 80,
  strokeWidth = 6,
  color = '#00C9F2',
}: {
  percentage: number;
  size?: number;
  strokeWidth?: number;
  color?: string;
}) {
  const center = size / 2;
  const radius = (size - strokeWidth) / 2 - 1;
  const circumference = 2 * Math.PI * radius;
  const filled = (percentage / 100) * circumference;
  const roundedPct = Math.round(percentage);

  return (
    <div className="relative flex-shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={center} cy={center} r={radius}
          fill="none" stroke="#E2E8F0" strokeWidth={strokeWidth}
          className="dark:stroke-slate-700"
        />
        <motion.circle
          cx={center} cy={center} r={radius}
          fill="none" stroke={color} strokeWidth={strokeWidth}
          strokeLinecap="round" strokeDasharray={circumference}
          initial={{ strokeDashoffset: circumference }}
          animate={{ strokeDashoffset: circumference - filled }}
          transition={{ duration: 1, ease: 'easeOut' }}
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <span className="text-lg font-black text-gray-800 dark:text-white leading-none tabular-nums">
          {roundedPct}<span className="text-[11px] font-bold">%</span>
        </span>
      </div>
    </div>
  );
}

interface StatsOverviewProps {
  stats: any;
  currentTrack?: string;
  isGuest?: boolean;
  onStartWorkout?: () => void;
  /**
   * Direct-start callback from UserWorkoutAdjuster — bypasses the JIT
   * equipment popup so the user goes straight from "Update" to "Preview".
   */
  onDirectStart?: () => void;
  /** Show the weekly goals carousel */
  showGoalsCarousel?: boolean;
  /** Fires whenever the dynamic workout is generated or updated (lifted to parent) */
  onWorkoutGenerated?: (workout: GeneratedWorkout) => void;
  /** UTS Phase 2 — ISO date for which to generate the workout. Defaults to today. */
  selectedDate?: string;
  /** Whether the user has completed the onboarding assessment */
  hasCompletedAssessment?: boolean;
  /** When true, hides the workout trio carousel (e.g. post-workout celebration replaces it) */
  hideWorkoutSection?: boolean;
  /** Feature flag — when false, clamps RUNNING/HYBRID dashboard mode to DEFAULT */
  enableRunningPrograms?: boolean;
  /** Increment to force workout re-generation after a schedule mutation */
  scheduleVersion?: number;
  /** When provided, a "בנה אימון משלך" card is appended to the workout carousel */
  onBuildCustom?: (ctx: BuilderContext) => void;
  /**
   * When `true`, passes `generateSingleOption: true` to `generateHomeWorkoutTrio`
   * so only the Balanced (D2) option is computed.  Cuts latency ~66%.
   * Controlled by the parent when the preview drawer is loading a card tap.
   */
  generateSingleOption?: boolean;
  /**
   * True when `selectedDate` is strictly after today (a future calendar slot).
   * Used to lock the Start CTA — the trio is still rendered as a planning
   * preview, but tapping a card cannot launch the active workout flow.
   * Completion is always anchored to the real device day, so allowing a
   * future-day start would log activity under "today" and confuse the user.
   */
  isViewingFutureDate?: boolean;
}

/** Context forwarded to the workout builder when the custom card is tapped. */
export interface BuilderContext {
  location?: string;
  programIds?: string[];
  duration?: number;
  difficulty?: number;
}

export default function StatsOverview({ 
  stats, 
  currentTrack, 
  isGuest, 
  onStartWorkout,
  onDirectStart,
  showGoalsCarousel = true,
  onWorkoutGenerated,
  selectedDate: selectedDateProp,
  hasCompletedAssessment = true,
  hideWorkoutSection = false,
  enableRunningPrograms = true,
  scheduleVersion,
  onBuildCustom,
  generateSingleOption,
  isViewingFutureDate = false,
}: StatsOverviewProps) {
  const { profile } = useUserStore();
  const checkAndResetWeek = useWeeklyVolumeStore((s) => s.checkAndResetWeek);
  const recalculateFromActivities = useWeeklyVolumeStore((s) => s.recalculateFromActivities);

  // ── Gear cache warm-up (best-effort, non-blocking) ────────────────────
  // Populates BOTH the runtime caches (for resolveEquipmentLabel /
  // normalizeGearId) AND the ALIAS_TO_CANONICAL map (via registerGearAlias).
  // The generation effect also awaits this inside the promise chain for
  // correctness; this useEffect just starts the cache fill a bit sooner.
  useEffect(() => {
    ensureEquipmentCachesLoaded().catch(() => {});
  }, []);

  // ── Weekly Budget Sync: init/reset store when profile loads ───────────
  useEffect(() => {
    if (!profile?.id || isGuest) return;
    let cancelled = false;
    resolveActiveProgramBudget(profile)
      .then((lead) => {
        if (cancelled) return;
        const scheduleDays = (profile.lifestyle?.scheduleDays?.length ?? 0) || 3;
        const tracks = profile.progression?.tracks ?? {};
        const domains = profile.progression?.domains ?? {};
        const baseLevel =
          Math.max(
            ...Object.values(tracks).map((t) => t?.currentLevel ?? 1),
            ...Object.values(domains).map((d) => (d as { currentLevel?: number })?.currentLevel ?? 1),
            1
          ) || 1;
        const budget =
          lead?.weeklyVolumeTarget ?? calculateWeeklyBudget(baseLevel, Math.max(1, scheduleDays));
        checkAndResetWeek(profile.id, budget);
        recalculateFromActivities();
      })
      .catch((err) => console.warn('[StatsOverview] Budget sync failed:', err));
    return () => {
      cancelled = true;
    };
  }, [profile?.id, profile?.lifestyle?.scheduleDays, profile?.progression?.tracks, isGuest, checkAndResetWeek, recalculateFromActivities]);

  // Get real activity data from the Activity Store
  const { 
    stepsToday, 
    caloriesToday, 
  } = useDailyActivity();
  
  const {
    summary: weeklySummaryData,
  } = useWeeklyProgress();

  // 1. Calculate Mode (clamped by feature flag)
  const mode = useDashboardMode(profile, enableRunningPrograms);

  // 2. Safe Logging
  useEffect(() => {
    if (typeof window !== 'undefined' && process.env.NODE_ENV === 'development') {
      // eslint-disable-next-line no-console
      console.log('🧠 Brain Decision (Stable):', mode);
    }
  }, [mode]);

  const displaySteps = stepsToday > 0 ? stepsToday : (stats?.steps || 0);

  // ── Missed-Workout Alignment (Running) ──
  const [alignmentAction, setAlignmentAction] = useState<AlignmentAction>({ type: 'none' });
  const [showRealignPopup, setShowRealignPopup] = useState(false);
  const [showRebuildPopup, setShowRebuildPopup] = useState(false);
  const [bannerDismissed, setBannerDismissed] = useState(false);

  const lastWorkoutDate = profile?.running?.lastWorkoutDate;

  useEffect(() => {
    const runProgram = profile?.running?.activeProgram;
    if (!runProgram) return;
    const action = handleProgramAlignment(runProgram, lastWorkoutDate ?? null);
    setAlignmentAction(action);
    if (action.type === 'plan_realign') setShowRealignPopup(true);
    if (action.type === 'rebuild') setShowRebuildPopup(true);
  }, [profile?.running?.activeProgram, lastWorkoutDate]);

  const handleRollBack = useCallback(async () => {
    const uid = getCurrentUid();
    const prog = profile?.running?.activeProgram;
    if (!uid || !prog) return;
    await rollBackOneWeek(uid, prog);
    setShowRealignPopup(false);
    window.location.reload();
  }, [profile?.running?.activeProgram]);

  const dismissAlignment = useCallback(() => {
    setShowRealignPopup(false);
    setShowRebuildPopup(false);
    setBannerDismissed(true);
  }, []);

  // ── Build shared program progress data (used in PERFORMANCE and DEFAULT) ──
  // SINGLE SOURCE OF TRUTH: progression.tracks is always the freshest data.
  // progression.domains is a legacy mirror that may lag behind.
  const activeProgram = profile?.progression?.activePrograms?.[0];
  const activeProgramCount = profile?.progression?.activePrograms?.length ?? 1;

  // Resolve primary domain ID: prefer activeProgram.templateId, then first domains key, then first tracks key.
  // Defensive: skip hash-looking domain keys (long alphanumeric, no underscores) left by the admin panel
  // assigning programs via hash ID — those orphan entries point to the wrong program.
  const primaryDomainId = useMemo(() => {
    if (activeProgram?.templateId) return activeProgram.templateId;
    const isHashKey = (k: string) => k.length > 15 && !k.includes('_');
    const domainsKeys = profile?.progression?.domains ? Object.keys(profile.progression.domains) : [];
    const slugDomainKeys = domainsKeys.filter((k) => !isHashKey(k));
    if (slugDomainKeys.length > 0) return slugDomainKeys[0];
    if (domainsKeys.length > 0) return domainsKeys[0]; // last resort: accept hash if no slug keys exist
    const tracksKeys = profile?.progression?.tracks ? Object.keys(profile.progression.tracks) : [];
    return tracksKeys.length > 0 ? tracksKeys[0] : null;
  }, [activeProgram?.templateId, profile?.progression?.domains, profile?.progression?.tracks]);

  // Read level AND percent from tracks (source of truth), fallback to domains
  const { domainLevel, inLevelPercent, domainMaxLevel, hasProgramData } = useMemo(() => {
    const tracks = profile?.progression?.tracks;
    const domains = profile?.progression?.domains;
    const track = primaryDomainId ? tracks?.[primaryDomainId] : undefined;
    const domain = primaryDomainId ? domains?.[primaryDomainId] : undefined;

    // Level: tracks > domains > 1
    const level = track?.currentLevel ?? domain?.currentLevel ?? 1;
    // Percent: tracks > 0
    const percent = track?.percent != null ? Math.round(track.percent) : 0;
    // MaxLevel: domains > 25
    const maxLvl = domain?.maxLevel ?? 25;
    const hasData = !!(activeProgram || primaryDomainId);

    if (process.env.NODE_ENV === 'development') {
      console.log(
        `[StatsOverview] 📊 State Sync: domainId=${primaryDomainId}` +
        ` | tracks.level=${track?.currentLevel} tracks.percent=${track?.percent}` +
        ` | domains.level=${domain?.currentLevel}` +
        ` | RESOLVED → Level ${level}, ${percent}%`,
      );
    }

    return { domainLevel: level, inLevelPercent: percent, domainMaxLevel: maxLvl, hasProgramData: hasData };
  }, [primaryDomainId, profile?.progression?.tracks, profile?.progression?.domains, activeProgram]);

  // ── Fetch program data (name, isMaster, subPrograms) from Firestore ──
  const [hebrewProgramName, setHebrewProgramName] = useState<string | null>(null);
  const [programMeta, setProgramMeta] = useState<{
    isMaster: boolean;
    subPrograms: string[];
  } | null>(null);

  useEffect(() => {
    if (!primaryDomainId && !activeProgram?.templateId) return;
    const programId = activeProgram?.templateId || primaryDomainId;
    if (!programId) return;

    let cancelled = false;
    getProgramByTemplateId(programId)
      .then((prog) => {
        if (cancelled || !prog) return;
        if (prog.name) setHebrewProgramName(prog.name);
        setProgramMeta({
          isMaster: !!prog.isMaster,
          subPrograms: prog.subPrograms ?? [],
        });
        console.log(
          `[StatsOverview] Program loaded: ${prog.name} — isMaster=${prog.isMaster}, children=[${(prog.subPrograms ?? []).join(', ')}]`,
        );
      })
      .catch((err) => console.warn('[StatsOverview] Failed to fetch program:', err));
    return () => { cancelled = true; };
  }, [primaryDomainId, activeProgram?.templateId]);

  const PROGRAM_NAME_HE: Record<string, string> = {
    full_body: 'כל הגוף', fullbody: 'כל הגוף',
    upper_body: 'פלג גוף עליון', push: 'דחיפה', pushing: 'דחיפה',
    lower_body: 'רגליים', legs: 'רגליים',
    pull: 'משיכה', pulling: 'משיכה', calisthenics: 'קליסטניקס',
    running: 'ריצה', cardio: 'קרדיו',
    pilates: 'פילאטיס', yoga: 'יוגה',
    healthy_lifestyle: 'אורח חיים בריא', pull_up_pro: 'מתח מקצועי',
  };
  const resolvedProgramName = hebrewProgramName
    || (primaryDomainId ? PROGRAM_NAME_HE[primaryDomainId.toLowerCase()] : undefined)
    || 'תוכנית אימון';

  // Resolve icon key for ProgramProgressCard (full_body vs muscle vs heart etc.)
  const resolvedProgramIcon = useMemo(
    () => resolveIconKey(undefined, primaryDomainId ?? undefined),
    [primaryDomainId],
  );

  // ── Fetch level goals (milestones) via shared hook ──────────────────────
  // useGoalsForProgram handles master expansion, tracks-based discovery, and
  // the last-resort scan internally — no inline orchestration needed here.
  const { goals: rawGoals } = useGoalsForProgram(
    primaryDomainId ? { templateId: primaryDomainId, currentLevel: domainLevel } : null,
  );

  // Map raw LevelGoal[] → GoalItem[] for ProgramProgressCard.
  // Completion state is derived from progression.levelGoalProgress.
  const levelGoals = useMemo<GoalItem[]>(() => {
    if (rawGoals.length === 0) return [];

    const userGoalProgress = profile?.progression?.levelGoalProgress ?? [];
    const currentLevelProgress = userGoalProgress.find(
      (lgp) => lgp.levelName === `Level ${domainLevel}`,
    );

    return rawGoals.map((tg, idx) => {
      let isCompleted = false;
      if (currentLevelProgress?.goals) {
        const match = currentLevelProgress.goals.find(
          (g: { exerciseId: string; isCompleted?: boolean }) => g.exerciseId === tg.exerciseId,
        );
        if (match?.isCompleted) isCompleted = true;
      }
      const unitLabel = tg.unit === 'reps' ? 'חזרות' : 'שניות';
      return {
        id: `${primaryDomainId ?? 'goal'}-${idx}-${tg.exerciseId}`,
        label: `${tg.exerciseName} — ${tg.targetValue} ${unitLabel}`,
        isCompleted,
      };
    });
  }, [rawGoals, primaryDomainId, domainLevel, profile?.progression?.levelGoalProgress]);

  // ── Dynamic Workout State (Trio) ────────────────────────────────────────
  const [trioResult, setTrioResult] = useState<HomeWorkoutTrioResult | null>(null);
  const [selectedOptionIndex, setSelectedOptionIndex] = useState(1);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isUserAdjusterOpen, setIsUserAdjusterOpen] = useState(false);
  const [showProcessing, setShowProcessing] = useState(false);
  const [currentWorkoutLocation, setCurrentWorkoutLocation] = useState<string | null>(null);
  const didGenerate = useRef(false);
  const lastGeneratedDate = useRef<string | null>(null);
  // Stores the program IDs used to generate the current trio so they can be
  // forwarded to the builder when the custom card is tapped.
  const scheduledProgramIdsRef = useRef<string[]>([]);
  // Ref mirror of trioResult for synchronous reads inside the generation effect.
  const trioResultRef = useRef<HomeWorkoutTrioResult | null>(null);
  // Signals that a schedule-planner update (scheduleVersion change) deliberately
  // requested a re-generation.  Consumed once at the start of each generation run.
  const pendingScheduleRegenRef = useRef(false);
  // Ref-stabilised callback: prevents the generation effect from re-firing
  // purely because the parent recreated the onWorkoutGenerated function reference.
  const onWorkoutGeneratedRef = useRef(onWorkoutGenerated);
  useEffect(() => { onWorkoutGeneratedRef.current = onWorkoutGenerated; }, [onWorkoutGenerated]);

  // Ref-stabilised flag: read at generation time so the effect doesn't re-fire
  // when the parent clears this flag after the workout is delivered.
  const generateSingleOptionRef = useRef(generateSingleOption ?? false);
  useEffect(() => { generateSingleOptionRef.current = generateSingleOption ?? false; }, [generateSingleOption]);
  // Keep trioResultRef in sync with React state so the generation effect can
  // read the current value synchronously (effect closures see stale state).
  useEffect(() => { trioResultRef.current = trioResult; }, [trioResult]);

  const dynamicWorkout = trioResult?.options[selectedOptionIndex]?.result.workout ?? null;

  // Resolve effective target date (prop or today fallback)
  const targetDate = selectedDateProp ?? toISODate(new Date());

  // Reset generation guard whenever targetDate changes (week-strip day tap or
  // any other date navigation).  The unconditional reset means the generation
  // effect always re-fires for a new date — even if a prior generation for the
  // same session hasn't finished yet.  lastGeneratedDate is still updated at
  // the start of each generation run so the Custom-Builder bypass gate can
  // distinguish an intentional date change from a spurious re-render.
  useEffect(() => {
    didGenerate.current = false;
    if (process.env.NODE_ENV === 'development') {
      console.log(`[StatsOverview] targetDate changed → ${targetDate}, generation guard reset`);
    }
  }, [targetDate]);

  // Reset generation guard when a schedule mutation happens (e.g. add/move/remove entry
  // in TrainingPlannerOverlay) so the workout is re-generated with the updated schedule.
  useEffect(() => {
    if (scheduleVersion === undefined || scheduleVersion === 0) return;
    didGenerate.current = false;
    pendingScheduleRegenRef.current = true; // intentional re-generation triggered by scheduler
  }, [scheduleVersion]);

  // R-1.3 — location regen signal. The generation effect reads the location from
  // sessionStorage but does NOT depend on it, so changing location alone would not
  // regenerate. The anchor's location chip bumps this counter, which mirrors the
  // scheduleVersion pattern above (clear the guard + mark the regen intentional so
  // the Custom-Builder bypass does not swallow it). Stays 0 while the anchor is off.
  const [locationVersion, setLocationVersion] = useState(0);
  useEffect(() => {
    if (locationVersion === 0) return;
    didGenerate.current = false;
    pendingScheduleRegenRef.current = true;
  }, [locationVersion]);

  /**
   * The user's EXPLICIT location pick ("pinned"), deliberately kept SEPARATE from
   * `currentWorkoutLocation` — which is the engine's ECHO of what it actually
   * generated for (`trio.meta.location`). The generation write-back rewrites that
   * echo on every run, so without this split an explicit pick is reverted the
   * moment the next trio lands (and, because the echo is also written to
   * sessionStorage, erased permanently for subsequent runs too).
   * Stays null until the user touches the chip → unchanged behaviour otherwise.
   */
  const [pinnedLocation, setPinnedLocation] = useState<LocationId | null>(null);
  // Ref mirror so the generation effect can read the pin without re-subscribing.
  const pinnedLocationRef = useRef<LocationId | null>(null);
  useEffect(() => { pinnedLocationRef.current = pinnedLocation; }, [pinnedLocation]);

  /** Anchor location chip → pin the user's choice + regenerate for it. */
  const handleAnchorLocationChange = useCallback((id: LocationId) => {
    setPinnedLocation(id);
    if (typeof window !== 'undefined') {
      sessionStorage.setItem('currentWorkoutLocation', id);
    }
    setCurrentWorkoutLocation(id);
    setLocationVersion((v) => v + 1);
  }, []);

  // Generate workout on mount / date change — UTS Phase 2 date-reactive path
  //
  // GPS race-condition fix: park equipment is resolved INSIDE this effect,
  // serialized as the very first async step before generateHomeWorkoutTrio is
  // called.  The old pattern (a separate useEffect writing to parkEquipmentIds
  // state) fired in parallel with this effect, so generation consistently ran
  // before GPS resolved and always fell back to ESSENTIAL_PARK_GEAR.
  //
  // Dependency note: `profile?.id` is used instead of the full `profile` object
  // so that reference-level churn on the store (e.g. a Zustand selector in a
  // sibling hook returning a new object on every snapshot call) cannot
  // re-trigger generation. The full `profile` value is read from the closure at
  // execution time — the generator always sees the latest data. `didGenerate`
  // (ref) prevents any duplicate runs should the effect somehow fire twice.
  useEffect(() => {
    if (!profile || isGuest || didGenerate.current) return;

    // ── Custom-Builder bypass gate ────────────────────────────────────────
    // If a trio result is already set for today's date AND this effect did not
    // fire from an intentional schedule-planner update (pendingScheduleRegenRef),
    // a custom-builder session is likely still active.  Preserve it and return
    // early to avoid the default background generation from overwriting the user's
    // hand-crafted workout selection.
    if (
      trioResultRef.current !== null &&
      lastGeneratedDate.current === targetDate &&
      !pendingScheduleRegenRef.current
    ) {
      didGenerate.current = true; // re-arm guard so spurious re-fires are also caught
      return;
    }
    // Consume the intentional-regen flag so it is not carried into future runs.
    pendingScheduleRegenRef.current = false;

    // Pure RUNNING mode: strength workouts are never shown.
    // NextRunWorkoutCard reads profile.running.activeProgram directly — no trio needed.
    // HYBRID falls through and generates the strength side normally.
    if (mode === 'RUNNING') {
      didGenerate.current = true;
      setIsGenerating(false);
      return;
    }

    // Mark as generating immediately to prevent double-execution on re-render.
    // All async work (GPS, schedule, generation) happens inside the IIFE below,
    // so the guard is set before any await — this is intentional.
    didGenerate.current = true;
    lastGeneratedDate.current = targetDate;

    setIsGenerating(true);
    setTrioResult(null);
    setSelectedOptionIndex(1);

    // ADVANCED LOCATION CHAIN:
    //   1. sessionStorage (from current session / last override)
    //   2. profile.lifestyle.locationPreference (from questionnaire)
    //   3. profile.firstWorkoutLocation (from onboarding assessment)
    //   4. 'home' (bodyweight fallback)
    const storedLocation = (typeof window !== 'undefined'
      ? sessionStorage.getItem('currentWorkoutLocation')
      : null) as import('@/features/content/exercises/core/exercise.types').ExecutionLocation | null;
    const lifestyleLocation = (profile.lifestyle as any)?.locationPreference as import('@/features/content/exercises/core/exercise.types').ExecutionLocation | undefined;
    const resolvedLocation = storedLocation
      || lifestyleLocation
      || (profile.firstWorkoutLocation as import('@/features/content/exercises/core/exercise.types').ExecutionLocation)
      || 'home';

    // ── Momentum Guard (Late-Night Pivot) ──────────────────────────────
    // Only applies to today; future/past dates skip this check.
    // NOTE: isLateNightPivot always returns false while the Bolt-specific
    // duration caps (Bolt1=30 / Bolt2=45 / Bolt3=60) are active.
    // The engine now controls duration internally per bolt; we pass the
    // maximum (60 min) so the exercise pool is sized for Bolt 3 and the
    // per-bolt Volume Guard trims lighter options down to their own cap.
    const isTargetToday = targetDate === toISODate(new Date());
    const lateNight = isTargetToday && isLateNightPivot(profile.lifestyle?.trainingTime);
    const condensedTime = lateNight ? 15 : 60;
    if (lateNight) {
      console.log('[UTS] Late-Night Pivot active → condensed 15-min workout');
    }

    (async () => {
      // #0: measure the full home-trio timeline (no-op unless GEN_TIMING is on).
      genPerfBegin('home-trio');
      try {
        // ── Step 1: Resolve context (coverage-aware) BEFORE generation ──
        // Inferred flow: an equipped park within 2 km → park with its REAL gear;
        // no equipped park / no GPS fix → HOME (never a fake ESSENTIAL_PARK_GEAR park).
        const storeFix = useGPSStore.getState().coords;
        const ctx = await resolveWorkoutContext(profile, resolvedLocation, {
          gpsCoords: storeFix ?? undefined,
        });
        const effectiveLocation = ctx.location;
        const resolvedParkGear = ctx.availableGear;
        console.log(
          `[StatsOverview] Context: requested=${resolvedLocation} → effective=${effectiveLocation} ` +
          `(source=${ctx.source}, gear=${resolvedParkGear.length})`,
        );
        genPerfMark('#0 context+GPS (resolveWorkoutContext / waitForGpsFix)');

        // ── Step 2: Consult UserSchedule ───────────────────────────────────
        //
        // Priority for picking the entry that drives workout generation:
        //   1. Personal training entry (non-community) → use programIds
        //   2. Explicit rest entry → marks day as `isRestDay`
        //   3. Community-only or no entry → fall through to recurringTemplate
        //      hydration (or the activeProgram default below) — the user can
        //      still get a workout suggestion alongside their community session.
        const rawEntries = await getScheduleEntries(profile.id, targetDate);
        let entry: UserScheduleEntry | null =
          rawEntries.find((e) => e.type === 'training' && e.source !== 'community') ??
          rawEntries.find((e) => e.type === 'rest') ??
          null;
        if (!entry && profile.lifestyle?.recurringTemplate) {
          entry = await hydrateFromTemplate(profile.id, targetDate, profile.lifestyle.recurringTemplate);
        }
        genPerfMark('#1-2 schedule (getScheduleEntries + hydrateFromTemplate)');

        const isExplicitRestDay = entry?.type === 'rest';
        const activeProgram = profile.progression?.activePrograms?.[0]?.templateId;

        // When both getScheduleEntries AND hydrateFromTemplate returned null
        // (e.g. network error, but no tombstone), read today's program IDs
        // directly from the in-memory recurringTemplate as a pure read-only
        // fallback.  This prevents the engine from falling to activePrograms[0]
        // (e.g. 'front_lever') when the scheduled day maps to a master session
        // (e.g. 'UPPER_CALISTHENICS').
        // NOTE: if entry is a rest-tombstone (override=true), `!entry` is false
        // and we correctly skip this path — respecting the user's deletion.
        const templateDayLetter = getHebrewDayLetter(new Date(targetDate + 'T00:00:00'));
        const templateFallbackIds =
          !entry && profile.lifestyle?.recurringTemplate?.[templateDayLetter]
            ? (profile.lifestyle.recurringTemplate[templateDayLetter] as string[]).filter(Boolean)
            : null;

        // ── Off-day detection ─────────────────────────────────────────────────
        // A user with a configured recurring schedule (scheduleDays or
        // recurringTemplate) who has NO Firestore entry AND no template programs
        // for the target date is on an unscheduled/off day.  We must NOT fall
        // back to activePrograms[0] in this case — doing so leaks the active
        // program ID into the engine's context and causes it to emit a full
        // TRAINING DAY trio (muscle-arm icon, intense options) instead of a
        // REST/RECOVERY trio.
        const hasScheduleConfigured =
          (profile.lifestyle?.scheduleDays?.length ?? 0) > 0 ||
          Object.keys(profile.lifestyle?.recurringTemplate ?? {}).length > 0;
        // Implicit off-day: schedule is configured but nothing is planned here.
        const isImplicitOffDay =
          !entry && !templateFallbackIds?.length && hasScheduleConfigured;
        // Effective rest-day flag fed to the workout engine.
        const isRestDay = isExplicitRestDay || isImplicitOffDay;

        // Off-days get an empty program list so the engine can apply
        // REST_DAY_CONFIGS cleanly, without an activeProgram sneaking in.
        const scheduledProgramIds: string[] = isRestDay
          ? []
          : entry?.type === 'training' && entry.programIds?.length
            ? entry.programIds
            : templateFallbackIds?.length
              ? templateFallbackIds
              : activeProgram ? [activeProgram] : [];

        scheduledProgramIdsRef.current = scheduledProgramIds;
        console.log(
          `[UTS] Schedule for ${targetDate}: type=${
            entry?.type ?? (isImplicitOffDay ? 'off-day' : 'none')
          }` +
          ` programs=[${scheduledProgramIds.join(',')}]` +
          ` lateNight=${lateNight}`,
        );

        // Only trust the persisted budget data when the store is confirmed to
        // belong to the current user. A mismatch means the store still holds a
        // previous user's completed-sets count, which can produce a stale small
        // remainingBudget (e.g. 2-4 sets) that falsely triggers the Budget Floor
        // guard in generateHomeWorkoutTrio (remainingWeeklyBudget < 6 → 3
        // "אימון שחרור והתאוששות" recovery cards for a brand-new user).
        // checkAndResetWeek() runs async in a parallel useEffect; by the time we
        // reach here it may not have completed yet, so we guard here too.
        const volumeStoreState = useWeeklyVolumeStore.getState();
        const storeOwnsCurrentUser =
          volumeStoreState.isInitialized && volumeStoreState.userId === profile.id;

        // Secondary consistency gate: if the store claims sets were completed
        // but has zero session logs to back them up, the `totalSetsCompleted`
        // value is stale data (e.g. a same-UID test run where sessions were
        // injected directly into the store without going through
        // recordStrengthSession). A small stale remainingBudget (< 6) would
        // otherwise slip through storeOwnsCurrentUser and falsely trigger the
        // Budget Floor → 3 recovery cards even for a new user on day 1.
        const sessionLogs = volumeStoreState.sessionLogs ?? [];
        const hasConsistentStrengthData =
          sessionLogs.length > 0 ||
          volumeStoreState.strength.totalSetsCompleted === 0;

        const budgetDataValid = storeOwnsCurrentUser && hasConsistentStrengthData;

        const remainingBudget = budgetDataValid
          ? volumeStoreState.getRemainingBudget()
          : 0;
        const budgetUsagePercent = budgetDataValid
          ? volumeStoreState.getBudgetUsagePercent()
          : 0;
        const domainSetsCompletedThisWeek = budgetDataValid
          ? volumeStoreState.getDomainSetsCompleted()
          : {};
        const recentExerciseIds = storeOwnsCurrentUser
          ? volumeStoreState.getRecentExerciseIds(2)
          : [];

        // Phase 4: Count remaining training days in the week (including today)
        const userScheduleDays = profile.lifestyle?.scheduleDays ?? [];
        const todayDayIndex = new Date(targetDate + 'T00:00:00').getDay();
        const remainingScheduleDays = userScheduleDays.length > 0
          ? userScheduleDays.filter((_day, i) => {
              const dayNames = ['א','ב','ג','ד','ה','ו','ש'];
              const dayIdx = dayNames.indexOf(userScheduleDays[i]);
              return dayIdx >= todayDayIndex;
            }).length || 1
          : undefined;

        // Ensure both runtime caches AND alias map are ready before generation,
        // so Firestore equipment IDs resolve to canonical keys in the useMemo.
        // Cached + deduped — essentially free on repeat calls.
        await ensureEquipmentCachesLoaded();
        genPerfMark('pre-gen (schedule-derived sync + equipCache await)');

        // ── Step 3: Generate with fully-resolved park gear ─────────────────
        // generateHomeWorkoutTrio adds its own internal marks (#3–#8) to this timeline.
        const trio = await generateHomeWorkoutTrio({
          userProfile: profile,
          location: effectiveLocation,
          availableTime: condensedTime,
          selectedDate: targetDate,
          scheduledProgramIds,
          isScheduledRestDay: isRestDay,
          remainingWeeklyBudget: remainingBudget > 0 ? remainingBudget : undefined,
          weeklyBudgetUsagePercent: budgetUsagePercent > 0 ? budgetUsagePercent : undefined,
          domainSetsCompletedThisWeek: Object.keys(domainSetsCompletedThisWeek).length > 0
            ? domainSetsCompletedThisWeek : undefined,
          remainingScheduleDays,
          recentExerciseIds: recentExerciseIds.length > 0 ? recentExerciseIds : undefined,
          parkEquipmentIds: resolvedParkGear.length > 0 ? resolvedParkGear : undefined,
          // Drawer fast-path: skip D1/D3 generation when only D2 is needed.
          generateSingleOption: generateSingleOptionRef.current || undefined,
        });

        setTrioResult(trio);
        // Periodization: use policy-driven default focus (0=Easy/Deload, 1=Normal, 2=Intense/Peak).
        const focusIdx = trio.meta?.defaultFocusIndex ?? 1;
        setSelectedOptionIndex(focusIdx);
        onWorkoutGeneratedRef.current?.(trio.options[focusIdx].result.workout);
        if (focusIdx !== 1) {
          console.log(
            `[Periodization] Auto-focused carousel to option ${focusIdx} ` +
            `(week=${trio.meta?.periodizationWeek}, reason=${trio.meta?.coachCue ?? 'n/a'})`,
          );
        }
        const loc = trio.meta?.location || effectiveLocation;
        setCurrentWorkoutLocation(loc);
        // Never let the engine echo erase an explicit user pick. This key is both the
        // cross-surface channel (active page / preview drawer read it) AND the first
        // link in the NEXT run's location chain, so overwriting it would revert the
        // pin permanently. Unpinned → unchanged behaviour.
        if (typeof window !== 'undefined' && loc && !pinnedLocationRef.current) {
          sessionStorage.setItem('currentWorkoutLocation', loc);
        }
      } catch (err) {
        console.error('[StatsOverview] Workout generation failed:', err);
      } finally {
        setIsGenerating(false);
        genPerfEnd(); // #0: print the phase/read table (no-op unless GEN_TIMING is on)
      }
    })();
    // locationVersion: bumped by the anchor's location chip (R-1.3). Constant 0 while
    // HOME_ANCHOR_V2_ENABLED is off, so the effect fires exactly as before.
  }, [profile?.id, isGuest, targetDate, scheduleVersion, locationVersion]);

  // Persist hero media to sessionStorage so the Workout Detail page can reuse it
  useEffect(() => {
    if (!dynamicWorkout?.exercises) return;
    const heroEx = pickHeroExercise(dynamicWorkout.exercises);
    const media = resolveHeroMedia(heroEx, currentWorkoutLocation);
    if (typeof window !== 'undefined') {
      sessionStorage.setItem('workout_hero_media', JSON.stringify(media));
    }
  }, [dynamicWorkout, currentWorkoutLocation]);

  const isGenerated = !!dynamicWorkout;

  // Handle apply from UserWorkoutAdjuster — single workout → open PreviewDrawer directly, bypassing JIT
  const handleAdjusterApplyAndStart = useCallback((workout: GeneratedWorkout) => {
    onWorkoutGenerated?.(workout);  // synchronously updates generatedWorkoutRef in HomePage
    onDirectStart?.();              // opens preview without the equipment JIT popup
  }, [onWorkoutGenerated, onDirectStart]);

  const pendingWorkoutRef = useRef<GeneratedWorkout | null>(null);

  const handleProcessingComplete = useCallback(() => {
    setShowProcessing(false);
    if (pendingWorkoutRef.current) {
      setTrioResult(prev => {
        if (!prev) return prev;
        const updated = { ...prev, options: [...prev.options] as [any, any, any] };
        updated.options[selectedOptionIndex] = {
          ...updated.options[selectedOptionIndex],
          result: { ...updated.options[selectedOptionIndex].result, workout: pendingWorkoutRef.current! },
        };
        return updated;
      });
      onWorkoutGenerated?.(pendingWorkoutRef.current);
      pendingWorkoutRef.current = null;
    }
  }, [onWorkoutGenerated, selectedOptionIndex]);

  const handleTrioSelect = useCallback((idx: number) => {
    setSelectedOptionIndex(idx);
    if (trioResult) {
      onWorkoutGenerated?.(trioResult.options[idx].result.workout);
    }
  }, [trioResult, onWorkoutGenerated]);

  const handleTrioStart = useCallback((idx: number) => {
    setSelectedOptionIndex(idx);
    if (trioResult) {
      onWorkoutGenerated?.(trioResult.options[idx].result.workout);
    }
    // Viewing a future/different date → intercept and ask the user to confirm
    // "train ahead" before launching.  The completion pipeline still anchors
    // writes to today's slot regardless.
    if (isViewingFutureDate) {
      setPendingTrainAheadIndex(idx);
      setIsTrainAheadModalOpen(true);
      return;
    }
    onStartWorkout?.();
  }, [trioResult, onWorkoutGenerated, onStartWorkout, isViewingFutureDate]);

  // Confirm from the Train-Ahead modal — launch the workout normally.
  const handleConfirmTrainAhead = useCallback(() => {
    setIsTrainAheadModalOpen(false);
    setPendingTrainAheadIndex(null);
    onStartWorkout?.();
  }, [onStartWorkout]);

  // Wraps onBuildCustom to forward the current trio context (location, programs,
  // duration, difficulty) so the builder opens pre-filled.
  const handleBuildCustomWrapped = useCallback(() => {
    const workout = trioResult?.options[selectedOptionIndex]?.result.workout;
    const ctx: BuilderContext = {
      location:   currentWorkoutLocation ?? undefined,
      programIds: scheduledProgramIdsRef.current.length > 0
        ? scheduledProgramIdsRef.current
        : undefined,
      duration:   workout?.estimatedDuration,
      difficulty: workout?.difficulty,
    };
    onBuildCustom?.(ctx);
  }, [trioResult, selectedOptionIndex, currentWorkoutLocation, onBuildCustom]);

  // ── Nudge popup state (for locked widgets) — must be before any early return ──
  const [showNudge, setShowNudge] = useState(false);

  // ── Train-Ahead modal state ───────────────────────────────────────────────
  const [isTrainAheadModalOpen, setIsTrainAheadModalOpen] = useState(false);
  const [pendingTrainAheadIndex, setPendingTrainAheadIndex] = useState<number | null>(null);

  // Hebrew name for the target date's day of week (e.g. "חמישי")
  const HEBREW_DAY_NAMES = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];
  const targetDayName = useMemo(() => {
    const d = new Date(targetDate + 'T00:00:00');
    return HEBREW_DAY_NAMES[d.getDay()];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targetDate]);

  const handleLockedWidgetTap = () => {
    if (!hasCompletedAssessment) {
      setShowNudge(true);
    }
  };

  // ── Derive weekly session counts for compact stats card ──
  const strengthSessions = weeklySummaryData?.categorySessions?.strength ?? 0;
  const scheduleDaysCount = profile?.lifestyle?.scheduleDays?.length ?? 3;
  const strengthGoal = Math.max(1, scheduleDaysCount);

  // Running sessions: use the running schedule as source of truth (matches Profile page)
  const runningScheduleCompletedThisWeek = useMemo(() => {
    const schedule = profile?.running?.activeProgram?.schedule as Array<{
      week?: number; status?: string;
    }> | undefined;
    if (!schedule?.length) return 0;
    const currentWeek = profile?.running?.activeProgram?.currentWeek ?? 1;
    return schedule.filter(
      (e) => e.week === currentWeek && e.status === 'completed',
    ).length;
  }, [profile?.running?.activeProgram]);

  const cardioSessions = Math.max(
    weeklySummaryData?.categorySessions?.cardio ?? 0,
    runningScheduleCompletedThisWeek,
  );
  // ── Build carousel slides from tracks / subPrograms ──
  type ProgramSlide = {
    id: string;
    name: string;
    iconKey: string;
    level: number;
    maxLevel: number;
    percent: number;
  };

  const programSlides = useMemo<ProgramSlide[]>(() => {
    const tracks = profile?.progression?.tracks;
    const domains = profile?.progression?.domains;
    const subs = programMeta?.subPrograms ?? [];

    const slideIds = subs.length > 0
      ? subs
      : tracks
        ? Object.keys(tracks)
        : primaryDomainId
          ? [primaryDomainId]
          : [];

    if (slideIds.length === 0 && primaryDomainId) {
      return [{
        id: primaryDomainId,
        name: resolvedProgramName,
        iconKey: resolvedProgramIcon,
        level: domainLevel,
        maxLevel: domainMaxLevel,
        percent: inLevelPercent,
      }];
    }

    return slideIds.map((sid) => {
      const track = tracks?.[sid];
      const domain = domains?.[sid];
      return {
        id: sid,
        name: PROGRAM_NAME_HE[sid.toLowerCase()] ?? sid,
        iconKey: resolveIconKey(undefined, sid),
        level: track?.currentLevel ?? domain?.currentLevel ?? 1,
        maxLevel: domain?.maxLevel ?? 25,
        percent: track?.percent != null ? Math.round(track.percent) : 0,
      };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    profile?.progression?.tracks, profile?.progression?.domains,
    programMeta?.subPrograms, primaryDomainId,
    resolvedProgramName, resolvedProgramIcon, domainLevel, domainMaxLevel, inLevelPercent,
  ]);

  const [activeSlide, setActiveSlide] = useState(0);
  const carouselRef = useRef<HTMLDivElement>(null);

  // ── Shared Carousel / Hero Section ──
  const renderWorkoutSection = () => (
    <div>
      {/* Header + description — padded */}
      <div className="px-5" dir="rtl">
        <div
          className={
            HOME_ANCHOR_V2_ENABLED
              ? 'relative mb-1 flex items-center justify-between gap-2'
              : 'relative mb-1'
          }
        >
          <h3 className="text-2xl font-extrabold text-gray-900 dark:text-white">האימון היומי שלך</h3>
          {/* Location square beside the title. Shows the user's pin when there is one,
              otherwise the engine's echo (clamped to the pickable set). */}
          {HOME_ANCHOR_V2_ENABLED && (
            <AnchorLocationChip
              value={
                pinnedLocation ??
                (currentWorkoutLocation === 'park' ||
                currentWorkoutLocation === 'gym' ||
                currentWorkoutLocation === 'home'
                  ? currentWorkoutLocation
                  : 'park')
              }
              onSelect={handleAnchorLocationChange}
            />
          )}
          {!hasCompletedAssessment && (
            <img
              src="/assets/lemur/lemur_curious_peek.png"
              alt=""
              className="absolute -top-12 -left-4 w-[176px] h-[176px] object-contain drop-shadow-lg pointer-events-none"
            />
          )}
        </div>

        <p className="text-sm text-gray-500 dark:text-gray-400 font-medium mb-4 leading-relaxed text-right">
          {!hasCompletedAssessment
            ? 'התאימו את האימונים לרמה שלכם .'
            : dynamicWorkout?.description || 'מוכן להתחיל?'}
        </p>
      </div>

      {/* Periodization / Reactivation Coach Cue Banner */}
      {/* Gated behind SHOW_MISSED_DAYS_PROMPTS (default off). trioResult.meta.coachCue
          is still computed by the periodization service — only this display is hidden. */}
      {SHOW_MISSED_DAYS_PROMPTS && trioResult?.meta?.coachCue && (
        <div
          className="mx-4 mb-3 px-4 py-3 rounded-2xl text-sm font-medium text-center"
          style={{ backgroundColor: 'rgba(99,102,241,0.12)', color: '#4f46e5' }}
          dir="rtl"
        >
          {trioResult.meta.coachCue}
        </div>
      )}

      {/* Carousel — blurred with lemur teaser overlay when assessment is not completed */}
      <div className="relative">
        <div className={!hasCompletedAssessment ? 'blur-md pointer-events-none select-none' : ''}>
          {trioResult ? (
            HOME_ANCHOR_V2_ENABLED ? (
              /* R Track 1 anchor: toggle row (3 options) → single hero (recommended)
                 → "מחולל" builder. Engine unchanged — still trioResult.options[3];
                 selection reuses selectedOptionIndex + handleTrioSelect/handleTrioStart. */
              <div className="flex flex-col items-center gap-3 px-4">
                <AnchorOptionToggles
                  labels={trioResult.options.map((o) => o.label)}
                  selectedIndex={selectedOptionIndex}
                  onSelect={handleTrioSelect}
                  recommendedIndex={trioResult.meta?.defaultFocusIndex}
                />
                <HeroWorkoutCard
                  variant="active"
                  workout={generatedToHeroWorkout(trioResult.options[selectedOptionIndex].result.workout)}
                  exercises={trioResult.options[selectedOptionIndex].result.workout.exercises}
                  workoutLocation={currentWorkoutLocation}
                  programIconKey={primaryDomainId}
                  userGender={profile?.core?.gender}
                  onStart={() => handleTrioStart(selectedOptionIndex)}
                />
                <BuildCustomButton onTap={handleBuildCustomWrapped} userGender={profile?.core?.gender} />
              </div>
            ) : (
              <WorkoutSelectionCarousel
                options={trioResult.options}
                isRestDay={trioResult.isRestDay}
                onSelect={handleTrioSelect}
                onStart={handleTrioStart}
                workoutLocation={currentWorkoutLocation}
                programIconKey={primaryDomainId}
                selectedIndex={selectedOptionIndex}
                userGender={profile?.core?.gender}
                onBuildCustom={handleBuildCustomWrapped}
              />
            )
          ) : (
            <CarouselSkeleton />
          )}
        </div>

        {!hasCompletedAssessment && (
          <button
            onClick={() => onStartWorkout?.()}
            className="absolute inset-0 z-10 flex items-center justify-center"
          >
            <div
              className="flex flex-col items-center gap-1 px-6 py-4 rounded-2xl shadow-xl"
              style={{ backgroundColor: 'rgba(255,255,255,0.94)', backdropFilter: 'blur(6px)' }}
              dir="rtl"
            >
              <span className="text-[15px] font-black text-gray-800 leading-snug">
                בואו נראה למה אתם מסוגלים...
              </span>
              <span className="text-xs text-gray-500 font-medium">
                שאלון קצר והאימונים פתוחים!
              </span>
            </div>
          </button>
        )}
      </div>
    </div>
  );

  const renderModals = () => (
    <>
      {profile && (
        <UserWorkoutAdjuster
          isOpen={isUserAdjusterOpen}
          onClose={() => setIsUserAdjusterOpen(false)}
          userProfile={profile}
          initialLocation={currentWorkoutLocation as any}
          onApplyAndStart={handleAdjusterApplyAndStart}
        />
      )}
      <ProcessingOverlay isVisible={showProcessing} onComplete={handleProcessingComplete} />

      {/* ── Train-Ahead confirmation modal ─────────────────────────────── */}
      <AnimatePresence>
        {isTrainAheadModalOpen && (
          <motion.div
            key="train-ahead-backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[90] flex items-center justify-center p-6"
            style={{ backdropFilter: 'blur(8px)', backgroundColor: 'rgba(0,0,0,0.40)' }}
            onClick={() => setIsTrainAheadModalOpen(false)}
          >
            <motion.div
              key="train-ahead-card"
              initial={{ scale: 0.85, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.85, opacity: 0, y: 20 }}
              transition={{ type: 'spring', damping: 22, stiffness: 300 }}
              className="bg-white dark:bg-slate-800 rounded-3xl p-8 w-full max-w-sm shadow-2xl text-center"
              dir="rtl"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Clock icon */}
              <div className="w-14 h-14 mx-auto mb-5 rounded-full bg-cyan-50 dark:bg-cyan-900/30 flex items-center justify-center">
                <Clock className="w-7 h-7 text-cyan-500" />
              </div>

              <h2
                className="text-xl font-black text-gray-900 dark:text-white mb-3 leading-snug"
                style={{ fontFamily: 'var(--font-simpler)' }}
              >
                רוצה להקדים את האימון שלך?
              </h2>

              <p
                className="text-sm text-slate-500 dark:text-slate-400 mb-7 leading-relaxed"
                style={{ fontFamily: 'var(--font-simpler)' }}
              >
                האימון הזה מתוכן ליום {targetDayName}. רוצה לבצע אותו עכשיו ולשמור להיום?
              </p>

              {/* Primary CTA */}
              <button
                onClick={handleConfirmTrainAhead}
                className="w-full h-14 rounded-2xl font-bold text-black text-base mb-4 active:scale-[0.98] transition-transform shadow-lg shadow-cyan-500/20"
                style={{
                  fontFamily: 'var(--font-simpler)',
                  background: 'linear-gradient(135deg, #00BAF7 0%, #0CF2E3 100%)',
                }}
              >
                אני רוצה לעשות את האימון היום!
              </button>

              {/* Secondary — dismiss */}
              <button
                onClick={() => setIsTrainAheadModalOpen(false)}
                className="text-sm text-slate-500 dark:text-slate-400 underline underline-offset-2 hover:text-slate-700 dark:hover:text-slate-300 transition-colors"
                style={{ fontFamily: 'var(--font-simpler)' }}
              >
                תשאירו ביום המקורי
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );

  // ── Render: RUNNING Mode ──
  // Decomposition (PR 4 of 4): removed the "Top Row: Running Circle + Strength
  // Circle" and the WeeklyExecutionCard at the bottom. Real equivalents now
  // live in:
  //   - Running Circle (Riegel)   → RaceAndKmCarousel  (Row 4/5 via PerformanceMetricsRow)
  //   - Strength program ring     → ProgramProgressRow (Row 2 right)
  //   - Run + Strength session bars → ConsistencyWidget (Row 2 left)
  // What remains here is the action zone: NextRunWorkoutCard for today.
  if (mode === 'RUNNING') {
    const DAY_LETTERS = ['א', 'ב', 'ג', 'ד', 'ה', 'ו', 'ש'];
    const todayHebrewLetter = DAY_LETTERS[new Date().getDay()];
    const runScheduleDays = profile?.running?.scheduleDays ?? [];
    const isRunDayToday = runScheduleDays.includes(todayHebrewLetter);

    return (
      <div className="space-y-5">
        {/* ── Rest Day: show card FIRST when it's a rest day ── */}
        {!isRunDayToday && (
          <div className="w-full max-w-[358px] mx-auto">
            <NextRunWorkoutCard />
          </div>
        )}

        {/* ── Missed Workout Banner ── */}
        {alignmentAction.type === 'quality_makeup' && !bannerDismissed && (
          <div className="w-full max-w-[358px] mx-auto">
            <MissedWorkoutBanner
              onDoIt={() => onStartWorkout?.()}
              onContinue={dismissAlignment}
            />
          </div>
        )}

        {/* ── Today's Workout Card (only on run days — rest day shown above) ── */}
        {isRunDayToday && (
          <div className="w-full max-w-[358px] mx-auto">
            <NextRunWorkoutCard />
          </div>
        )}

        {renderModals()}

        {/* ── Alignment Popups (Layer 3 & 4) ── */}
        <PlanRealignPopup
          open={showRealignPopup}
          onContinue={dismissAlignment}
          onBackOneWeek={handleRollBack}
          onReset={() => {
            setShowRealignPopup(false);
            window.location.href = '/onboarding-new/dynamic';
          }}
          onClose={() => setShowRealignPopup(false)}
        />
        <RebuildPopup
          open={showRebuildPopup}
          onRebuild={() => {
            setShowRebuildPopup(false);
            window.location.href = '/onboarding-new/dynamic';
          }}
          onContinue={dismissAlignment}
          onClose={() => setShowRebuildPopup(false)}
        />
      </div>
    );
  }

  // ── Render: PERFORMANCE / Strength Mode ──
  // Decomposition (PR 4 of 4 — Apr 2026): the previous "Weekly Progress" tiles
  // (StrengthVolumeWidget compact + Steps numeric tile) and the standalone
  // ProgramProgressCard have been removed. They now live in the new dashboard
  // rows above this hero:
  //   - Strength bars     → ConsistencyWidget   (Row 2 left)
  //   - Steps tile        → StepsSummaryCard    (Row 4/5 left, Health Metrics)
  //   - Program ring      → ProgramProgressRow  (Row 2 right)
  // What remains here is the action zone: LoadAdvisor + workout selection.
  if (mode === 'PERFORMANCE') {
    return (
      <div className="space-y-8">
        <LoadAdvisorBanner />
        {!hideWorkoutSection && renderWorkoutSection()}
        {renderModals()}
      </div>
    );
  }

  // ── Render: HYBRID Mode (Strength + Running) ──
  // Decomposition (PR 4 of 4): removed StrengthVolumeWidget, ProgramProgressCard
  // and the placeholder RunningStatsWidget(weeklyDistance={12.5}). Real
  // equivalents now live in:
  //   - Strength bars + Run bars  → ConsistencyWidget         (Row 2 left)
  //   - Program ring              → ProgramProgressRow         (Row 2 right)
  //   - Real Weekly KM            → RaceAndKmCarousel via
  //                                 PerformanceMetricsRow      (Row 4/5 left)
  if (mode === 'HYBRID') {
    return (
      <div className="space-y-8">
        <LoadAdvisorBanner />
        {!hideWorkoutSection && renderWorkoutSection()}
        {renderModals()}
      </div>
    );
  }

  // ── DEFAULT / HEALTH MODE ─────────────────────────────────────────────────
  // Decomposition (PR 4 of 4 — Apr 2026): the previous "Power Row"
  // (5fr/8fr strength bar tile + program ring carousel) and the locked
  // progress circle have been removed. Real equivalents now live above:
  //   - Strength bar tile         → ConsistencyWidget    (Row 2 left, via StrengthVolumeWidget)
  //   - Program ring carousel     → ProgramProgressRow   (Row 2 right)
  // What remains here is the action zone (workout selection trio + nudge
  // modal), so this row truly becomes the "Thumb Zone" hero.
  return (
    <div className="space-y-3">
      {/* Nudge Popup — directs user to assessment */}
      <AnimatePresence>
        {showNudge && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[90] flex items-center justify-center p-6"
            style={{ backdropFilter: 'blur(8px)', backgroundColor: 'rgba(0,0,0,0.4)' }}
            onClick={() => setShowNudge(false)}
          >
            <motion.div
              initial={{ scale: 0.85, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.85, opacity: 0, y: 20 }}
              transition={{ type: 'spring', damping: 22, stiffness: 300 }}
              className="bg-white dark:bg-slate-800 rounded-3xl p-8 w-full max-w-sm shadow-2xl text-center"
              dir="rtl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="w-14 h-14 mx-auto mb-5 rounded-full border-2 border-cyan-400 flex items-center justify-center">
                <Lock className="w-6 h-6 text-cyan-500" />
              </div>
              <h2
                className="text-xl font-black text-slate-900 dark:text-white mb-2"
                style={{ fontFamily: 'var(--font-simpler)' }}
              >
                קודם כל, בואו נכיר!
              </h2>
              <p
                className="text-sm text-slate-500 dark:text-slate-400 mb-7"
                style={{ fontFamily: 'var(--font-simpler)' }}
              >
                השלם/י את האבחון הקצר כדי לפתוח את כל תכונות האפליקציה
              </p>
              <button
                onClick={() => {
                  setShowNudge(false);
                  onStartWorkout?.();
                }}
                className="w-full h-14 rounded-2xl font-bold text-white text-base mb-4 bg-gradient-to-l from-[#00C9F2] to-[#00AEEF] shadow-lg shadow-cyan-500/20 active:scale-[0.98] transition-transform"
                style={{ fontFamily: 'var(--font-simpler)' }}
              >
                התחל אבחון רמה
              </button>
              <button
                onClick={() => setShowNudge(false)}
                className="text-sm text-slate-500 dark:text-slate-400 underline underline-offset-2 hover:text-slate-700 dark:hover:text-slate-300 transition-colors"
                style={{ fontFamily: 'var(--font-simpler)' }}
              >
                אולי מאוחר יותר
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {!hideWorkoutSection && renderWorkoutSection()}
      {renderModals()}
    </div>
  );
}
