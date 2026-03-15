'use client';

/**
 * RollingAgenda — Compact day list with running-schedule awareness + drag-and-drop.
 *
 * Training rows can be dragged vertically. On release, if the item
 * landed on a different day, `moveScheduleEntry` swaps the Firestore
 * document from the source date to the target date.
 */

import React, { useRef, useEffect, useMemo, useState, useCallback } from 'react';
import { motion, Reorder } from 'framer-motion';
import AgendaDayCard from './AgendaDayCard';
import { toISODate, addDays, getHebrewDayLetter } from '@/features/user/scheduling/utils/dateUtils';
import { moveScheduleEntry } from '@/features/user/scheduling/services/userSchedule.service';
import type { RecurringTemplate } from '@/features/user/scheduling/types/schedule.types';
import { useUserStore } from '@/features/user';

const DAY_LETTERS = ['א', 'ב', 'ג', 'ד', 'ה', 'ו', 'ש'];

const PAST_DAYS    = 7;
const FUTURE_DAYS  = 14;
const ALL_FUTURE   = 6;
const PLANNER_FUTURE_DAYS = 84; // 12 weeks

export type RollingAgendaFilterMode = 'all' | 'future_only';

interface RollingAgendaProps {
  selectedDate: string;
  onDaySelect: (iso: string) => void;
  userId: string;
  recurringTemplate?: RecurringTemplate;
  onStartWorkout?: () => void;
  filterMode?: RollingAgendaFilterMode;
  onAddWorkout?: (date: string) => void;
  refreshKey?: number;
  onScheduleChanged?: () => void;
}

function isTrainingDay(iso: string, template?: RecurringTemplate, runScheduleDays?: string[]): boolean {
  const d = new Date(iso + 'T00:00:00');
  const dayIdx = d.getDay();
  const letter = DAY_LETTERS[dayIdx];

  // Check running schedule days first
  if (runScheduleDays?.includes(letter)) return true;

  // Then check recurring template
  if (template) {
    const hLetter = getHebrewDayLetter(d);
    const programs = template[hLetter];
    return !!programs && programs.length > 0;
  }

  return true;
}

export default function RollingAgenda({
  selectedDate,
  onDaySelect,
  userId,
  recurringTemplate,
  onStartWorkout,
  filterMode = 'all',
  onAddWorkout,
  refreshKey,
  onScheduleChanged,
}: RollingAgendaProps) {
  const { profile } = useUserStore();
  const runScheduleDays = profile?.running?.scheduleDays;
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const cardRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const didInitialScroll = useRef(false);
  const [localRefreshKey, setLocalRefreshKey] = useState(0);

  const todayISO = useMemo(() => toISODate(new Date()), []);

  const dates = useMemo(() => {
    let raw: string[];

    if (filterMode === 'future_only') {
      // For planner view, show the full program range (12 weeks)
      const futureDays = PLANNER_FUTURE_DAYS;
      raw = Array.from({ length: futureDays + 1 }, (_, i) => addDays(todayISO, i));
    } else {
      const startDate = addDays(todayISO, -PAST_DAYS);
      const total = PAST_DAYS + 1 + ALL_FUTURE;
      raw = Array.from({ length: total }, (_, i) => addDays(startDate, i));
    }

    // Keep chronological order — do not re-sort
    return raw;
  }, [todayISO, filterMode]);

  // Reorder state — starts from chronological dates
  const [orderedDates, setOrderedDates] = useState<string[]>(dates);
  useEffect(() => setOrderedDates(dates), [dates]);

  // Scroll to selected date
  useEffect(() => {
    const el = cardRefs.current.get(selectedDate);
    if (!el) return;
    if (!didInitialScroll.current) {
      el.scrollIntoView({ block: 'nearest' });
      didInitialScroll.current = true;
    } else {
      el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }, [selectedDate]);

  useEffect(() => { didInitialScroll.current = false; }, [filterMode]);

  const setCardRef = useCallback((date: string, el: HTMLDivElement | null) => {
    if (el) cardRefs.current.set(date, el);
    else cardRefs.current.delete(date);
  }, []);

  // Drag-and-drop: detect which item moved and swap in Firestore
  const handleReorder = useCallback((newOrder: string[]) => {
    setOrderedDates(newOrder);
  }, []);

  // After a reorder animation settles, detect the swap and persist
  const handleDragEnd = useCallback(async () => {
    // Compare orderedDates with dates to find what moved
    const moved: { from: string; to: string } | null = (() => {
      for (let i = 0; i < orderedDates.length; i++) {
        if (orderedDates[i] !== dates[i]) {
          // Item at position i in ordered was at a different position in dates
          const originalIdx = dates.indexOf(orderedDates[i]);
          if (originalIdx !== -1 && originalIdx !== i) {
            return { from: dates[originalIdx], to: dates[i] };
          }
        }
      }
      return null;
    })();

    // Reset to chronological immediately
    setOrderedDates(dates);

    if (moved && moved.from !== moved.to) {
      const success = await moveScheduleEntry(userId, moved.from, moved.to);
      if (success) {
        setLocalRefreshKey(k => k + 1);
        onScheduleChanged?.();
      }
    }
  }, [orderedDates, dates, userId, onScheduleChanged]);

  // Combine external + local refresh keys
  const combinedRefreshKey = (refreshKey ?? 0) + localRefreshKey;

  const label = filterMode === 'future_only' ? 'תכנון קדימה' : 'יומן אימונים';

  // Group dates by calendar week for the planner view
  const weekGroups = useMemo(() => {
    if (filterMode !== 'future_only') return null;
    const running = profile?.running;
    const programStart = running?.activeProgram?.startDate;
    const groups: { weekLabel: string; dates: string[] }[] = [];
    let currentGroup: { weekLabel: string; dates: string[] } | null = null;

    for (const iso of dates) {
      const d = new Date(iso + 'T00:00:00');
      // Calculate program week number
      let weekNum = 1;
      if (programStart) {
        const start = new Date(programStart);
        start.setHours(0, 0, 0, 0);
        const diffMs = d.getTime() - start.getTime();
        const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
        weekNum = Math.max(1, Math.floor(diffDays / 7) + 1);
      }
      const weekLabel = `שבוע ${weekNum}`;

      if (!currentGroup || currentGroup.weekLabel !== weekLabel) {
        currentGroup = { weekLabel, dates: [iso] };
        groups.push(currentGroup);
      } else {
        currentGroup.dates.push(iso);
      }
    }
    return groups;
  }, [dates, filterMode, profile?.running]);

  return (
    <motion.div
      ref={scrollContainerRef}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.3 }}
      className="flex flex-col"
    >
      {/* Section header */}
      <div className="flex items-center justify-between px-4 mb-2">
        <span className="text-xs font-bold text-gray-400 dark:text-gray-500 tracking-wide">
          {dates.length} ימים
        </span>
        <h3 className="text-sm font-black text-gray-900 dark:text-white">
          {label}
        </h3>
      </div>

      {filterMode === 'future_only' && weekGroups ? (
        /* ── Planner: Weekly groups (no drag-and-drop for performance) ── */
        <div className="flex flex-col gap-3 mx-2">
          {weekGroups.map((group) => (
            <div key={group.weekLabel} className="bg-white dark:bg-[#1E1E1E] rounded-2xl border border-gray-100 dark:border-gray-800 overflow-hidden">
              {/* Week header */}
              <div className="flex items-center justify-between px-3 py-1.5 bg-gray-50 dark:bg-gray-900/40 border-b border-gray-100 dark:border-gray-800" dir="rtl">
                <span className="text-[10px] font-black text-cyan-600 dark:text-cyan-400 tracking-wide">
                  {group.weekLabel}
                </span>
                <span className="text-[9px] font-medium text-gray-400">
                  {group.dates.length} ימים
                </span>
              </div>
              {group.dates.map((iso, idx) => (
                <div key={iso}>
                  {idx > 0 && (
                    <div className="h-px bg-gray-100 dark:bg-gray-800 mx-4" />
                  )}
                  <AgendaDayCard
                    date={iso}
                    isSelected={iso === selectedDate}
                    onSelect={() => onDaySelect(iso)}
                    userId={userId}
                    recurringTemplate={recurringTemplate}
                    onStartWorkout={iso === todayISO ? onStartWorkout : undefined}
                    onAddWorkout={onAddWorkout}
                    refreshKey={combinedRefreshKey}
                    rowRef={(el) => setCardRef(iso, el)}
                  />
                </div>
              ))}
            </div>
          ))}
        </div>
      ) : (
        /* ── Home: Reorderable row list ── */
        <Reorder.Group
          axis="y"
          values={orderedDates}
          onReorder={handleReorder}
          className="bg-white dark:bg-[#1E1E1E] rounded-2xl border border-gray-100 dark:border-gray-800 overflow-hidden mx-2"
          as="div"
        >
          {orderedDates.map((iso, idx) => (
            <Reorder.Item
              key={iso}
              value={iso}
              onDragEnd={handleDragEnd}
              dragListener={isTrainingDay(iso, recurringTemplate, runScheduleDays)}
              className="relative"
              as="div"
              whileDrag={{ scale: 1.02, boxShadow: '0 8px 30px rgba(0,0,0,0.12)', zIndex: 50, backgroundColor: 'rgba(255,255,255,0.98)' }}
            >
              {idx > 0 && (
                <div className="h-px bg-gray-100 dark:bg-gray-800 mx-4" />
              )}
              <AgendaDayCard
                date={iso}
                isSelected={iso === selectedDate}
                onSelect={() => onDaySelect(iso)}
                userId={userId}
                recurringTemplate={recurringTemplate}
                onStartWorkout={iso === todayISO ? onStartWorkout : undefined}
                onAddWorkout={onAddWorkout}
                onDragToDate={() => {}}
                refreshKey={combinedRefreshKey}
                rowRef={(el) => setCardRef(iso, el)}
              />
            </Reorder.Item>
          ))}
        </Reorder.Group>
      )}
    </motion.div>
  );
}
