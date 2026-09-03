"use client";

/**
 * SmartWeeklySchedule Component
 *
 * Enhanced weekly calendar with:
 * - Smart Activity Dots (Cyan=Strength, Lime=Cardio, Purple=Maintenance)
 * - Liquid Momentum Path connecting completed days (rings view)
 * - Ghost Ring for missed days
 * - DayIconCell flame/lemur icons with pager dots (icons view, default)
 */

import React, { useMemo, useState, useRef, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence, type PanInfo } from 'framer-motion';
import { DaySchedule } from '@/features/home/data/mock-schedule-data';
import { Bed, Check, CalendarDays, Footprints, Zap, Timer, TrendingUp, Mountain } from 'lucide-react';
import { useDailyActivity, useWeeklyProgress, useDayStatus, useDateKey, usePastWorkoutCompleted } from '@/features/activity';
import { CompactRingsProgress } from './rings/ConcentricRingsProgress';
import { resolveIconKey, SmartDayIcon, getProgramIcon, CyanDot, PROGRAM_ALIAS_TO_ICON } from '@/features/content/programs/core/program-icon.util';
import { SKILL_DISPLAY } from '@/features/schedule/types/smartSchedule.types';
import { resolveDayDisplayProps, DayIconCell, type DaySessionInput } from '@/features/home/utils/day-display.utils';
import { buildActivityRingData } from '@/features/home/utils/activity-ring.utils';
import MonthlyCalendarGrid from './calendar/MonthlyCalendarGrid';
import type { RecurringTemplate, UserScheduleEntry, ScheduleActivityCategory } from '@/features/user/scheduling/types/schedule.types';
import { getWeekEntries } from '@/features/user/scheduling/services/userSchedule.service';
import { getSundayWeekStart, toISODate } from '@/features/user/scheduling/utils/dateUtils';
import { APP_CONFIG_LINKS } from '@/lib/config/app-urls';
import { resolveRunningCurrentWeek } from '@/features/workout-engine/shared/utils/running-current-week.utils';
import { resolveTodayRunningWorkout } from '@/lib/running-today-workout';
import { excludeRunningShadowEntry } from '@/features/schedule/services/excludeRunningShadowEntry';
import { 
  ACTIVITY_COLORS, 
  ACTIVITY_LABELS,
  STREAK_MINIMUM_MINUTES,
  type ActivityCategory,
  type DailyActivity,
  type RingData,
} from '@/features/activity/types/activity.types';

// ============================================================================
// TYPES
// ============================================================================

type ScheduleViewMode = 'rings' | 'icons';
type CalendarMode = 'week' | 'month';

/** Journey state: Map path (no assessment), Assessment path (no schedule), or Active */
export type ScheduleJourneyState = 'map' | 'assessment' | 'active';

export interface RunningScheduleEntry {
  week: number;
  day: number;
  workoutId: string;
  status: 'pending' | 'completed' | 'skipped' | 'swapped';
  category?: string;
  workoutName?: string;
  actualPerformance?: { avgPace: number; completionRate: number };
}

interface SmartWeeklyScheduleProps {
  schedule: DaySchedule[];
  currentTrack?: 'wellness' | 'performance' | 'running';
  scheduleDays?: string[];
  programIconKey?: string;
  onDayClick?: (day: DaySchedule) => void;
  /** UTS Phase 2 — ISO date of the currently selected day (cyan ring highlight) */
  selectedDate?: string;
  /** UTS Phase 2 — fires when user taps a cell with the ISO date for that day */
  onDaySelect?: (isoDate: string) => void;
  /** UTS Phase 3 — user ID for monthly schedule fetching */
  userId?: string;
  /** UTS Phase 3 — recurring template for monthly schedule hydration */
  recurringTemplate?: RecurringTemplate;
  /** Phase 4 — controlled calendar mode from CalendarSheet (overrides internal state) */
  calendarMode?: CalendarMode;
  /** Phase 4 — fires when the internal toggle is clicked so parent can sync sheet state */
  onCalendarModeChange?: (mode: CalendarMode) => void;
  /** Phase 4 — clip the MonthlyCalendarGrid to this height (px) for the 'split' snap state */
  monthGridMaxHeight?: number;
  /** Phase 5 — dynamic grid sizing for expanded planner mode */
  expandedGridConfig?: {
    cellHeight: number;
    ringSize: number;
    ringStroke: number;
  };
  /** Phase 6 — hide the month/week toggle button, lock to week strip */
  hideMonthToggle?: boolean;
  /** Phase 5 — swipe-down on the week strip triggers this callback (e.g. open planner) */
  onSwipeDown?: () => void;
  /** Tapping "שינוי לוז" triggers this callback (e.g. open the full planner overlay).
   *  When omitted, the button falls back to toggling week/month mode. */
  onOpenPlanner?: () => void;
  /** Journey: Map path (no assessment) vs Assessment path (no schedule) vs Active */
  hasCompletedAssessment?: boolean;
  /** True when user has set scheduleDays */
  hasSchedule?: boolean;
  /** Called when user taps "התחל אבחון" (Map path) */
  onStartAssessment?: () => void;
  /** Called when user taps "קבע לו״ז אימונים" (Assessment path) */
  onSetSchedule?: () => void;
  /** Running program schedule entries for the current week */
  runningSchedule?: RunningScheduleEntry[];
  /**
   * Stage H (18.08.2026) — the active running program's own id
   * (profile.running.activeProgram.programId). Used ONLY to filter
   * buildPlannedSessions' manualEntries: onboarding-sync.service.ts's running
   * bridge seeds `recurringTemplate[day] = [programTemplate.id]` for every
   * running training day specifically so hydrateFromTemplate() produces a
   * userSchedule entry for it — the SAME planned run runningSchedule/
   * runningEntriesByDayIndex already represents, not a second activity.
   * Without this, a running day would double-count as 2 sessions.
   */
  runningProgramId?: string;
  /** Current program week number */
  runningCurrentWeek?: number;
  /** Program start date (ISO or Date) */
  runningProgramStartDate?: string | Date;
  /** Base pace in seconds per km */
  runningBasePace?: number;
  /** Increment to force weekly-strip re-derivation after a schedule mutation */
  scheduleVersion?: number;
  /**
   * ACTIVITY schedule view (Stage 2). When true the strip renders the S10
   * activity RING per day instead of the S8 flame — the two schedules are
   * separate views toggled by the host (health tab). Flame logic is untouched.
   */
  activityView?: boolean;
}

interface DayActivityData {
  hasActivity: boolean;
  isCompleted: boolean;
  /** S8-only: completed an OUT workout (drives the FLAME). Split from the blended isCompleted. */
  workoutDone?: boolean;
  /**
   * True when workoutDone's completion was recovery-only content (video
   * trio / Budget-Floor cooldown) rather than bonus effort — suppresses
   * Beast Mode downstream. Gated by RECOVERY_DAY_BADGE_FIX_ENABLED.
   */
  isRecoveryCompletion?: boolean;
  isMissed: boolean;
  isRest: boolean;
  isToday: boolean;
  isFuture: boolean;
  totalMinutes: number;
  steps: number;
  calories: number;
  categories: {
    strength: number;
    cardio: number;
    maintenance: number;
  };
  dominantCategory: ActivityCategory | null;
  /**
   * Phase 3 — Cross-Day Debt Clearing.
   * True if THIS day is a missed planned day whose workout was made up
   * on a later (rest) day in the same ISO week.
   */
  debtCleared: boolean;
  /** Icon key override for days that have a community training entry. */
  communityIconKey?: string;
  /** Primary personal schedule entry for this day — used for per-entry icon resolution. */
  primaryEntry?: UserScheduleEntry;
  /**
   * Stage H (18.08.2026) — every distinct activity/goal relevant to this day,
   * completed or planned. Fed to resolveDayDisplayProps so DayIconCell can
   * alternate between them (2+) instead of collapsing to one. Completed axis:
   * useDayStatus().sessions (real logged category-minutes). Planned axis:
   * scheduled entries (weekScheduleEntries) + the running program's entry for
   * the day, merged — see buildPlannedSessions().
   */
  sessions?: DaySessionInput[];
  /**
   * True when `sessions` above came from the completed/activity axis
   * (useDayStatus().sessions, non-empty) rather than the planned fallback.
   * Deliberately independent of `isCompleted`/`workoutDone` (the WORKOUT
   * axis, which the isRunningMode block below can also override) — see
   * DayDisplayInput.sessionsCompleted's doc for why these must stay decoupled.
   */
  sessionsCompleted?: boolean;
}

// ============================================================================
// CONSTANTS
// ============================================================================

const HEBREW_DAYS = ['א', 'ב', 'ג', 'ד', 'ה', 'ו', 'ש'] as const;

// Dot colors from activity.types.ts
const DOT_COLORS = {
  strength: ACTIVITY_COLORS.strength.hex,    // #06B6D4 (Cyan)
  cardio: ACTIVITY_COLORS.cardio.hex,        // #84CC16 (Lime)
  maintenance: ACTIVITY_COLORS.maintenance.hex, // #A855F7 (Purple)
} as const;

// Default goals for mini rings
const MINI_RING_GOALS = {
  strength: 30,
  cardio: 20,
  maintenance: 15,
} as const;

// ── Running Workout Category → Color (Admin Panel sync) ──
const CATEGORY_COLORS: Record<string, string> = {
  easy_run:             '#4CAF50',
  long_run:             '#2E7D32',
  short_intervals:      '#E11D48',
  long_intervals:       '#0D9488',
  fartlek_easy:         '#CE93D8',
  fartlek_structured:   '#AB47BC',
  tempo:                '#9C27B0',
  hill_long:            '#FF7043',
  hill_short:           '#EF6C00',
  hill_sprints:         '#DC2626',
  strides:              '#00BAF7',
  recovery:             '#B0BEC5',
};

const CATEGORY_LABELS_HE: Record<string, string> = {
  easy_run:             'ריצה קלה',
  long_run:             'ריצה ארוכה',
  short_intervals:      'אינטרוולים קצרים',
  long_intervals:       'אינטרוולים ארוכים',
  fartlek_easy:         'פארטלק קל',
  fartlek_structured:   'פארטלק מובנה',
  tempo:                'ריצת טמפו',
  hill_long:            'עליות ארוכות',
  hill_short:           'עליות קצרות',
  hill_sprints:         'ספרינט עליות',
  strides:              'סטריידים',
  recovery:             'התאוששות',
};

function getCategoryColor(category: string | undefined): string {
  if (!category) return '#00BAF7';
  return CATEGORY_COLORS[category] ?? '#00BAF7';
}

function getCategoryLabel(category: string | undefined): string {
  if (!category) return 'אימון ריצה';
  return CATEGORY_LABELS_HE[category] ?? category;
}

/** ScheduleActivityCategory (includes 'walking') → the 3-way ActivityCategory bucket. */
function toActivityCategory(cat?: ScheduleActivityCategory): ActivityCategory {
  if (cat === 'maintenance') return 'maintenance';
  if (cat === 'cardio' || cat === 'walking') return 'cardio';
  return 'strength';
}

/**
 * Stage H (18.08.2026) — planned-axis session list for one day: one
 * DaySessionInput per scheduled training entry (weekScheduleEntries —
 * manual/recurring/community) plus the running program's entry for that day
 * when present and not yet completed. Mirrors the per-entry icon-resolution
 * rules already used for the single `primaryEntry` (communityIconKey /
 * resolveIconKey) — applied to every entry instead of only the first one, so
 * a day with 2+ scheduled activities (e.g. a personal + a community session,
 * or a scheduled run alongside a scheduled strength session) can alternate
 * between all of them instead of collapsing to one. Reuses the same two
 * already-fetched data sources the single-entry path uses — no new counting
 * mechanism, no new Firestore reads.
 *
 * runningProgramId excludes the ONE manual entry that double-represents the
 * running program's own scheduled run (David caught this, 18.08.2026):
 * onboarding-sync.service.ts's running bridge seeds
 * recurringTemplate[day] = [programTemplate.id] for every running training
 * day specifically so hydrateFromTemplate() materializes a userSchedule doc
 * for it — that doc surfaces here as a manualEntries entry with
 * programIds[0] === the running program's own id, representing the SAME
 * planned run `runEntry` below already represents via a completely separate
 * data source (profile.running.activeProgram.schedule). Without this filter,
 * a plain running day (nothing else scheduled) would wrongly show 2 dots for
 * 1 real activity.
 */
function buildPlannedSessions(
  manualEntries: UserScheduleEntry[],
  runEntry: RunningScheduleEntry | undefined,
  runningProgramId: string | undefined,
): DaySessionInput[] {
  const sessions: DaySessionInput[] = excludeRunningShadowEntry(manualEntries, runningProgramId)
    .filter((e) => e.type === 'training')
    .map((e) => ({
      category: toActivityCategory(e.scheduledCategories?.[0]),
      minutes: 0,
      programIconKey:
        e.source === 'community'
          ? PROGRAM_ALIAS_TO_ICON[e.scheduledCategories?.[0] ?? '']
          : resolveIconKey(e.programIds?.[0] ?? e.scheduledCategories?.[0]),
    }));

  if (runEntry && runEntry.status === 'pending') {
    sessions.push({
      category: 'cardio',
      minutes: 0,
      runningCategory: runEntry.category,
      runningColor: runEntry.category ? getCategoryColor(runEntry.category) : undefined,
    });
  }

  return sessions;
}

// Helper to build RingData array from day categories
function buildMiniRingData(
  categories: { strength: number; cardio: number; maintenance: number }
): RingData[] {
  const rings: RingData[] = [];
  
  (['strength', 'cardio', 'maintenance'] as ActivityCategory[]).forEach((cat, index) => {
    const minutes = categories[cat];
    if (minutes > 0) {
      const goal = MINI_RING_GOALS[cat];
      rings.push({
        id: cat,
        label: ACTIVITY_LABELS[cat].he,
        value: minutes,
        max: goal,
        percentage: Math.min((minutes / goal) * 100, 100),
        color: DOT_COLORS[cat],
        colorClass: ACTIVITY_COLORS[cat].tailwind,
        order: index,
        icon: cat === 'strength' ? 'dumbbell' : cat === 'cardio' ? 'heart' : 'sparkles',
      });
    }
  });
  
  return rings;
}

// ============================================================================
// DUMMY PREVIEW SCHEDULE
// Vibrant mock activity shown blurred behind the glass scrim when the user
// has no schedule set yet (hasSchedule === false). Gives the frosted overlay
// a rich calisthenics depth cue without touching any real user data.
// ============================================================================

/** Training days used by the preview (Sun / Tue / Thu). */
const DUMMY_PREVIEW_SCHEDULE_DAYS: readonly string[] = ['א', 'ג', 'ה'];

function buildDummyActivityMap(): Map<number, DayActivityData> {
  const restDay: DayActivityData = {
    hasActivity: false,
    isCompleted: false,
    isMissed: false,
    isRest: true,
    isToday: false,
    isFuture: false,
    totalMinutes: 0,
    steps: 0,
    calories: 0,
    categories: { strength: 0, cardio: 0, maintenance: 0 },
    dominantCategory: null,
    debtCleared: false,
  };

  // "today pending" template — forces resolveDayDisplayProps into the
  // state==='today' && !isCompleted branch which is the only path that
  // returns bgOpacity:1 (solid fill). This guarantees a fully opaque
  // category-coloured square that bleeds through the glass scrim as a
  // vivid halo even after filter:blur + opacity on the wrapper.
  const trainingBase: DayActivityData = {
    ...restDay,
    isRest: false,
    isToday: true,    // drives state='today' → solid fill in DayDisplayProps
    isCompleted: false,
    categories: { strength: 0, cardio: 0, maintenance: 0 }, // no sessions → single icon
  };

  const map = new Map<number, DayActivityData>();
  for (let i = 0; i < 7; i++) map.set(i, { ...restDay });

  // Sunday (0) — Planche Skill Focus → solid cyan square
  map.set(0, { ...trainingBase, dominantCategory: 'strength' });

  // Tuesday (2) — Front Lever & Pull Volume → solid lime square
  map.set(2, { ...trainingBase, dominantCategory: 'cardio' });

  // Thursday (4) — Handstand & Push Day → solid cyan square
  map.set(4, { ...trainingBase, dominantCategory: 'strength' });

  return map;
}

const DUMMY_ACTIVITY_MAP: Map<number, DayActivityData> = buildDummyActivityMap();

// ============================================================================
// ACTIVITY DOTS COMPONENT
// ============================================================================

function ActivityDots({ 
  categories, 
  isCompleted 
}: { 
  categories: { strength: number; cardio: number; maintenance: number }; 
  isCompleted: boolean;
}) {
  const activeDots = Object.entries(categories)
    .filter(([_, minutes]) => minutes > 0)
    .map(([category]) => category as ActivityCategory);
  
  if (activeDots.length === 0) return null;
  
  return (
    <div className="flex items-center justify-center gap-1 mt-1.5">
      {activeDots.map((category) => (
        <motion.div
          key={category}
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ type: 'spring', stiffness: 500, damping: 25 }}
          className="w-2 h-2 rounded-full transition-all"
          style={{
            backgroundColor: isCompleted ? DOT_COLORS[category] : 'transparent',
            border: isCompleted ? 'none' : `1.5px solid ${DOT_COLORS[category]}`,
          }}
          title={ACTIVITY_LABELS[category].he}
        />
      ))}
    </div>
  );
}

// ============================================================================
// LIQUID PATH COMPONENT (SVG connecting completed days)
// ============================================================================

function LiquidMomentumPath({ 
  completedIndices, 
  dominantColor,
  containerWidth,
}: { 
  completedIndices: number[]; 
  dominantColor: string;
  containerWidth: number;
}) {
  if (completedIndices.length < 2) return null;
  
  // Calculate positions for each day (assuming 7 days evenly spaced)
  const dayWidth = containerWidth / 7;
  const centerY = 20; // Center of the day circles
  
  // Build path segments between consecutive completed days
  const pathSegments: string[] = [];
  
  for (let i = 0; i < completedIndices.length - 1; i++) {
    const currentIdx = completedIndices[i];
    const nextIdx = completedIndices[i + 1];
    
    // Only connect if they're consecutive or close
    if (nextIdx - currentIdx === 1) {
      const x1 = dayWidth * currentIdx + dayWidth / 2;
      const x2 = dayWidth * nextIdx + dayWidth / 2;
      
      // Create a curved path between days
      const controlY = centerY - 8; // Slight curve upward
      pathSegments.push(
        `M ${x1} ${centerY} Q ${(x1 + x2) / 2} ${controlY} ${x2} ${centerY}`
      );
    }
  }
  
  if (pathSegments.length === 0) return null;
  
  return (
    <svg 
      className="absolute top-1/2 left-0 right-0 -translate-y-1/2 pointer-events-none z-0"
      width="100%" 
      height="40"
      style={{ overflow: 'visible' }}
    >
      <defs>
        <linearGradient id="liquidGradient" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor={dominantColor} stopOpacity="0.3" />
          <stop offset="50%" stopColor={dominantColor} stopOpacity="0.6" />
          <stop offset="100%" stopColor={dominantColor} stopOpacity="0.3" />
        </linearGradient>
        <filter id="liquidGlow" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur in="SourceGraphic" stdDeviation="3" result="blur" />
          <feMerge>
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>
      {pathSegments.map((d, idx) => (
        <motion.path
          key={idx}
          d={d}
          fill="none"
          stroke="url(#liquidGradient)"
          strokeWidth="4"
          strokeLinecap="round"
          filter="url(#liquidGlow)"
          initial={{ pathLength: 0, opacity: 0 }}
          animate={{ pathLength: 1, opacity: 1 }}
          transition={{ duration: 0.8, delay: idx * 0.15 }}
        />
      ))}
    </svg>
  );
}

// ============================================================================
// DAY TOOLTIP COMPONENT
// ============================================================================


// ============================================================================
// RUNNING WORKOUT CARDS — Daily Focus View
// Shows only today's workout, or a rest-day state with "Next Up" teaser.
// Completed workouts this week appear as compact cards below.
// ============================================================================

function RunningWorkoutCards({
  entries,
  currentWeek,
  basePace,
  onCardClick,
  todayScheduleDay,
}: {
  entries: RunningScheduleEntry[];
  currentWeek: number;
  basePace: number;
  onCardClick: (entry: RunningScheduleEntry) => void;
  todayScheduleDay?: number;
}) {
  if (entries.length === 0) return null;

  // Split entries: today's workout vs the rest. Decision logic lives in
  // resolveTodayRunningWorkout (src/lib/running-today-workout.ts, pure +
  // unit-tested — this component has no jsdom coverage) — 02.09.2026 fix:
  // the removed else-branch here used to fall back to "first pending entry
  // in the week" whenever todayScheduleDay was nullish, which is exactly
  // what a real rest day looks like — so isRestDay could never become true.
  //
  // 02.09.2026, revised same day: on a rest day this area shows NOTHING
  // about "today" — no title, no workout card, and (deliberately) no rest
  // card either, even though one was briefly built here. adaptive-schedule-
  // map.md §5 documents six already-competing missed/rest/return message
  // systems and warns explicitly against adding a seventh; a second rest
  // card at the top of the screen would be exactly that. The only rest-day
  // messaging lives in the carousel below (recovery workout + videos). What
  // stays visible here on a rest day is data, not messaging: the week/count
  // line and the completed-workouts list. `nextUpEntry` is intentionally
  // not consumed here anymore — see the pure function's own doc comment for
  // why it's still returned (other callers may want it).
  const { todayEntry, isRestDay } = resolveTodayRunningWorkout(entries, todayScheduleDay);

  const completedEntries = entries.filter((e) => e.status === 'completed');
  const completedCount = completedEntries.length;

  return (
    <div className="mt-4 space-y-2.5" dir="rtl">
      <div className="flex items-center justify-between px-1 mb-1">
        {/* h3 always renders (empty on a rest day) so this row always has
            two flex children — otherwise `justify-between` collapses to a
            single child and the counter jumps from the end edge to the
            start edge between rest/training days. */}
        <h3 className="text-sm font-bold text-gray-700 dark:text-gray-300">
          {!isRestDay && 'האימון שלך היום'}
        </h3>
        <span className="text-[11px] font-medium text-gray-400">
          שבוע {currentWeek} · {completedCount}/{entries.length}
        </span>
      </div>

      {/* ── Today's workout (primary focus) ── */}
      {todayEntry && (
        <TodayWorkoutCard
          entry={todayEntry}
          onCardClick={onCardClick}
        />
      )}

      {/* ── Completed this week (compact) ── */}
      {completedCount > 0 && (
        <div className="space-y-1.5 mt-1">
          {completedEntries.map((entry) => (
            <CompactWorkoutCard key={`${entry.week}-${entry.day}`} entry={entry} />
          ))}
        </div>
      )}
    </div>
  );
}

// ============================================================================
// TODAY WORKOUT CARD — full-size, tappable primary card
// ============================================================================

function TodayWorkoutCard({
  entry,
  onCardClick,
}: {
  entry: RunningScheduleEntry;
  onCardClick: (entry: RunningScheduleEntry) => void;
}) {
  const color = getCategoryColor(entry.category);
  const label = entry.workoutName || getCategoryLabel(entry.category);

  return (
    <motion.button
      onClick={() => onCardClick(entry)}
      whileTap={{ scale: 0.97 }}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="w-full flex items-stretch rounded-2xl overflow-hidden text-right ring-2 ring-offset-1"
      style={{
        border: '0.5px solid #E0E9FF',
        boxShadow: `0 0 12px ${color}30, 0 2px 8px rgba(0,0,0,0.04)`,
        ['--tw-ring-color' as string]: color,
        background: 'white',
      }}
    >
      <div
        className="flex-shrink-0"
        style={{ width: 4, backgroundColor: color, borderRadius: '0 8px 8px 0' }}
      />
      <div className="flex items-center gap-3 flex-1 py-3.5 px-4 min-w-0">
        <div
          className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
          style={{ background: `${color}15`, color }}
        >
          {getCategoryIcon(entry.category, 'w-5 h-5')}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className="text-sm font-bold text-gray-900 dark:text-white truncate">
              {label}
            </p>
            <span
              className="text-[10px] font-bold px-2 py-0.5 rounded-full text-white flex-shrink-0"
              style={{ background: color }}
            >
              היום
            </span>
          </div>
          <span className="text-xs text-gray-400 mt-0.5">
            אימון {entry.day}
          </span>
        </div>
        <svg width="7" height="12" viewBox="0 0 7 12" fill="none" className="text-gray-300 rotate-180 flex-shrink-0">
          <path d="M1 1L6 6L1 11" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </div>
    </motion.button>
  );
}

// ============================================================================
// COMPACT WORKOUT CARD — slim row for completed / upcoming entries
// Shows: Icon · Workout Name · Duration estimate · Checkmark
// ============================================================================

const CATEGORY_DURATION_ESTIMATE: Record<string, string> = {
  easy_run: '25–35 דק׳',
  recovery: '20–25 דק׳',
  short_intervals: '30–40 דק׳',
  long_intervals: '35–45 דק׳',
  fartlek_easy: '30–35 דק׳',
  fartlek_structured: '35–40 דק׳',
  tempo: '30–40 דק׳',
  long_run: '45–60 דק׳',
  hill_long: '35–45 דק׳',
  hill_short: '25–35 דק׳',
  hill_sprints: '25–30 דק׳',
  strides: '25–30 דק׳',
};

function CompactWorkoutCard({ entry }: { entry: RunningScheduleEntry }) {
  const color = getCategoryColor(entry.category);
  const isCompleted = entry.status === 'completed';
  const isSkipped = entry.status === 'skipped';
  const label = entry.workoutName || getCategoryLabel(entry.category);
  const durationHint = CATEGORY_DURATION_ESTIMATE[entry.category ?? ''] ?? '30 דק׳';

  return (
    <div
      className="flex items-center gap-2.5 rounded-xl py-2 px-3 text-right"
      style={{
        border: '0.5px solid #E0E9FF',
        background: 'white',
        opacity: isCompleted || isSkipped ? 0.65 : 1,
      }}
    >
      <div
        className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0"
        style={{ background: `${color}12`, color }}
      >
        {isCompleted ? (
          <Check className="w-3.5 h-3.5 text-green-500" />
        ) : (
          getCategoryIcon(entry.category, 'w-3.5 h-3.5')
        )}
      </div>
      <p className={`text-[13px] font-semibold flex-1 min-w-0 truncate ${
        isCompleted ? 'text-gray-400 line-through' : 'text-gray-700 dark:text-gray-200'
      }`}>
        {label}
      </p>
      <span className="text-[11px] text-gray-400 tabular-nums flex-shrink-0">
        {durationHint}
      </span>
      {isCompleted && (
        <div className="w-5 h-5 rounded-full bg-green-100 flex items-center justify-center flex-shrink-0">
          <Check className="w-3 h-3 text-green-600" />
        </div>
      )}
    </div>
  );
}

// ============================================================================
// RUNNING DAY ICON (color-coded for calendar strip)
// ============================================================================

function getCategoryIcon(category: string | undefined, className: string) {
  switch (category) {
    case 'short_intervals':
    case 'long_intervals':
      return <Zap className={className} />;
    case 'tempo':
      return <Timer className={className} />;
    case 'long_run':
      return <TrendingUp className={className} />;
    case 'hill_long':
    case 'hill_short':
    case 'hill_sprints':
      return <Mountain className={className} />;
    default:
      return <Footprints className={className} />;
  }
}

function RunningDayIcon({
  entry,
  isToday,
}: {
  entry: RunningScheduleEntry | undefined;
  isToday: boolean;
}) {
  if (!entry) return null;
  const color = getCategoryColor(entry.category);
  const isCompleted = entry.status === 'completed';

  if (isCompleted) {
    return (
      <motion.div
        initial={{ scale: 0.8 }}
        animate={{ scale: 1 }}
        className="w-9 h-9 rounded-full flex items-center justify-center text-white shadow-sm"
        style={{ backgroundColor: color, boxShadow: `0 3px 10px ${color}40` }}
      >
        <Check className="w-5 h-5 stroke-[3]" />
      </motion.div>
    );
  }

  const iconColor = isToday ? color : `${color}80`;

  return (
    <div
      className="flex items-center justify-center"
      style={{
        width: 44,
        height: 44,
        color: iconColor,
        filter: isToday ? `drop-shadow(0 0 6px ${color}60)` : undefined,
      }}
    >
      {getCategoryIcon(entry.category, 'w-5 h-5')}
    </div>
  );
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export default function SmartWeeklySchedule({ 
  schedule, 
  currentTrack = 'wellness',
  scheduleDays = [],
  programIconKey,
  onDayClick,
  selectedDate,
  onDaySelect,
  userId,
  recurringTemplate,
  calendarMode: externalCalendarMode,
  onCalendarModeChange,
  monthGridMaxHeight,
  expandedGridConfig,
  hideMonthToggle = false,
  onSwipeDown,
  onOpenPlanner,
  hasCompletedAssessment = false,
  hasSchedule = true,
  onStartAssessment,
  onSetSchedule,
  runningSchedule,
  runningCurrentWeek,
  runningProgramStartDate,
  runningBasePace,
  runningProgramId,
  scheduleVersion,
  activityView = false,
}: SmartWeeklyScheduleProps) {
  const router = useRouter();
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(0);
  const [internalCalendarMode, setInternalCalendarMode] = useState<CalendarMode>('week');
  const calendarMode = externalCalendarMode ?? internalCalendarMode;
  const toggleCalendarMode = useCallback(() => {
    const next: CalendarMode = calendarMode === 'week' ? 'month' : 'week';
    if (onCalendarModeChange) {
      onCalendarModeChange(next);
    } else {
      setInternalCalendarMode(next);
    }
  }, [calendarMode, onCalendarModeChange]);


  const isHealthMode = currentTrack === 'wellness';
  const isRunningMode = currentTrack === 'running';
  const plannedDotColor = isRunningMode ? '#00BAF7' : '#00C9F2';

  // Infer workout category from day position in the frequency cycle
  const freq = scheduleDays.length || 3;

  // Canonical current-week resolution (flag-gated recompute; falls back to
  // the `runningCurrentWeek` prop exactly as today while
  // RUNNING_CURRENT_WEEK_RECOMPUTE_ENABLED is false). Activates the
  // previously-plumbed-but-dead `runningProgramStartDate` prop instead of
  // trusting the (possibly stale) `runningCurrentWeek` prop directly.
  const effectiveCurrentWeek = resolveRunningCurrentWeek(runningProgramStartDate, runningCurrentWeek);

  const currentWeekEntries = useMemo(() => {
    if (!isRunningMode || !runningSchedule?.length || !effectiveCurrentWeek) return [];
    const entries = runningSchedule.filter((e) => e.week === effectiveCurrentWeek);
    return entries.map((entry) => ({
      ...entry,
      category: entry.category || 'easy_run',
      workoutName: entry.workoutName || (CATEGORY_LABELS_HE[entry.category ?? ''] ?? 'אימון ריצה'),
    }));
  }, [isRunningMode, runningSchedule, effectiveCurrentWeek]);

  // Map running schedule entries to week day indices (0=Sunday)
  const runningEntriesByDayIndex = useMemo(() => {
    if (!isRunningMode || !currentWeekEntries.length) return new Map<number, RunningScheduleEntry>();
    const map = new Map<number, RunningScheduleEntry>();
    const trainingDayIndices = scheduleDays
      .map((letter) => HEBREW_DAYS.indexOf(letter as typeof HEBREW_DAYS[number]))
      .filter((i) => i >= 0)
      .sort((a, b) => a - b);
    currentWeekEntries.forEach((entry) => {
      // entry.day is 1-indexed (1st workout, 2nd workout, …)
      const slotIndex = entry.day - 1;
      const dayIdx = trainingDayIndices[slotIndex];
      if (dayIdx !== undefined) map.set(dayIdx, entry);
    });
    return map;
  }, [isRunningMode, currentWeekEntries, scheduleDays]);

  const handleRunCardClick = useCallback((entry: RunningScheduleEntry) => {
    const params = new URLSearchParams();
    params.set('workoutId', entry.workoutId);
    params.set('week', String(entry.week));
    params.set('day', String(entry.day));
    params.set('context', 'running');
    router.push(`/map?${params.toString()}`);
  }, [router]);

  // View mode: Phase 5 dots-only DayIconCell is the canonical view for
  // every track. The toggle still lets users opt in to the legacy rings
  // view for activity-progress detail.
  // View mode is locked to 'icons' since the rings/icons toggle button was
  // removed. Kept as a typed local so all the existing `viewMode` / `useIconView`
  // branches keep working without churn.
  const viewMode: ScheduleViewMode = 'icons';
  
  // Get activity data from the Activity store
  const { 
    todayActivity, 
    dominantColor, 
    streak,
    isLoading: activityLoading,
    userProgram,
  } = useDailyActivity();

  const resolvedIconKey = useMemo(() => {
    const key = resolveIconKey(programIconKey, userProgram);
    return key;
  }, [programIconKey, userProgram]);
  
  const { 
    summary: weeklySummary,
    daysWithActivity,
  } = useWeeklyProgress();
  
  // Centralized day-status brain — encapsulates the Completion Bridge and
  // icon-priority logic. Returns a stable getter to use inside useMemo.
  const getDayStatus = useDayStatus();

  // Subscribe to the global midnight clock so the weekly strip's "today"
  // index advances at 00:00 without a hard refresh.
  const dateKey = useDateKey();
  
  // Measure container width for liquid path
  useEffect(() => {
    const updateWidth = () => {
      if (containerRef.current) {
        setContainerWidth(containerRef.current.offsetWidth - 16); // Subtract padding
      }
    };
    updateWidth();
    window.addEventListener('resize', updateWidth);
    return () => window.removeEventListener('resize', updateWidth);
  }, []);

  // Per-date manual schedule entries for the current week.
  // Keyed by ISO date; populated from Firestore so the strip can prefer an
  // explicit rest/training override over the recurring template.
  const [weekScheduleEntries, setWeekScheduleEntries] = useState<Map<string, UserScheduleEntry[]>>(new Map());

  // Section B (31.08.2026): weekScheduleEntries starts empty on every mount (it's
  // local state — a remount, not just a cold app boot, resets it), so the very
  // first paint falls back to the recurring-template guess before this fetch
  // resolves. On a day whose real status comes from a manual override (diverging
  // from the recurring template), that guess is visibly wrong for the ~1-2s this
  // fetch takes — live-measured, not assumed — then flips once real data lands.
  // Blocking a loading gate on it was considered and rejected: it's local state,
  // so the same gap reopens on every return-to-home navigation, not just cold
  // boot, and the fetch is too slow to add to a blocking gate at that frequency
  // regardless of the exact number. entriesLoaded instead drives a per-icon
  // skeleton below (zero layout shift — same fixed-size slot either way) so the
  // strip never shows a guess that might be wrong, only a neutral pulse until
  // the real value is known.
  const [entriesLoaded, setEntriesLoaded] = useState(false);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    const sundayISO = getSundayWeekStart(new Date());
    getWeekEntries(userId, sundayISO)
      .then((entries) => {
        if (cancelled) return;
        const byDate = new Map<string, UserScheduleEntry[]>();
        for (const entry of entries) {
          const list = byDate.get(entry.date) ?? [];
          list.push(entry);
          byDate.set(entry.date, list);
        }
        setWeekScheduleEntries(byDate);
        setEntriesLoaded(true);
      })
      .catch(() => {
        // non-critical — strip falls back to scheduleDays, but still stop
        // showing the skeleton so a fetch failure doesn't pulse forever.
        if (!cancelled) setEntriesLoaded(true);
      });
    return () => { cancelled = true; };
  }, [userId, scheduleVersion]);

  // Past-day workout completion (S8 dailyProgress) for this week — shared hook,
  // single source with the month grid. Feeds workoutDone for PAST days so a past
  // flame lights on a real completed OUT workout, not the S7 scheduleCompleted flag.
  const weekPastIsos = useMemo(() => {
    const today = new Date();
    const todayIndex = today.getDay();
    const isos: string[] = [];
    for (let i = 0; i < todayIndex; i++) {
      const d = new Date(today);
      d.setDate(today.getDate() - todayIndex + i);
      isos.push(toISODate(d));
    }
    return isos;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dateKey]);
  const { completedMap: pastProgressMap, recoveryMap: pastRecoveryMap } = usePastWorkoutCompleted(userId, weekPastIsos);

  // Normalize selected days from props
  const selectedDays = scheduleDays || [];
  
  // Helper to check if a day is a training day
  const isTrainingDay = (dayLetter: string) => selectedDays.includes(dayLetter);
  
  // Build activity data for each day of the week
  const weekActivityData = useMemo((): Map<number, DayActivityData> => {
    const map = new Map<number, DayActivityData>();
    const today = new Date();
    const todayIndex = today.getDay();
    
    // Process each day of the week
    for (let i = 0; i < 7; i++) {
      const dayLetter = HEBREW_DAYS[i];
      const isToday = i === todayIndex;
      const isFuture = i > todayIndex;

      // Compute ISO date for this day index within the current week.
      // The week is Sunday-anchored (i=0=Sun, …, i=6=Sat).
      const dayDate = new Date(today);
      dayDate.setDate(today.getDate() - todayIndex + i);
      const isoDate = toISODate(dayDate);

      // Manual userSchedule entries for this date take priority over the
      // recurring template (scheduleDays). An explicit rest entry makes the
      // day rest; an explicit training entry makes it training — regardless
      // of whether the day letter is in scheduleDays.
      const manualEntries = weekScheduleEntries.get(isoDate) ?? [];
      const hasManualTraining = manualEntries.some((e) => e.type === 'training');
      const hasManualRest     = manualEntries.some((e) => e.type === 'rest');
      const isRestDay = hasManualRest
        ? true
        : hasManualTraining
          ? false
          : !isTrainingDay(dayLetter);

      const communityEntry = manualEntries.find(
        (e) => e.source === 'community' && e.type === 'training'
      );
      const communityIconKey: string | undefined = communityEntry
        ? (PROGRAM_ALIAS_TO_ICON[communityEntry.scheduledCategories?.[0] ?? ''] ?? undefined)
        : undefined;

      // Stage H (18.08.2026) — planned-axis sessions for this day, from the
      // same two already-fetched sources used elsewhere in this loop
      // (manualEntries below, runningEntriesByDayIndex above). Used as-is for
      // future days; used as today's fallback when nothing's been done yet.
      const plannedSessions = buildPlannedSessions(
        manualEntries,
        isRunningMode ? runningEntriesByDayIndex.get(i) : undefined,
        isRunningMode ? runningProgramId : undefined,
      );

      // Default data
      let dayData: DayActivityData = {
        hasActivity: false,
        isCompleted: false,
        workoutDone: false,
        isRecoveryCompletion: false,
        isMissed: false,
        isRest: isRestDay,
        isToday,
        isFuture,
        totalMinutes: 0,
        steps: 0,
        calories: 0,
        categories: { strength: 0, cardio: 0, maintenance: 0 },
        dominantCategory: null,
        debtCleared: false,
        communityIconKey,
        primaryEntry: manualEntries.find((e) => e.type === 'training' && e.source !== 'community')
          ?? manualEntries.find((e) => e.type === 'training')
          ?? manualEntries[0],
        sessions: isFuture ? plannedSessions : [],
        sessionsCompleted: false,
      };

      const scheduleDay = schedule.find(s => s.day === dayLetter);

      // workoutDone: today → S8 (live todayProgress); past → S8 (dailyProgress via
      // usePastWorkoutCompleted), NOT the S7 scheduleCompleted flag. useDayStatus
      // still bridges real per-category activity minutes for the ring.
      if (!isFuture) {
        const status = getDayStatus(
          isoDate,
          pastProgressMap.get(isoDate) ?? false,
          pastRecoveryMap.get(isoDate) ?? false,
        );
        dayData = {
          ...dayData,
          hasActivity: status.hasActivity,
          isCompleted: status.isCompleted,
          workoutDone: status.workoutDone,
          isRecoveryCompletion: status.isRecoveryCompletion,
          totalMinutes: status.totalMinutes,
          categories: status.categories,
          dominantCategory: status.dominantCategory,
          // Keep steps/calories from the store when available (today only)
          steps: isToday && todayActivity ? todayActivity.steps : dayData.steps,
          calories: isToday && todayActivity ? todayActivity.calories : dayData.calories,
          // Stage H: real logged sessions when there are any; for today with
          // nothing done yet, fall back to what's planned (today hasn't
          // happened yet either — same "planned" bucket as a future day).
          // Past days with nothing logged keep [] — allowMulti requires
          // sessionsCompleted for past anyway, so it's unused there regardless.
          sessions: status.sessions.length > 0 ? status.sessions : (isToday ? plannedSessions : []),
          sessionsCompleted: status.sessions.length > 0,
        };
        // Mark missed: past training day with no activity and not completed.
        // Prefer the manual entry override; fall back to scheduleDay / scheduleDays.
        if (!isToday && !status.isCompleted) {
          const isTraining = hasManualRest
            ? false
            : hasManualTraining
              ? true
              : scheduleDay
                ? scheduleDay.status !== 'rest'
                : isTrainingDay(dayLetter);
          if (isTraining) dayData.isMissed = true;
        }
      }
      
      // Running mode: completion is determined by running entries, not the
      // generic schedule prop (which hard-codes past training days as completed).
      if (isRunningMode) {
        const runEntry = runningEntriesByDayIndex.get(i);
        if (runEntry) {
          dayData = {
            ...dayData,
            hasActivity: runEntry.status === 'completed',
            isCompleted: runEntry.status === 'completed',
            isMissed: runEntry.status === 'skipped',
          };
        } else if (!isRestDay) {
          dayData = {
            ...dayData,
            hasActivity: false,
            isCompleted: false,
            isMissed: false,
          };
        }
      }

      map.set(i, dayData);
    }

    // ── Phase 5: One-to-One Debt Clearing ────────────────────────────────
    // A makeup = a past rest-day on which the user actually completed a
    // workout. Each makeup clears EXACTLY ONE missed training day — the
    // oldest still-unpaired missed day that occurred *before* the makeup.
    //
    // Algorithm:
    //   1. Collect past missed-training indices in chronological order.
    //   2. Collect past makeup-rest indices in chronological order.
    //   3. For each makeup (earliest first), pair it with the oldest
    //      unpaired missed day whose index < makeup index.
    //   4. Flip `debtCleared` on the paired missed day.
    //
    // This prevents one makeup from inflating the streak by clearing every
    // prior missed day in the week.
    const missedQueue: number[] = [];
    const makeupQueue: number[] = [];
    for (let i = 0; i < todayIndex; i++) {
      const day = map.get(i);
      if (!day) continue;
      if (day.isMissed) missedQueue.push(i);
      if (day.isRest && day.hasActivity && day.isCompleted) makeupQueue.push(i);
    }

    for (const makeupIdx of makeupQueue) {
      // Find the oldest missed day strictly before this makeup that is
      // still unpaired (hasn't been spliced out yet).
      const pairIdxInQueue = missedQueue.findIndex((m) => m < makeupIdx);
      if (pairIdxInQueue === -1) continue;
      const pairedMissedIdx = missedQueue[pairIdxInQueue];
      missedQueue.splice(pairIdxInQueue, 1);

      const missedDay = map.get(pairedMissedIdx);
      if (missedDay) {
        map.set(pairedMissedIdx, { ...missedDay, debtCleared: true });
      }
    }

    return map;
  }, [schedule, scheduleDays, todayActivity, getDayStatus, dateKey, isRunningMode, runningEntriesByDayIndex, runningProgramId, scheduleVersion, weekScheduleEntries, pastProgressMap]);
  
  // Get indices of completed days for the liquid path
  const completedIndices = useMemo(() => {
    const indices: number[] = [];
    weekActivityData.forEach((data, index) => {
      if (data.isCompleted) {
        indices.push(index);
      }
    });
    return indices;
  }, [weekActivityData]);
  
  // Calculate remaining workouts this week
  const remainingWorkouts = useMemo(() => {
    const todayIndex = new Date().getDay();
    let remaining = 0;
    selectedDays.forEach(dayLetter => {
      const dayIndex = HEBREW_DAYS.indexOf(dayLetter as typeof HEBREW_DAYS[number]);
      if (dayIndex >= todayIndex) {
        const dayData = weekActivityData.get(dayIndex);
        if (!dayData?.isCompleted) {
          remaining++;
        }
      }
    });
    return remaining;
  }, [selectedDays, weekActivityData]);
  
  const useIconView = viewMode === 'icons';

  // Journey states: Map path (no assessment), Assessment path (no schedule), Active
  const journeyState: ScheduleJourneyState = !hasCompletedAssessment
    ? 'map'
    : hasSchedule
      ? 'active'
      : 'assessment';
  const showOverlay = !hasSchedule && (onStartAssessment || onSetSchedule);

  // When the glass scrim overlay is active, substitute real activity data with
  // the dummy preview so the blurred background shows a vibrant calisthenics
  // week layout instead of empty cells.
  const effectiveActivityData: Map<number, DayActivityData> = showOverlay
    ? DUMMY_ACTIVITY_MAP
    : weekActivityData;

  // Get day icon based on track, view mode, and status.
  // In "icons" view, delegates to the unified SmartDayIcon wrapper.
  // In "rings" view, keeps the CompactRingsProgress rendering.
  const getDayIcon = (day: DaySchedule, dayData: DayActivityData, isCellSelected: boolean, dayIndex: number) => {
    const { day: dayLetter } = day;
    const planned = isTrainingDay(dayLetter);

    // Per-day skill icon bridge: resolve the primary programId stored in the
    // day's schedule entry so all render paths can share it.
    const perDayPrimaryId = dayData.primaryEntry?.programIds?.[0] ?? null;

    // ── ACTIVITY schedule (Stage 2): the RING axis (S10). Takes precedence over
    //    every flame/icon path — this is a separate schedule toggled by the host
    //    (health tab). One aggregate summary ring per day; flame logic untouched.
    if (activityView) {
      const state: 'past' | 'today' | 'future' = dayData.isToday
        ? 'today'
        : dayData.isFuture
          ? 'future'
          : 'past';
      const ring = buildActivityRingData({
        totalMinutes: dayData.totalMinutes,
        categories: dayData.categories,
        dominantCategory: dayData.dominantCategory,
      });
      // props are required by DayIconCell but ignored when activityRing is set;
      // pass minimal valid state so the cell can echo today/selection if needed.
      // isRecoveryCompletion intentionally NOT threaded here: isRest and
      // isCompleted are both hardcoded false in this branch (the ring view
      // never renders the flame/Beast-Mode UI), so resolveDayDisplayProps'
      // `isRest && isCompleted` Beast Mode gate is structurally unreachable
      // regardless of recovery status — confirmed by reading both branches.
      const displayProps = resolveDayDisplayProps({
        state,
        isSelected: isCellSelected,
        isRest: false,
        isMissed: false,
        isCompleted: false,
      });
      return <DayIconCell props={displayProps} activityRing={ring} ringSizePx={40} />;
    }

    // ── Running mode + icon view: route through the centralized engine
    //    so we get the branded flame + colored pager dot for the actual
    //    running category (tempo → red intensity flame + red dot, etc.).
    if (isRunningMode && useIconView) {
      const runEntry = runningEntriesByDayIndex.get(dayIndex);
      const state: 'past' | 'today' | 'future' = dayData.isToday
        ? 'today'
        : dayData.isFuture
          ? 'future'
          : 'past';

      const runningCategory = runEntry?.category;
      const runningColor = runningCategory ? getCategoryColor(runningCategory) : undefined;

      // isRecoveryCompletion IS threaded here even though this branch uses the
      // deprecated blended `dayData.isCompleted` (wasActive || workoutDone),
      // not `workoutDone` — reachability check (13.08.2026): on a rest day
      // with no matching runEntry, the isRunningMode block above (weekActivityData
      // useMemo) only overrides isCompleted when `!isRestDay`; on an actual rest
      // day it falls through untouched, keeping the general `status.isCompleted`
      // value set by the earlier `!isFuture` block — the SAME dailyProgress-backed
      // signal the icon-view branch below uses. Recovery-video-trio always plays
      // through the STRENGTH runner (confirmed: home/page.tsx's composer builds
      // trainingType:'strength', and StrengthSummaryPage → useActivitySync is the
      // only isRecovery producer), never the running player — but the
      // dailyProgress/{uid}_{date} document it writes is global per user+date,
      // not scoped to currentTrack. So a running-track user who completes a
      // recovery-video-trio (via the strength runner) on their rest day WILL
      // reach this branch with isCompleted=true, isRest=true — Beast Mode would
      // incorrectly fire here too without this field.
      const displayProps = resolveDayDisplayProps({
        state,
        isSelected: isCellSelected,
        isRest: dayData.isRest,
        isMissed: dayData.isMissed,
        isCompleted: dayData.isCompleted,
        debtCleared: dayData.debtCleared,
        dominantCategory: dayData.dominantCategory ?? (runEntry ? 'cardio' : null),
        stepGoalMet: false,
        programIconKey: 'shoe',
        runningCategory,
        runningColor,
        isRecoveryCompletion: dayData.isRecoveryCompletion,
        // Stage H (18.08.2026): 2+ distinct activities this day (e.g. the
        // running program's entry alongside a manually-scheduled strength
        // session) alternate icon+dots instead of collapsing to this single
        // run entry. Falls through to the fields above unchanged when there's
        // only 1 (the common case). sessionsCompleted is intentionally NOT
        // dayData.isCompleted — that's overwritten above (by the isRunningMode
        // block later in weekActivityData) to the RUN entry's own status,
        // which can disagree with whether the OTHER sessions in this list
        // (e.g. strength, logged separately) are actually done.
        sessions: dayData.sessions,
        sessionsCompleted: dayData.sessionsCompleted,
      });

      return <DayIconCell props={displayProps} />;
    }

    // ── Running mode (rings view): keep the legacy RunningDayIcon path ──
    if (isRunningMode) {
      const runEntry = runningEntriesByDayIndex.get(dayIndex);
      if (runEntry) {
        return <RunningDayIcon entry={runEntry} isToday={dayData.isToday} />;
      }
      if (dayData.isRest || !planned) {
        return <Bed className="text-gray-400 dark:text-gray-500 text-lg" />;
      }
      // Planned training day without a running entry: pending running icon
      const pendingColor = dayData.isToday ? '#00BAF7' : '#00BAF780';
      return (
        <div
          className="flex items-center justify-center"
          style={{
            width: 44,
            height: 44,
            color: pendingColor,
            filter: dayData.isToday ? 'drop-shadow(0 0 6px #00BAF760)' : undefined,
          }}
        >
          <Footprints className="w-5 h-5" />
        </div>
      );
    }

    // ── Icon-view: delegate everything (including missed days) to the
    //    centralized state engine. The engine renders debt-uncleared misses as
    //    a neutral rest icon (softening — a missed day looks like a rest day) AND
    //    the branded flame + dot for debt-cleared ones — so we MUST NOT
    //    short-circuit before this branch.
    if (useIconView) {
      const state: 'past' | 'today' | 'future' = dayData.isToday
        ? 'today'
        : dayData.isFuture
          ? 'future'
          : 'past';

      // Activity multi-session detection (sessions/heroSession) removed with the
      // flame→workoutDone split: the flame is the WORKOUT axis (single S7 workout,
      // coloured by programIconKey), not activity. Activity (dayData.categories) will
      // build the RING via buildMiniRingData in Stage 2 (composition).

      const displayProps = resolveDayDisplayProps({
        state,
        isSelected: isCellSelected,
        isRest: dayData.isRest,
        isMissed: dayData.isMissed,
        isCompleted: dayData.workoutDone ?? false,
        debtCleared: dayData.debtCleared,
        // Flame colour comes from the SCHEDULED WORKOUT type (S7), never activity:
        // leave dominantCategory null so resolveCategory / resolveFlameSrc fall to
        // programIconKey (S7 entry → FLAME_BY_PROGRAM_ICON_KEY). Activity (S10) drives
        // the ring, not the flame (composition is Stage 2).
        dominantCategory: null,
        stepGoalMet: false,
        programIconKey:
          dayData.communityIconKey ??
          resolveIconKey(dayData.primaryEntry?.programIds?.[0] ?? dayData.primaryEntry?.scheduledCategories?.[0]) ??
          resolvedIconKey,
        // Stage H (18.08.2026) re-introduces multi-session alternation, per
        // David's explicit request — deliberately on the ACTIVITY axis
        // (dayData.sessions, sourced from useDayStatus()/scheduled entries),
        // not a new S7-workout-count. Single S7 workout still drives the
        // single-icon fields above unchanged; this only takes over when 2+
        // distinct activities are relevant to the day (done or planned).
        // sessionsCompleted (NOT dayData.workoutDone) decides flame-vs-plain
        // for those sessions — the workout axis and activity axis aren't 1:1
        // (a user can log real activity without pressing "workout complete").
        sessions: dayData.sessions,
        sessionsCompleted: dayData.sessionsCompleted,
        isRecoveryCompletion: dayData.isRecoveryCompletion,
      });

      return <DayIconCell props={displayProps} />;
    }

    // ── Rings-view: keep existing CompactRingsProgress paths ─────
    if (dayData.isCompleted) {
      const miniRingData = buildMiniRingData(dayData.categories);
      if (miniRingData.length > 0) {
        return (
          <motion.div initial={{ scale: 0.8 }} animate={{ scale: 1 }} className="relative z-10">
            <CompactRingsProgress ringData={miniRingData} size={36} strokeWidth={6} />
          </motion.div>
        );
      }
      const bgColor = dayData.dominantCategory ? DOT_COLORS[dayData.dominantCategory] : '#4CAF50';
      return (
        <motion.div
          initial={{ scale: 0.8 }}
          animate={{ scale: 1 }}
          className="w-9 h-9 rounded-full flex items-center justify-center text-white shadow-md relative z-10"
          style={{ backgroundColor: bgColor, boxShadow: `0 4px 12px ${bgColor}40` }}
        >
          <Check className="w-5 h-5 stroke-[3]" />
        </motion.div>
      );
    }

    if (dayData.isToday) {
      if (dayData.hasActivity && dayData.totalMinutes >= STREAK_MINIMUM_MINUTES) {
        const todayRingData = buildMiniRingData(dayData.categories);
        if (todayRingData.length > 0) {
          return (
            <motion.div initial={{ scale: 0.8 }} animate={{ scale: 1 }} className="relative z-10">
              <CompactRingsProgress ringData={todayRingData} size={40} strokeWidth={6} />
            </motion.div>
          );
        }
      }
      // Rings-view today: standalone colored icon, no background circle.
      // Priority: SKILL_DISPLAY svg → legacy getProgramIcon.
      const ringColor = dominantColor || '#00C9F2';
      const todaySkillDisplay = perDayPrimaryId
        ? SKILL_DISPLAY[perDayPrimaryId as keyof typeof SKILL_DISPLAY]
        : null;
      return (
        <div className="flex items-center justify-center" style={{ width: 44, height: 44 }}>
          <div style={{ color: ringColor, filter: `drop-shadow(0 0 4px ${ringColor}60)` }}>
            {todaySkillDisplay
              ? (
                <img
                  src={todaySkillDisplay.iconPath}
                  alt={todaySkillDisplay.shortName}
                  className="w-6 h-6 object-contain"
                  onError={(e) => { e.currentTarget.style.display = 'none'; }}
                />
              )
              : getProgramIcon(resolvedIconKey, 'w-6 h-6')
            }
          </div>
        </div>
      );
    }

    if (dayData.isFuture && planned) {
      // Priority: SKILL_DISPLAY svg → legacy getProgramIcon.
      const futureSkillDisplay = perDayPrimaryId
        ? SKILL_DISPLAY[perDayPrimaryId as keyof typeof SKILL_DISPLAY]
        : null;
      return (
        <div className="flex items-center justify-center text-gray-300 dark:text-gray-600" style={{ width: 44, height: 44 }}>
          {futureSkillDisplay
            ? (
              <img
                src={futureSkillDisplay.iconPath}
                alt={futureSkillDisplay.shortName}
                className="w-5 h-5 object-contain opacity-40"
                onError={(e) => { e.currentTarget.style.display = 'none'; }}
              />
            )
            : getProgramIcon(resolvedIconKey, 'w-5 h-5')
          }
        </div>
      );
    }

    if (dayData.isRest) {
      if (!isHealthMode) {
        return <Bed className="text-gray-500 dark:text-gray-400 text-lg" />;
      }
      return <span className="text-xs text-gray-600 dark:text-gray-400">z<sup>z</sup></span>;
    }

    return null;
  };
  
  // Handle day click — propagate selected date to parent, no tooltip
  const handleDayClick = (day: DaySchedule, index: number) => {
    const today = new Date();
    const dayDate = new Date(today);
    const todayIndex = today.getDay();
    dayDate.setDate(today.getDate() + (index - todayIndex));
    const isoDate = dayDate.toISOString().split('T')[0];
    onDaySelect?.(isoDate);
    onDayClick?.(day);
  };

  const handlePanEnd = useCallback((_: unknown, info: PanInfo) => {
    // Swipe-down on the schedule card → open the planner. The R day-swipe (stepping
    // the selected day) moved to the central workout anchor (see home/page.tsx), so
    // the strip no longer owns a horizontal pan — it stays free for its display role
    // and the future axis-B (metrics) carousel.
    if (onSwipeDown && info.offset.y > 50 && info.velocity.y > 100) {
      onSwipeDown();
    }
  }, [onSwipeDown]);

  // Fallback: Empty state
  if (!schedule || schedule.length === 0) {
    return (
      <div className="mb-0 w-full max-w-[358px] mx-auto" dir="rtl">
        <div
          className="bg-gradient-to-b from-white to-slate-50/80 dark:from-[#1E1E1E] dark:to-[#1A1A2E]"
          style={{ borderRadius: 12, padding: 16, border: '0.5px solid #E0E9FF', boxShadow: '0 1px 4px 0 rgba(0,0,0,0.04), inset 0 1px 3px 0 rgba(0,0,0,0.02)' }}
        >
          <div className="flex justify-center items-center py-6">
            <p className="text-sm text-gray-400 dark:text-gray-500 animate-pulse">טוען לו״ז שבועי...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="mb-0 relative z-10 w-full max-w-[358px] mx-auto" dir="rtl">
      {/* ── Header — OUTSIDE the card ─────────────────────────── */}
      <div className="flex items-center justify-between mb-1 px-1">
        <h2 className="text-lg font-bold text-gray-900 dark:text-white">לו״ז אימונים</h2>
        {!hideMonthToggle && (
          <div className="flex items-center gap-2 relative z-20">
            <button
              onClick={toggleCalendarMode}
              className={`p-2 rounded-xl transition-all active:scale-90 ${
                calendarMode === 'month'
                  ? 'bg-cyan-50 dark:bg-cyan-900/30 text-cyan-600 dark:text-cyan-400'
                  : 'bg-gray-50 dark:bg-gray-800 text-gray-400 hover:text-[#00ADEF]'
              }`}
              title={calendarMode === 'week' ? 'הצג תצוגה חודשית' : 'הצג תצוגה שבועית'}
              aria-label={calendarMode === 'week' ? 'תצוגה חודשית' : 'תצוגה שבועית'}
            >
              <CalendarDays className="w-4.5 h-4.5" />
            </button>
          </div>
        )}
      </div>

      {/* ── Sub-header row — sync chip & edit link (hidden while schedule is unset) */}
      {!showOverlay && <div className="flex items-center justify-between mb-2 px-1">
        {/* Calendar subscription:
            - iOS: webcal:// via window.open(_system) → UIApplication.open → Apple Calendar
            - Android: Google Calendar subscribe URL via window.open(_system) → ACTION_VIEW intent
            - Web: webcal:// href (desktop calendar clients)
            Note: App.openUrl does not exist in @capacitor/app v6 — window.open(_system)
            is the correct cross-platform Capacitor API for firing external URL intents. */}
        <button
          type="button"
          onClick={() => {
            if (!userId) return;
            const w = window as unknown as { Capacitor?: { getPlatform?: () => string } };
            const platform = w.Capacitor?.getPlatform?.() ?? 'web'; // 'ios' | 'android' | 'web'
            const feedHost = platform !== 'web'
              ? APP_CONFIG_LINKS.WEB_BASE_URL.replace('https://', '')
              : (typeof window !== 'undefined' ? window.location.host : 'outrun.co.il');
            const webcalUrl = `webcal://${feedHost}/api/calendar/${userId}`;
            if (platform === 'android') {
              // Android has no built-in webcal:// handler. Pass the Google Calendar
              // subscribe URL to window.open(_system) — Capacitor fires ACTION_VIEW,
              // GCal App Links intercept it and open the "Add calendar" flow.
              const gcalUrl = `https://calendar.google.com/calendar/r?cid=${encodeURIComponent(webcalUrl)}`;
              window.open(gcalUrl, '_system');
            } else if (platform === 'ios') {
              // iOS handles webcal:// natively via UIApplication.open.
              window.open(webcalUrl, '_system');
            } else {
              window.location.href = webcalUrl;
            }
          }}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
        >
          <img src="/icons/schedule/sync-calendar.svg" alt="" className="w-4 h-4" />
          <span className="text-xs font-semibold text-gray-600 dark:text-gray-300">
            סנכרון ליומן
          </span>
        </button>
        <button
          onClick={onOpenPlanner ?? toggleCalendarMode}
          className="inline-flex items-center gap-1 font-medium hover:underline"
          style={{ fontSize: 13, color: '#00C9F2' }}
        >
          <img src="/icons/schedule/edit-pen.svg" alt="" className="w-3.5 h-3.5" />
          <span>שינוי לוז</span>
        </button>
      </div>}

      {/* ── Main Card — bordered container with depth ──────────── */}
      <motion.div
        className="bg-gradient-to-b from-white to-slate-50/80 dark:from-[#1E1E1E] dark:to-[#1A1A2E] relative overflow-hidden"
        style={{
          borderRadius: 12,
          padding: '10px 12px',
          border: '0.5px solid #E0E9FF',
          boxShadow: '0 1px 4px 0 rgba(0,0,0,0.04), inset 0 1px 3px 0 rgba(0,0,0,0.02)',
        }}
        onPanEnd={onSwipeDown ? handlePanEnd : undefined}
      >
        {/* Journey overlay: ultra-light full-card glass — calendar stays sharp below */}
        {showOverlay && (
          <div
            className="absolute inset-0 z-20 rounded-2xl flex flex-col items-center justify-center gap-2 bg-white/15 dark:bg-slate-900/35 backdrop-blur-[2px]"
          >
            <button
              onClick={journeyState === 'map' ? onStartAssessment : onSetSchedule}
              className="px-7 py-2 text-black text-sm font-semibold rounded-full shadow-md shadow-cyan-400/25 transition-all duration-200 hover:brightness-105 active:scale-95"
              style={{ background: 'linear-gradient(135deg, #00BAF7 0%, #0CF2E3 100%)' }}
            >
              {journeyState === 'map' ? 'התחל אבחון' : 'קבע לו״ז אימונים'}
            </button>
          </div>
        )}
        <div
          className={showOverlay ? 'pointer-events-none select-none' : ''}
        >
        <AnimatePresence mode="wait">
          {calendarMode === 'week' ? (
            <motion.div
              key="week-view"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
            >
              {/* Days Grid with Liquid Path */}
              <div ref={containerRef} className="relative">
                {/* Liquid Momentum Path — rings-view only. In icon view the
                    DayIconCell engine owns the visual story (flames + dots),
                    and the blurred glow path was layering as a "filled circle"
                    blob over completed cells (David's bug report). */}
                {!useIconView && containerWidth > 0 && completedIndices.length > 1 && (
                  <LiquidMomentumPath 
                    completedIndices={completedIndices}
                    dominantColor={dominantColor || '#06B6D4'}
                    containerWidth={containerWidth}
                  />
                )}
                
                <div className="flex justify-between items-start relative z-10 w-full max-w-[326px] mx-auto">
                  {schedule.map((day, index) => {
                    const todayIndex = new Date().getDay();
                    const isToday = index === todayIndex;
                    const isPast = index < todayIndex;
                    const dayData = effectiveActivityData.get(index);

                    const todayNow = new Date();
                    const cellDate = new Date(todayNow);
                    cellDate.setDate(todayNow.getDate() + (index - todayNow.getDay()));
                    const cellISO = cellDate.toISOString().split('T')[0];
                    const isCellSelected = selectedDate === cellISO;
                    // In preview mode force training days to use their colored
                    // 15%-fill + 1px border container (same as "selected" state)
                    // so the category halos have enough surface area to bleed
                    // through the glass scrim as recognisable color blocks.
                    const effectiveCellSelected =
                      isCellSelected ||
                      (showOverlay && DUMMY_PREVIEW_SCHEDULE_DAYS.includes(day.day));

                    const dayColor = isToday
                      ? '#00C9F2'
                      : isPast
                        ? '#71717A'
                        : '#374151';
                    
                    const planned = isTrainingDay(day.day);

                    return (
                      <div
                        key={index}
                        className="flex flex-col items-center group"
                        style={{ width: 44, flexShrink: 0, overflow: 'visible' }}
                      >
                        {/* Day label */}
                        <span
                          className="font-bold transition-colors leading-none"
                          style={{ fontSize: 14, color: dayColor, marginBottom: 4 }}
                        >
                          {day.day}
                        </span>
                        
                        {/* Day icon — 32×32 slot (matches CONTAINER_SIZE_PX).
                            In icon view the DayIconCell owns its own pager dot
                            below the container, so we no longer render the
                            legacy absolute cyan dot here (it collided with the
                            engine's dot, producing the "double circle" David
                            flagged). The legacy dot is preserved for rings view
                            only. */}
                        <motion.button
                          onClick={() => handleDayClick(day, index)}
                          whileTap={{ scale: 0.92 }}
                          transition={{ type: 'spring', stiffness: 400, damping: 20 }}
                          className="flex items-center justify-center relative"
                          style={{
                            // Activity view (ring) uses a larger 40 px slot since
                            // it's a toggle — one schedule on screen at a time.
                            width: activityView ? 40 : 32,
                            height: activityView ? 40 : 32,
                            overflow: 'visible',
                          }}
                        >
                          {!entriesLoaded && !showOverlay ? (
                            // Section B: neutral pulse instead of the recurring-
                            // template guess while weekScheduleEntries is still
                            // loading — same fixed slot as the real icon below,
                            // so swapping in the real icon causes no layout shift.
                            <div
                              className="rounded-full bg-gray-200 dark:bg-slate-700 animate-pulse"
                              style={{ width: activityView ? 40 : 32, height: activityView ? 40 : 32 }}
                            />
                          ) : (
                            dayData && getDayIcon(day, dayData, effectiveCellSelected, index)
                          )}

                          {/* Legacy planned dot — rings view only */}
                          {!useIconView && planned && (
                            <div
                              className="absolute left-1/2 -translate-x-1/2"
                              style={{ top: 48 }}
                            >
                              {isToday ? (
                                <div
                                  className="rounded-full"
                                  style={{
                                    width: 4,
                                    height: 4,
                                    backgroundColor: plannedDotColor,
                                    boxShadow: `0 0 6px 1px ${plannedDotColor}80`,
                                  }}
                                />
                              ) : (
                                <CyanDot />
                              )}
                            </div>
                          )}
                        </motion.button>

                        {/* Spacer — only needed in rings view (legacy dot lives
                            outside the button); in icon view DayIconCell already
                            adds its own 8 px of internal spacing. */}
                        {!useIconView && <div style={{ height: 12 }} />}
                        
                      </div>
                    );
                  })}
                </div>
              </div>
            </motion.div>
          ) : (
            <motion.div
              key="month-view"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              style={{
                maxHeight: monthGridMaxHeight ?? undefined,
                overflow: monthGridMaxHeight ? 'hidden' : undefined,
              }}
            >
              <MonthlyCalendarGrid
                selectedDate={selectedDate ?? ''}
                onDaySelect={(iso) => onDaySelect?.(iso)}
                viewMode={viewMode}
                userId={userId ?? ''}
                recurringTemplate={recurringTemplate}
                scheduleDays={scheduleDays}
                programIconKey={programIconKey}
                cellHeight={expandedGridConfig?.cellHeight}
                ringSize={expandedGridConfig?.ringSize}
                ringStroke={expandedGridConfig?.ringStroke}
                activityView={activityView}
              />
            </motion.div>
          )}
        </AnimatePresence>
        </div>
      </motion.div>

      {/* ── Running Workout Cards (below strip) ── */}
      {isRunningMode && currentWeekEntries.length > 0 && calendarMode === 'week' && (
        <RunningWorkoutCards
          entries={currentWeekEntries}
          currentWeek={effectiveCurrentWeek ?? 1}
          basePace={runningBasePace ?? 0}
          onCardClick={handleRunCardClick}
          todayScheduleDay={runningEntriesByDayIndex.get(new Date().getDay())?.day}
        />
      )}
    </div>
  );
}