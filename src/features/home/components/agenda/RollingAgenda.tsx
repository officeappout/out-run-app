'use client';

/**
 * RollingAgenda — Compact Runna-style day list with drag-and-drop.
 *
 * Training rows can be dragged vertically. On release, if the item
 * landed on a different day, `moveScheduleEntry` swaps the Firestore
 * document from the source date to the target date.
 *
 * Rest days render as minimal rows and are valid drop targets.
 */

import React, { useRef, useEffect, useMemo, useState, useCallback } from 'react';
import { motion, Reorder, AnimatePresence } from 'framer-motion';
import AgendaDayCard from './AgendaDayCard';
import { toISODate, addDays, getHebrewDayLetter } from '@/features/user/scheduling/utils/dateUtils';
import { moveScheduleEntry } from '@/features/user/scheduling/services/userSchedule.service';
import type { RecurringTemplate } from '@/features/user/scheduling/types/schedule.types';

const PAST_DAYS    = 7;
const FUTURE_DAYS  = 14;
const ALL_FUTURE   = 6;

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

function isTrainingDay(iso: string, template?: RecurringTemplate): boolean {
  if (!template) return true;
  const d = new Date(iso + 'T00:00:00');
  const letter = getHebrewDayLetter(d);
  const programs = template[letter];
  return !!programs && programs.length > 0;
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
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const cardRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const didInitialScroll = useRef(false);
  const [localRefreshKey, setLocalRefreshKey] = useState(0);

  const todayISO = useMemo(() => toISODate(new Date()), []);

  const dates = useMemo(() => {
    let raw: string[];

    if (filterMode === 'future_only') {
      raw = Array.from({ length: FUTURE_DAYS + 1 }, (_, i) => addDays(todayISO, i));
    } else {
      const startDate = addDays(todayISO, -PAST_DAYS);
      const total = PAST_DAYS + 1 + ALL_FUTURE;
      raw = Array.from({ length: total }, (_, i) => addDays(startDate, i));
    }

    // Keep chronological, training days first within each temporal group
    return raw.sort((a, b) => {
      const aT = isTrainingDay(a, recurringTemplate) ? 0 : 1;
      const bT = isTrainingDay(b, recurringTemplate) ? 0 : 1;
      return aT - bT;
    });
  }, [todayISO, filterMode, recurringTemplate]);

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

      {/* Reorderable row list */}
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
            dragListener={isTrainingDay(iso, recurringTemplate)}
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
    </motion.div>
  );
}
