import React, { useMemo, useEffect, useState, useCallback, useRef } from 'react';
import { useUserStore } from '@/features/user';
import { useDashboardMode } from '@/hooks/useDashboardMode';
import { pickHeroExercise, resolveHeroMedia } from './HeroWorkoutCard';
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
import { X, Dumbbell, Footprints, SlidersHorizontal, Lock } from 'lucide-react';
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
import { getPark } from '@/features/parks/core/services/parks.service';
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

  // ── Park Equipment Bridge (temporary filter, never written to profile) ──
  const [parkEquipmentIds, setParkEquipmentIds] = useState<string[]>([]);

  useEffect(() => {
    const parkId = profile?.firstWorkoutParkId;
    if (!parkId) return;
    let cancelled = false;
    getPark(parkId)
      .then((park) => {
        if (cancelled || !park?.gymEquipment?.length) return;
        setParkEquipmentIds(park.gymEquipment.map((eq) => eq.equipmentId));
      })
      .catch((err) => console.warn('[StatsOverview] Park equipment fetch failed:', err));
    return () => { cancelled = true; };
  }, [profile?.firstWorkoutParkId]);

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
      .then(async (entry) => {
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

        // Ensure both runtime caches AND alias map are ready before generation,
        // so Firestore equipment IDs resolve to canonical keys in the useMemo.
        // Cached + deduped — essentially free on repeat calls.
        await ensureEquipmentCachesLoaded();

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
          parkEquipmentIds: parkEquipmentIds.length > 0 ? parkEquipmentIds : undefined,
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
        <div className="relative flex items-center justify-between mb-1">
          <h3 className="text-2xl font-extrabold text-gray-900 dark:text-white">האימון היומי שלך</h3>
          {isGenerated && hasCompletedAssessment && (
            <button
              onClick={() => setIsUserAdjusterOpen(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-gray-100 dark:bg-slate-800 rounded-full text-xs font-bold text-gray-600 dark:text-gray-300 transition-all hover:bg-gray-200 dark:hover:bg-slate-700 active:scale-95"
            >
              <SlidersHorizontal size={14} className="text-cyan-600" />
              התאם
            </button>
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

      {/* Carousel — blurred with lemur teaser overlay when assessment is not completed */}
      <div className="relative">
        <div className={!hasCompletedAssessment ? 'blur-md pointer-events-none select-none' : ''}>
          {trioResult ? (
            <WorkoutSelectionCarousel
              options={trioResult.options}
              isRestDay={trioResult.isRestDay}
              onSelect={handleTrioSelect}
              onStart={handleTrioStart}
              workoutLocation={currentWorkoutLocation}
              programIconKey={primaryDomainId}
              selectedIndex={selectedOptionIndex}
              userGender={profile?.core?.gender}
            />
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
