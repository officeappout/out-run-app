"use client";

import React from 'react';
import { motion } from 'framer-motion';
import { useSessionStore } from '../../../core/store/useSessionStore';
import { useRunningPlayer } from '../store/useRunningPlayer';
import { formatPace } from '../../../core/utils/formatPace';
import type { RunBlock } from '../types/run-block.type';

interface IntervalRunViewProps {
  currentBlock?: RunBlock | null;
  timeRemainingSeconds?: number;
  distanceRemainingMeters?: number;
}

export const IntervalRunView: React.FC<IntervalRunViewProps> = ({
  currentBlock,
  timeRemainingSeconds,
  distanceRemainingMeters,
}) => {
  const { totalDuration } = useSessionStore();
  const { currentPace } = useRunningPlayer();

  const targetLabel = currentBlock?.label || 'אינטרוול';

  const formatTime = (s?: number) => {
    if (!s || s <= 0) return '00:00';
    const m = Math.floor(s / 60)
      .toString()
      .padStart(2, '0');
    const sec = Math.floor(s % 60)
      .toString()
      .padStart(2, '0');
    return `${m}:${sec}`;
  };

  const remainingDistanceKm =
    distanceRemainingMeters && distanceRemainingMeters > 0
      ? (distanceRemainingMeters / 1000).toFixed(2)
      : null;

  // Gauge percentage based on target pace percentage, if present
  const gaugePercent =
    currentBlock?.targetPacePercentage && currentBlock.targetPacePercentage.max
      ? Math.min(
          150,
          Math.max(
            50,
            ((currentBlock.targetPacePercentage.max +
              (currentBlock.targetPacePercentage.min || 0)) /
              2) *
              100,
          ),
        )
      : 100;

  return (
    <div className="absolute inset-0 z-20 pointer-events-none flex flex-col justify-start p-4 pt-8">
      <div className="pointer-events-auto mx-auto w-full max-w-md bg-white/95 rounded-3xl shadow-xl border border-gray-100 px-6 py-5">
        {/* Interval Title */}
        <div className="mb-3 flex items-center justify-between">
          <div>
            <div className="text-[11px] font-bold text-gray-400 uppercase tracking-widest">
              אינטרוול נוכחי
            </div>
            <div className="mt-1 text-lg font-[900] text-gray-900">
              {targetLabel}
            </div>
          </div>
          <div className="text-right">
            <div className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">
              זמן כולל
            </div>
            <div className="text-base font-[900] text-gray-800">
              {formatTime(totalDuration)}
            </div>
          </div>
        </div>

        {/* Pace Gauge */}
        <div className="mt-3 mb-4">
          <div className="flex items-center justify-between text-[10px] font-bold text-gray-400 mb-1">
            <span>קצב נוכחי</span>
            <span>קצב יעד</span>
          </div>
          <div className="relative h-3 rounded-full bg-gray-100 overflow-hidden">
            {/* Target band */}
            <div className="absolute inset-y-0 left-0 right-0 mx-8 rounded-full bg-emerald-100" />
            {/* Current marker */}
            <motion.div
              className="absolute inset-y-0 w-2 rounded-full bg-emerald-500 shadow-md"
              initial={{ x: 0 }}
              animate={{ x: `${gaugePercent - 100}%` }}
              transition={{ type: 'spring', stiffness: 120, damping: 20 }}
            />
          </div>
          <div className="mt-2 flex items-center justify-between text-[11px] font-[900] text-gray-700">
            <span>{formatPace(currentPace)}</span>
            <span>
              {currentBlock?.targetPacePercentage
                ? `${currentBlock.targetPacePercentage.min || 0}–${
                    currentBlock.targetPacePercentage.max
                  }%`
                : '—'}
            </span>
          </div>
        </div>

        {/* Remaining time / distance */}
        <div className="mt-4 grid grid-cols-2 gap-3 border-t border-gray-100 pt-3">
          <div className="text-center">
            <div className="text-[11px] font-bold text-gray-400 uppercase tracking-widest mb-1">
              זמן נותר
            </div>
            <div className="text-2xl font-[900] text-gray-900">
              {formatTime(timeRemainingSeconds)}
            </div>
          </div>
          <div className="text-center">
            <div className="text-[11px] font-bold text-gray-400 uppercase tracking-widest mb-1">
              מרחק נותר
            </div>
            <div className="text-2xl font-[900] text-gray-900">
              {remainingDistanceKm ?? '—'}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

