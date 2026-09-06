'use client';

/**
 * ScheduleBuilderDrawer — schedule-drawer-screen-spec.md, stage 1
 * (screen + engine, no drag, no save).
 *
 * Sheet mechanics: `useMotionValue(0)` + `drag="y"` on the handle +
 * `useSheetScrollChain` for swipe-to-dismiss from inside the scroll body —
 * NOT `useSheetDrag`. Verified before building (not assumed): `useSheetDrag`
 * drives an `AnimationControls` object for named multi-anchor sheets
 * (peek/half/full); `useSheetScrollChain` needs a real `MotionValue<number>`
 * it reads/writes directly during a touch gesture. The two don't compose —
 * zero existing components combine them (`HybridOverviewScreen.tsx`
 * mentions both names but its own comment says it reproduces
 * useSheetScrollChain's logic locally instead of calling it, for exactly
 * this reason). This drawer has one open/closed state, no snap levels — the
 * `useMotionValue`+`drag="y"`+`useSheetScrollChain` pattern already used by
 * `GroupDetailsDrawer.tsx`/`WorkoutPreviewDrawer.tsx`/`ExerciseDetailDrawer.tsx`/
 * `ParkDetailSheet.tsx` is the real fit, not `useSheetDrag`. Logged in
 * `.claude/knowledge/parking-lot.md` — David's call, not a workaround.
 *
 * Area C reuses `AgendaDayCard` for both domains, in read-only preview mode:
 *  - strength: fed via `scheduleMap` (an existing escape hatch — a parent-
 *    supplied, date-keyed batch bypasses AgendaDayCard's own Firestore
 *    fetch).
 *  - running: fed via `runningOverride` (new — AgendaDayCard's running side
 *    used to read only from the live global store, with no way to preview
 *    a hypothetical week that was never saved).
 *  - `suppressScheduleDaysFallback` (new, paired with `runningOverride`):
 *    without it, a rest day in the proposal could silently render the
 *    user's REAL, unrelated strength habit for that weekday (AgendaDayCard's
 *    own scheduleDays-fallback reads live profile data unconditionally
 *    whenever the supplied entries are empty).
 *  - `onDragStart`/`onCardDragEnd` are both omitted (not passed as `undefined`
 *    props — simply never given) — `AgendaDayCard`'s own `isDraggable`
 *    is `!!onCardDragEnd && ...`, so this is the same mechanism the
 *    component already uses to turn drag off for other non-draggable
 *    contexts, not a new "disable" flag.
 *
 * Data flow: `buildWeaverInput(profile, focus, availableDayCount, asOfDate)`
 * → `weaveWeek(input)`. This component never decides anything the engine
 * should — `sharedDays[].order`, every reduction, every note, come from
 * `weaveWeek`'s own return value.
 */

import { useMemo, useState } from 'react';
import { motion, AnimatePresence, useMotionValue, useTransform, useDragControls, animate } from 'framer-motion';
import { X } from 'lucide-react';
import { useUserStore } from '@/features/user';
import { useSheetScrollChain } from '@/hooks/useSheetScrollChain';
import AgendaDayCard, { type ResolvedRunningWorkout } from '@/features/home/components/agenda/AgendaDayCard';
import AerobicStrengthSlider from '@/features/parks/core/components/hybrid/AerobicStrengthSlider';
import { buildWeaverInput, type WeaverInputProfile } from '../engine/weaverInput';
import { weaveWeek, type WeaveWeekResult } from '../engine/scheduleWeaver';
import type { UserScheduleEntry } from '@/features/user/scheduling/types/schedule.types';
import { DAY_LETTERS } from '../types/smartSchedule.types';
import { SCHEDULE_BUILDER_DRAWER_ENABLED } from '@/config/feature-flags';

const DAY_SHORT_HE = ['א', 'ב', 'ג', 'ד', 'ה', 'ו', 'ש'] as const;
const CLOSE_THRESHOLD = 220;
const SPRING = { type: 'spring', damping: 40, stiffness: 260, mass: 0.8 } as const;

type ChipMode = 'strength' | 'running' | 'combined';

function chipModeForFocus(focus: number): ChipMode {
  if (focus <= 0) return 'strength';
  if (focus >= 100) return 'running';
  return 'combined';
}

/** Local YYYY-MM-DD — not `toISOString()`, which converts to UTC and can shift the calendar date near midnight in this user's timezone. */
function formatLocalISODate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** The real calendar date for `dayOfWeek` (0=Sunday..6=Saturday) in the week containing `asOfDate`. */
function isoDateForDayOfWeek(asOfDate: Date, dayOfWeek: number): string {
  const startOfWeek = new Date(asOfDate);
  startOfWeek.setDate(asOfDate.getDate() - asOfDate.getDay());
  const target = new Date(startOfWeek);
  target.setDate(startOfWeek.getDate() + dayOfWeek);
  return formatLocalISODate(target);
}

/** localStorage override, same pattern as isRunningOnboardingGateEnabled/isAgendaHybridDayDisplayEnabled/isPlsCacheEnabled. */
export function isScheduleBuilderDrawerEnabled(): boolean {
  if (typeof window !== 'undefined') {
    try {
      const ls = window.localStorage?.getItem('OUT_SCHEDULE_DRAWER');
      if (ls === '0' || ls === 'false') return false;
      if (ls === '1' || ls === 'true') return true;
    } catch {
      /* private mode — ignore */
    }
  }
  return SCHEDULE_BUILDER_DRAWER_ENABLED;
}

interface ScheduleBuilderDrawerProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function ScheduleBuilderDrawer({ isOpen, onClose }: ScheduleBuilderDrawerProps) {
  const profile = useUserStore((s) => s.profile);
  const userId = profile?.id ?? '';

  const y = useMotionValue(0);
  const opacity = useTransform(y, [0, 220], [1, 0]);
  const dragControls = useDragControls();
  const { scrollRef } = useSheetScrollChain({ isOpen, y, onClose });

  // Local-only for this stage — no persisted default yet (schedule-drawer-
  // screen-spec.md's "שמירת הפקדים" section is a later stage, not this one;
  // "no save" here covers these controls too, not just the final approval).
  const [focus, setFocus] = useState(50);
  const [availableDayCount, setAvailableDayCount] = useState(3);
  const chipMode = chipModeForFocus(focus);

  const asOfDate = useMemo(() => new Date(), []); // one fixed anchor per mount, not re-read on every render

  const result: WeaveWeekResult | null = useMemo(() => {
    const input = buildWeaverInput(profile as WeaverInputProfile | null | undefined, focus, availableDayCount, asOfDate);
    if (!input) return null;
    return weaveWeek(input);
  }, [profile, focus, availableDayCount, asOfDate]);

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[101] bg-black/40"
            style={{ backdropFilter: 'blur(4px)' }}
            onClick={onClose}
          />
          <motion.div
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={SPRING}
            drag="y"
            dragControls={dragControls}
            dragListener={false}
            dragConstraints={{ top: 0, bottom: 500 }}
            dragElastic={{ top: 0.08, bottom: 0 }}
            dragMomentum={false}
            onDragEnd={(_, info) => {
              const offset = info.offset.y;
              if (offset > CLOSE_THRESHOLD || info.velocity.y > 500) {
                onClose();
              } else {
                animate(y, 0, SPRING);
              }
            }}
            className="fixed bottom-0 left-0 right-0 z-[101] max-w-md mx-auto bg-[#F8FAFC] rounded-t-3xl shadow-2xl flex flex-col"
            style={{ height: '92vh', y, opacity }}
            dir="rtl"
          >
            {/* ── Handle + close ── */}
            <div
              className="relative flex-shrink-0 flex items-center justify-center py-3 cursor-grab active:cursor-grabbing"
              onPointerDown={(e) => dragControls.start(e)}
              style={{ touchAction: 'none' }}
            >
              <div className="w-10 h-1 bg-slate-300 rounded-full" />
              <button
                type="button"
                onClick={onClose}
                onPointerDown={(e) => e.stopPropagation()}
                aria-label="סגור"
                className="absolute left-3 top-2 w-9 h-9 rounded-full bg-white border border-slate-200 flex items-center justify-center shadow-sm active:scale-90 transition-all"
              >
                <X className="w-4 h-4 stroke-[2.5] text-gray-900" />
              </button>
            </div>

            <div ref={scrollRef} className="flex-1 overflow-y-auto overscroll-contain px-4 pb-8">
              <h2 className="text-base font-black text-gray-900 mb-3">בואו נבנה לוז</h2>

              {/* ── Area A — what's in the schedule ── */}
              <div className="flex gap-2 mb-4">
                <ChipButton label="כוח" active={chipMode === 'strength'} onClick={() => setFocus(0)} />
                <ChipButton label="ריצה" active={chipMode === 'running'} onClick={() => setFocus(100)} />
                <ChipButton label="משולב" active={chipMode === 'combined'} onClick={() => setFocus((f) => (f <= 0 || f >= 100 ? 50 : f))} />
              </div>

              {chipMode === 'strength' && <OwnedProgramsList result={result} />}

              {/* ── Area B — dosage + availability ── */}
              {chipMode === 'combined' && (
                <AerobicStrengthSlider
                  aerobicShare={Math.min(0.7, Math.max(0.3, focus / 100))}
                  onChange={(share) => setFocus(Math.round(share * 100))}
                  goalType="time"
                  timeBudgetMin={30}
                />
              )}
              <AvailabilityStepper value={availableDayCount} onChange={setAvailableDayCount} />

              {/* ── Area C — the resulting week ── */}
              <div className="mt-4 space-y-2">
                {result && Array.from({ length: 7 }, (_, dayOfWeek) => (
                  <DayRow key={dayOfWeek} dayOfWeek={dayOfWeek} asOfDate={asOfDate} result={result} userId={userId} />
                ))}
                {!result && (
                  <p className="text-sm text-gray-500 text-center py-6">
                    אין עדיין מספיק נתונים כדי להציע לוז — פתח תוכנית כוח או ריצה קודם.
                  </p>
                )}
              </div>

              {/* ── Coach notes — one home, per spec ── */}
              {result && result.notes.length > 0 && (
                <div className="mt-4 rounded-2xl bg-white border border-slate-100 p-3">
                  <p className="text-[12px] font-black text-gray-700 mb-1.5">הערות</p>
                  <ul className="space-y-1">
                    {result.notes.map((note, i) => (
                      <li key={i} className="text-[12px] text-gray-600 leading-snug">{note}</li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Approval button — inactive at this stage. No write, per spec. */}
              <button
                type="button"
                disabled
                className="w-full mt-4 py-3 rounded-2xl bg-slate-200 text-slate-400 font-black text-sm cursor-not-allowed"
              >
                אישור (בקרוב)
              </button>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

function ChipButton({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex-1 py-2 rounded-xl text-sm font-black transition-all ${
        active ? 'bg-[#00C9F2] text-white' : 'bg-white text-gray-600 border border-slate-200'
      }`}
    >
      {label}
    </button>
  );
}

function AvailabilityStepper({ value, onChange }: { value: number; onChange: (n: number) => void }) {
  return (
    <div className="flex items-center justify-between bg-white rounded-2xl border border-slate-100 px-4 py-3 mb-2">
      <span className="text-sm font-black text-gray-700">כמה ימים תוכל להתאמן?</span>
      <div className="flex items-center gap-3">
        <button type="button" onClick={() => onChange(Math.max(1, value - 1))} className="w-8 h-8 rounded-full bg-slate-100 font-black text-gray-700">−</button>
        <span className="text-base font-black text-gray-900 w-4 text-center">{value}</span>
        <button type="button" onClick={() => onChange(Math.min(7, value + 1))} className="w-8 h-8 rounded-full bg-slate-100 font-black text-gray-700">+</button>
      </div>
    </div>
  );
}

/**
 * Ownership principle — shows only the strength programs/skills weaveWeek
 * actually built the proposal from (resolveScheduleSeed's real output,
 * already ownership-filtered inside buildWeaverInput). Read-only list, no
 * add/remove here — "a program that wasn't opened isn't shown and can't be
 * manually added" (spec's own wording).
 */
function OwnedProgramsList({ result }: { result: WeaveWeekResult | null }) {
  if (!result) return null;
  const programs = result.week.strength.flatMap((d) => d.sessions.map((s) => s.skillId));
  const unique = Array.from(new Set(programs));
  if (unique.length === 0) return null;
  return (
    <div className="mb-3 flex flex-wrap gap-1.5">
      {unique.map((id) => (
        <span key={id} className="text-[11px] font-black px-2.5 py-1 rounded-full bg-white border border-slate-200 text-gray-600">{id}</span>
      ))}
    </div>
  );
}

const CATEGORY_LABEL_HE: Record<string, string> = {
  quality_primary: 'איכות',
  tempo: 'איכות',
  short_intervals: 'איכות',
  long_intervals: 'איכות',
  hill_sprints: 'איכות',
  hill_short: 'איכות',
  hill_long: 'ריצת גבעות',
  fartlek_structured: 'איכות',
  long_run: 'ריצה ארוכה',
  easy_run: 'ריצה קלה',
  fartlek_easy: 'ריצה קלה',
  strides: 'סטרייידס',
};

function DayRow({
  dayOfWeek,
  asOfDate,
  result,
  userId,
}: {
  dayOfWeek: number;
  asOfDate: Date;
  result: WeaveWeekResult;
  userId: string;
}) {
  const date = isoDateForDayOfWeek(asOfDate, dayOfWeek);
  const strengthDay = result.week.strength.find((d) => d.dayOfWeek === dayOfWeek);
  const runningDay = result.week.running.find((d) => d.dayOfWeek === dayOfWeek);
  const shared = result.sharedDays.find((d) => d.dayOfWeek === dayOfWeek);

  const scheduleMap: Record<string, UserScheduleEntry[]> = {
    [date]: strengthDay && strengthDay.sessions.length > 0
      ? strengthDay.sessions.map((s) => ({
          userId,
          date,
          programIds: [s.skillId],
          type: 'training',
          source: 'recurring',
          completed: false,
        }))
      : [],
  };

  const runningOverride: ResolvedRunningWorkout | null = runningDay && runningDay.category !== null
    ? {
        name: CATEGORY_LABEL_HE[runningDay.category] ?? 'אימון ריצה',
        category: runningDay.category,
        status: 'pending',
      }
    : null;

  return (
    <div>
      {shared && (
        <p className="text-[11px] font-black text-gray-500 mb-0.5 px-1">
          {DAY_LETTERS[dayOfWeek]} — יום כפול: {shared.order === 'running-first' ? 'ריצה קודם' : 'כוח קודם'}
        </p>
      )}
      <AgendaDayCard
        date={date}
        isSelected={false}
        onSelect={() => {}}
        userId={userId}
        scheduleMap={scheduleMap}
        runningOverride={runningOverride}
        suppressScheduleDaysFallback
      />
    </div>
  );
}
