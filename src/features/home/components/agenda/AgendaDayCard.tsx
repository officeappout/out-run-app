'use client';

/**
 * AgendaDayCard — Compact Runna-style agenda row (~60px training / 44px rest).
 *
 * Ring & Schedule rules:
 *   - Adding a workout positions the icon — does NOT mark complete.
 *   - "Completed" state only comes from finishing the actual workout engine.
 *   - Past/Today rows show filled chips; future rows show ghost icons.
 *   - No manual "Check" button.
 *
 * Drag & Drop:
 *   - Training rows expose an `onDragToDate` prop to move workouts between days.
 *   - Drag handle: the activity icons area is the grab target.
 */

import React, { useEffect, useState, useCallback } from 'react';
import { motion } from 'framer-motion';
import { Plus, GripVertical, Dumbbell, Footprints, Sparkles, Check } from 'lucide-react';
import { getScheduleEntry, hydrateFromTemplate } from '@/features/user/scheduling/services/userSchedule.service';
import type { UserScheduleEntry, RecurringTemplate, ScheduleActivityCategory } from '@/features/user/scheduling/types/schedule.types';
import { getHebrewDayLetter } from '@/features/user/scheduling/utils/dateUtils';

// ── Types ──────────────────────────────────────────────────────────────────

type CardMode = 'past' | 'today' | 'future' | 'rest';

interface AgendaDayCardProps {
  date: string;
  isSelected: boolean;
  onSelect: () => void;
  userId: string;
  recurringTemplate?: RecurringTemplate;
  onStartWorkout?: () => void;
  onAddWorkout?: (date: string) => void;
  /** When truthy, shows a drag handle — actual drag logic lives in RollingAgenda Reorder */
  onDragToDate?: (...args: unknown[]) => void;
  refreshKey?: number;
  /** Ref callback so the parent can measure position for drag-and-drop */
  rowRef?: (el: HTMLDivElement | null) => void;
}

// ── Helpers ────────────────────────────────────────────────────────────────

const HEBREW_DAY_SHORT: Record<string, string> = {
  'א': 'א׳', 'ב': 'ב׳', 'ג': 'ג׳', 'ד': 'ד׳',
  'ה': 'ה׳', 'ו': 'ו׳', 'ש': 'ש׳',
};

const CATEGORY_ICON: Record<ScheduleActivityCategory, React.FC<{ className?: string }>> = {
  strength: Dumbbell,
  cardio: Footprints,
  maintenance: Sparkles,
};

const CATEGORY_EMOJI: Record<ScheduleActivityCategory, string> = {
  strength: '💪',
  cardio: '🏃',
  maintenance: '⚡',
};

function resolveCardMode(iso: string): CardMode {
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const target = new Date(iso + 'T00:00:00');
  if (target.getTime() === today.getTime()) return 'today';
  if (target < today) return 'past';
  return 'future';
}

function formatTime(hhmm: string | undefined): string | null {
  if (!hhmm) return null;
  const [h, m] = hhmm.split(':');
  if (!h || !m) return null;
  return `${h.padStart(2, '0')}:${m.padStart(2, '0')}`;
}

// ── Component ──────────────────────────────────────────────────────────────

export default function AgendaDayCard({
  date,
  isSelected,
  onSelect,
  userId,
  recurringTemplate,
  onAddWorkout,
  onDragToDate,
  refreshKey,
  rowRef,
}: AgendaDayCardProps) {
  const [entry, setEntry] = useState<UserScheduleEntry | null | undefined>(undefined);
  const baseMode = resolveCardMode(date);
  const d = new Date(date + 'T00:00:00');
  const dayLetter = getHebrewDayLetter(d);
  const dayShort = HEBREW_DAY_SHORT[dayLetter] ?? dayLetter;
  const dayNum = d.getDate();

  useEffect(() => {
    if (!userId) { setEntry(null); return; }
    let cancelled = false;
    async function load() {
      try {
        let e = await getScheduleEntry(userId, date);
        if (!e && recurringTemplate) {
          e = await hydrateFromTemplate(userId, date, recurringTemplate);
        }
        if (!cancelled) setEntry(e);
      } catch {
        if (!cancelled) setEntry(null);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [userId, date, recurringTemplate, refreshKey]);

  const handleAddClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    onAddWorkout?.(date);
  }, [onAddWorkout, date]);

  const isLoading = entry === undefined;
  const isRest = entry === null || entry?.type === 'rest';
  const isCompleted = entry?.completed ?? false;
  const mode: CardMode = isRest ? 'rest' : baseMode;
  const timeLabel = formatTime(entry?.startTime);
  const showAdd = onAddWorkout && (mode === 'future' || mode === 'rest' || (mode === 'today' && !isCompleted));
  const isDraggable = !!onDragToDate && !isRest && !isLoading;

  const cats: ScheduleActivityCategory[] = entry?.scheduledCategories && entry.scheduledCategories.length > 0
    ? entry.scheduledCategories
    : (isRest ? [] : ['strength']);

  // ── Visual styling ────────────────────────────────────────────────────

  const isToday = mode === 'today';
  const isFutureRest = isRest && baseMode === 'future';
  const isPastRest = isRest && baseMode === 'past';

  return (
    <div ref={rowRef} data-date={date}>
      <button
        onClick={onSelect}
        className={`
          w-full flex items-center gap-2 px-1 text-right transition-colors
          ${isRest ? 'h-[44px]' : 'h-[60px]'}
          ${isSelected ? 'bg-cyan-50/60 dark:bg-cyan-950/20' : 'bg-transparent'}
          active:bg-gray-50 dark:active:bg-gray-800/40
        `}
        dir="rtl"
      >
        {/* ── RIGHT: Day label + date number ── */}
        <div className="w-11 flex-shrink-0 flex flex-col items-center justify-center">
          <span className={`text-[10px] font-bold uppercase leading-none ${
            isToday
              ? 'text-cyan-500'
              : 'text-gray-900 dark:text-gray-300'
          }`}>
            {dayShort}
          </span>
          <span className={`leading-tight tabular-nums ${
            isToday
              ? 'text-lg font-black text-cyan-600 dark:text-cyan-400'
              : isCompleted
                ? 'text-lg font-black text-emerald-600 dark:text-emerald-400'
                : isRest
                  ? 'text-base font-semibold text-gray-700 dark:text-gray-400'
                  : 'text-lg font-black text-gray-900 dark:text-gray-100'
          }`}>
            {dayNum}
          </span>
        </div>

        {/* ── Timeline dot — hidden for rest days ── */}
        <div className="flex flex-col items-center self-stretch py-3 flex-shrink-0">
          {(isFutureRest || isPastRest) ? (
            <div className="w-2 h-2 flex-shrink-0" />
          ) : (
            <div className={`w-2 h-2 rounded-full flex-shrink-0 ${
              isToday
                ? 'bg-cyan-500'
                : isCompleted
                  ? 'bg-emerald-500'
                  : 'bg-gray-200 dark:bg-gray-700'
            }`} />
          )}
          <div className={`w-px flex-1 mt-1 ${
            isRest ? 'bg-gray-200 dark:bg-gray-700' : 'bg-gray-200 dark:bg-gray-700'
          }`} />
        </div>

        {/* ── CENTER: Activity icons + info ── */}
        <div className="flex-1 min-w-0 flex items-center gap-2">
          {isLoading ? (
            <div className="h-3 w-20 bg-gray-100 dark:bg-gray-800 rounded-full animate-pulse" />
          ) : mode === 'rest' ? (
            <span className="text-[11px] text-gray-700 dark:text-gray-400 font-medium tracking-wide">מנוחה</span>
          ) : isCompleted ? (
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1">
                {cats.map((cat) => (
                  <span key={cat} className="text-sm">{CATEGORY_EMOJI[cat]}</span>
                ))}
              </div>
              <div className="flex items-center gap-1 px-2 py-0.5 rounded-lg bg-emerald-50 dark:bg-emerald-900/20">
                <Check className="w-3 h-3 text-emerald-500" />
                <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400">הושלם</span>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              {/* Activity category icons */}
              <div className="flex items-center gap-1">
                {cats.map((cat) => (
                  <span key={cat} className="text-sm">
                    {CATEGORY_EMOJI[cat]}
                  </span>
                ))}
              </div>
              {/* Status chip */}
              {isToday ? (
                <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-lg bg-cyan-50 dark:bg-cyan-900/20">
                  <div className="w-1.5 h-1.5 rounded-full bg-cyan-500 animate-pulse" />
                  <span className="text-[10px] font-bold text-cyan-600 dark:text-cyan-400">
                    {cats.length > 1 ? `${cats.length} סוגים` : 'מתוכנן'}
                  </span>
                </div>
              ) : (
                <span className="text-[10px] font-medium text-gray-700 dark:text-gray-400">
                  {cats.length > 1 ? `${cats.length} סוגים` : 'מתוכנן'}
                </span>
              )}
              {timeLabel && (
                <span className={`text-[11px] font-bold tabular-nums ${
                  isToday ? 'text-cyan-500' : 'text-gray-800 dark:text-gray-300'
                }`}>{timeLabel}</span>
              )}
            </div>
          )}
        </div>

        {/* ── LEFT: Drag handle (training only) + Add button ── */}
        <div className="flex items-center gap-1 flex-shrink-0">
          {showAdd && (
            <button
              onClick={handleAddClick}
              className={`flex items-center gap-1 px-2 py-1 active:scale-90 transition-all ${
                isRest
                  ? 'text-gray-700 dark:text-gray-400 hover:text-cyan-500'
                  : 'text-gray-800 dark:text-gray-300 hover:text-cyan-500'
              }`}
              aria-label="הוסף אימון ליום זה"
            >
              <Plus className="w-3.5 h-3.5" strokeWidth={2.5} />
              <span className="text-[11px] font-bold">הוסף</span>
            </button>
          )}
          {isDraggable && (
            <div className="text-gray-200 dark:text-gray-700 cursor-grab active:cursor-grabbing px-0.5">
              <GripVertical className="w-3.5 h-3.5" />
            </div>
          )}
        </div>
      </button>
    </div>
  );
}
