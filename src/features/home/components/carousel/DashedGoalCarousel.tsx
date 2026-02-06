"use client";

/**
 * DashedGoalCarousel Component
 * 
 * Horizontal swipable carousel showing weekly goals with segmented circular progress.
 * Each card displays a goal with dashed ring segments representing completion.
 * 
 * Features:
 * - Swipable horizontal scroll using Framer Motion
 * - Dashed/segmented circular progress (segments = goal count)
 * - Category-based colors (Cyan=Strength, Lime=Cardio, Purple=Maintenance)
 * - Persona-based ordering (relevant goals shown first)
 */

import React, { useMemo, useRef } from 'react';
import { motion, useAnimation, PanInfo } from 'framer-motion';
import { 
  Dumbbell, 
  Footprints, 
  Sparkles, 
  Timer,
  Trophy,
  Target,
  Flame,
} from 'lucide-react';
import { useUserStore } from '@/features/user';
import { useDailyActivity, useWeeklyProgress } from '@/features/activity';
import {
  ACTIVITY_COLORS,
  ACTIVITY_LABELS,
  type ActivityCategory,
} from '@/features/activity/types/activity.types';

// ============================================================================
// TYPES
// ============================================================================

interface WeeklyGoal {
  id: string;
  category: ActivityCategory;
  title: string;
  target: number;
  current: number;
  unit: string;
  icon: React.ReactNode;
  description?: string;
  priority: number; // Lower = higher priority (shown first)
}

interface DashedGoalCarouselProps {
  /** Custom goals (overrides auto-generation) */
  goals?: WeeklyGoal[];
  /** Show all goals or limit */
  maxVisible?: number;
  /** Card height */
  cardHeight?: number;
  /** Custom className */
  className?: string;
}

// ============================================================================
// DASHED RING COMPONENT
// ============================================================================

interface DashedRingProps {
  size: number;
  segments: number;
  completed: number;
  color: string;
  strokeWidth?: number;
}

function DashedRing({
  size,
  segments,
  completed,
  color,
  strokeWidth = 6,
}: DashedRingProps) {
  const center = size / 2;
  const radius = (size - strokeWidth) / 2 - 2;
  const circumference = 2 * Math.PI * radius;
  
  // Calculate dash array: each segment takes equal space
  // Gap between segments
  const gapRatio = 0.15; // 15% of each segment is gap
  const segmentLength = circumference / segments;
  const dashLength = segmentLength * (1 - gapRatio);
  const gapLength = segmentLength * gapRatio;
  
  // Create individual segment paths
  const segmentPaths = [];
  const anglePerSegment = 360 / segments;
  
  for (let i = 0; i < segments; i++) {
    const startAngle = -90 + (i * anglePerSegment); // Start from top
    const endAngle = startAngle + anglePerSegment * (1 - gapRatio);
    
    // Convert to radians
    const startRad = (startAngle * Math.PI) / 180;
    const endRad = (endAngle * Math.PI) / 180;
    
    // Calculate arc points
    const x1 = center + radius * Math.cos(startRad);
    const y1 = center + radius * Math.sin(startRad);
    const x2 = center + radius * Math.cos(endRad);
    const y2 = center + radius * Math.sin(endRad);
    
    const largeArcFlag = anglePerSegment * (1 - gapRatio) > 180 ? 1 : 0;
    
    const pathD = `M ${x1} ${y1} A ${radius} ${radius} 0 ${largeArcFlag} 1 ${x2} ${y2}`;
    
    const isCompleted = i < completed;
    
    segmentPaths.push(
      <motion.path
        key={i}
        d={pathD}
        fill="none"
        stroke={isCompleted ? color : `${color}20`}
        strokeWidth={strokeWidth}
        strokeLinecap="round"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: i * 0.1, duration: 0.3 }}
      />
    );
  }
  
  return (
    <svg width={size} height={size} className="overflow-visible">
      {segmentPaths}
    </svg>
  );
}

// ============================================================================
// GOAL CARD COMPONENT
// ============================================================================

interface GoalCardProps {
  goal: WeeklyGoal;
  index: number;
}

function GoalCard({ goal, index }: GoalCardProps) {
  const percentage = Math.min((goal.current / goal.target) * 100, 100);
  const isComplete = goal.current >= goal.target;
  const color = ACTIVITY_COLORS[goal.category].hex;
  
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ delay: index * 0.1 }}
      className={`
        flex-shrink-0 w-[140px] bg-white dark:bg-slate-800 
        rounded-2xl p-4 shadow-sm border border-gray-100 dark:border-slate-700
        relative overflow-hidden
        ${isComplete ? 'ring-2' : ''}
      `}
      style={{
        ringColor: isComplete ? color : undefined,
      }}
    >
      {/* Completion badge */}
      {isComplete && (
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          className="absolute top-2 right-2 w-5 h-5 rounded-full flex items-center justify-center"
          style={{ backgroundColor: color }}
        >
          <Trophy className="w-3 h-3 text-white" />
        </motion.div>
      )}
      
      {/* Dashed Ring */}
      <div className="flex justify-center mb-3">
        <div className="relative">
          <DashedRing
            size={70}
            segments={goal.target}
            completed={goal.current}
            color={color}
            strokeWidth={5}
          />
          {/* Center icon */}
          <div 
            className="absolute inset-0 flex items-center justify-center"
            style={{ color }}
          >
            {goal.icon}
          </div>
        </div>
      </div>
      
      {/* Title */}
      <h4 className="text-xs font-bold text-gray-900 dark:text-white text-center mb-1 line-clamp-1">
        {goal.title}
      </h4>
      
      {/* Progress text */}
      <p className="text-[10px] text-gray-500 dark:text-gray-400 text-center">
        {goal.current}/{goal.target} {goal.unit}
      </p>
      
      {/* Category indicator */}
      <div className="flex justify-center mt-2">
        <span 
          className="text-[9px] font-bold px-2 py-0.5 rounded-full"
          style={{ 
            backgroundColor: `${color}15`,
            color: color,
          }}
        >
          {ACTIVITY_LABELS[goal.category].he}
        </span>
      </div>
    </motion.div>
  );
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export default function DashedGoalCarousel({
  goals: customGoals,
  maxVisible = 6,
  cardHeight = 180,
  className = '',
}: DashedGoalCarouselProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const { profile } = useUserStore();
  const { summary: weeklySummary, daysWithActivity } = useWeeklyProgress();
  const { userProgram } = useDailyActivity();
  
  // Get user's lifestyle/persona for priority ordering
  const userPersona = profile?.personaId || profile?.lifestyle?.lifestyleTags?.[0] || 'general';
  
  // Generate weekly goals based on user's program and progress
  const weeklyGoals = useMemo((): WeeklyGoal[] => {
    if (customGoals) return customGoals;
    
    // Default goals based on weekly tracking
    const strengthSessions = weeklySummary?.categoryTotals?.strength 
      ? Math.floor(weeklySummary.categoryTotals.strength / 30) 
      : 0;
    const cardioSessions = weeklySummary?.categoryTotals?.cardio 
      ? Math.floor(weeklySummary.categoryTotals.cardio / 30) 
      : 0;
    const maintenanceSessions = weeklySummary?.categoryTotals?.maintenance 
      ? Math.floor(weeklySummary.categoryTotals.maintenance / 20) 
      : 0;
    
    // Base goals
    const baseGoals: WeeklyGoal[] = [
      {
        id: 'strength-sessions',
        category: 'strength',
        title: 'אימוני כוח',
        target: 3,
        current: strengthSessions,
        unit: 'אימונים',
        icon: <Dumbbell className="w-6 h-6" />,
        description: '3 אימוני כוח בשבוע',
        priority: 1,
      },
      {
        id: 'cardio-sessions',
        category: 'cardio',
        title: 'אימוני קרדיו',
        target: 3,
        current: cardioSessions,
        unit: 'אימונים',
        icon: <Footprints className="w-6 h-6" />,
        description: '3 אימוני קרדיו בשבוע',
        priority: 2,
      },
      {
        id: 'maintenance-sessions',
        category: 'maintenance',
        title: 'גמישות ומוביליטי',
        target: 2,
        current: maintenanceSessions,
        unit: 'אימונים',
        icon: <Sparkles className="w-6 h-6" />,
        description: '2 אימוני גמישות',
        priority: 3,
      },
      {
        id: 'active-days',
        category: 'cardio',
        title: 'ימים פעילים',
        target: 5,
        current: daysWithActivity,
        unit: 'ימים',
        icon: <Flame className="w-6 h-6" />,
        description: '5 ימים עם פעילות',
        priority: 4,
      },
      {
        id: 'weekly-minutes',
        category: 'strength',
        title: 'דקות אימון',
        target: 150,
        current: weeklySummary 
          ? Object.values(weeklySummary.categoryTotals).reduce((a, b) => a + b, 0) 
          : 0,
        unit: 'דקות',
        icon: <Timer className="w-6 h-6" />,
        description: '150 דקות שבועיות',
        priority: 5,
      },
      {
        id: 'personal-best',
        category: 'strength',
        title: 'שיאים אישיים',
        target: 2,
        current: 1, // This would come from achievements
        unit: 'שיאים',
        icon: <Target className="w-6 h-6" />,
        description: 'שבור 2 שיאים',
        priority: 6,
      },
    ];
    
    // Adjust priority based on persona
    const adjustedGoals = baseGoals.map(goal => {
      let priorityBonus = 0;
      
      // Athletes prioritize strength
      if (['athlete', 'fitness_center'].includes(userPersona)) {
        if (goal.category === 'strength') priorityBonus = -2;
      }
      // Parents/WFH prioritize quick workouts
      else if (['parent', 'wfh'].includes(userPersona)) {
        if (goal.id === 'active-days') priorityBonus = -2;
        if (goal.category === 'maintenance') priorityBonus = -1;
      }
      // Seniors prioritize maintenance
      else if (userPersona === 'senior') {
        if (goal.category === 'maintenance') priorityBonus = -3;
        if (goal.category === 'cardio') priorityBonus = -1;
      }
      // Students prioritize cardio
      else if (userPersona === 'student') {
        if (goal.category === 'cardio') priorityBonus = -2;
      }
      // Office workers need movement
      else if (userPersona === 'office') {
        if (goal.id === 'active-days') priorityBonus = -3;
        if (goal.category === 'cardio') priorityBonus = -1;
      }
      
      // Adjust based on user's primary program
      if (userProgram) {
        const programLower = userProgram.toLowerCase();
        if (['running', 'cardio', 'walking'].includes(programLower) && goal.category === 'cardio') {
          priorityBonus = -3;
        } else if (['strength', 'calisthenics', 'upper_body', 'full_body'].includes(programLower) && goal.category === 'strength') {
          priorityBonus = -3;
        }
      }
      
      return { ...goal, priority: goal.priority + priorityBonus };
    });
    
    // Sort by priority (lower = first)
    return adjustedGoals.sort((a, b) => a.priority - b.priority);
  }, [customGoals, weeklySummary, daysWithActivity, userPersona, userProgram]);
  
  // Limit visible goals
  const visibleGoals = weeklyGoals.slice(0, maxVisible);
  
  // Handle drag/swipe
  const handleDragEnd = (e: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => {
    const scrollContainer = scrollRef.current;
    if (!scrollContainer) return;
    
    const velocity = info.velocity.x;
    const offset = info.offset.x;
    
    if (Math.abs(velocity) > 500 || Math.abs(offset) > 100) {
      const direction = velocity > 0 || offset > 0 ? -1 : 1;
      const scrollAmount = 150; // Card width
      scrollContainer.scrollBy({
        left: direction * scrollAmount,
        behavior: 'smooth',
      });
    }
  };
  
  if (visibleGoals.length === 0) {
    return null;
  }

  return (
    <div className={`relative ${className}`}>
      {/* Header */}
      <div className="flex items-center justify-between mb-3 px-1">
        <h3 className="text-sm font-bold text-gray-900 dark:text-white">
          יעדים שבועיים
        </h3>
        <span className="text-[10px] text-gray-400">
          {weeklyGoals.filter(g => g.current >= g.target).length}/{weeklyGoals.length} הושלמו
        </span>
      </div>
      
      {/* Scrollable container */}
      <motion.div
        ref={scrollRef}
        className="flex gap-3 overflow-x-auto pb-2 scrollbar-hide"
        style={{ 
          scrollbarWidth: 'none',
          msOverflowStyle: 'none',
          WebkitOverflowScrolling: 'touch',
        }}
        drag="x"
        dragConstraints={{ left: -((visibleGoals.length - 2) * 150), right: 0 }}
        onDragEnd={handleDragEnd}
      >
        {visibleGoals.map((goal, index) => (
          <GoalCard key={goal.id} goal={goal} index={index} />
        ))}
      </motion.div>
      
      {/* Scroll indicators */}
      <div className="flex justify-center gap-1 mt-3">
        {visibleGoals.slice(0, Math.min(5, visibleGoals.length)).map((_, idx) => (
          <div
            key={idx}
            className={`w-1.5 h-1.5 rounded-full transition-all ${
              idx === 0 ? 'bg-gray-400' : 'bg-gray-200 dark:bg-gray-700'
            }`}
          />
        ))}
      </div>
    </div>
  );
}

// ============================================================================
// EXPORTS
// ============================================================================

export { DashedGoalCarousel, DashedRing };
export type { WeeklyGoal };
