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
import { Bed, Check, X, LayoutGrid, Circle as CircleIcon, CalendarDays, Footprints, Zap, Timer, TrendingUp, Mountain, Moon } from 'lucide-react';
import { useDailyActivity, useWeeklyProgress, useDayStatus, useDateKey } from '@/features/activity';
import { CompactRingsProgress } from './rings/ConcentricRingsProgress';
import { resolveIconKey, SmartDayIcon, getProgramIcon, CyanDot } from '@/features/content/programs/core/program-icon.util';
import { resolveDayDisplayProps, DayIconCell, type DaySessionInput } from '@/features/home/utils/day-display.utils';
import MonthlyCalendarGrid from './calendar/MonthlyCalendarGrid';
import type { RecurringTemplate } from '@/features/user/scheduling/types/schedule.types';
import { getWeekEntries } from '@/features/user/scheduling/services/userSchedule.service';
import {
  generateCommunityICS,
  downloadICS,
} from '@/features/user/scheduling/services/communitySchedule.service';
import { getSundayWeekStart, toISODate } from '@/features/user/scheduling/utils/dateUtils';
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
  /** Current program week number */
  runningCurrentWeek?: number;
  /** Program start date (ISO or Date) */
  runningProgramStartDate?: string | Date;
  /** Base pace in seconds per km */
  runningBasePace?: number;
}

interface DayActivityData {
  hasActivity: boolean;
  isCompleted: boolean;
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
// GHOST RING COMPONENT (for missed days)
// ============================================================================

function GhostRing() {
  return (
    <div className="w-9 h-9 rounded-full border-2 border-dashed border-gray-300 dark:border-gray-600 flex items-center justify-center bg-gray-50 dark:bg-gray-800/50 opacity-60">
      <X className="w-4 h-4 text-gray-400" />
    </div>
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

  // Split entries: today's workout vs the rest
  const todayEntry = todayScheduleDay != null
    ? entries.find((e) => e.day === todayScheduleDay && (e.status === 'pending' || !e.status))
    : entries.find((e) => e.status === 'pending' || !e.status);

  const nextUpEntry = todayEntry
    ? null
    : entries.find((e) => e.status === 'pending' || !e.status);

  const completedEntries = entries.filter((e) => e.status === 'completed');
  const completedCount = completedEntries.length;
  const isRestDay = !todayEntry;

  return (
    <div className="mt-4 space-y-2.5" dir="rtl">
      <div className="flex items-center justify-between px-1 mb-1">
        <h3 className="text-sm font-bold text-gray-700 dark:text-gray-300">
          {isRestDay ? 'יום מנוחה' : 'האימון שלך היום'}
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

      {/* ── Rest Day state ── */}
      {isRestDay && (
        <div
          className="rounded-2xl overflow-hidden text-right"
          style={{ border: '0.5px solid #E0E9FF', boxShadow: '0 2px 8px rgba(0,0,0,0.04)', background: 'white' }}
        >
          <div className="flex items-center gap-3 py-4 px-4">
            <div
              className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
              style={{ background: 'rgba(0,186,247,0.08)' }}
            >
              <Moon size={20} style={{ color: '#00BAF7' }} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-gray-900 dark:text-white">
                היום זה להתאושש 🧘
              </p>
              {nextUpEntry && (
                <p className="text-xs text-slate-400 mt-0.5">
                  הבא: {nextUpEntry.workoutName || getCategoryLabel(nextUpEntry.category)}
                </p>
              )}
            </div>
          </div>
        </div>
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
  hasCompletedAssessment = false,
  hasSchedule = true,
  onStartAssessment,
  onSetSchedule,
  runningSchedule,
  runningCurrentWeek,
  runningProgramStartDate,
  runningBasePace,
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

  const [syncing, setSyncing] = useState(false);

  const handleCalendarSync = useCallback(async () => {
    if (!userId || syncing) return;
    setSyncing(true);
    try {
      const sundayISO = getSundayWeekStart(new Date());
      const entries = await getWeekEntries(userId, sundayISO);
      const communityEvents: Parameters<typeof generateCommunityICS>[0] = [];
      const seenSlots = new Set<string>();
      for (const entry of entries) {
        if (!entry.communitySessions?.length) continue;
        for (const s of entry.communitySessions) {
          const key = `${s.groupId}-${s.time}`;
          if (seenSlots.has(key)) continue;
          seenSlots.add(key);
          const dayOfWeek = new Date(entry.date + 'T00:00:00').getDay();
          communityEvents.push({
            groupName: s.groupName,
            category: s.category,
            dayOfWeek,
            time: s.time,
          });
        }
      }
      if (communityEvents.length === 0) {
        alert('אין מפגשים קהילתיים בלוז כרגע');
        return;
      }
      const ics = generateCommunityICS(communityEvents);
      downloadICS(ics);
    } catch (err) {
      console.error('[SmartWeeklySchedule] calendar sync failed:', err);
    } finally {
      setSyncing(false);
    }
  }, [userId, syncing]);

  const isHealthMode = currentTrack === 'wellness';
  const isRunningMode = currentTrack === 'running';
  const plannedDotColor = isRunningMode ? '#00BAF7' : '#00C9F2';

  // Infer workout category from day position in the frequency cycle
  const freq = scheduleDays.length || 3;

  const currentWeekEntries = useMemo(() => {
    if (!isRunningMode || !runningSchedule?.length || !runningCurrentWeek) return [];
    const entries = runningSchedule.filter((e) => e.week === runningCurrentWeek);
    return entries.map((entry) => ({
      ...entry,
      category: entry.category || 'easy_run',
      workoutName: entry.workoutName || (CATEGORY_LABELS_HE[entry.category ?? ''] ?? 'אימון ריצה'),
    }));
  }, [isRunningMode, runningSchedule, runningCurrentWeek]);

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
  const [viewMode, setViewMode] = useState<ScheduleViewMode>('icons');
  const toggleViewMode = useCallback(() => {
    setViewMode((prev) => (prev === 'rings' ? 'icons' : 'rings'));
  }, []);
  
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
      const isRestDay = !isTrainingDay(dayLetter);
      
      // Default data
      let dayData: DayActivityData = {
        hasActivity: false,
        isCompleted: false,
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
      };
      
      // Compute ISO date for this day index within the current week.
      // The week is Sunday-anchored (i=0=Sun, …, i=6=Sat).
      const dayDate = new Date(today);
      dayDate.setDate(today.getDate() - todayIndex + i);
      const isoDate = toISODate(dayDate);

      // scheduleDay drives the "completed" signal for past non-today days.
      const scheduleDay = schedule.find(s => s.day === dayLetter);
      const scheduleCompleted = scheduleDay?.status === 'completed';

      // useDayStatus handles the Completion Bridge and real per-category data
      // for today AND any past days that are still in weekActivities.
      if (!isFuture) {
        const status = getDayStatus(isoDate, scheduleCompleted);
        dayData = {
          ...dayData,
          hasActivity: status.hasActivity,
          isCompleted: status.isCompleted,
          totalMinutes: status.totalMinutes,
          categories: status.categories,
          dominantCategory: status.dominantCategory,
          // Keep steps/calories from the store when available (today only)
          steps: isToday && todayActivity ? todayActivity.steps : dayData.steps,
          calories: isToday && todayActivity ? todayActivity.calories : dayData.calories,
        };
        // Mark missed: past training day with no activity and not completed.
        if (!isToday && !status.isCompleted) {
          const isTraining = scheduleDay
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
  }, [schedule, scheduleDays, todayActivity, getDayStatus, dateKey, isRunningMode, runningEntriesByDayIndex]);
  
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

  // Get day icon based on track, view mode, and status.
  // In "icons" view, delegates to the unified SmartDayIcon wrapper.
  // In "rings" view, keeps the CompactRingsProgress rendering.
  const getDayIcon = (day: DaySchedule, dayData: DayActivityData, isCellSelected: boolean, dayIndex: number) => {
    const { day: dayLetter } = day;
    const planned = isTrainingDay(dayLetter);

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
    //    centralized state engine. The engine renders the GhostRing for
    //    debt-uncleared misses AND the branded flame + dot for debt-cleared
    //    ones — so we MUST NOT short-circuit before this branch.
    if (useIconView) {
      const state: 'past' | 'today' | 'future' = dayData.isToday
        ? 'today'
        : dayData.isFuture
          ? 'future'
          : 'past';

      // ── Multi-session detection ─────────────────────────────────────
      // Build sessions from per-bucket minutes. Any category with ≥ 10
      // logged minutes counts as its own session; sorted desc by minutes
      // and capped at 3 by the engine. When 2+ are present and the day
      // qualifies, the engine returns alternating sessions and DayIconCell
      // pulses through them with pager dots.
      const sessions: DaySessionInput[] = (
        ['strength', 'cardio', 'maintenance'] as const
      )
        .filter((cat) => (dayData.categories[cat] ?? 0) >= STREAK_MINIMUM_MINUTES)
        .map((cat) => ({
          category: cat,
          minutes: dayData.categories[cat],
          // Strength session reuses the user's resolved program icon;
          // cardio/maintenance fall back to category defaults inside the engine.
          programIconKey: cat === 'strength' ? resolvedIconKey : undefined,
        }))
        .sort((a, b) => b.minutes - a.minutes);

      // Hero-flame selection: Strength > Cardio > Maintenance priority order.
      // Used as the fallback dominantCategory/programIconKey when only one
      // session is active, and as the first icon in the alternating sequence
      // when multiple real sessions exist.
      const heroPriority = ['strength', 'cardio', 'maintenance'] as const;
      const heroSession =
        sessions.find((s) => s.category === heroPriority[0]) ??
        sessions.find((s) => s.category === heroPriority[1]) ??
        sessions[0];

      const displayProps = resolveDayDisplayProps({
        state,
        isSelected: isCellSelected,
        isRest: dayData.isRest,
        isMissed: dayData.isMissed,
        isCompleted: dayData.isCompleted,
        debtCleared: dayData.debtCleared,
        dominantCategory: heroSession?.category ?? dayData.dominantCategory,
        stepGoalMet: false,
        programIconKey: heroSession?.programIconKey ?? resolvedIconKey,
        // Pass the full sessions array when 2+ real activities exist so
        // DayIconCell alternates between them with pager dots.
        sessions: sessions.length >= 2 ? sessions : undefined,
      });

      return <DayIconCell props={displayProps} />;
    }

    // Rings-view fallback: missed past days still need the legacy ghost.
    if (dayData.isMissed && !dayData.isToday && !dayData.isFuture) {
      return <GhostRing />;
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
      // Rings-view today: standalone colored icon, no background circle
      const ringColor = dominantColor || '#00C9F2';
      return (
        <div className="flex items-center justify-center" style={{ width: 44, height: 44 }}>
          <div style={{ color: ringColor, filter: `drop-shadow(0 0 4px ${ringColor}60)` }}>
            {getProgramIcon(resolvedIconKey, 'w-6 h-6')}
          </div>
        </div>
      );
    }

    if (dayData.isFuture && planned) {
      return (
        <div className="flex items-center justify-center text-gray-300 dark:text-gray-600" style={{ width: 44, height: 44 }}>
          {getProgramIcon(resolvedIconKey, 'w-5 h-5')}
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
    if (onSwipeDown && info.offset.y > 50 && info.velocity.y > 100) {
      onSwipeDown();
    }
  }, [onSwipeDown]);

  // Fallback: Empty state
  if (!schedule || schedule.length === 0) {
    return (
      <div className="mb-6 w-full max-w-[358px] mx-auto" dir="rtl">
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
    <div className="mb-6 relative z-10 w-full max-w-[358px] mx-auto" dir="rtl">
      {/* ── Header — OUTSIDE the card ─────────────────────────── */}
      <div className="flex items-center justify-between mb-2 px-1">
        <h2 className="text-lg font-bold text-gray-900 dark:text-white">לו״ז אימונים</h2>
        <div className="flex items-center gap-2 relative z-20">
          <button
            onClick={toggleViewMode}
            className={`p-2 rounded-xl transition-all active:scale-90 ${
              viewMode === 'icons'
                ? 'bg-cyan-50 dark:bg-cyan-900/30 text-cyan-600 dark:text-cyan-400'
                : 'bg-gray-50 dark:bg-gray-800 text-gray-400 hover:text-[#00ADEF]'
            }`}
            title={viewMode === 'rings' ? 'הצג אייקוני תוכנית' : 'הצג טבעות פעילות'}
            aria-label={viewMode === 'rings' ? 'הצג אייקוני תוכנית' : 'הצג טבעות פעילות'}
          >
            {viewMode === 'icons' ? (
              <CircleIcon className="w-4.5 h-4.5" />
            ) : (
              <LayoutGrid className="w-4.5 h-4.5" />
            )}
          </button>
          {!hideMonthToggle && (
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
          )}
        </div>
      </div>

      {/* ── Sub-header row — sync chip & edit link ──────────── */}
      <div className="flex items-center justify-between mb-3 px-1">
        <button
          onClick={handleCalendarSync}
          disabled={syncing}
          className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full transition-colors ${
            syncing
              ? 'bg-cyan-100 dark:bg-cyan-900/30 text-cyan-600'
              : 'bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700'
          }`}
        >
          <img src="/icons/schedule/sync-calendar.svg" alt="" className={`w-4 h-4 ${syncing ? 'animate-spin' : ''}`} />
          <span className="text-xs font-semibold text-gray-600 dark:text-gray-300">
            {syncing ? 'מסנכרן...' : 'סנכרון ליומן'}
          </span>
        </button>
        <button
          onClick={toggleCalendarMode}
          className="inline-flex items-center gap-1 font-medium hover:underline"
          style={{ fontSize: 13, color: '#00C9F2' }}
        >
          <img src="/icons/schedule/edit-pen.svg" alt="" className="w-3.5 h-3.5" />
          <span>שינוי לוז</span>
        </button>
      </div>

      {/* ── Main Card — bordered container with depth ──────────── */}
      <motion.div
        className="bg-gradient-to-b from-white to-slate-50/80 dark:from-[#1E1E1E] dark:to-[#1A1A2E] relative overflow-hidden"
        style={{
          borderRadius: 12,
          padding: 16,
          border: '0.5px solid #E0E9FF',
          boxShadow: '0 1px 4px 0 rgba(0,0,0,0.04), inset 0 1px 3px 0 rgba(0,0,0,0.02)',
        }}
        onPanEnd={onSwipeDown ? handlePanEnd : undefined}
      >
        {/* Journey overlay: glassmorphism over days grid — Map or Assessment path */}
        {showOverlay && (
          <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-white/60 dark:bg-[#1E1E1E]/70 backdrop-blur-md" style={{ borderRadius: 12 }}>
            {/* Subtle watermark illustration */}
            <svg
              className="absolute inset-0 w-full h-full pointer-events-none opacity-[0.04] dark:opacity-[0.06]"
              viewBox="0 0 300 160"
              fill="none"
              preserveAspectRatio="xMidYMid slice"
            >
              <rect x="30" y="20" width="240" height="16" rx="4" fill="currentColor" />
              <rect x="30" y="46" width="30" height="30" rx="6" fill="currentColor" />
              <rect x="70" y="46" width="30" height="30" rx="6" fill="currentColor" />
              <rect x="110" y="46" width="30" height="30" rx="6" fill="currentColor" />
              <rect x="150" y="46" width="30" height="30" rx="6" fill="currentColor" />
              <rect x="190" y="46" width="30" height="30" rx="6" fill="currentColor" />
              <rect x="230" y="46" width="30" height="30" rx="6" fill="currentColor" />
              <rect x="30" y="86" width="30" height="30" rx="6" fill="currentColor" />
              <rect x="70" y="86" width="30" height="30" rx="6" fill="currentColor" />
              <rect x="110" y="86" width="30" height="30" rx="6" fill="currentColor" />
              <rect x="150" y="86" width="30" height="30" rx="6" fill="currentColor" />
              <rect x="190" y="86" width="30" height="30" rx="6" fill="currentColor" />
              <rect x="230" y="86" width="30" height="30" rx="6" fill="currentColor" />
              <rect x="30" y="126" width="240" height="12" rx="4" fill="currentColor" />
            </svg>

            <p className="text-xs text-gray-500 dark:text-gray-400 text-center px-8 leading-relaxed">
              {journeyState === 'map'
                ? 'גלול/י למטה והשלם/י את האבחון כדי לפתוח את הלו״ז'
                : 'בחר באילו ימים אתה מתאמן כדי שנתאים את התוכנית'}
            </p>

            <button
              onClick={journeyState === 'map' ? onStartAssessment : onSetSchedule}
              className="mt-4 px-7 py-2.5 text-white text-sm font-bold rounded-xl transition-all active:scale-95"
              style={{
                background: 'linear-gradient(135deg, #00C9F2 0%, #00A3CC 100%)',
                boxShadow: '0 4px 14px 0 rgba(0, 186, 247, 0.35)',
              }}
            >
              {journeyState === 'map' ? 'התחל אבחון' : 'קבע לו״ז אימונים'}
            </button>
          </div>
        )}
        <div
          className={
            showOverlay
              ? journeyState === 'map'
                ? 'filter blur-md pointer-events-none select-none'
                : 'filter blur-sm opacity-60 pointer-events-none select-none'
              : ''
          }
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
                    const dayData = weekActivityData.get(index);

                    const todayNow = new Date();
                    const cellDate = new Date(todayNow);
                    cellDate.setDate(todayNow.getDate() + (index - todayNow.getDay()));
                    const cellISO = cellDate.toISOString().split('T')[0];
                    const isCellSelected = selectedDate === cellISO;

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
                          style={{ width: 32, height: 32, overflow: 'visible' }}
                        >
                          {dayData && getDayIcon(day, dayData, isCellSelected, index)}

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
          currentWeek={runningCurrentWeek ?? 1}
          basePace={runningBasePace ?? 0}
          onCardClick={handleRunCardClick}
          todayScheduleDay={runningEntriesByDayIndex.get(new Date().getDay())?.day}
        />
      )}
    </div>
  );
}