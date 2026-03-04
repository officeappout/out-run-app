'use client';

import React from 'react';
import { Play, ArrowLeft } from 'lucide-react';
import { usePlannedRunEngine } from '../../hooks/usePlannedRunEngine';
import { formatPaceSeconds } from '../../../../core/services/running-engine.service';
import type RunWorkout from '../../types/run-workout.type';

interface WorkoutPreviewScreenProps {
  workout: RunWorkout;
  onStart: () => void;
  onBack: () => void;
}

export default function WorkoutPreviewScreen({
  workout,
  onStart,
  onBack,
}: WorkoutPreviewScreenProps) {
  const { zones, basePace, showNumbers } = usePlannedRunEngine();

  const totalDuration = workout.blocks.reduce(
    (sum, b) => sum + (b.durationSeconds ?? 0),
    0,
  );
  const totalDistance = workout.blocks.reduce(
    (sum, b) => sum + (b.distanceMeters ?? 0),
    0,
  );

  return (
    <div
      className="absolute inset-0 z-20 flex flex-col overflow-hidden bg-white"
      style={{ fontFamily: 'var(--font-simpler)' }}
    >
      {/* Header */}
      <header className="bg-[#00ADEF] text-white h-14 min-h-[3.5rem] flex items-center justify-between px-4 shadow-sm z-30 shrink-0">
        <div className="w-11" />
        <h1 className="text-lg font-bold tracking-wide">סקירת אימון</h1>
        <button
          onClick={onBack}
          className="w-8 h-8 flex items-center justify-center rounded-full active:bg-white/20 transition-colors min-w-[44px] min-h-[44px]"
        >
          <ArrowLeft className="transform rotate-180" size={24} />
        </button>
      </header>

      {/* Workout title + summary strip */}
      <div className="px-6 pt-6 pb-2">
        <h2 className="text-2xl font-black text-gray-900">{workout.title}</h2>
        {workout.description && (
          <p className="text-sm text-gray-500 mt-1">{workout.description}</p>
        )}

        <div className="flex items-center gap-4 mt-3">
          {workout.isQualityWorkout && (
            <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 px-2.5 py-0.5 rounded-full">
              אימון איכות
            </span>
          )}
          {totalDuration > 0 && (
            <span className="text-xs text-gray-400">
              {formatOverviewDuration(totalDuration)}
            </span>
          )}
          {totalDistance > 0 && (
            <span className="text-xs text-gray-400">
              {formatOverviewDistance(totalDistance)}
            </span>
          )}
          <span className="text-xs text-gray-400">
            {workout.blocks.length} בלוקים
          </span>
        </div>
      </div>

      {/* Divider */}
      <div className="px-6">
        <div className="h-px bg-gray-200 my-3" />
      </div>

      {/* Block list */}
      <div className="flex-grow overflow-auto px-6 pb-32">
        <div className="space-y-2">
          {workout.blocks.map((block, i) => {
            let paceLabel = '';
            if (showNumbers && basePace > 0) {
              if (block.zoneType && zones) {
                const z = zones[block.zoneType];
                paceLabel = `${formatPaceSeconds(z.minPace)}–${formatPaceSeconds(z.maxPace)}`;
              } else if (block.targetPacePercentage) {
                const minP = Math.round(
                  basePace * block.targetPacePercentage.min / 100,
                );
                const maxP = Math.round(
                  basePace * block.targetPacePercentage.max / 100,
                );
                paceLabel = `${formatPaceSeconds(minP)}–${formatPaceSeconds(maxP)}`;
              }
            }

            const metaLabel = block.durationSeconds
              ? formatBlockDuration(block.durationSeconds)
              : block.distanceMeters
                ? formatBlockDistance(block.distanceMeters)
                : '';

            return (
              <div
                key={block.id}
                className="flex items-center gap-3 rounded-xl bg-gray-50 px-4 py-3"
              >
                {/* Color indicator */}
                <div
                  className="w-1 h-10 rounded-full shrink-0"
                  style={{ backgroundColor: block.colorHex || '#9CA3AF' }}
                />

                {/* Info */}
                <div className="flex-grow min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold text-gray-900 truncate">
                      {block.label}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-[11px] text-gray-400">
                      {metaLabel}
                    </span>
                    {paceLabel && (
                      <span
                        className="text-[11px] text-gray-500 font-medium"
                        dir="ltr"
                      >
                        {paceLabel} /ק"מ
                      </span>
                    )}
                  </div>
                </div>

                {/* Block index badge */}
                <span className="text-[11px] font-bold text-gray-300 bg-gray-100 w-6 h-6 rounded-full flex items-center justify-center shrink-0">
                  {i + 1}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* Sticky start button */}
      <div
        className="absolute bottom-0 left-0 right-0 p-6 bg-gradient-to-t from-white via-white/95 to-transparent pointer-events-auto"
        style={{ paddingBottom: 'calc(1.5rem + env(safe-area-inset-bottom, 0px))' }}
      >
        <button
          onClick={onStart}
          className="w-full h-14 bg-[#00ADEF] text-white rounded-2xl flex items-center justify-center gap-3 text-lg font-bold shadow-lg active:scale-[0.98] transition-transform"
        >
          <Play size={24} fill="currentColor" />
          <span>התחל אימון</span>
        </button>
      </div>
    </div>
  );
}

function formatBlockDuration(s: number): string {
  if (s < 60) return `${s} שנ'`;
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return sec > 0
    ? `${m}:${sec.toString().padStart(2, '0')} דק'`
    : `${m} דק'`;
}

function formatBlockDistance(m: number): string {
  if (m >= 1000) return `${(m / 1000).toFixed(1)} ק"מ`;
  return `${m} מ'`;
}

function formatOverviewDuration(s: number): string {
  if (s < 60) return `${s} שניות`;
  const m = Math.floor(s / 60);
  return `~${m} דק'`;
}

function formatOverviewDistance(m: number): string {
  if (m >= 1000) return `${(m / 1000).toFixed(1)} ק"מ`;
  return `${m} מ'`;
}
