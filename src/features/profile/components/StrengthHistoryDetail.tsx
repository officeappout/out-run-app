'use client';

import React from 'react';
import { motion } from 'framer-motion';
import { ArrowRight, Dumbbell, Timer, Flame, Layers, Star } from 'lucide-react';
import { WorkoutHistoryEntry } from '@/features/workout-engine/core/services/storage.service';

interface Props {
  workout: WorkoutHistoryEntry;
  onClose: () => void;
}

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  if (m === 0) return `${s} שנ'`;
  if (s === 0) return `${m} דק'`;
  return `${m}:${String(s).padStart(2, '0')} דק'`;
}

function formatDate(date: Date): string {
  return date.toLocaleDateString('he-IL', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

function DifficultyBolts({ level }: { level?: 1 | 2 | 3 }) {
  const count = level ?? 1;
  return (
    <div className="flex items-center gap-0.5">
      {[1, 2, 3].map((i) => (
        <span key={i} className={`text-lg ${i <= count ? 'text-yellow-400' : 'text-gray-200'}`}>⚡</span>
      ))}
    </div>
  );
}

export default function StrengthHistoryDetail({ workout, onClose }: Props) {
  const completionRate =
    workout.setsPlanned && workout.setsPlanned > 0
      ? Math.round(((workout.setsCompleted ?? 0) / workout.setsPlanned) * 100)
      : null;

  const stats: { icon: React.ReactNode; label: string; value: string }[] = [
    {
      icon: <Timer className="w-5 h-5 text-[#00ADEF]" />,
      label: 'משך האימון',
      value: formatDuration(workout.duration),
    },
    {
      icon: <Flame className="w-5 h-5 text-orange-400" />,
      label: 'קלוריות',
      value: `${workout.calories} קל'`,
    },
    ...(workout.setsCompleted != null
      ? [
          {
            icon: <Layers className="w-5 h-5 text-purple-400" />,
            label: 'סטים שהושלמו',
            value: workout.setsPlanned
              ? `${workout.setsCompleted} / ${workout.setsPlanned}`
              : `${workout.setsCompleted}`,
          },
        ]
      : []),
  ];

  return (
    <div className="fixed inset-0 z-[200] bg-[#F8FAFC] flex flex-col" dir="rtl">
      {/* Header */}
      <div className="flex items-center gap-3 px-4 pt-safe pt-4 pb-3 bg-white border-b border-gray-100">
        <button
          onClick={onClose}
          className="p-2 rounded-full hover:bg-gray-100 transition-colors"
          aria-label="חזור"
        >
          <ArrowRight className="w-5 h-5 text-gray-600" />
        </button>
        <div className="flex-1">
          <h1 className="text-base font-bold text-gray-900">סיכום אימון כוח</h1>
          <p className="text-xs text-gray-500 mt-0.5">{formatDate(workout.date)}</p>
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto px-4 py-6 space-y-4">
        {/* Hero card */}
        <motion.div
          initial={{ y: 16, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ type: 'spring', stiffness: 260, damping: 22 }}
          className="bg-white rounded-2xl p-6 shadow-sm border border-gray-100 text-center"
        >
          <div className="w-16 h-16 rounded-full bg-gradient-to-br from-[#00ADEF] to-cyan-600 flex items-center justify-center mx-auto mb-4 shadow-md">
            <Dumbbell className="w-8 h-8 text-white" />
          </div>

          <DifficultyBolts level={workout.difficulty} />

          {completionRate != null && (
            <div className="mt-4">
              <div className="text-3xl font-black text-gray-900">{completionRate}%</div>
              <p className="text-xs text-gray-500 mt-0.5">השלמת האימון</p>
              <div className="w-full h-2 bg-gray-100 rounded-full mt-3 overflow-hidden">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${completionRate}%` }}
                  transition={{ duration: 0.8, ease: 'easeOut', delay: 0.3 }}
                  className="h-full rounded-full bg-gradient-to-r from-[#00ADEF] to-cyan-400"
                />
              </div>
            </div>
          )}
        </motion.div>

        {/* Stats grid */}
        <motion.div
          initial={{ y: 16, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ type: 'spring', stiffness: 260, damping: 22, delay: 0.08 }}
          className="grid grid-cols-2 gap-3"
        >
          {stats.map((stat, i) => (
            <div
              key={i}
              className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100 flex flex-col items-center gap-2"
            >
              {stat.icon}
              <div className="text-lg font-black text-gray-900">{stat.value}</div>
              <div className="text-[10px] font-semibold text-gray-500">{stat.label}</div>
            </div>
          ))}
        </motion.div>

        {/* Coins earned */}
        {workout.earnedCoins > 0 && (
          <motion.div
            initial={{ y: 16, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ type: 'spring', stiffness: 260, damping: 22, delay: 0.16 }}
            className="bg-amber-50 border border-amber-100 rounded-2xl p-4 flex items-center gap-3"
          >
            <Star className="w-5 h-5 text-amber-500 flex-shrink-0" />
            <div>
              <div className="text-sm font-bold text-amber-800">+{workout.earnedCoins} מטבעות</div>
              <div className="text-xs text-amber-600">הרווחת על האימון הזה</div>
            </div>
          </motion.div>
        )}
      </div>
    </div>
  );
}
