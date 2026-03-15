'use client';

/**
 * AgendaDayCard — Compact agenda row with running program awareness.
 *
 * Resolves workout details from:
 *   1. Firestore schedule entries (strength/general)
 *   2. profile.running.activeProgram.schedule (running workouts)
 *
 * Displays actual workout names, categories, and completion status.
 */

import React, { useEffect, useState, useCallback, useMemo } from 'react';
import { Plus, GripVertical, Footprints, Check, Zap, Timer, TrendingUp, Mountain } from 'lucide-react';
import { getScheduleEntry, hydrateFromTemplate } from '@/features/user/scheduling/services/userSchedule.service';
import type { UserScheduleEntry, RecurringTemplate, ScheduleActivityCategory } from '@/features/user/scheduling/types/schedule.types';
import { getHebrewDayLetter } from '@/features/user/scheduling/utils/dateUtils';
import { useUserStore } from '@/features/user';

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
  onDragToDate?: (...args: unknown[]) => void;
  refreshKey?: number;
  rowRef?: (el: HTMLDivElement | null) => void;
}

interface ResolvedRunningWorkout {
  name: string;
  category?: string;
  status: string;
}

// ── Helpers ────────────────────────────────────────────────────────────────

const DAY_LETTERS = ['א', 'ב', 'ג', 'ד', 'ה', 'ו', 'ש'];

const HEBREW_DAY_SHORT: Record<string, string> = {
  'א': 'א׳', 'ב': 'ב׳', 'ג': 'ג׳', 'ד': 'ד׳',
  'ה': 'ה׳', 'ו': 'ו׳', 'ש': 'ש׳',
};

const CATEGORY_LABELS_HE: Record<string, string> = {
  easy_run: 'ריצה קלה', long_run: 'ריצה ארוכה',
  short_intervals: 'אינטרוולים קצרים', long_intervals: 'אינטרוולים ארוכים',
  fartlek_easy: 'פארטלק קל', fartlek_structured: 'פארטלק מובנה',
  tempo: 'ריצת טמפו', hill_long: 'עליות ארוכות',
  hill_short: 'עליות קצרות', hill_sprints: 'ספרינט עליות',
  strides: 'סטריידים', recovery: 'התאוששות',
};

const CATEGORY_EMOJI: Record<ScheduleActivityCategory, string> = {
  strength: '💪',
  cardio: '🏃',
  maintenance: '⚡',
};

function getCategoryIcon(category: string | undefined) {
  switch (category) {
    case 'short_intervals': case 'long_intervals':
    case 'fartlek_easy': case 'fartlek_structured':
      return <Zap className="w-3 h-3" />;
    case 'tempo': return <Timer className="w-3 h-3" />;
    case 'long_run': return <TrendingUp className="w-3 h-3" />;
    case 'hill_long': case 'hill_short': case 'hill_sprints':
      return <Mountain className="w-3 h-3" />;
    default: return <Footprints className="w-3 h-3" />;
  }
}

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

/**
 * Map an ISO date to a running schedule entry using scheduleDays + program start.
 */
function resolveRunningEntry(
  iso: string,
  scheduleDays: string[],
  schedule: any[],
  programStartDate: Date | string | number | undefined,
  currentWeek: number,
): ResolvedRunningWorkout | null {
  if (!schedule?.length || !scheduleDays?.length) return null;

  const d = new Date(iso + 'T00:00:00');
  const dayIdx = d.getDay(); // 0=Sun
  const letter = DAY_LETTERS[dayIdx];
  if (!scheduleDays.includes(letter)) return null;

  // Calculate which week this date falls in relative to program start
  let weekNum = currentWeek;
  if (programStartDate) {
    const start = new Date(programStartDate);
    start.setHours(0, 0, 0, 0);
    const diffMs = d.getTime() - start.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    weekNum = Math.max(1, Math.floor(diffDays / 7) + 1);
  }

  // Find the slot index (1-based "day" in the schedule)
  const trainingDayIndices = scheduleDays
    .map((l) => DAY_LETTERS.indexOf(l))
    .filter((i) => i >= 0)
    .sort((a, b) => a - b);
  const slotIndex = trainingDayIndices.indexOf(dayIdx);
  if (slotIndex < 0) return null;
  const daySlot = slotIndex + 1;

  const entry = schedule.find(
    (e: any) => e.week === weekNum && e.day === daySlot,
  );
  if (!entry) return null;

  return {
    name: entry.workoutName || CATEGORY_LABELS_HE[entry.category] || 'אימון ריצה',
    category: entry.category,
    status: entry.status ?? 'pending',
  };
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
  const { profile } = useUserStore();
  const [entry, setEntry] = useState<UserScheduleEntry | null | undefined>(undefined);
  const baseMode = resolveCardMode(date);
  const d = new Date(date + 'T00:00:00');
  const dayLetter = getHebrewDayLetter(d);
  const dayShort = HEBREW_DAY_SHORT[dayLetter] ?? dayLetter;
  const dayNum = d.getDate();

  // Resolve running workout for this date
  const runningWorkout = useMemo(() => {
    const running = profile?.running;
    if (!running?.activeProgram?.schedule) return null;
    return resolveRunningEntry(
      date,
      running.scheduleDays ?? [],
      running.activeProgram.schedule as any[],
      running.activeProgram.startDate,
      running.activeProgram.currentWeek ?? 1,
    );
  }, [date, profile?.running]);

  const hasRunning = !!runningWorkout;
  const runCompleted = runningWorkout?.status === 'completed';

  useEffect(() => {
    // Skip Firestore lookup if we already have running schedule data for this day
    if (hasRunning) { setEntry(null); return; }
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
  }, [userId, date, recurringTemplate, refreshKey, hasRunning]);

  const handleAddClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    onAddWorkout?.(date);
  }, [onAddWorkout, date]);

  const isLoading = entry === undefined && !hasRunning;
  const isRest = !hasRunning && (entry === null || entry?.type === 'rest');
  const isCompleted = runCompleted || (entry?.completed ?? false);
  const mode: CardMode = isRest ? 'rest' : baseMode;
  const timeLabel = formatTime(entry?.startTime);
  const showAdd = onAddWorkout && !hasRunning && (mode === 'future' || mode === 'rest' || (mode === 'today' && !isCompleted));
  const isDraggable = !!onDragToDate && !isRest && !isLoading;

  const cats: ScheduleActivityCategory[] = hasRunning
    ? ['cardio']
    : entry?.scheduledCategories && entry.scheduledCategories.length > 0
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
          w-full flex items-center gap-1.5 px-1 text-right transition-colors
          ${isRest ? 'h-[36px]' : 'h-[44px]'}
          ${isSelected ? 'bg-cyan-50/60 dark:bg-cyan-950/20' : 'bg-transparent'}
          active:bg-gray-50 dark:active:bg-gray-800/40
        `}
        dir="rtl"
      >
        {/* ── RIGHT: Day label + date number ── */}
        <div className="w-9 flex-shrink-0 flex flex-col items-center justify-center">
          <span className={`text-[9px] font-bold uppercase leading-none ${
            isToday ? 'text-cyan-500' : 'text-gray-500 dark:text-gray-400'
          }`}>
            {dayShort}
          </span>
          <span className={`leading-tight tabular-nums ${
            isToday
              ? 'text-base font-black text-cyan-600 dark:text-cyan-400'
              : isCompleted
                ? 'text-base font-black text-emerald-600 dark:text-emerald-400'
                : isRest
                  ? 'text-sm font-semibold text-gray-500 dark:text-gray-400'
                  : 'text-base font-black text-gray-900 dark:text-gray-100'
          }`}>
            {dayNum}
          </span>
        </div>

        {/* ── Timeline dot ── */}
        <div className="flex flex-col items-center self-stretch py-2 flex-shrink-0">
          {(isFutureRest || isPastRest) ? (
            <div className="w-1.5 h-1.5 flex-shrink-0" />
          ) : (
            <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
              isToday ? 'bg-cyan-500'
              : isCompleted ? 'bg-emerald-500'
              : 'bg-gray-200 dark:bg-gray-700'
            }`} />
          )}
          <div className="w-px flex-1 mt-0.5 bg-gray-100 dark:bg-gray-800" />
        </div>

        {/* ── CENTER: Activity name + status ── */}
        <div className="flex-1 min-w-0 flex items-center gap-1.5">
          {isLoading ? (
            <div className="h-2.5 w-16 bg-gray-100 dark:bg-gray-800 rounded-full animate-pulse" />
          ) : mode === 'rest' ? (
            <span className="text-[10px] text-gray-400 dark:text-gray-500 font-medium">🛌 מנוחה</span>
          ) : isCompleted ? (
            <div className="flex items-center gap-1.5 min-w-0">
              {hasRunning ? (
                <span className="text-cyan-500">{getCategoryIcon(runningWorkout?.category)}</span>
              ) : (
                cats.map((cat) => (
                  <span key={cat} className="text-xs flex-shrink-0">{CATEGORY_EMOJI[cat]}</span>
                ))
              )}
              <span className="text-[10px] font-semibold text-gray-600 dark:text-gray-300 truncate">
                {hasRunning ? runningWorkout!.name : 'אימון'}
              </span>
              <div className="flex items-center gap-0.5 px-1.5 py-px rounded-md bg-emerald-50 dark:bg-emerald-900/20 flex-shrink-0">
                <Check className="w-2.5 h-2.5 text-emerald-500" />
                <span className="text-[9px] font-bold text-emerald-600 dark:text-emerald-400">הושלם</span>
              </div>
            </div>
          ) : (
            <div className="flex items-center gap-1.5 min-w-0">
              {hasRunning ? (
                <span className={isToday ? 'text-cyan-500' : 'text-gray-400'}>
                  {getCategoryIcon(runningWorkout?.category)}
                </span>
              ) : (
                cats.map((cat) => (
                  <span key={cat} className="text-xs flex-shrink-0">{CATEGORY_EMOJI[cat]}</span>
                ))
              )}
              {hasRunning ? (
                <span className={`text-[10px] font-semibold truncate ${
                  isToday ? 'text-gray-900 dark:text-white' : 'text-gray-600 dark:text-gray-300'
                }`}>
                  {runningWorkout!.name}
                </span>
              ) : (
                <span className="text-[9px] font-medium text-gray-500 dark:text-gray-400">מתוכנן</span>
              )}
              {isToday && (
                <div className="flex items-center gap-1 px-1.5 py-px rounded-md bg-cyan-50 dark:bg-cyan-900/20 flex-shrink-0">
                  <div className="w-1 h-1 rounded-full bg-cyan-500 animate-pulse" />
                  <span className="text-[9px] font-bold text-cyan-600 dark:text-cyan-400">היום</span>
                </div>
              )}
              {timeLabel && (
                <span className={`text-[10px] font-bold tabular-nums flex-shrink-0 ${
                  isToday ? 'text-cyan-500' : 'text-gray-600 dark:text-gray-300'
                }`}>{timeLabel}</span>
              )}
            </div>
          )}
        </div>

        {/* ── LEFT: Add button + drag handle ── */}
        <div className="flex items-center gap-0.5 flex-shrink-0">
          {showAdd && (
            <button
              onClick={handleAddClick}
              className="flex items-center gap-0.5 px-1.5 py-0.5 active:scale-90 transition-all text-gray-400 hover:text-cyan-500"
              aria-label="הוסף אימון ליום זה"
            >
              <Plus className="w-3 h-3" strokeWidth={2.5} />
              <span className="text-[10px] font-bold">הוסף</span>
            </button>
          )}
          {isDraggable && (
            <div className="text-gray-200 dark:text-gray-700 cursor-grab active:cursor-grabbing">
              <GripVertical className="w-3 h-3" />
            </div>
          )}
        </div>
      </button>
    </div>
  );
}
