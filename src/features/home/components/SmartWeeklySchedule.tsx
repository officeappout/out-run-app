"use client";

/**
 * SmartWeeklySchedule Component
 * 
 * Enhanced weekly calendar with:
 * - Smart Activity Dots (Cyan=Strength, Lime=Cardio, Purple=Maintenance)
 * - Liquid Momentum Path connecting completed days
 * - Ghost Ring for missed days
 * - Interactive tooltip with activity summary
 */

import React, { useMemo, useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence, type PanInfo } from 'framer-motion';
import { DaySchedule } from '@/features/home/data/mock-schedule-data';
import { Bed, Check, X, LayoutGrid, Circle as CircleIcon, CalendarDays } from 'lucide-react';
import { useDailyProgress } from '../hooks/useDailyProgress';
import { useDailyActivity, useWeeklyProgress } from '@/features/activity';
import { CompactRingsProgress } from './rings/ConcentricRingsProgress';
import { resolveIconKey, SmartDayIcon, getProgramIcon, CyanDot } from '@/features/content/programs/core/program-icon.util';
import MonthlyCalendarGrid from './calendar/MonthlyCalendarGrid';
import type { RecurringTemplate } from '@/features/user/scheduling/types/schedule.types';
import { 
  ACTIVITY_COLORS, 
  ACTIVITY_LABELS,
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

interface SmartWeeklyScheduleProps {
  schedule: DaySchedule[];
  currentTrack?: 'wellness' | 'performance';
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
}

interface TooltipData {
  visible: boolean;
  x: number;
  y: number;
  day: string;
  date: string;
  data: DayActivityData | null;
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

function DayTooltip({ 
  data, 
  position,
  onClose,
}: { 
  data: TooltipData;
  position: 'top' | 'bottom';
  onClose: () => void;
}) {
  if (!data.visible || !data.data) return null;
  
  const { data: dayData, day, date } = data;
  
  // Format date for display
  const dateObj = new Date(date);
  const formattedDate = dateObj.toLocaleDateString('he-IL', { 
    month: 'short', 
    day: 'numeric' 
  });
  
  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: position === 'top' ? 10 : -10, scale: 0.9 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: position === 'top' ? 10 : -10, scale: 0.9 }}
        className={`absolute z-50 bg-white dark:bg-slate-800 rounded-2xl shadow-xl border border-gray-100 dark:border-slate-700 p-3 min-w-[160px] ${
          position === 'top' ? 'bottom-full mb-2' : 'top-full mt-2'
        }`}
        style={{ left: '50%', transform: 'translateX(-50%)' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-bold text-gray-900 dark:text-white">
            יום {day} • {formattedDate}
          </span>
          <button 
            onClick={onClose}
            className="p-0.5 hover:bg-gray-100 dark:hover:bg-slate-700 rounded-full"
          >
            <X className="w-3.5 h-3.5 text-gray-400" />
          </button>
        </div>
        
        {/* Activity Summary */}
        {dayData.hasActivity ? (
          <div className="space-y-1.5">
            {/* Minutes breakdown */}
            {dayData.categories.strength > 0 && (
              <div className="flex items-center gap-2 text-xs">
                <div className="w-2 h-2 rounded-full" style={{ backgroundColor: DOT_COLORS.strength }} />
                <span className="text-gray-600 dark:text-gray-300">
                  {dayData.categories.strength} דק' כוח
                </span>
              </div>
            )}
            {dayData.categories.cardio > 0 && (
              <div className="flex items-center gap-2 text-xs">
                <div className="w-2 h-2 rounded-full" style={{ backgroundColor: DOT_COLORS.cardio }} />
                <span className="text-gray-600 dark:text-gray-300">
                  {dayData.categories.cardio} דק' קרדיו
                </span>
              </div>
            )}
            {dayData.categories.maintenance > 0 && (
              <div className="flex items-center gap-2 text-xs">
                <div className="w-2 h-2 rounded-full" style={{ backgroundColor: DOT_COLORS.maintenance }} />
                <span className="text-gray-600 dark:text-gray-300">
                  {dayData.categories.maintenance} דק' תחזוקה
                </span>
              </div>
            )}
            
            {/* Total stats */}
            <div className="pt-1.5 mt-1.5 border-t border-gray-100 dark:border-slate-700 flex items-center gap-3 text-[10px] text-gray-500">
              {dayData.steps > 0 && (
                <span>👟 {dayData.steps.toLocaleString()}</span>
              )}
              {dayData.calories > 0 && (
                <span>🔥 {dayData.calories}</span>
              )}
            </div>
          </div>
        ) : dayData.isRest ? (
          <p className="text-xs text-gray-500 dark:text-gray-400">יום מנוחה</p>
        ) : dayData.isMissed ? (
          <p className="text-xs text-gray-500 dark:text-gray-400">לא הושלם פעילות</p>
        ) : dayData.isFuture ? (
          <p className="text-xs text-gray-500 dark:text-gray-400">אימון מתוכנן</p>
        ) : (
          <p className="text-xs text-gray-500 dark:text-gray-400">אין נתונים</p>
        )}
        
        {/* Arrow */}
        <div 
          className={`absolute left-1/2 -translate-x-1/2 w-3 h-3 bg-white dark:bg-slate-800 transform rotate-45 border-gray-100 dark:border-slate-700 ${
            position === 'top' 
              ? 'bottom-0 translate-y-1/2 border-b border-r' 
              : 'top-0 -translate-y-1/2 border-t border-l'
          }`}
        />
      </motion.div>
    </AnimatePresence>
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
}: SmartWeeklyScheduleProps) {
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
  const [tooltip, setTooltip] = useState<TooltipData>({
    visible: false,
    x: 0,
    y: 0,
    day: '',
    date: '',
    data: null,
  });
  
  const isHealthMode = currentTrack === 'wellness';

  // View mode: default from track, togglable per session
  const defaultViewMode: ScheduleViewMode = isHealthMode ? 'rings' : 'icons';
  const [viewMode, setViewMode] = useState<ScheduleViewMode>(defaultViewMode);
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
    console.log('[Schedule] icon resolve:', { programIconKey, userProgram, resolved: key });
    return key;
  }, [programIconKey, userProgram]);
  
  const { 
    summary: weeklySummary,
    daysWithActivity,
  } = useWeeklyProgress();
  
  // Get today's daily progress from the existing hook
  const todayProgress = useDailyProgress();
  
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
      };
      
      // For today, use todayActivity from the store
      if (isToday && todayActivity) {
        const strengthMins = todayActivity.categories.strength.minutes;
        const cardioMins = todayActivity.categories.cardio.minutes;
        const maintenanceMins = todayActivity.categories.maintenance.minutes;
        const totalMins = strengthMins + cardioMins + maintenanceMins;
        
        dayData = {
          ...dayData,
          hasActivity: totalMins > 0,
          isCompleted: totalMins >= 10, // 10+ mins counts as completed
          totalMinutes: totalMins,
          steps: todayActivity.steps,
          calories: todayActivity.calories,
          categories: {
            strength: strengthMins,
            cardio: cardioMins,
            maintenance: maintenanceMins,
          },
          dominantCategory: todayActivity.dominantCategory,
        };
      }
      // For past days, check the schedule status
      else if (!isFuture && !isToday) {
        const scheduleDay = schedule.find(s => s.day === dayLetter);
        if (scheduleDay) {
          if (scheduleDay.status === 'completed') {
            // Mock data for completed past days (in real app, would come from weekly store)
            dayData = {
              ...dayData,
              hasActivity: true,
              isCompleted: true,
              totalMinutes: 30, // Default
              steps: 5000, // Default
              calories: 200, // Default
              categories: { strength: 20, cardio: 10, maintenance: 0 },
              dominantCategory: 'strength',
            };
          } else if (scheduleDay.status === 'missed' || (isTrainingDay(dayLetter) && scheduleDay.status !== 'rest')) {
            dayData.isMissed = true;
          }
        } else if (isTrainingDay(dayLetter)) {
          // Training day with no data = missed
          dayData.isMissed = true;
        }
      }
      
      map.set(i, dayData);
    }
    
    return map;
  }, [schedule, scheduleDays, todayActivity, todayProgress]);
  
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
  const getDayIcon = (day: DaySchedule, dayData: DayActivityData, isCellSelected: boolean) => {
    const { day: dayLetter } = day;
    const planned = isTrainingDay(dayLetter);

    // 1. Missed training day: Ghost Ring (same for both modes)
    if (dayData.isMissed && !dayData.isToday && !dayData.isFuture) {
      return <GhostRing />;
    }

    // ── Icon-view: delegate everything to SmartDayIcon ────────────
    if (useIconView) {
      if (dayData.isCompleted) {
        return (
          <SmartDayIcon
            iconKey={resolvedIconKey}
            status="completed"
            isPlanned={planned}
            isSelected={isCellSelected}
          />
        );
      }
      if (dayData.isToday) {
        const progress = (dayData.totalMinutes / 30) * 100;
        return (
          <SmartDayIcon
            iconKey={resolvedIconKey}
            status="today"
            progress={progress}
            isPlanned={planned}
            isSelected={isCellSelected}
          />
        );
      }
      if (dayData.isFuture && planned) {
        return (
          <SmartDayIcon
            iconKey={resolvedIconKey}
            status="future"
            isPlanned={planned}
            isSelected={isCellSelected}
          />
        );
      }
      if (dayData.isRest) {
        return <Bed className="text-gray-500 dark:text-gray-400 text-lg" />;
      }
      return null;
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
      if (dayData.hasActivity && dayData.totalMinutes >= 10) {
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
  
  // Handle day click for tooltip + UTS date selection
  const handleDayClick = (day: DaySchedule, index: number, event: React.MouseEvent) => {
    const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
    const dayData = weekActivityData.get(index) || null;
    
    // Calculate date string for this day
    const today = new Date();
    const dayDate = new Date(today);
    const todayIndex = today.getDay();
    dayDate.setDate(today.getDate() + (index - todayIndex));
    const isoDate = dayDate.toISOString().split('T')[0];
    
    setTooltip({
      visible: true,
      x: rect.left + rect.width / 2,
      y: rect.top,
      day: day.day,
      date: isoDate,
      data: dayData,
    });
    
    // UTS Phase 2 — propagate selected date to parent
    onDaySelect?.(isoDate);
    // Legacy handler
    onDayClick?.(day);
  };
  
  // Close tooltip
  const closeTooltip = () => setTooltip(prev => ({ ...prev, visible: false }));
  
  // Click outside to close tooltip
  useEffect(() => {
    const handleClickOutside = () => closeTooltip();
    if (tooltip.visible) {
      document.addEventListener('click', handleClickOutside);
      return () => document.removeEventListener('click', handleClickOutside);
    }
  }, [tooltip.visible]);

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
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
        >
          <img src="/icons/schedule/sync-calendar.svg" alt="" className="w-4 h-4" />
          <span className="text-xs font-semibold text-gray-600 dark:text-gray-300">סנכרון ליומן</span>
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
                {/* Liquid Momentum Path (behind the day circles) */}
                {containerWidth > 0 && completedIndices.length > 1 && (
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
                        
                        {/* Day icon — 44×44 slot, relative for dot anchor */}
                        <motion.button
                          onClick={(e) => handleDayClick(day, index, e)}
                          whileTap={{ scale: 0.92 }}
                          transition={{ type: 'spring', stiffness: 400, damping: 20 }}
                          className="flex items-center justify-center relative"
                          style={{ width: 44, height: 44, overflow: 'visible' }}
                        >
                          {dayData && getDayIcon(day, dayData, isCellSelected)}

                          {/* Cyan dot — Y=48 from button top (4px below the 44px icon) */}
                          {planned && (
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
                                    backgroundColor: '#00C9F2',
                                    boxShadow: '0 0 6px 1px rgba(0,201,242,0.5)',
                                  }}
                                />
                              ) : (
                                <CyanDot />
                              )}
                            </div>
                          )}
                        </motion.button>

                        {/* Spacer — reserves space for dot so it stays inside card padding */}
                        <div style={{ height: 12 }} />
                        
                        {/* Tooltip (positioned per day) */}
                        {tooltip.visible && tooltip.day === day.day && (
                          <DayTooltip 
                            data={tooltip}
                            position="bottom"
                            onClose={closeTooltip}
                          />
                        )}
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
    </div>
  );
}