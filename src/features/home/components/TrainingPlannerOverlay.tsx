'use client';

/**
 * TrainingPlannerOverlay — Full-Screen Planning View (Runna-style)
 *
 * Calendar: collapsible two-state header.
 *   Collapsed (default) — current week strip (~130 px).
 *   Expanded            — full month grid (~310 px).
 * A drag handle between the calendar and the agenda list toggles the two
 * states: drag up → expand, drag down → collapse, tap → toggle.
 *
 * Agenda: flex-1 overflow-y-auto; RollingAgenda renders per-week cards
 * with their own sticky section labels.
 */

import React, { useState, useCallback, useRef, useMemo, useEffect } from 'react';
import { motion, AnimatePresence, type PanInfo } from 'framer-motion';
import { X, CalendarDays } from 'lucide-react';
import MonthlyCalendarGrid from './calendar/MonthlyCalendarGrid';
import RollingAgenda from './agenda/RollingAgenda';
import AddWorkoutModal from './AddWorkoutModal';
import type { RecurringTemplate, UserScheduleEntry } from '@/features/user/scheduling/types/schedule.types';
import { useUserStore } from '@/features/user';
import { resolveRunningCurrentWeek } from '@/features/workout-engine/shared/utils/running-current-week.utils';
import { isDateWithinRunningPlan } from '@/lib/running-plan-date-range';
import ScheduleBuilderDrawer, { isScheduleBuilderDrawerEnabled } from '@/features/schedule/components/ScheduleBuilderDrawer';

// ── Constants ──────────────────────────────────────────────────────────────

/** px height of the calendar section wrapper in each state */
const CAL_HEIGHT_COLLAPSED = 116; // taller than before to fit week-header row
const CAL_HEIGHT_EXPANDED  = 310;

/** cellHeight passed to MonthlyCalendarGrid per state */
const CELL_HEIGHT_COLLAPSED = 60; // 1 row  — taller cells look better as a strip
const CELL_HEIGHT_EXPANDED  = 50; // 6 rows — smaller to fit within 310 px

const DRAG_THRESHOLD_PX = 40; // minimum drag distance to flip state

const SLIDE_SPRING = {
  type: 'spring' as const,
  stiffness: 300,
  damping: 32,
  mass: 0.9,
};

const HEBREW_MONTHS = [
  'ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני',
  'יולי',  'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר',
];

// ── Helpers ────────────────────────────────────────────────────────────────

/** ISO string of the Sunday of the week containing today. */
function getTodayWeekSunday(): string {
  const d = new Date();
  d.setDate(d.getDate() - d.getDay());
  return d.toISOString().split('T')[0];
}

function getWeekDateRange(sundayISO: string): string {
  const sunday   = new Date(sundayISO + 'T00:00:00');
  const saturday = new Date(sunday);
  saturday.setDate(sunday.getDate() + 6);
  const startDay   = sunday.getDate();
  const endDay     = saturday.getDate();
  const startMonth = HEBREW_MONTHS[sunday.getMonth()];
  const endMonth   = HEBREW_MONTHS[saturday.getMonth()];
  return startMonth === endMonth
    ? `${startDay}–${endDay} ${startMonth}`
    : `${startDay} ${startMonth} — ${endDay} ${endMonth}`;
}

// ── Props ──────────────────────────────────────────────────────────────────

interface TrainingPlannerOverlayProps {
  isOpen: boolean;
  onClose: () => void;
  userId: string;
  recurringTemplate?: RecurringTemplate;
  scheduleDays?: string[];
  programIconKey?: string;
  selectedDate: string;
  onDaySelect: (iso: string) => void;
  /** Receives the ISO date of the tapped workout card — mirrors AgendaDayCardProps.onStartWorkout. */
  onStartWorkout?: (date: string, skipCompletedLookup?: boolean) => void;
  /** Fired after any schedule mutation (add / move / remove) so the home screen can re-render */
  onScheduleChanged?: () => void;
  /** Called when a personal card is tapped — lets home/page.tsx track the preview entry for the drawer pencil. */
  onPreviewEntry?: (entry: UserScheduleEntry) => void;
  /** Called when a calendar cell with a training entry is tapped — opens WorkoutPreviewDrawer. */
  onEntryTap?: (entry: UserScheduleEntry) => void;
  /** Called when a community entry is tapped — opens group drawer instead of navigating. */
  onCommunityTap?: (groupId: string, groupName: string) => void;
  /** Optional: open the Smart Workout Builder sheet instead of navigating to /workout-builder */
  onOpenBuilder?: (params: { mode: string; date: string; defaultDuration?: string; defaultProgramIds?: string }) => void;
}

// ── Component ──────────────────────────────────────────────────────────────

export default function TrainingPlannerOverlay({
  isOpen,
  onClose,
  userId,
  recurringTemplate,
  scheduleDays,
  programIconKey,
  selectedDate,
  onDaySelect,
  onStartWorkout,
  onScheduleChanged,
  onPreviewEntry,
  onEntryTap,
  onCommunityTap,
  onOpenBuilder,
}: TrainingPlannerOverlayProps) {
  const [showAddModal, setShowAddModal]           = useState(false);
  // Temporary entry point (schedule-drawer-screen-spec.md, ת6's real entry
  // point comes in stage 3) — gated by the flag, default off, zero change
  // to existing behavior when off.
  const [showScheduleBuilder, setShowScheduleBuilder] = useState(false);
  const [addModalDate, setAddModalDate]           = useState<string | undefined>(undefined);
  const [editEntry, setEditEntry]                 = useState<UserScheduleEntry | null>(null);
  const [refreshKey, setRefreshKey]               = useState(0);
  const [isCalendarCollapsed, setIsCalendarCollapsed] = useState(true);

  // ── Week navigation state (collapsed / week-strip mode only) ─────────────
  const { profile } = useUserStore();
  const programStartDate = (profile as any)?.running?.activeProgram?.startDate ?? null;

  const currentWeekSunday = useMemo(() => getTodayWeekSunday(), []);
  const [weekStart, setWeekStart] = useState(currentWeekSunday);
  const [agendaFade, setAgendaFade] = useState(false);

  // Reset to current week whenever the overlay is opened
  useEffect(() => {
    if (isOpen) setWeekStart(currentWeekSunday);
  }, [isOpen, currentWeekSunday]);

  // Brief opacity flash on the agenda when week changes
  useEffect(() => {
    setAgendaFade(true);
    const t = setTimeout(() => setAgendaFade(false), 180);
    return () => clearTimeout(t);
  }, [weekStart]);

  const weekDateRange = useMemo(() => getWeekDateRange(weekStart), [weekStart]);

  // Gated by RUNNING_CURRENT_WEEK_RECOMPUTE_ENABLED (via resolveRunningCurrentWeek):
  // while false, stays `null` exactly as today (this hand-rolled version was
  // always broken — `programStartDate` is a real Date object, and string-
  // concatenating it here silently produced an Invalid Date, so this badge
  // has never actually rendered). Once true, computes the real week via the
  // canonical calculateCurrentWeek(startDate, asOfDate), asOfDate being the
  // navigated week's Sunday (`weekStart`), not necessarily today.
  //
  // isDateWithinRunningPlan checked FIRST (02.09.2026 fix) — a navigated
  // week entirely before the program's real start would otherwise still
  // label as "שבוע 1" via calculateCurrentWeek's clamp, same as every other
  // pre-start week — three different calendar ranges all reading "week 1".
  const weekNumber = useMemo((): number | null => {
    const sunday = new Date(weekStart + 'T00:00:00');
    if (programStartDate && !isDateWithinRunningPlan(programStartDate, sunday)) return null;
    return resolveRunningCurrentWeek(programStartDate, null, sunday) ?? null;
  }, [weekStart, programStartDate]);

  // ── Drag handle state ────────────────────────────────────────────────────
  const dragStartY      = useRef<number | null>(null);
  const dragMovedEnough = useRef(false);

  const handleHandlePointerDown = useCallback((e: React.PointerEvent) => {
    dragStartY.current      = e.clientY;
    dragMovedEnough.current = false;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  }, []);

  const handleHandlePointerMove = useCallback((e: React.PointerEvent) => {
    if (dragStartY.current === null) return;
    if (Math.abs(e.clientY - dragStartY.current) > 10) {
      dragMovedEnough.current = true;
    }
  }, []);

  const handleHandlePointerUp = useCallback((e: React.PointerEvent) => {
    if (dragStartY.current === null) return;
    const delta   = e.clientY - dragStartY.current;
    const wasDrag = dragMovedEnough.current && Math.abs(delta) >= 15;
    dragStartY.current      = null;
    dragMovedEnough.current = false;

    if (!wasDrag) {
      // Tap → toggle
      setIsCalendarCollapsed((prev) => !prev);
    } else if (delta < -DRAG_THRESHOLD_PX) {
      setIsCalendarCollapsed(false); // drag up → expand
    } else if (delta > DRAG_THRESHOLD_PX) {
      setIsCalendarCollapsed(true);  // drag down → collapse
    }
  }, []);

  // Cancel drag if pointer leaves element unexpectedly
  const handleHandlePointerCancel = useCallback(() => {
    dragStartY.current      = null;
    dragMovedEnough.current = false;
  }, []);

  // ── Week navigation (collapsed mode) ──────────────────────────────────────

  const goToNextWeek = useCallback(() => {
    setWeekStart((prev) => {
      const d = new Date(prev + 'T00:00:00');
      d.setDate(d.getDate() + 7);
      return d.toISOString().split('T')[0];
    });
  }, []);

  const goToPrevWeek = useCallback(() => {
    setWeekStart((prev) => {
      if (prev <= currentWeekSunday) return prev; // already at current week — locked
      const d = new Date(prev + 'T00:00:00');
      d.setDate(d.getDate() - 7);
      return d.toISOString().split('T')[0];
    });
  }, [currentWeekSunday]);

  const handleWeekSwipe = useCallback(
    (_: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => {
      const { x, y } = info.offset;
      // Only act on clearly horizontal gestures (avoids conflict with vertical drag handle)
      if (Math.abs(x) <= Math.abs(y) || Math.abs(x) < 50) return;
      if (x < 0) goToNextWeek();
      else       goToPrevWeek();
    },
    [goToNextWeek, goToPrevWeek],
  );

  // ── Handlers ──────────────────────────────────────────────────────────────

  const handleDaySelect = useCallback((iso: string) => {
    onDaySelect(iso);
  }, [onDaySelect]);

  const handleInlineAdd = useCallback((date: string) => {
    setAddModalDate(date);
    setShowAddModal(true);
  }, []);

  const handleEditEntry = useCallback((entry: UserScheduleEntry) => {
    setEditEntry(entry);
  }, []);

  const handleSaved = useCallback(() => {
    setRefreshKey((k) => k + 1);
    onScheduleChanged?.();
  }, [onScheduleChanged]);

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <>
      <AnimatePresence>
        {isOpen && (
          <motion.div
            key="training-planner"
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={SLIDE_SPRING}
            className="fixed inset-0 z-50 flex flex-col bg-[#F8FAFC]"
            style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
          >
            {/* ── Header ── */}
            <div
              className="flex-shrink-0 bg-white/95 backdrop-blur-md border-b border-slate-100"
              style={{ paddingTop: 'max(1rem, env(safe-area-inset-top, 24px))' }}
            >
              <div className="max-w-md mx-auto px-4 pb-3 flex items-center justify-between" dir="rtl">
                <div className="flex items-center gap-2">
                  <CalendarDays className="w-5 h-5 text-[#00C9F2]" />
                  <h2 className="text-base font-black text-gray-900">תכנון אימונים</h2>
                </div>
                <div className="flex items-center gap-2">
                  {isScheduleBuilderDrawerEnabled() && (
                    <button
                      type="button"
                      onClick={() => setShowScheduleBuilder(true)}
                      className="w-9 h-9 rounded-full bg-white flex items-center justify-center border border-slate-200 text-gray-900 active:scale-90 transition-all shadow-sm"
                      aria-label="בנה לוז אימונים"
                    >
                      <CalendarDays className="w-4 h-4 stroke-[2.5] text-[#00C9F2]" />
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={onClose}
                    className="w-9 h-9 rounded-full bg-white flex items-center justify-center border border-slate-200 text-gray-900 active:scale-90 transition-all shadow-sm"
                    aria-label="סגור"
                  >
                    <X className="w-4 h-4 stroke-[2.5]" />
                  </button>
                </div>
              </div>
            </div>

            {/* ── Body ── */}
            <div className="flex-1 flex flex-col overflow-hidden max-w-md w-full mx-auto">

              {/* ── Collapsible calendar ── */}
              {/*
                The wrapper has a fixed pixel height with a CSS cubic-bezier
                transition and overflow: hidden. MonthlyCalendarGrid renders
                either 1 row (collapsed) or 6 rows (expanded); the clip does
                the rest. No framer-motion height animation here — plain CSS
                transition avoids fighting framer's own layout engine.

                Visual model: the calendar is the panel "dropping down" from
                above. Heavy bottom corner radius + soft downward shadow give
                it the feel of a header card resting on top of the agenda.
                `relative z-[1]` lifts its shadow above the agenda below
                instead of letting later DOM siblings paint over it.
              */}
              <div
                className="flex-shrink-0 bg-white overflow-hidden rounded-b-3xl shadow-[0_10px_30px_rgba(0,0,0,0.08)] relative z-[1]"
                style={{
                  height: isCalendarCollapsed ? CAL_HEIGHT_COLLAPSED : CAL_HEIGHT_EXPANDED,
                  transition: 'height 0.35s cubic-bezier(0.4, 0, 0.2, 1)',
                }}
              >
                {/*
                  In collapsed mode this motion.div is draggable horizontally.
                  drag="x" + dragElastic gives the rubbery pull feel.
                  touchAction: pan-y lets the browser handle vertical scroll
                  while JS captures horizontal gestures.
                */}
                <motion.div
                  drag={isCalendarCollapsed ? 'x' : false}
                  dragConstraints={{ left: 0, right: 0 }}
                  dragElastic={0.18}
                  dragMomentum={false}
                  onDragEnd={handleWeekSwipe}
                  style={{
                    touchAction: isCalendarCollapsed ? 'pan-y' : 'auto',
                    paddingTop: 8,
                    paddingLeft: 16,
                    paddingRight: 16,
                  }}
                >
                  {/* Week header — only in collapsed (week-strip) mode */}
                  {isCalendarCollapsed && (
                    <div
                      className="flex items-center justify-between mb-1.5"
                      dir="rtl"
                    >
                      <span
                        style={{
                          fontSize:   14,
                          fontWeight: 500,
                          color:      'var(--color-text-primary, #111827)',
                        }}
                      >
                        {weekDateRange}
                      </span>
                      {weekNumber !== null && (
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
                          שבוע {weekNumber}
                        </span>
                      )}
                    </div>
                  )}

                  <MonthlyCalendarGrid
                    selectedDate={selectedDate}
                    onDaySelect={handleDaySelect}
                    onEntryTap={onEntryTap}
                    viewMode="rings"
                    userId={userId}
                    recurringTemplate={recurringTemplate}
                    scheduleDays={scheduleDays}
                    programIconKey={programIconKey}
                    cellHeight={isCalendarCollapsed ? CELL_HEIGHT_COLLAPSED : CELL_HEIGHT_EXPANDED}
                    refreshKey={refreshKey}
                    collapsed={isCalendarCollapsed}
                  />
                </motion.div>
              </div>

              {/*
                ── Calendar trailing baseline: capsule handle pill ────────
                Logically belongs to the calendar (it's the calendar's drag
                handle), so it lives between the calendar panel and the
                agenda. Pointer handlers and view-state (isCalendarCollapsed
                toggle / drag-threshold collapse) are unchanged — only the
                physical placement and visual chrome changed.
              */}
              <div
                className="flex-shrink-0 flex justify-center items-start pt-3 pb-2 bg-white select-none cursor-pointer"
                onPointerDown={handleHandlePointerDown}
                onPointerMove={handleHandlePointerMove}
                onPointerUp={handleHandlePointerUp}
                onPointerCancel={handleHandlePointerCancel}
                style={{ touchAction: 'none' }}
                aria-label={isCalendarCollapsed ? 'הרחב לוח שנה' : 'כווץ לוח שנה'}
                role="button"
              >
                <div className="w-12 h-1.5 bg-gray-300 dark:bg-gray-700 rounded-full mx-auto" />
              </div>

              {/* Ultra-thin hairline divider between handle row and agenda */}
              <div className="flex-shrink-0 h-[1px] bg-gray-100/70" />

              {/*
                ── Agenda list ────────────────────────────────────────────
                Flat top edges — sits naturally in the background flow under
                the calendar panel. No top radius, no upward shadow: the
                visual elevation now lives on the calendar above (rounded
                bottom + downward shadow), so the agenda just receives it.
              */}
              <div className="flex-1 flex flex-col overflow-hidden bg-white">
                {/* ── Scrollable agenda ── */}
                <div
                  className="flex-1 overflow-y-auto pb-6"
                  style={{
                    opacity:    agendaFade ? 0.65 : 1,
                    transition: 'opacity 0.15s ease',
                  }}
                >
                  <RollingAgenda
                    selectedDate={selectedDate}
                    onDaySelect={handleDaySelect}
                    userId={userId}
                    recurringTemplate={recurringTemplate}
                    onStartWorkout={onStartWorkout}
                    filterMode="planner"
                    onAddWorkout={handleInlineAdd}
                    refreshKey={refreshKey}
                    onScheduleChanged={handleSaved}
                    weekStart={isCalendarCollapsed ? weekStart : undefined}
                    onEditEntry={handleEditEntry}
                    onPreviewEntry={onPreviewEntry}
                    onCommunityTap={onCommunityTap}
                  />
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <AddWorkoutModal
        isOpen={showAddModal}
        onClose={() => setShowAddModal(false)}
        targetDate={addModalDate}
        userId={userId}
        onSaved={handleSaved}
        onOpenBuilder={onOpenBuilder}
      />

      {/* Edit modal — opened by swipe-left edit button on agenda cards */}
      {editEntry && (() => {
        const cat = editEntry.scheduledCategories?.[0] ?? 'strength';
        const entryType = (cat === 'walking' ? 'walking' : cat === 'cardio' ? 'running' : 'strength') as 'strength' | 'running' | 'walking';
        return (
          <AddWorkoutModal
            isOpen={!!editEntry}
            onClose={() => setEditEntry(null)}
            targetDate={editEntry.date}
            userId={userId}
            onSaved={() => { setEditEntry(null); handleSaved(); }}
            initialEntryId={editEntry.entryId}
            initialType={entryType}
            initialProgramId={editEntry.programIds?.[0]}
            initialStartTime={editEntry.startTime}
            initialTitle={editEntry.title}
            onOpenBuilder={onOpenBuilder}
          />
        );
      })()}

      {isScheduleBuilderDrawerEnabled() && (
        <ScheduleBuilderDrawer isOpen={showScheduleBuilder} onClose={() => setShowScheduleBuilder(false)} />
      )}
    </>
  );
}
