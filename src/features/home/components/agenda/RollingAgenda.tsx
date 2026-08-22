'use client';

/**
 * RollingAgenda — Compact day list with running-schedule awareness + drag-and-drop.
 *
 * Training rows can be dragged vertically. On release, if the item
 * landed on a different day, `moveScheduleEntry` swaps the Firestore
 * document from the source date to the target date.
 *
 * Planner mode (filterMode === 'planner' | 'future_only'):
 *   Days are grouped into weekly cards (Sun → Sat).
 *   Each card has a sticky date-range label above it.
 *   Current week → cyan border. Past weeks → 0.6 opacity, no add buttons.
 *   Week-number badge is shown only when a running program exists.
 */

import React, { useRef, useEffect, useMemo, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { motion, Reorder } from 'framer-motion';
import AgendaDayCard from './AgendaDayCard';
import { toISODate, addDays, getHebrewDayLetter } from '@/features/user/scheduling/utils/dateUtils';
import { getWorkoutsInDateRange, type WorkoutHistoryEntry } from '@/features/workout-engine/core/services/storage.service';
import {
  moveScheduleEntry,
  removeScheduleEntry,
  removeCommunityEntriesForGroup,
  updateScheduleDays,
  getScheduleEntry,
  getScheduleEntriesForDates,
} from '@/features/user/scheduling/services/userSchedule.service';
import type { RecurringTemplate, UserScheduleEntry } from '@/features/user/scheduling/types/schedule.types';
import { useUserStore } from '@/features/user';
import { resolveRunningCurrentWeek } from '@/features/workout-engine/shared/utils/running-current-week.utils';

// ── Constants ──────────────────────────────────────────────────────────────

const DAY_LETTERS = ['א', 'ב', 'ג', 'ד', 'ה', 'ו', 'ש'];

const PAST_DAYS           = 7;
const ALL_FUTURE          = 6;
const PLANNER_FUTURE_DAYS = 84; // 12 weeks
const PLANNER_PAST_DAYS   = 30;

const HEBREW_MONTHS = [
  'ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני',
  'יולי',  'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר',
];

// ── Types ──────────────────────────────────────────────────────────────────

export type RollingAgendaFilterMode = 'all' | 'future_only' | 'planner';

interface WeekGroup {
  /** ISO of the Sunday that starts this week */
  weekSunday: string;
  /** ISO of the Saturday that ends this week */
  weekSaturday: string;
  /** Human-readable date range: "4 מאי — 10 מאי" */
  dateRange: string;
  /**
   * 1-based week number from the running program's start date.
   * null when no running program exists (badge is hidden).
   */
  weekNumber: number | null;
  isCurrentWeek: boolean;
  /** true when Saturday of this week is already in the past */
  isPastWeek: boolean;
  dates: string[];
}

interface RollingAgendaProps {
  selectedDate: string;
  onDaySelect: (iso: string) => void;
  userId: string;
  recurringTemplate?: RecurringTemplate;
  /** Receives the ISO date of the tapped workout card — mirrors AgendaDayCardProps.onStartWorkout. */
  onStartWorkout?: (date: string) => void;
  filterMode?: RollingAgendaFilterMode;
  onAddWorkout?: (date: string) => void;
  refreshKey?: number;
  onScheduleChanged?: () => void;
  /** Forwarded from AgendaDayCard — opens group drawer instead of navigating. */
  onCommunityTap?: (groupId: string, groupName: string) => void;
  /** ISO of the Sunday to scroll into view when week navigation changes (planner mode). */
  weekStart?: string;
  /** Called when the swipe-left edit button is tapped on a persisted personal entry. */
  onEditEntry?: (entry: UserScheduleEntry) => void;
  /** Called when a personal card is tapped — fires before onStartWorkout. */
  onPreviewEntry?: (entry: UserScheduleEntry) => void;
}

// ── Helpers ────────────────────────────────────────────────────────────────

function isTrainingDay(iso: string, template?: RecurringTemplate, runScheduleDays?: string[]): boolean {
  const d = new Date(iso + 'T00:00:00');
  const dayIdx = d.getDay();
  const letter = DAY_LETTERS[dayIdx];

  if (runScheduleDays?.includes(letter)) return true;

  if (template) {
    const hLetter = getHebrewDayLetter(d);
    const programs = template[hLetter];
    return !!programs && programs.length > 0;
  }

  return true;
}

/** ISO date of the Sunday of the week containing `iso`. */
function getWeekSunday(iso: string): string {
  const d = new Date(iso + 'T00:00:00');
  const sunday = new Date(d);
  sunday.setDate(d.getDate() - d.getDay());
  return toISODate(sunday);
}

// ── Drag helpers ────────────────────────────────────────────────────────────

const HEBREW_DAY_FULL: Record<string, string> = {
  'א': 'יום ראשון', 'ב': 'יום שני', 'ג': 'יום שלישי',
  'ד': 'יום רביעי', 'ה': 'יום חמישי', 'ו': 'יום שישי', 'ש': 'שבת',
};

function getDayLabel(iso: string): string {
  const d = new Date(iso + 'T00:00:00');
  const letter = DAY_LETTERS[d.getDay()];
  return HEBREW_DAY_FULL[letter] ?? '';
}

function formatShortDate(iso: string): string {
  const d = new Date(iso + 'T00:00:00');
  return `${d.getDate()} ${HEBREW_MONTHS[d.getMonth()]}`;
}

// ── Types ─────────────────────────────────────────────────────────────────

interface MoveIntent {
  fromDate: string;
  toDate: string;
  /** true when the target day already had a workout before the drag */
  targetHasEntry: boolean;
  /**
   * Stable id of the dragged entry inside `userSchedule/{uid}_{fromDate}.entries[]`.
   * `undefined` for synthesized recurring cards that have no Firestore record
   * yet — the move handler must supply a `fallbackEntry` in that case.
   */
  entryId: string | undefined;
}

// ── Component ──────────────────────────────────────────────────────────────

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
  onCommunityTap,
  weekStart,
  onEditEntry,
  onPreviewEntry,
}: RollingAgendaProps) {
  const { profile } = useUserStore();
  const runScheduleDays = profile?.running?.scheduleDays;

  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const cardRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const didInitialScroll = useRef(false);
  const [localRefreshKey, setLocalRefreshKey] = useState(0);

  // ── Drag reschedule state ───────────────────────────────────────────────
  const [moveIntent, setMoveIntent]           = useState<MoveIntent | null>(null);
  const [draggingFromISO, setDraggingFromISO] = useState<string | null>(null);

  // Portal mount flag — the reschedule confirmation sheet must be rendered
  // into <body> so it escapes the TrainingPlannerOverlay's z-50 stacking
  // context (created by its `fixed inset-0 z-50` + framer-motion transform).
  // Without this, the sheet is trapped under the global BottomNavbar.
  const [portalReady, setPortalReady] = useState(false);
  useEffect(() => { setPortalReady(true); }, []);

  const todayISO = useMemo(() => toISODate(new Date()), []);

  // ── Date list ──────────────────────────────────────────────────────────

  const dates = useMemo(() => {
    let raw: string[];

    if (filterMode === 'planner') {
      const startDate = addDays(todayISO, -PLANNER_PAST_DAYS);
      const total = PLANNER_PAST_DAYS + 1 + PLANNER_FUTURE_DAYS;
      raw = Array.from({ length: total }, (_, i) => addDays(startDate, i));
    } else if (filterMode === 'future_only') {
      raw = Array.from({ length: PLANNER_FUTURE_DAYS + 1 }, (_, i) => addDays(todayISO, i));
    } else {
      // 'all': 7 past + today + 6 future
      const startDate = addDays(todayISO, -PAST_DAYS);
      const total = PAST_DAYS + 1 + ALL_FUTURE;
      raw = Array.from({ length: total }, (_, i) => addDays(startDate, i));
    }

    return raw;
  }, [todayISO, filterMode]);

  // Reorder state for the drag-and-drop 'all' mode
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

  // When the parent navigates to a different week (week-strip swipe), scroll
  // the agenda list so that week card comes into view.
  useEffect(() => {
    if (!weekStart || (filterMode !== 'planner' && filterMode !== 'future_only')) return;
    const id = setTimeout(() => {
      document
        .querySelector(`[data-week-sunday="${weekStart}"]`)
        ?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 50);
    return () => clearTimeout(id);
  }, [weekStart, filterMode]);

  // On mount in planner mode, snap the scroll container to the current week
  // so the user lands on "now" rather than the top of the 30-day history.
  useEffect(() => {
    if (filterMode !== 'planner' && filterMode !== 'future_only') return;
    // Small timeout lets the DOM finish rendering the week cards before we
    // try to scroll — the list is long and the refs may not all be attached yet.
    const id = setTimeout(() => {
      document
        .querySelector('[data-current-week="true"]')
        ?.scrollIntoView({ behavior: 'instant', block: 'start' });
    }, 0);
    return () => clearTimeout(id);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterMode]); // re-run if the user switches modes, not on every render

  const setCardRef = useCallback((date: string, el: HTMLDivElement | null) => {
    if (el) cardRefs.current.set(date, el);
    else cardRefs.current.delete(date);
  }, []);

  // ── Drag-and-drop (home 'all' mode only) ──────────────────────────────

  const handleReorder = useCallback((newOrder: string[]) => {
    setOrderedDates(newOrder);
  }, []);

  const handleDragEnd = useCallback(async () => {
    const moved: { from: string; to: string } | null = (() => {
      for (let i = 0; i < orderedDates.length; i++) {
        if (orderedDates[i] !== dates[i]) {
          const originalIdx = dates.indexOf(orderedDates[i]);
          if (originalIdx !== -1 && originalIdx !== i) {
            return { from: dates[originalIdx], to: dates[i] };
          }
        }
      }
      return null;
    })();

    setOrderedDates(dates);

    if (moved && moved.from !== moved.to) {
      const success = await moveScheduleEntry(userId, moved.from, moved.to);
      if (success) {
        setLocalRefreshKey((k) => k + 1);
        onScheduleChanged?.();
      }
    }
  }, [orderedDates, dates, userId, onScheduleChanged]);

  // ── Combine refresh keys ───────────────────────────────────────────────

  const combinedRefreshKey = (refreshKey ?? 0) + localRefreshKey;

  // ── Batched schedule fetch (perf) ──────────────────────────────────────
  //
  // `dates` can be up to 115 entries (planner mode). Previously each
  // AgendaDayCard fetched its own day independently — ~115 getDoc round-trips
  // per open, ~145 per edit (see .claude/knowledge/schedule-editor-perf-audit.md).
  // One chunked `documentId() in [...]` query here replaces that fan-out.
  // Three states reach AgendaDayCard via its `scheduleMap` prop:
  //   null      → batch still in flight, hold the loading skeleton
  //   object    → batch succeeded (possibly `{}` = confirmed no docs)
  //   undefined → batch FAILED — do not treat missing dates as confirmed-
  //               empty (would let hydration write a duplicate entry);
  //               `undefined` reuses AgendaDayCard's "no scheduleMap"
  //               contract so every card falls back to its own fetch.
  const [scheduleMap, setScheduleMap] = useState<Record<string, UserScheduleEntry[]> | null | undefined>(null);
  useEffect(() => {
    if (!userId || dates.length === 0) { setScheduleMap({}); return; }
    let cancelled = false;
    setScheduleMap(null);
    getScheduleEntriesForDates(userId, dates).then((map) => {
      if (!cancelled) setScheduleMap(map ?? undefined);
    });
    return () => { cancelled = true; };
  }, [userId, dates, combinedRefreshKey]);

  // ── Real completed-workout signal (AGENDA_UNPLANNED_COMPLETION_FIX_ENABLED) ──
  //
  // One batched range query over the `workouts` collection — same
  // {userId,date} composite index `getWorkoutsForDate` already uses, just
  // wider bounds (see getWorkoutsInDateRange's own doc comment). Covers
  // past dates + today only — future days can't have real workout docs.
  // Real per-document data (not a day-level aggregate like dailyProgress),
  // so a day with 2+ spontaneous workouts is represented as 2+ distinct
  // docs, not collapsed into one flag. Starts `{}` and fills in once the
  // query resolves — a fetch failure degrades to "no actual workouts
  // known," never a destructive false-positive, so no `null` "in flight"
  // gate is needed (unlike `scheduleMap` above).
  const [actualWorkoutsMap, setActualWorkoutsMap] = useState<Record<string, WorkoutHistoryEntry[]>>({});
  useEffect(() => {
    if (!userId) { setActualWorkoutsMap({}); return; }
    const pastDates = dates.filter((d) => d <= todayISO);
    const rangeStart = pastDates.length > 0 ? pastDates[0] : todayISO;
    let cancelled = false;
    getWorkoutsInDateRange(userId, rangeStart, todayISO).then((workouts) => {
      if (cancelled) return;
      const map: Record<string, WorkoutHistoryEntry[]> = {};
      for (const w of workouts) {
        const iso = toISODate(w.date);
        (map[iso] ??= []).push(w);
      }
      setActualWorkoutsMap(map);
    });
    return () => { cancelled = true; };
  }, [userId, dates, todayISO, combinedRefreshKey]);

  // ── Drag callbacks ────────────────────────────────────────────────────

  const handleDragMoveIntent = useCallback(
    (from: string, to: string, targetHasEntry: boolean, entryId: string | undefined) => {
      setMoveIntent({ fromDate: from, toDate: to, targetHasEntry, entryId });
    },
    [],
  );

  /**
   * Per-card drag-end handler: hitTests releaseY against cardRefs and fires
   * the confirmation sheet.  `entryId` is `undefined` when the dragged card
   * was a synthesized recurring fallback (no Firestore record yet).
   */
  const handleCardDragEnd = useCallback(
    async (fromIso: string, entryId: string | undefined, releaseY: number) => {
      setDraggingFromISO(null);
      let targetISO: string | null = null;
      for (const [date, el] of cardRefs.current) {
        if (date === fromIso || date < todayISO) continue;
        const rect = el.getBoundingClientRect();
        if (releaseY >= rect.top && releaseY <= rect.bottom) {
          targetISO = date;
          break;
        }
      }
      if (targetISO) {
        const existingEntry = await getScheduleEntry(userId, targetISO);
        handleDragMoveIntent(fromIso, targetISO, existingEntry !== null, entryId);
      }
    },
    [todayISO, userId, cardRefs, handleDragMoveIntent],
  );

  /**
   * Build the fallback partial used by `moveScheduleEntry` when the dragged
   * card is a synthesized recurring entry (no Firestore record yet).
   */
  const buildRecurringFallback = useCallback(() => ({
    scheduledCategories: ['strength'] as ['strength'],
    programIds: profile?.progression?.activePrograms?.map((p: { templateId: string }) => p.templateId) ?? [],
  }), [profile]);

  /** "שנה רק את האימון הזה" — move only this occurrence */
  const handleMoveOnce = useCallback(async () => {
    if (!moveIntent) return;
    const { fromDate, toDate, entryId } = moveIntent;
    setMoveIntent(null);

    // Real entries identify themselves by entryId; synthesized recurring
    // entries must reconstruct via fallbackEntry.
    const fallback = entryId ? undefined : buildRecurringFallback();
    const success = await moveScheduleEntry(userId, fromDate, toDate, fallback, entryId);
    if (success) {
      setLocalRefreshKey((k) => k + 1);
      onScheduleChanged?.();
    }
  }, [moveIntent, userId, buildRecurringFallback, onScheduleChanged]);

  /** "שנה את כל הלוז קדימה" — update recurring schedule + move this occurrence */
  const handleMoveAll = useCallback(async () => {
    if (!moveIntent) return;
    const { fromDate, toDate, entryId } = moveIntent;
    setMoveIntent(null);

    const fromLetter = getHebrewDayLetter(new Date(fromDate + 'T00:00:00'));
    const toLetter   = getHebrewDayLetter(new Date(toDate   + 'T00:00:00'));

    const fallback = entryId ? undefined : buildRecurringFallback();
    await moveScheduleEntry(userId, fromDate, toDate, fallback, entryId);

    const currentScheduleDays = (profile as any)?.lifestyle?.scheduleDays ?? [];
    const currentTemplate     = (profile as any)?.lifestyle?.recurringTemplate;
    await updateScheduleDays(fromLetter, toLetter, currentScheduleDays, currentTemplate);

    setLocalRefreshKey((k) => k + 1);
    onScheduleChanged?.();
  }, [moveIntent, userId, profile, buildRecurringFallback, onScheduleChanged]);

  /** Called from AgendaDayCard after the user confirms deletion. */
  const handleDeleteEntry = useCallback(async (entryId: string, date: string, groupId?: string) => {
    try {
      if (groupId) {
        // Community/scheduled-run entry: remove by groupId (ghost-prevention cleanup).
        await removeCommunityEntriesForGroup(userId, date, groupId);
      } else {
        await removeScheduleEntry(userId, date, entryId);
      }
      setLocalRefreshKey((k) => k + 1);
      onScheduleChanged?.();
    } catch {
      // Non-fatal — card will re-render with the original data on next refresh.
    }
  }, [userId, onScheduleChanged]);

  // ── Week groups (planner + future_only modes) ─────────────────────────

  const weekGroups = useMemo((): WeekGroup[] | null => {
    if (filterMode !== 'future_only' && filterMode !== 'planner') return null;

    const programStart = profile?.running?.activeProgram?.startDate ?? null;

    // Sunday of today's week — used to identify the current week
    const todayDay = new Date(todayISO + 'T00:00:00').getDay();
    const todaySunday = new Date(todayISO + 'T00:00:00');
    todaySunday.setDate(todaySunday.getDate() - todayDay);
    const currentWeekSundayISO = toISODate(todaySunday);

    const map = new Map<string, WeekGroup>();

    for (const iso of dates) {
      const sundayISO = getWeekSunday(iso);

      if (!map.has(sundayISO)) {
        const sunday   = new Date(sundayISO + 'T00:00:00');
        const saturday = new Date(sunday);
        saturday.setDate(sunday.getDate() + 6);
        const saturdayISO = toISODate(saturday);

        // Date range label — cross-month aware
        const startDay   = sunday.getDate();
        const startMonth = HEBREW_MONTHS[sunday.getMonth()];
        const endDay     = saturday.getDate();
        const endMonth   = HEBREW_MONTHS[saturday.getMonth()];
        const dateRange  = startMonth === endMonth
          ? `${startDay}–${endDay} ${startMonth}`
          : `${startDay} ${startMonth} — ${endDay} ${endMonth}`;

        // Week number from program start, or null. Gated by
        // RUNNING_CURRENT_WEEK_RECOMPUTE_ENABLED (via resolveRunningCurrentWeek):
        // while false, stays `null` exactly as today (this hand-rolled version
        // was always broken — `programStart` is a real Date object, and
        // string-concatenating it here silently produced an Invalid Date, so
        // this badge has never actually rendered). Once true, computes the
        // real week via the canonical calculateCurrentWeek(startDate, asOfDate)
        // for real, using `sunday` (this week-group's Sunday) as asOfDate.
        const weekNumber = resolveRunningCurrentWeek(programStart, null, sunday) ?? null;

        map.set(sundayISO, {
          weekSunday:    sundayISO,
          weekSaturday:  saturdayISO,
          dateRange,
          weekNumber,
          isCurrentWeek: sundayISO === currentWeekSundayISO,
          isPastWeek:    saturdayISO < todayISO,
          dates:         [],
        });
      }

      map.get(sundayISO)!.dates.push(iso);
    }

    return Array.from(map.values());
  }, [dates, filterMode, profile?.running?.activeProgram?.startDate, todayISO]);

  // ── Render ─────────────────────────────────────────────────────────────

  return (
    <motion.div
      ref={scrollContainerRef}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.3 }}
      className="flex flex-col"
    >
      {/* Section header — shown only in 'all' (home) mode */}
      {filterMode === 'all' && (
        <div className="flex items-center justify-between px-4 mb-2">
          <span className="text-xs font-bold text-gray-400 dark:text-gray-500 tracking-wide">
            {dates.length} ימים
          </span>
          <h3 className="text-sm font-black text-gray-900 dark:text-white">
            יומן אימונים
          </h3>
        </div>
      )}

      {(filterMode === 'future_only' || filterMode === 'planner') && weekGroups ? (
        /* ── Planner: Weekly cards with sticky section labels + per-card drag ── */
        <div className="flex flex-col pb-4">
          {weekGroups.map((group) => (
            <React.Fragment key={group.weekSunday}>

              {/* Sticky week label */}
              <div
                className="sticky top-0 z-[1] flex items-center justify-between"
                dir="rtl"
                data-current-week={group.isCurrentWeek ? 'true' : undefined}
                data-week-sunday={group.weekSunday}
                style={{
                  background:  'var(--color-background-tertiary, #F8FAFC)',
                  padding:     '4px 14px 3px',
                  fontSize:    12,
                  color:       'var(--color-text-secondary, #64748B)',
                  fontWeight:  500,
                }}
              >
                <span>{group.dateRange}</span>
                {group.weekNumber !== null && (
                  <span
                    style={{
                      fontSize:     11,
                      fontWeight:   700,
                      padding:      '3px 10px',
                      borderRadius: 20,
                      background:   '#E8FAFE',
                      color:        '#0B6B77',
                      border:       '0.5px solid #00C9F240',
                    }}
                  >
                    שבוע {group.weekNumber}
                  </span>
                )}
              </div>

              {/* Week card — overflow:visible while dragging so the card can escape the bounds */}
              <div
                style={{
                  margin:       '0 10px 12px',
                  border:       group.isCurrentWeek
                    ? '1.5px solid #00C9F2'
                    : '0.5px solid var(--color-border-tertiary, #E2E8F0)',
                  borderRadius: 10,
                  background:   'var(--color-background-primary, #ffffff)',
                  opacity:      group.isPastWeek ? 0.6 : 1,
                  overflow:     draggingFromISO ? 'visible' : 'hidden',
                }}
              >
                {group.dates.map((iso, idx) => (
                  <div key={iso}>
                    {idx > 0 && (
                      <div style={{ height: 1, background: 'rgba(100,116,139,0.15)', margin: '0 16px' }} />
                    )}
                    <AgendaDayCard
                      date={iso}
                      isSelected={iso === selectedDate}
                      onSelect={() => onDaySelect(iso)}
                      userId={userId}
                      recurringTemplate={recurringTemplate}
                      onStartWorkout={onStartWorkout}
                      onAddWorkout={group.isPastWeek ? undefined : onAddWorkout}
                      onDragStart={group.isPastWeek ? undefined : () => setDraggingFromISO(iso)}
                      onCardDragEnd={group.isPastWeek ? undefined : (entryId, releaseY) => handleCardDragEnd(iso, entryId, releaseY)}
                      onDeleteEntry={handleDeleteEntry}
                      onEditEntry={group.isPastWeek ? undefined : onEditEntry}
                      onPreviewEntry={onPreviewEntry}
                      onCommunityTap={onCommunityTap}
                      refreshKey={combinedRefreshKey}
                      scheduleMap={scheduleMap}
                      actualWorkoutsMap={actualWorkoutsMap}
                      rowRef={(el) => setCardRef(iso, el)}
                    />
                  </div>
                ))}
              </div>

            </React.Fragment>
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
                onStartWorkout={onStartWorkout}
                onAddWorkout={onAddWorkout}
                onDeleteEntry={handleDeleteEntry}
                onEditEntry={onEditEntry}
                onPreviewEntry={onPreviewEntry}
                onCommunityTap={onCommunityTap}
                refreshKey={combinedRefreshKey}
                scheduleMap={scheduleMap}
                actualWorkoutsMap={actualWorkoutsMap}
                rowRef={(el) => setCardRef(iso, el)}
              />
            </Reorder.Item>
          ))}
        </Reorder.Group>
      )}

      {/*
        ── Drag reschedule confirmation sheet ───────────────────────────────
        Rendered through a portal into <body>. The host page mounts this
        agenda inside TrainingPlannerOverlay, whose root is a
        `fixed inset-0 z-50` motion.div with a transform animation — that
        combination forms a stacking context capped at z-50, which trapped
        the sheet UNDER the global BottomNavbar (also z-50). Portaling out +
        z-[140]/z-[150] guarantees the sheet & its backdrop land above every
        chrome layer cleanly.
      */}
      {portalReady && createPortal(
        <>
          <motion.div
            key="drag-confirm-backdrop"
            className="fixed inset-0 z-[140] bg-black/40"
            style={{ pointerEvents: moveIntent ? 'auto' : 'none' }}
            animate={{ opacity: moveIntent ? 1 : 0 }}
            transition={{ duration: 0.2 }}
            onClick={() => setMoveIntent(null)}
          />
          {/*
            Fluid Drawer Layout Contract — DO NOT RE-INTRODUCE:
              • No `min-h-[…px]` — the sheet hugs its content height so
                short viewports (small Androids, landscape) never get
                clipped and tall viewports (Pro Max, foldables) never
                stretch into wasted whitespace.
              • No `48px + 24px` style pixel math for nav clearance.
                The bottom inset is owned by `paddingBottom` below, which
                uses `max(rem-floor, env(safe-area-inset-bottom))` so:
                  – iOS notched devices get the home-indicator inset
                  – Android / flat displays get the rem floor
                Both keep the "ביטול" tap target clear of system chrome
                without hard-coding any nav-bar height.
              • No `justify-between` — the container hugs its content, so
                space-between would be a visual no-op and a footgun if a
                fixed height is ever added later by mistake.
          */}
          <motion.div
            key="drag-confirm-sheet"
            className="fixed bottom-0 inset-x-0 z-[150] flex flex-col bg-white rounded-t-2xl shadow-[0_-8px_24px_rgba(0,0,0,0.12)]"
            style={{
              paddingBottom: 'max(1.75rem, env(safe-area-inset-bottom, 28px))',
            }}
            initial={{ y: '100%' }}
            animate={{ y: moveIntent ? 0 : '100%' }}
            transition={{ type: 'spring', stiffness: 300, damping: 30 }}
            dir="rtl"
          >
            {/* Handle bar */}
            <div className="flex justify-center pt-3 pb-1 shrink-0">
              <div className="w-10 h-1 rounded-full bg-gray-200" />
            </div>

            {/* Title — divider line drops naturally below the heading.
                shrink-0 prevents flex compression on tiny viewports. */}
            <div className="px-5 pt-3 pb-4 border-b border-gray-100 shrink-0">
              <h2 className="text-base font-black text-gray-900">
                {moveIntent
                  ? moveIntent.targetHasEntry
                    ? `הוסף לאימון ב${getDayLabel(moveIntent.toDate)}`
                    : `העברת אימון ל${getDayLabel(moveIntent.toDate)}`
                  : ''
                }
              </h2>
              {moveIntent && (
                <p className="text-xs text-gray-500 mt-1">
                  {formatShortDate(moveIntent.fromDate)} ← {formatShortDate(moveIntent.toDate)}
                </p>
              )}
            </div>

            {/* Action buttons — pt-4 keeps spacing from divider; the
                bottom edge of "ביטול" is protected by the wrapper's
                fluid safe-area paddingBottom above. */}
            <div className="px-5 pt-4 space-y-3 shrink-0">
              <button
                type="button"
                className="w-full py-3.5 rounded-xl text-sm font-black text-white active:scale-[0.98] transition-transform"
                style={{ background: '#00C9F2' }}
                onClick={handleMoveOnce}
              >
                שנה רק את האימון הזה
              </button>
              <button
                type="button"
                className="w-full py-3.5 rounded-xl text-sm font-bold bg-gray-100 text-gray-700 active:scale-[0.98] transition-transform"
                onClick={handleMoveAll}
              >
                שנה את כל הלוז קדימה
              </button>
              <button
                type="button"
                className="w-full py-3 text-sm text-gray-400 active:scale-[0.98] transition-transform"
                onClick={() => setMoveIntent(null)}
              >
                ביטול
              </button>
            </div>
          </motion.div>
        </>,
        document.body
      )}

    </motion.div>
  );
}
