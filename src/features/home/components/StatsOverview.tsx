import React, { useMemo, useEffect, useState, useCallback, useRef } from 'react';
import { useUserStore } from '@/features/user';
import { useDashboardMode } from '@/hooks/useDashboardMode';
import { pickHeroExercise, resolveHeroMedia } from './HeroWorkoutCard';
import { RunningStatsWidget } from './widgets/RunningStatsWidget';
import { StrengthVolumeWidget } from './widgets/StrengthVolumeWidget';
import { ProgramProgressCard } from './widgets/ProgramProgressCard';
import { LoadAdvisorBanner } from './widgets/LoadAdvisorBanner';
import { RunForecastWidget } from './widgets/RunForecastWidget';
import RunProgressCircle from './widgets/RunProgressCircle';
import WeeklyExecutionCard from './widgets/WeeklyExecutionCard';
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
import { ConcentricRingsProgress } from './rings/ConcentricRingsProgress';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Dumbbell, Sparkles, Footprints, SlidersHorizontal, Lock } from 'lucide-react';
import { GeneratedWorkout, WorkoutExercise } from '@/features/workout-engine/logic/WorkoutGenerator';
import { generateHomeWorkoutTrio } from '@/features/workout-engine/services/home-workout.service';
import type { HomeWorkoutTrioResult } from '@/features/workout-engine/services/home-workout.types';
import WorkoutSelectionCarousel, { CarouselSkeleton } from './WorkoutSelectionCarousel';
import {
  useWeeklyVolumeStore,
  calculateWeeklyBudget,
} from '@/features/workout-engine/core/store/useWeeklyVolumeStore';
import { resolveActiveProgramBudget } from '@/features/workout-engine/services/lead-program.service';
import { getScheduleEntry, hydrateFromTemplate } from '@/features/user/scheduling/services/userSchedule.service';
import { toISODate, isLateNightPivot } from '@/features/user/scheduling/utils/dateUtils';
import UserWorkoutAdjuster from './UserWorkoutAdjuster';
import ProcessingOverlay from './ProcessingOverlay';
import { getProgram } from '@/features/content/programs/core/program.service';
import { getProgramLevelSetting } from '@/features/content/programs/core/programLevelSettings.service';
import type { GoalItem } from './widgets/ProgramProgressCard';
import { getLocalizedText } from '@/features/content/exercises';
import { resolveIconKey, getProgramIcon } from '@/features/content/programs';
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
}: StatsOverviewProps) {
  const { profile } = useUserStore();
  const checkAndResetWeek = useWeeklyVolumeStore((s) => s.checkAndResetWeek);
  const recalculateFromActivities = useWeeklyVolumeStore((s) => s.recalculateFromActivities);

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
    totalMinutesToday,
    ringData,
    dominantColor,
  } = useDailyActivity();
  
  const {
    totalMinutes: weeklyMinutes,
    daysWithActivity,
    summary: weeklySummaryData,
  } = useWeeklyProgress();

  // 1. Calculate Mode
  const mode = useDashboardMode(profile);

  // 2. Safe Logging
  useEffect(() => {
    if (typeof window !== 'undefined' && process.env.NODE_ENV === 'development') {
      // eslint-disable-next-line no-console
      console.log('🧠 Brain Decision (Stable):', mode);
    }
  }, [mode]);

  // 3. Smart Goals Logic (Memoized)
  const goals = useMemo(
    () => ({
      dailySteps: profile?.goals?.dailySteps || 4000,
      weeklyMinutes: 150,
    }),
    [profile?.goals?.dailySteps],
  );
  
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

  // Resolve primary domain ID: prefer activeProgram.templateId, then first domains key, then first tracks key
  const primaryDomainId = useMemo(() => {
    if (activeProgram?.templateId) return activeProgram.templateId;
    const domainsKeys = profile?.progression?.domains ? Object.keys(profile.progression.domains) : [];
    if (domainsKeys.length > 0) return domainsKeys[0];
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
    getProgram(programId)
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
    || activeProgram?.name
    || 'תוכנית אימון';

  // Resolve icon key for ProgramProgressCard (full_body vs muscle vs heart etc.)
  const resolvedProgramIcon = useMemo(
    () => resolveIconKey(undefined, primaryDomainId ?? undefined),
    [primaryDomainId],
  );

  // ── Fetch level goals (milestones) from ProgramLevelSettings ──
  // Supports Goal Inheritance: if current program is a Master Program,
  // also fetch goals from all its child programs.
  // FIXED: depends on `programMeta` state (not a ref) to avoid race conditions.
  const [levelGoals, setLevelGoals] = useState<GoalItem[]>([]);

  useEffect(() => {
    if (!primaryDomainId) return;
    // Wait until programMeta is loaded so we know if it's a master program
    if (programMeta === null) return;

    let cancelled = false;

    const userGoalProgress = profile?.progression?.levelGoalProgress ?? [];

    const mapGoals = (
      settings: { id?: string; targetGoals?: any[] } | null,
      sourcePrefix: string,
    ): GoalItem[] => {
      if (!settings?.targetGoals?.length) return [];
      const currentLevelProgress = userGoalProgress.find(
        (lgp) => lgp.levelId === settings.id || lgp.levelName === `Level ${domainLevel}`,
      );
      return settings.targetGoals.map((tg: any, idx: number) => {
        let isCompleted = false;
        if (currentLevelProgress?.goals) {
          const match = currentLevelProgress.goals.find(
            (g: any) => g.exerciseId === tg.exerciseId,
          );
          if (match) isCompleted = match.isCompleted;
        }
        const unitLabel = tg.unit === 'reps' ? 'חזרות' : 'שניות';
        return {
          id: `${sourcePrefix}-goal-${idx}-${tg.exerciseId}`,
          label: `${tg.exerciseName} — ${tg.targetValue} ${unitLabel}`,
          isCompleted,
        };
      });
    };

    (async () => {
      try {
        const tracks = profile?.progression?.tracks;

        // ── Step 1: Fetch goals for the primary program document ──
        const mainSettings = await getProgramLevelSetting(primaryDomainId, domainLevel);
        let allGoals = mapGoals(mainSettings, primaryDomainId);

        console.log(
          `[StatsOverview] Primary doc "${primaryDomainId}_level_${domainLevel}" → ${allGoals.length} goals`,
        );

        // ── Step 2: Goal Inheritance for Master Programs ──
        // Collect child IDs from programMeta (canonical source).
        // Also fetch the program directly as a second-pass fallback in case
        // programMeta.subPrograms was cached empty while Firestore had data.
        let childIds = [...programMeta.subPrograms];

        if (programMeta.isMaster && childIds.length === 0) {
          console.log(`[StatsOverview] isMaster=true but children empty — refetching ${primaryDomainId}`);
          try {
            const freshProg = await getProgram(primaryDomainId);
            if (freshProg?.subPrograms?.length) {
              childIds = freshProg.subPrograms;
              setProgramMeta({ isMaster: true, subPrograms: childIds });
            }
          } catch { /* ignore */ }
        }

        // ── Step 2b: Tracks-based discovery fallback ──
        // If subPrograms is still empty, discover children from the user's
        // progression.tracks keys (any track that isn't the primary itself).
        if (childIds.length === 0 && tracks) {
          const discoveredChildren = Object.keys(tracks).filter(
            (trackId) => trackId !== primaryDomainId,
          );
          if (discoveredChildren.length > 0) {
            console.log(
              `[StatsOverview] 🔍 Discovered ${discoveredChildren.length} child tracks from profile.progression.tracks: [${discoveredChildren.join(', ')}]`,
            );
            childIds = discoveredChildren;
          }
        }

        if (childIds.length > 0) {
          console.log(
            `[StatsOverview] Fetching child-program goals: [${childIds.join(', ')}] (each at own track level)`,
          );
          const childResults = await Promise.allSettled(
            childIds.map((childId) => {
              const childTrackLevel = tracks?.[childId]?.currentLevel ?? domainLevel;
              console.log(`[StatsOverview]   ↳ "${childId}" → fetching level ${childTrackLevel}`);
              return getProgramLevelSetting(childId, childTrackLevel);
            }),
          );
          for (let i = 0; i < childResults.length; i++) {
            const result = childResults[i];
            const childId = childIds[i];
            if (result.status === 'fulfilled' && result.value) {
              const childGoals = mapGoals(result.value, childId);
              console.log(`[StatsOverview]   └─ "${childId}": ${childGoals.length} goals`);
              allGoals = [...allGoals, ...childGoals];
            } else {
              console.log(`[StatsOverview]   └─ "${childId}": no settings found`);
            }
          }
        }

        // ── Step 3: Last-resort — query ALL level settings for the primary program ──
        // If we still have 0 goals, it might be that the doc ID convention
        // doesn't match (e.g., level stored as 0 instead of 1). Try fetching
        // all settings for the primary program and pick the closest level.
        if (allGoals.length === 0) {
          console.log(
            `[StatsOverview] ⚠️ Still 0 goals — last-resort: fetching ALL settings for "${primaryDomainId}"`,
          );
          try {
            const { getProgramLevelSettingsByProgram } = await import(
              '@/features/content/programs/core/programLevelSettings.service'
            );
            const allSettings = await getProgramLevelSettingsByProgram(primaryDomainId);
            if (allSettings.length > 0) {
              const closest =
                allSettings.find((s) => s.levelNumber === domainLevel) ||
                allSettings[0];
              const fallbackGoals = mapGoals(closest, primaryDomainId);
              console.log(
                `[StatsOverview]   └─ last-resort found ${allSettings.length} docs, using level ${closest.levelNumber}: ${fallbackGoals.length} goals`,
              );
              allGoals = [...allGoals, ...fallbackGoals];
            } else {
              console.log(`[StatsOverview]   └─ last-resort: no settings docs at all for "${primaryDomainId}"`);
            }
          } catch (err) {
            console.warn('[StatsOverview] Last-resort query failed:', err);
          }
        }

        if (!cancelled) {
          setLevelGoals(allGoals);
          console.log(
            `[StatsOverview] ✅ MERGED GOALS ARRAY (${allGoals.length} total):`,
            allGoals.map(g => ({ id: g.id, label: g.label, done: g.isCompleted })),
          );
        }
      } catch (err) {
        console.warn('[StatsOverview] Failed to fetch level goals:', err);
      }
    })();

    return () => { cancelled = true; };
  }, [primaryDomainId, domainLevel, profile?.progression?.levelGoalProgress, profile?.progression?.tracks, programMeta]);

  // ── State ────────────────────────────────────────────────────────────
  const [showWeeklyDetail, setShowWeeklyDetail] = useState(false);

  // ── Dynamic Workout State (Trio) ────────────────────────────────────────
  const [trioResult, setTrioResult] = useState<HomeWorkoutTrioResult | null>(null);
  const [selectedOptionIndex, setSelectedOptionIndex] = useState(1);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isUserAdjusterOpen, setIsUserAdjusterOpen] = useState(false);
  const [showProcessing, setShowProcessing] = useState(false);
  const [currentWorkoutLocation, setCurrentWorkoutLocation] = useState<string | null>(null);
  const didGenerate = useRef(false);
  const lastGeneratedDate = useRef<string | null>(null);

  const dynamicWorkout = trioResult?.options[selectedOptionIndex]?.result.workout ?? null;

  // Resolve effective target date (prop or today fallback)
  const targetDate = selectedDateProp ?? toISODate(new Date());

  // Reset generation guard when selectedDate changes so the effect re-fires
  useEffect(() => {
    if (lastGeneratedDate.current && lastGeneratedDate.current !== targetDate) {
      didGenerate.current = false;
    }
  }, [targetDate]);

  // Generate workout on mount / date change — UTS Phase 2 date-reactive path
  useEffect(() => {
    if (!profile || isGuest || didGenerate.current) return;

    // Pure RUNNING mode: strength workouts are never shown.
    // NextRunWorkoutCard reads profile.running.activeProgram directly — no trio needed.
    // HYBRID falls through and generates the strength side normally.
    if (mode === 'RUNNING') {
      didGenerate.current = true;
      setIsGenerating(false);
      return;
    }

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
    const isTargetToday = targetDate === toISODate(new Date());
    const lateNight = isTargetToday && isLateNightPivot(profile.lifestyle?.trainingTime);
    const condensedTime = lateNight ? 15 : 30;
    if (lateNight) {
      console.log('[UTS] Late-Night Pivot active → condensed 15-min workout');
    }

    // ── UTS: Consult UserSchedule before generating ────────────────────
    getScheduleEntry(profile.id, targetDate)
      .then(entry => {
        if (!entry && profile.lifestyle?.recurringTemplate) {
          return hydrateFromTemplate(profile.id, targetDate, profile.lifestyle.recurringTemplate);
        }
        return entry;
      })
      .then(entry => {
        const isRestDay = entry?.type === 'rest';
        const activeProgram = profile.progression?.activePrograms?.[0]?.templateId;
        const scheduledProgramIds =
          entry?.type === 'training' && entry.programIds?.length
            ? entry.programIds
            : activeProgram ? [activeProgram] : [];

        console.log(
          `[UTS] Schedule for ${targetDate}: type=${entry?.type ?? 'none'}` +
          ` programs=[${scheduledProgramIds.join(',')}]` +
          ` lateNight=${lateNight}`,
        );

        const remainingBudget = useWeeklyVolumeStore.getState().getRemainingBudget();
        const budgetUsagePercent = useWeeklyVolumeStore.getState().getBudgetUsagePercent();
        const domainSetsCompletedThisWeek = useWeeklyVolumeStore.getState().getDomainSetsCompleted();
        const recentExerciseIds = useWeeklyVolumeStore.getState().getRecentExerciseIds(2);

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

        return generateHomeWorkoutTrio({
          userProfile: profile,
          location: resolvedLocation,
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
        });
      })
      .then((trio) => {
        setTrioResult(trio);
        setSelectedOptionIndex(1);
        onWorkoutGenerated?.(trio.options[1].result.workout);
        const loc = trio.meta?.location || resolvedLocation;
        setCurrentWorkoutLocation(loc);
        if (typeof window !== 'undefined' && loc) {
          sessionStorage.setItem('currentWorkoutLocation', loc);
        }
      })
      .catch((err) => {
        console.error('[StatsOverview] Workout generation failed:', err);
      })
      .finally(() => setIsGenerating(false));
  }, [profile, isGuest, onWorkoutGenerated, targetDate]);

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
    onStartWorkout?.();
  }, [trioResult, onWorkoutGenerated, onStartWorkout]);

  // ── Nudge popup state (for locked widgets) — must be before any early return ──
  const [showNudge, setShowNudge] = useState(false);

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
  const hasRunningPlan = mode === 'RUNNING' || mode === 'HYBRID'
    || profile?.lifestyle?.primaryTrack === 'run'
    || profile?.lifestyle?.primaryTrack === 'hybrid';
  const runningGoal = Math.max(1, Math.ceil(scheduleDaysCount * 0.4));
  const [showRunningCTA, setShowRunningCTA] = useState(false);


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
        <div className="flex items-center justify-between mb-1">
          <h3 className="text-2xl font-extrabold text-gray-900 dark:text-white">האימון היומי שלך</h3>
          {isGenerated && (
            <button
              onClick={() => setIsUserAdjusterOpen(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-100 dark:bg-slate-800 rounded-full text-xs font-bold text-gray-600 dark:text-gray-300 transition-all hover:bg-gray-200 dark:hover:bg-slate-700 active:scale-95"
            >
              <SlidersHorizontal size={14} className="text-cyan-600" />
              התאם
            </button>
          )}
        </div>

        {dynamicWorkout ? (
          <p className="text-sm text-gray-500 dark:text-gray-400 font-medium mb-4 leading-relaxed text-right">
            {dynamicWorkout.description || 'מוכן להתחיל?'}
          </p>
        ) : (
          <div className="h-4 w-56 rounded bg-gray-200 dark:bg-slate-700 animate-pulse mb-4 mr-auto" />
        )}
      </div>

      {/* Carousel — full bleed so side cards peek to screen edges */}
      {trioResult ? (
        <WorkoutSelectionCarousel
          options={trioResult.options}
          isRestDay={trioResult.isRestDay}
          onSelect={handleTrioSelect}
          onStart={handleTrioStart}
          workoutLocation={currentWorkoutLocation}
          programIconKey={primaryDomainId}
          selectedIndex={selectedOptionIndex}
        />
      ) : (
        <CarouselSkeleton />
      )}
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
    </>
  );

  // ── Render: RUNNING Mode ──
  if (mode === 'RUNNING') {
    const runFreq = profile?.running?.generatedProgramTemplate?.canonicalFrequency ?? 3;
    const strengthScheduleTotal = Math.max(1, profile?.lifestyle?.scheduleDays?.length ?? 3);
    const hasStrengthPlan = !!(profile?.personaId || (profile?.progression?.domains && Object.keys(profile.progression.domains).length > 0));

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

        {/* ── Top Row: Running Circle + Strength Circle ── */}
        <div
          className="w-full max-w-[358px] mx-auto grid gap-3 items-stretch"
          style={{ gridTemplateColumns: '1fr 1fr', direction: 'rtl' }}
        >
          <RunProgressCircle />

          {hasStrengthPlan ? (
            <div
              className="bg-white dark:bg-slate-800 flex items-center gap-2.5 px-3 py-3"
              dir="rtl"
              style={{
                borderRadius: 16,
                border: '0.5px solid #E0E9FF',
                boxShadow: '0 2px 8px 0 rgba(0,0,0,0.04)',
              }}
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 mb-0.5">
                  <span style={{ color: '#0AC2B6' }} className="flex-shrink-0">
                    {getProgramIcon(resolvedProgramIcon, 'w-4 h-4')}
                  </span>
                  <h3 className="text-[14px] font-bold text-gray-900 dark:text-white truncate leading-tight">
                    {resolvedProgramName}
                  </h3>
                </div>
                <p className="text-[13px] text-gray-600 dark:text-gray-300 font-semibold">
                  רמה {domainLevel}/{domainMaxLevel}
                </p>
              </div>
              <ProgressRingInline percentage={inLevelPercent} size={66} strokeWidth={5.5} color="#0AC2B6" />
            </div>
          ) : (
            <button
              onClick={onStartWorkout}
              dir="rtl"
              className="bg-gradient-to-br from-[#0AC2B6]/10 to-[#0AC2B6]/5 flex flex-col items-center justify-center p-4 text-center"
              style={{ borderRadius: 16, border: '1px dashed #0AC2B6' }}
            >
              <Dumbbell className="w-6 h-6 mb-1.5" style={{ color: '#0AC2B6' }} />
              <p className="text-sm font-bold text-gray-700 dark:text-gray-200">התאמת תוכנית כוח</p>
              <p className="text-[10px] text-gray-400 mt-0.5">השלם אבחון לפתוח תוכנית</p>
            </button>
          )}
        </div>

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

        {/* ── Weekly Execution: Running + Strength Bars ── */}
        <div className="w-full max-w-[358px] mx-auto">
          <WeeklyExecutionCard
            runDone={cardioSessions}
            runTotal={runFreq}
            strengthDone={weeklySummaryData?.categorySessions?.strength ?? 0}
            strengthTotal={strengthScheduleTotal}
          />
        </div>

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
  if (mode === 'PERFORMANCE') {
    return (
      <div className="space-y-8">
        {/* Weekly Progress — 231px strength + 111px steps */}
        <div className="w-full max-w-[358px] mx-auto" dir="rtl">
          <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-2 px-1">
            התקדמות שבועית
          </h3>
          <div className="flex gap-4">
            {/* Strength — 231px */}
            <StrengthVolumeWidget layout="compact" />
            {/* Steps — 111px */}
            <div
              className="bg-white dark:bg-slate-800 overflow-hidden flex flex-col items-center justify-center text-center"
              style={{
                width: 111,
                minWidth: 0,
                flexShrink: 1,
                borderRadius: 12,
                padding: 16,
                border: '0.5px solid #E0E9FF',
                boxShadow: '0 1px 4px 0 rgba(0,0,0,0.04)',
              }}
            >
              <Footprints className="w-6 h-6 text-gray-800 dark:text-gray-200 mb-1" />
              <span className="text-2xl font-black text-[#00C9F2] tabular-nums leading-none">
                {displaySteps.toLocaleString()}
              </span>
              <span className="text-[11px] text-gray-500 dark:text-gray-400 mt-1">צעדים היום</span>
              <span className="text-[12px] font-bold text-[#00C9F2] mt-2">התחילו לצעוד!</span>
            </div>
          </div>
        </div>

        {/* Program Progress Card (Level Ring) — below weekly */}
        <ProgramProgressCard
          programName={resolvedProgramName}
          iconKey={resolvedProgramIcon}
          currentLevel={domainLevel}
          maxLevel={domainMaxLevel}
          progressPercent={inLevelPercent}
          goals={levelGoals}
          programCount={activeProgramCount}
        />

        {/* Load Advisor */}
        <LoadAdvisorBanner />

        {!hideWorkoutSection && renderWorkoutSection()}
        {renderModals()}
      </div>
    );
  }

  // ── Render: HYBRID Mode (Strength + Running) ──
  if (mode === 'HYBRID') {
    return (
      <div className="space-y-8">
        {/* Weekly Progress (segmented bars) — top of dashboard */}
        <StrengthVolumeWidget />

        {/* Program Progress Card (Level Ring) — below weekly */}
        {hasProgramData && (
          <ProgramProgressCard
            programName={resolvedProgramName}
            iconKey={resolvedProgramIcon}
            currentLevel={domainLevel}
            maxLevel={domainMaxLevel}
            progressPercent={inLevelPercent}
            goals={levelGoals}
            programCount={activeProgramCount}
          />
        )}

        {/* Running Snapshot */}
        <RunningStatsWidget weeklyDistance={12.5} weeklyGoal={20} calories={caloriesToday || 450} />

        {/* Load Advisor */}
        <LoadAdvisorBanner />

        {!hideWorkoutSection && renderWorkoutSection()}
        {renderModals()}
      </div>
    );
  }

  // DEFAULT / HEALTH MODE
  return (
    <div className="space-y-5">
      {/* ── Power Row: 5fr / 8fr grid ── */}
      <div
        className="w-full max-w-[358px] mx-auto grid gap-3 items-stretch"
        style={{ gridTemplateColumns: '5fr 8fr', direction: 'ltr' }}
      >
        {/* ── Left Card (35%): Weekly Metrics ── */}
        <div
          className="bg-white dark:bg-slate-800 flex flex-col justify-center px-3.5 py-3.5 h-full"
          dir="rtl"
          style={{
            borderRadius: 16,
            border: '0.5px solid #E0E9FF',
            boxShadow: '0 2px 8px 0 rgba(0,0,0,0.04)',
          }}
        >
          {/* ── Strength Block ── */}
          <div className="mb-1">
            {/* Top: [Icon + Label]  ···  [Count] */}
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-1.5">
                <svg width="13" height="11" viewBox="0 0 13 11" fill="none" className="text-gray-800 dark:text-gray-200 flex-shrink-0">
                  <path d="M11.875 8.49641C11.6642 9.35355 10.5787 9.5625 9.88848 9.5625C8.3983 9.5625 2.71702 9.5625 2.71702 9.5625C1.30519 9.5625 0.227331 7.96126 0.766428 6.5655C1.95888 4.46229 3.02976 2.83719 3.64838 0.894899C5.07769 0.0616627 6.91005 0.894898 6.4791 2.2858M4.64655 2.83719C3.87448 3.99641 4.30703 5.28212 3.64838 6.5655C5.60422 5.28159 7.52284 5.02481 9.60907 6.5655" stroke="currentColor" strokeWidth="1.125" strokeLinejoin="round"/>
                </svg>
                <span className="text-[11px] font-bold text-gray-500 dark:text-gray-400">כוח</span>
              </div>
              <span className="text-sm font-black text-gray-900 dark:text-white tabular-nums leading-none">{strengthSessions}/{strengthGoal}</span>
            </div>
            {/* Bottom: Full-width segmented bars */}
            <div className="flex gap-1">
              {Array.from({ length: strengthGoal }).map((_, i) => (
                <div
                  key={i}
                  className="flex-1 h-[5px] rounded-full overflow-hidden"
                  style={{ backgroundColor: '#F1F5F9' }}
                >
                  <motion.div
                    className="h-full rounded-full"
                    style={{ backgroundColor: '#00C9F2' }}
                    initial={{ width: 0 }}
                    animate={{ width: i < strengthSessions ? '100%' : '0%' }}
                    transition={{ duration: 0.6, delay: i * 0.12, ease: 'easeOut' }}
                  />
                </div>
              ))}
            </div>
          </div>

          {/* ── Divider ── */}
          <div className="h-px bg-gray-100 dark:bg-slate-700 my-2.5" />

          {/* ── Running Block ── */}
          <button
            onClick={() => { if (!hasRunningPlan) setShowRunningCTA(true); }}
            className={`transition-all ${!hasRunningPlan ? 'opacity-35 blur-[1px]' : ''}`}
          >
            {/* Top: [Icon + Label]  ···  [Count] */}
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-1.5">
                <svg width="13" height="13" viewBox="0 0 14 14" fill="none" className="text-gray-800 dark:text-gray-200 flex-shrink-0">
                  <g clipPath="url(#runClip)">
                    <path d="M13.5411 4.81964C13.2994 4.38452 12.7507 4.22773 12.3155 4.46947L10.8856 5.26389L9.94303 3.82233C9.91514 3.82331 9.88731 3.82446 9.8592 3.82446C8.90979 3.82446 8.09211 3.25156 7.73243 2.43354C6.62716 2.43346 4.76196 2.43335 4.76196 2.43335C4.43346 2.43335 4.13098 2.6121 3.9725 2.89983L2.83089 4.97276C2.59079 5.40879 2.74957 5.95689 3.18557 6.197C3.32344 6.27293 3.47252 6.30897 3.61954 6.30897C3.93741 6.30897 4.24563 6.14045 4.4098 5.84232L5.29451 4.23588H6.99666L4.39786 8.77229H1.24698C0.749242 8.77229 0.345703 9.1758 0.345703 9.67356C0.345703 10.1713 0.749215 10.5748 1.24698 10.5748H4.91216C5.23091 10.5748 5.52595 10.4065 5.6881 10.1321L6.33552 9.03646L7.97002 10.3243L6.99004 12.7623C6.80441 13.2241 7.0283 13.749 7.49013 13.9346C7.60036 13.9789 7.71408 13.9999 7.826 13.9999C8.18313 13.9999 8.52118 13.7862 8.66252 13.4345L9.89425 10.3702C10.0435 9.99893 9.9301 9.57373 9.61581 9.32611L7.80349 7.89822L9.05652 5.76032L9.83584 6.95223C10.0079 7.21539 10.2957 7.36039 10.5909 7.36039C10.7393 7.36039 10.8896 7.32367 11.0279 7.24686L13.1909 6.04516C13.626 5.80347 13.7828 5.25476 13.5411 4.81964Z" fill="currentColor"/>
                    <path d="M9.85906 3.00426C10.6887 3.00426 11.3612 2.33173 11.3612 1.50213C11.3612 0.672526 10.6887 0 9.85906 0C9.02946 0 8.35693 0.672526 8.35693 1.50213C8.35693 2.33173 9.02946 3.00426 9.85906 3.00426Z" fill="currentColor"/>
                  </g>
                  <defs><clipPath id="runClip"><rect width="14" height="14" fill="white"/></clipPath></defs>
                </svg>
                <span className="text-[11px] font-bold text-gray-500 dark:text-gray-400">ריצה</span>
              </div>
              <span className="text-sm font-black text-gray-900 dark:text-white tabular-nums leading-none">{cardioSessions}/{runningGoal}</span>
            </div>
            {/* Bottom: Full-width segmented bars */}
            <div className="flex gap-1">
              {Array.from({ length: runningGoal }).map((_, i) => (
                <div
                  key={i}
                  className="flex-1 h-[5px] rounded-full overflow-hidden"
                  style={{ backgroundColor: '#F1F5F9' }}
                >
                  <motion.div
                    className="h-full rounded-full"
                    style={{ backgroundColor: '#84cc16' }}
                    initial={{ width: 0 }}
                    animate={{ width: i < cardioSessions ? '100%' : '0%' }}
                    transition={{ duration: 0.6, delay: i * 0.12, ease: 'easeOut' }}
                  />
                </div>
              ))}
            </div>
          </button>
        </div>

        {/* ── Right Cell (65%): Program Carousel ── */}
        {hasProgramData && programSlides.length > 0 ? (
          <div
            className="overflow-hidden relative h-full"
            ref={carouselRef}
            style={{ borderRadius: 16 }}
          >
            <motion.div
              className="flex h-full"
              dir="ltr"
              drag={programSlides.length > 1 ? 'x' : false}
              dragConstraints={carouselRef}
              dragElastic={0.15}
              onDragEnd={(_e, info) => {
                const threshold = 40;
                if (info.offset.x < -threshold && activeSlide < programSlides.length - 1) {
                  setActiveSlide((p) => p + 1);
                } else if (info.offset.x > threshold && activeSlide > 0) {
                  setActiveSlide((p) => p - 1);
                }
              }}
              animate={{ x: `${-activeSlide * 100}%` }}
              transition={{ type: 'spring', stiffness: 300, damping: 30 }}
              style={{ width: '100%' }}
            >
              {programSlides.map((slide) => (
                <div
                  key={slide.id}
                  className="w-full flex-shrink-0 h-full bg-white dark:bg-slate-800 flex items-center gap-2.5 px-3 py-3"
                  dir="rtl"
                  style={{
                    borderRadius: 16,
                    border: '0.5px solid #E0E9FF',
                    boxShadow: '0 2px 8px 0 rgba(0,0,0,0.04)',
                  }}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 mb-0.5">
                      <span className="text-[#00C9F2] flex-shrink-0">
                        {getProgramIcon(slide.iconKey, 'w-4 h-4')}
                      </span>
                      <h3 className="text-[14px] font-bold text-gray-900 dark:text-white truncate leading-tight">
                        {slide.name}
                      </h3>
                    </div>
                    <p className="text-[13px] text-gray-600 dark:text-gray-300 font-semibold">
                      רמה {slide.level}/{slide.maxLevel}
                    </p>
                    {slide.level < slide.maxLevel && (
                      <p className="text-[11px] text-gray-400 dark:text-gray-500 mt-0.5">
                        עוד {Math.max(0, 100 - Math.round(slide.percent))}% לרמה הבאה
                      </p>
                    )}
                  </div>
                  <ProgressRingInline
                    percentage={slide.percent}
                    size={66}
                    strokeWidth={5.5}
                  />
                </div>
              ))}
            </motion.div>
          </div>
        ) : (
          <button
            onClick={onStartWorkout}
            dir="rtl"
            className="bg-gradient-to-br from-[#00C9F2]/10 to-[#00C9F2]/5 flex flex-col items-center justify-center p-4 text-center"
            style={{
              borderRadius: 16,
              border: '1px dashed #00C9F2',
            }}
          >
            <Sparkles className="w-7 h-7 text-[#00C9F2] mb-2" />
            <p className="text-sm font-bold text-gray-700 dark:text-gray-200">התחל תוכנית</p>
            <p className="text-[10px] text-gray-400 mt-0.5">השלם אבחון לפתוח תוכנית מותאמת</p>
          </button>
        )}
      </div>

      {/* ── Pagination Dots — aligned under the right card only ── */}
      {programSlides.length > 1 && (
        <div
          className="w-full max-w-[358px] mx-auto grid -mt-3"
          style={{ gridTemplateColumns: '5fr 8fr', direction: 'ltr' }}
        >
          <div />
          <div className="flex items-center justify-center gap-1.5 pt-1.5">
            {programSlides.map((slide, idx) => (
              <button
                key={slide.id}
                onClick={() => setActiveSlide(idx)}
                className="transition-all duration-200"
                style={{
                  width: idx === activeSlide ? 16 : 6,
                  height: 6,
                  borderRadius: 3,
                  backgroundColor: idx === activeSlide ? '#00C9F2' : '#CBD5E1',
                }}
              />
            ))}
          </div>
        </div>
      )}

      {/* ── Running Plan CTA Popup ── */}
      <AnimatePresence>
        {showRunningCTA && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[90] flex items-center justify-center p-6"
            style={{ backdropFilter: 'blur(8px)', backgroundColor: 'rgba(0,0,0,0.4)' }}
            onClick={() => setShowRunningCTA(false)}
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
              <div className="w-14 h-14 mx-auto mb-5 rounded-full bg-lime-50 dark:bg-lime-900/20 border-2 border-lime-400 flex items-center justify-center">
                <svg width="24" height="24" viewBox="0 0 14 14" fill="none" className="text-lime-500">
                  <g clipPath="url(#runCta)">
                    <path d="M13.5411 4.81964C13.2994 4.38452 12.7507 4.22773 12.3155 4.46947L10.8856 5.26389L9.94303 3.82233C9.91514 3.82331 9.88731 3.82446 9.8592 3.82446C8.90979 3.82446 8.09211 3.25156 7.73243 2.43354C6.62716 2.43346 4.76196 2.43335 4.76196 2.43335C4.43346 2.43335 4.13098 2.6121 3.9725 2.89983L2.83089 4.97276C2.59079 5.40879 2.74957 5.95689 3.18557 6.197C3.32344 6.27293 3.47252 6.30897 3.61954 6.30897C3.93741 6.30897 4.24563 6.14045 4.4098 5.84232L5.29451 4.23588H6.99666L4.39786 8.77229H1.24698C0.749242 8.77229 0.345703 9.1758 0.345703 9.67356C0.345703 10.1713 0.749215 10.5748 1.24698 10.5748H4.91216C5.23091 10.5748 5.52595 10.4065 5.6881 10.1321L6.33552 9.03646L7.97002 10.3243L6.99004 12.7623C6.80441 13.2241 7.0283 13.749 7.49013 13.9346C7.60036 13.9789 7.71408 13.9999 7.826 13.9999C8.18313 13.9999 8.52118 13.7862 8.66252 13.4345L9.89425 10.3702C10.0435 9.99893 9.9301 9.57373 9.61581 9.32611L7.80349 7.89822L9.05652 5.76032L9.83584 6.95223C10.0079 7.21539 10.2957 7.36039 10.5909 7.36039C10.7393 7.36039 10.8896 7.32367 11.0279 7.24686L13.1909 6.04516C13.626 5.80347 13.7828 5.25476 13.5411 4.81964Z" fill="currentColor"/>
                    <path d="M9.85906 3.00426C10.6887 3.00426 11.3612 2.33173 11.3612 1.50213C11.3612 0.672526 10.6887 0 9.85906 0C9.02946 0 8.35693 0.672526 8.35693 1.50213C8.35693 2.33173 9.02946 3.00426 9.85906 3.00426Z" fill="currentColor"/>
                  </g>
                  <defs><clipPath id="runCta"><rect width="14" height="14" fill="white"/></clipPath></defs>
                </svg>
              </div>
              <h2
                className="text-xl font-black text-slate-900 dark:text-white mb-2"
                style={{ fontFamily: 'var(--font-simpler)' }}
              >
                בואו נוסיף תוכנית ריצה
              </h2>
              <p
                className="text-sm text-slate-500 dark:text-slate-400 mb-7"
                style={{ fontFamily: 'var(--font-simpler)' }}
              >
                הוסיפו תוכנית ריצה מותאמת אישית כדי לעקוב אחרי ההתקדמות שלכם
              </p>
              <button
                onClick={() => {
                  setShowRunningCTA(false);
                  onStartWorkout?.();
                }}
                className="w-full h-14 rounded-2xl font-bold text-white text-base mb-4 bg-gradient-to-l from-lime-500 to-lime-400 shadow-lg shadow-lime-500/20 active:scale-[0.98] transition-transform"
                style={{ fontFamily: 'var(--font-simpler)' }}
              >
                הוסף תוכנית ריצה
              </button>
              <button
                onClick={() => setShowRunningCTA(false)}
                className="text-sm text-slate-500 dark:text-slate-400 underline underline-offset-2 hover:text-slate-700 dark:hover:text-slate-300 transition-colors"
                style={{ fontFamily: 'var(--font-simpler)' }}
              >
                אולי מאוחר יותר
              </button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Daily Stats Row: Steps + Minutes ── */}
      <div className="w-full max-w-[358px] mx-auto grid grid-cols-2 gap-3" dir="rtl">
        {/* Minutes card */}
        <button
          onClick={() => {
            if (!hasCompletedAssessment) { handleLockedWidgetTap(); return; }
            setShowWeeklyDetail(true);
          }}
          className="relative bg-white dark:bg-slate-800 rounded-2xl p-3.5 text-right transition-all hover:shadow-md active:scale-[0.98]"
          style={{
            borderRadius: 14,
            border: '0.5px solid #E0E9FF',
            boxShadow: '0 1px 4px 0 rgba(0,0,0,0.04)',
          }}
        >
          {!hasCompletedAssessment && (
            <div className="absolute top-2.5 left-2.5 z-10">
              <Lock className="w-3.5 h-3.5 text-amber-500" />
            </div>
          )}
          <div className="flex items-center gap-2 mb-1">
            <Dumbbell className="w-4 h-4 text-[#00C9F2]" />
            <span className="text-[10px] font-bold text-gray-400">דקות שבועיות</span>
          </div>
          <div className={!hasCompletedAssessment ? 'opacity-40' : ''}>
            <p className="text-xl font-black text-gray-900 dark:text-white tabular-nums">
              {Math.round(weeklyMinutes)}
              <span className="text-[10px] font-bold text-gray-400 mr-1">/ {goals.weeklyMinutes}</span>
            </p>
          </div>
        </button>

        {/* Steps card */}
        <button
          onClick={handleLockedWidgetTap}
          className="relative bg-white dark:bg-slate-800 rounded-2xl p-3.5 text-right"
          style={{
            borderRadius: 14,
            border: '0.5px solid #E0E9FF',
            boxShadow: '0 1px 4px 0 rgba(0,0,0,0.04)',
          }}
        >
          <div className="flex items-center gap-2 mb-1">
            <Footprints className="w-4 h-4 text-lime-500" />
            <span className="text-[10px] font-bold text-gray-400">צעדים היום</span>
          </div>
          <div className={!hasCompletedAssessment ? 'blur-sm pointer-events-none select-none' : ''}>
            <p className="text-xl font-black text-gray-900 dark:text-white tabular-nums">
              {displaySteps.toLocaleString()}
              <span className="text-[10px] font-bold text-gray-400 mr-1">/ {goals.dailySteps.toLocaleString()}</span>
            </p>
          </div>
        </button>
      </div>

      {/* Nudge Popup — directs user to scroll down to the assessment hero card */}
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
      
      {/* Weekly Detail Modal */}
      <AnimatePresence>
        {showWeeklyDetail && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
            onClick={() => setShowWeeklyDetail(false)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-white dark:bg-slate-800 rounded-3xl p-6 w-full max-w-sm shadow-2xl"
              dir="rtl"
            >
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-xl font-bold text-gray-900 dark:text-white">יעד שבועי</h3>
                <button
                  onClick={() => setShowWeeklyDetail(false)}
                  className="w-8 h-8 rounded-full bg-gray-100 dark:bg-slate-700 flex items-center justify-center"
                >
                  <X className="w-4 h-4 text-gray-500" />
                </button>
              </div>
              
              <div className="flex justify-center mb-6">
                <ConcentricRingsProgress
                  size={180}
                  strokeWidth={16}
                  showCenter={true}
                  centerMode="minutes"
                  showLegend={false}
                  animationDuration={0.8}
                  dynamicCenterColor={true}
                />
              </div>
              
              <div className="space-y-3">
                <p className="text-sm font-bold text-gray-600 dark:text-gray-300">התפלגות לפי קטגוריה</p>
                {ringData.map((ring) => (
                  <div key={ring.id} className="flex items-center gap-3 p-3 bg-gray-50 dark:bg-slate-700/50 rounded-xl">
                    <div className="w-3 h-3 rounded-full" style={{ backgroundColor: ring.color }} />
                    <span className="flex-1 text-sm text-gray-700 dark:text-gray-200">{ring.label}</span>
                    <span className="text-sm font-bold text-gray-900 dark:text-white">{Math.round(ring.value)} דק'</span>
                    <span className="text-xs text-gray-400">({Math.round(ring.percentage)}%)</span>
                  </div>
                ))}
              </div>
              
              <div className="mt-4 pt-4 border-t border-gray-100 dark:border-slate-700 flex items-center justify-between">
                <span className="text-sm text-gray-500">ימים פעילים השבוע</span>
                <span className="text-lg font-bold text-gray-900 dark:text-white">{daysWithActivity} / 7</span>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
