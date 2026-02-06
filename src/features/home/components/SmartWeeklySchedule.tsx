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

import React, { useMemo, useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { DaySchedule } from '@/features/home/data/mock-schedule-data';
import { Dumbbell, Bed, Check, Footprints, Move, Bike, Activity, X } from 'lucide-react';
import { useDailyProgress } from '../hooks/useDailyProgress';
import { useDailyActivity, useWeeklyProgress } from '@/features/activity';
import { CompactRingsProgress } from './rings/ConcentricRingsProgress';
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

interface SmartWeeklyScheduleProps {
  schedule: DaySchedule[];
  currentTrack?: 'wellness' | 'performance';
  scheduleDays?: string[]; // Array of Hebrew day letters like ['א', 'ב', 'ג']
  onDayClick?: (day: DaySchedule) => void;
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
  onDayClick 
}: SmartWeeklyScheduleProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState(0);
  const [tooltip, setTooltip] = useState<TooltipData>({
    visible: false,
    x: 0,
    y: 0,
    day: '',
    date: '',
    data: null,
  });
  
  const isHealthMode = currentTrack === 'wellness';
  
  // Get activity data from the Activity store
  const { 
    todayActivity, 
    dominantColor, 
    streak,
    isLoading: activityLoading,
  } = useDailyActivity();
  
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
  
  // Get day icon based on track and status
  const getDayIcon = (day: DaySchedule, dayData: DayActivityData) => {
    const { day: dayLetter } = day;
    
    // 1. Missed training day: Show Ghost Ring
    if (dayData.isMissed && !dayData.isToday && !dayData.isFuture) {
      return <GhostRing />;
    }
    
    // 2. Completed day with activity - Show compact concentric rings
    if (dayData.isCompleted) {
      // Build proper RingData array from day's categories
      const miniRingData = buildMiniRingData(dayData.categories);
      
      // If we have ring data, show compact rings
      if (miniRingData.length > 0) {
        return (
          <motion.div 
            initial={{ scale: 0.8 }}
            animate={{ scale: 1 }}
            className="relative z-10"
          >
            <CompactRingsProgress 
              ringData={miniRingData} 
              size={36}
              strokeWidth={3}
            />
          </motion.div>
        );
      }
      
      // Fallback: Simple completed circle with check
      const bgColor = dayData.dominantCategory 
        ? DOT_COLORS[dayData.dominantCategory] 
        : '#4CAF50';
      
      return (
        <motion.div 
          initial={{ scale: 0.8 }}
          animate={{ scale: 1 }}
          className="w-9 h-9 rounded-full flex items-center justify-center text-white shadow-md relative z-10"
          style={{ 
            backgroundColor: bgColor,
            boxShadow: `0 4px 12px ${bgColor}40`,
          }}
        >
          <Check className="w-5 h-5 stroke-[3]" />
        </motion.div>
      );
    }
    
    // 3. Today: Show compact rings or spinner
    if (dayData.isToday) {
      if (dayData.hasActivity && dayData.totalMinutes >= 10) {
        // Build proper RingData from today's categories
        const todayRingData = buildMiniRingData(dayData.categories);
        
        if (todayRingData.length > 0) {
          return (
            <motion.div 
              initial={{ scale: 0.8 }}
              animate={{ scale: 1 }}
              className="relative z-10"
            >
              <CompactRingsProgress 
                ringData={todayRingData} 
                size={40}
                strokeWidth={3.5}
              />
            </motion.div>
          );
        }
        
        // Fallback: completed with check
        const bgColor = dayData.dominantCategory 
          ? DOT_COLORS[dayData.dominantCategory] 
          : '#00ADEF';
        
        return (
          <motion.div 
            initial={{ scale: 0.8 }}
            animate={{ scale: 1 }}
            className="w-10 h-10 rounded-full flex items-center justify-center text-white shadow-lg relative z-10"
            style={{ 
              backgroundColor: bgColor,
              boxShadow: `0 4px 16px ${bgColor}50`,
            }}
          >
            <Check className="w-5 h-5 stroke-[3]" />
          </motion.div>
        );
      }
      
      // Active spinner with progress
      const progress = dayData.totalMinutes / 30 * 100; // Assume 30min goal
      return (
        <div className="w-10 h-10 rounded-full flex items-center justify-center relative">
          <svg className="absolute w-full h-full -rotate-90">
            <circle 
              cx="20" cy="20" r="17" 
              stroke="#E2E8F0" 
              strokeWidth="4" 
              fill="transparent" 
            />
            <circle
              cx="20" cy="20" r="17"
              stroke={dominantColor || '#00ADEF'}
              strokeWidth="4"
              fill="transparent"
              strokeDasharray="107"
              strokeDashoffset={107 - (107 * Math.min(progress, 100)) / 100}
              strokeLinecap="round"
              className="transition-all duration-500"
            />
          </svg>
          <div className="w-6 h-6 bg-white dark:bg-slate-800 rounded-full shadow-sm flex items-center justify-center">
            <div 
              className="w-2 h-2 rounded-full animate-pulse"
              style={{ backgroundColor: dominantColor || '#00ADEF' }}
            />
          </div>
        </div>
      );
    }
    
    // 4. Future/Scheduled days
    if (dayData.isFuture && isTrainingDay(dayLetter)) {
      if (!isHealthMode) {
        return (
          <div className="relative">
            <Dumbbell className="text-gray-300 dark:text-gray-600 text-xl transform rotate-12" />
            <div 
              className="absolute -top-1 -right-1 w-3 h-3 rounded-full border-2 border-white dark:border-gray-900 flex items-center justify-center"
              style={{ backgroundColor: dominantColor || '#00ADEF' }}
            >
              <div className="w-1 h-1 bg-white rounded-full" />
            </div>
          </div>
        );
      } else {
        return (
          <div className="flex flex-col items-center">
            <span className="text-xs filter grayscale opacity-50">💪</span>
            <div 
              className="w-1.5 h-1.5 rounded-full mt-1 opacity-60"
              style={{ backgroundColor: dominantColor || '#00ADEF' }}
            />
          </div>
        );
      }
    }
    
    // 5. Rest days
    if (dayData.isRest) {
      if (!isHealthMode) {
        return <Bed className="text-gray-300 dark:text-gray-700 text-lg opacity-40" />;
      } else {
        return <span className="text-xs text-gray-400 opacity-40">z<sup>z</sup></span>;
      }
    }
    
    return null;
  };
  
  // Handle day click for tooltip
  const handleDayClick = (day: DaySchedule, index: number, event: React.MouseEvent) => {
    const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
    const dayData = weekActivityData.get(index) || null;
    
    // Calculate date string for this day
    const today = new Date();
    const dayDate = new Date(today);
    const todayIndex = today.getDay();
    dayDate.setDate(today.getDate() + (index - todayIndex));
    
    setTooltip({
      visible: true,
      x: rect.left + rect.width / 2,
      y: rect.top,
      day: day.day,
      date: dayDate.toISOString().split('T')[0],
      data: dayData,
    });
    
    // Also call parent handler if provided
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

  // Fallback: Empty state
  if (!schedule || schedule.length === 0) {
    return (
      <div className="bg-white dark:bg-[#1E1E1E] rounded-3xl p-6 shadow-sm border border-gray-100 dark:border-gray-800 mb-6">
        <div className="flex justify-center items-center py-4">
          <p className="text-sm text-gray-400">טוען לו״ז שבועי...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-[#1E1E1E] rounded-3xl p-5 shadow-sm border border-gray-100 dark:border-gray-800 mb-6 relative z-10">
      {/* Header Section */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-bold text-gray-900 dark:text-white">לו״ז אימונים</h2>
          <div className="flex items-center gap-1.5 text-xs font-medium text-gray-500 dark:text-gray-400 mt-1">
            <div 
              className="w-2 h-2 rounded-full animate-pulse"
              style={{ backgroundColor: dominantColor || '#00ADEF' }}
            />
            <span>
              {streak > 0 
                ? `${streak} ימים ברצף 🔥`
                : 'התוכנית המותאמת שלך פעילה'
              }
            </span>
          </div>
        </div>
        <button className="p-2.5 bg-gray-50 dark:bg-gray-800 rounded-2xl text-gray-400 hover:text-[#00ADEF] transition-colors">
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
        </button>
      </div>

      {/* Days Grid with Liquid Path */}
      <div ref={containerRef} className="relative px-2">
        {/* Liquid Momentum Path (behind the day circles) */}
        {containerWidth > 0 && completedIndices.length > 1 && (
          <LiquidMomentumPath 
            completedIndices={completedIndices}
            dominantColor={dominantColor || '#06B6D4'}
            containerWidth={containerWidth}
          />
        )}
        
        <div className="flex justify-between items-start relative z-10">
          {schedule.map((day, index) => {
            const isToday = day.day === HEBREW_DAYS[new Date().getDay()];
            const isSelected = isTrainingDay(day.day);
            const dayData = weekActivityData.get(index);
            
            return (
              <div
                key={index}
                className="flex flex-col items-center gap-2 group relative"
              >
                {/* Day label */}
                <span className={`text-xs font-black transition-colors ${
                  isToday 
                    ? 'text-[#00ADEF]' 
                    : isSelected 
                      ? 'text-gray-900 dark:text-gray-200' 
                      : 'text-gray-300 dark:text-gray-600'
                }`}>
                  {day.day}
                </span>
                
                {/* Day circle/icon */}
                <button
                  onClick={(e) => handleDayClick(day, index, e)}
                  className="flex flex-col items-center transition-transform group-active:scale-90"
                >
                  <div className="flex items-center justify-center min-h-[44px]">
                    {dayData && getDayIcon(day, dayData)}
                  </div>
                  
                  {/* Activity Dots */}
                  {dayData && dayData.hasActivity && (
                    <ActivityDots 
                      categories={dayData.categories}
                      isCompleted={dayData.isCompleted}
                    />
                  )}
                </button>
                
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

      {/* Bottom Progress Indicator - Compact */}
      <div className="mt-5 pt-3 border-t border-gray-50 dark:border-gray-800/50 flex items-center justify-center">
        {/* Remaining workouts - Centered */}
        <span 
          className="text-xs font-bold"
          style={{ color: dominantColor || '#00ADEF' }}
        >
          {remainingWorkouts > 0 
            ? `${remainingWorkouts} אימונים נותרו השבוע`
            : 'הושלמו כל האימונים! 🎉'
          }
        </span>
      </div>
    </div>
  );
}