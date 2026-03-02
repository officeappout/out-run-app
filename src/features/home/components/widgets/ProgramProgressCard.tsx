"use client";

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronUp, ChevronDown } from 'lucide-react';
import { getProgramIcon, CheckMarkBadge, BRAND_CYAN } from '@/features/content/programs';

// ============================================================================
// TYPES
// ============================================================================

export interface GoalItem {
  id: string;
  label: string;
  isCompleted: boolean;
}

export interface ProgramProgressCardProps {
  programName: string;
  iconKey?: string;
  currentLevel: number;
  maxLevel: number;
  progressPercent: number; // 0-100
  goals?: GoalItem[];
  programCount?: number;
  className?: string;
}

// ============================================================================
// PROGRESS RING
// ============================================================================

function ProgressRing({
  percentage,
  size = 80,
  strokeWidth = 6,
}: {
  percentage: number;
  size?: number;
  strokeWidth?: number;
}) {
  const center = size / 2;
  const radius = (size - strokeWidth) / 2 - 1;
  const circumference = 2 * Math.PI * radius;
  const filled = (percentage / 100) * circumference;
  const roundedPct = Math.round(percentage);

  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={center} cy={center} r={radius}
          fill="none" stroke="#E2E8F0" strokeWidth={strokeWidth}
          className="dark:stroke-slate-700"
        />
        <motion.circle
          cx={center} cy={center} r={radius}
          fill="none" stroke={BRAND_CYAN} strokeWidth={strokeWidth}
          strokeLinecap="round" strokeDasharray={circumference}
          initial={{ strokeDashoffset: circumference }}
          animate={{ strokeDashoffset: circumference - filled }}
          transition={{ duration: 1, ease: 'easeOut' }}
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <span className="text-xl font-black text-gray-800 dark:text-white leading-none tabular-nums">
          {roundedPct}<span className="text-sm font-bold">%</span>
        </span>
      </div>
    </div>
  );
}

// ============================================================================
// GOAL CHECK ICON
// ============================================================================

function GoalCheckIcon({ completed }: { completed: boolean }) {
  if (completed) {
    return <CheckMarkBadge size={22} />;
  }
  return (
    <div
      className="rounded-full"
      style={{ width: 22, height: 22, border: '0.5px solid #CBD5E1' }}
    />
  );
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export function ProgramProgressCard({
  programName,
  iconKey,
  currentLevel,
  maxLevel,
  progressPercent,
  goals = [],
  programCount = 1,
  className = '',
}: ProgramProgressCardProps) {
  const nextLevel = currentLevel + 1;
  const remainingPercent = Math.max(0, 100 - Math.round(progressPercent));
  const [expanded, setExpanded] = useState(false);
  const completedCount = goals.filter(g => g.isCompleted).length;
  const hasGoals = goals.length > 0;
  const isCarousel = programCount > 1;

  const cardStyle: React.CSSProperties = isCarousel
    ? { width: 320, minHeight: 107, flexShrink: 0 }
    : {};

  return (
    <div
      className={`bg-white dark:bg-slate-800 overflow-hidden w-full max-w-[358px] mx-auto ${className}`}
      style={{
        ...cardStyle,
        borderRadius: 12,
        border: '0.5px solid #E0E9FF',
        boxShadow: '0 1px 4px 0 rgba(0,0,0,0.04)',
      }}
      dir="rtl"
    >
      {/* ── Top section: clickable to expand ──────────────────── */}
      <button
        onClick={() => hasGoals && setExpanded(v => !v)}
        className="w-full text-right flex items-center justify-between"
        style={{ padding: 16 }}
        disabled={!hasGoals}
      >
        {/* Right side: program info */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1.5">
            <span className="text-[#00C9F2] flex-shrink-0">
              {getProgramIcon(iconKey, 'w-5 h-5')}
            </span>
            <h3 className="text-[15px] font-bold text-gray-900 dark:text-white truncate">
              {programName}
            </h3>
          </div>

          <p className="text-sm text-gray-600 dark:text-gray-300 font-semibold mb-0.5">
            רמה {currentLevel}/{maxLevel}
          </p>

          {nextLevel <= maxLevel && (
            <div className="flex items-center gap-1" style={{ color: '#374151' }}>
              <span className="text-xs">
                עוד {remainingPercent}% לרמה {nextLevel}
              </span>
              <ChevronUp className="w-3 h-3" />
            </div>
          )}
        </div>

        {/* Left side: progress ring */}
        <ProgressRing
          percentage={progressPercent}
          size={isCarousel ? 68 : 80}
          strokeWidth={isCarousel ? 5 : 6}
        />
      </button>

      {/* ── Expandable goals ──────────────────────────────────── */}
      <AnimatePresence>
        {expanded && hasGoals && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: 'easeInOut' }}
            className="overflow-hidden"
          >
            {/* Separator */}
            <div style={{ height: 0.5, backgroundColor: '#E0E9FF' }} />

            {/* Goal items */}
            <div className="space-y-3" style={{ padding: '12px 16px 16px' }}>
              {goals.map((goal, idx) => (
                <motion.div
                  key={goal.id}
                  initial={{ opacity: 0, x: 8 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: idx * 0.05 }}
                  className="flex items-center gap-3"
                >
                  <GoalCheckIcon completed={goal.isCompleted} />
                  <span
                    className={`text-sm leading-snug ${
                      goal.isCompleted
                        ? 'text-gray-400 dark:text-gray-500 line-through'
                        : 'text-gray-800 dark:text-gray-200'
                    }`}
                  >
                    {goal.label}
                  </span>
                </motion.div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default ProgramProgressCard;
