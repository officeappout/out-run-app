'use client';

/**
 * ScheduleBuilderDrawer — schedule-drawer-screen-spec.md, stage 1
 * (screen + engine, no drag). Schedule advisor phase A: the week comes from the pure
 * advisor (adviseWeek, src/features/schedule/advisor), the controls' defaults from the
 * profile, the notes from typed reasons; saving exists only behind SCHEDULE_BUILDER_SAVE_V1
 * (off → the approve button stays disabled, exactly as before). Also opened from the home
 * card for a second-track user (entry='second_track', resolveScheduleCardDecision).
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
 * Data flow: `buildWeaverInput(profile, mode, focus, availableDayCount, asOfDate)`
 * → `weaveWeek(input)`. This component never decides anything the engine
 * should — `sharedDays[].order`, every reduction, every note, come from
 * `weaveWeek`'s own return value. This extends to the tabs themselves: the
 * "כוח"/"ריצה"/"משולב" chips set `mode`, which becomes engine INPUT (a
 * domain selection), never a display filter. DayRow/AgendaDayCard below
 * are not, and must not become, mode-aware — they render whatever
 * `result.week` contains, unconditionally; if the engine didn't build
 * running sessions this render, there are none in `result.week.running`
 * to show, full stop. A `mode`-conditional in DayRow would mean the input
 * didn't actually reach the engine correctly.
 */

import { useEffect, useMemo, useState } from 'react';
import { hapticTap } from '@/lib/haptics';
import { motion, AnimatePresence, useMotionValue, useTransform, useDragControls, animate } from 'framer-motion';
import { X, Lock, Sunrise, Sun, Sunset, Clock } from 'lucide-react';
import { DrumTimePicker } from '@/components/ui/DrumTimePicker';
import { useUserStore } from '@/features/user';
import { useSheetScrollChain } from '@/hooks/useSheetScrollChain';
import AgendaDayCard, { type ResolvedRunningWorkout } from '@/features/home/components/agenda/AgendaDayCard';
import AerobicStrengthSlider from '@/features/parks/core/components/hybrid/AerobicStrengthSlider';
import { defaultWeaveControls, type WeaveMode, type WeaverInputProfile } from '../engine/weaverInput';
import { scheduleIdNameHe } from '../engine/strengthVocabulary';
import { adviseWeek } from '../advisor/advisor';
import { toAdvisorInputFromClient, localDateKey } from '../advisor/adapters/client';
import type { WeekAdvice } from '../advisor/types';
import { planScheduleSave, type SaveScope } from '../services/scheduleBuilderSave.plan';
import { isScheduleBuilderSaveEnabled, saveScheduleProposal } from '../services/scheduleBuilderSave';
import { resolveToSlug } from '@/features/workout-engine/services/program-hierarchy.utils';
import type { UserScheduleEntry } from '@/features/user/scheduling/types/schedule.types';
import { DAY_LETTERS } from '../types/smartSchedule.types';
import { resolveTabLocks } from '@/lib/resolveTabLocks';
import { WHO_STRENGTH_TARGET_DAYS } from '@/lib/who-strength-target';
import { useFeatureFlags } from '@/hooks/useFeatureFlags';
import ScheduleBuilderSheetV2 from './ScheduleBuilderSheetV2';

const DAY_SHORT_HE = ['א', 'ב', 'ג', 'ד', 'ה', 'ו', 'ש'] as const;
const CLOSE_THRESHOLD = 220;
const SPRING = { type: 'spring', damping: 40, stiffness: 260, mass: 0.8 } as const;

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

// Moved to ../services/scheduleBuilderDrawerFlag (so callers can read the flag
// without pulling this whole drawer into their chunk); re-exported unchanged.
export { isScheduleBuilderDrawerEnabled } from '../services/scheduleBuilderDrawerFlag';

/**
 * Running-time presets — the same three RunningScheduleStep's v2 picker offers (a preset
 * only sets the "HH:MM" string; "אחר" opens the drum picker). Owner rule 01.09.2026: the
 * running step always carries a time picker, and the drawer is that step for a second track.
 */
const RUNNING_TIME_PRESETS = [
  { id: 'morning', label: 'בוקר', time: '07:00', Icon: Sunrise },
  { id: 'noon', label: 'צהריים', time: '12:30', Icon: Sun },
  { id: 'evening', label: 'ערב', time: '19:00', Icon: Sunset },
] as const;
/** Same default as RunningScheduleStep (morning) when the user never picked a time. */
const DEFAULT_RUNNING_TIME = '07:00';

interface ScheduleBuilderDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  /**
   * 'planner' (default) — opened from the schedule editor: approve offers
   * "רק השבוע / מכאן והלאה", as before.
   * 'second_track' — opened from the home card for a user who just added their second
   * track (resolveScheduleCardDecision): this is setting up the fixed week, so approve
   * saves "מכאן והלאה" directly (a this-week-only save would leave the week un-arranged).
   */
  entry?: 'planner' | 'second_track';
  /** Called after a successful save (the home page refreshes the profile so its card un-blurs). */
  onSaved?: () => void;
}

export default function ScheduleBuilderDrawer({ isOpen, onClose, entry = 'planner', onSaved }: ScheduleBuilderDrawerProps) {
  const profile = useUserStore((s) => s.profile);
  const userId = profile?.id ?? '';
  // enable_home_v2: the shared <Sheet> (ScheduleBuilderSheetV2); flag off keeps the markup below untouched.
  const v2 = useFeatureFlags(!!(profile?.core as { isSuperAdmin?: boolean } | undefined)?.isSuperAdmin).flags.enableHomeV2;

  // Pure decision, unit-tested on its own (src/lib/resolveTabLocks.ts) —
  // this component has no jsdom coverage, so the lock logic itself has to
  // live somewhere testable, not inline here.
  const { strength: strengthLocked, running: runningLocked, mixed: mixedLocked } = resolveTabLocks(profile);

  const y = useMotionValue(0);
  const opacity = useTransform(y, [0, 220], [1, 0]);
  const dragControls = useDragControls();
  // `y` is a MotionValue, not React state — it survives across close/reopen
  // because this component never unmounts (the parent renders it
  // unconditionally; `isOpen` only gates this component's own early return
  // below). Every close path must reset it, or the NEXT open starts from
  // whatever offset the drag/swipe left it at instead of fully expanded.
  const handleClose = () => {
    y.set(0);
    onClose();
  };
  const { scrollRef } = useSheetScrollChain({ isOpen, y, onClose: handleClose });

  // `mode` is the tab's own explicit state — a domain SELECTION fed into the engine
  // ("build me a strength week"), not a display filter. `focus` is the mixed-mode dosage
  // dial (dominance). Schedule advisor phase A (bug #2): none of the three is hardcoded
  // any more — the defaults come from the profile (defaultWeaveControls: the tab from
  // ownership, the days from the questionnaires' sum, focus from lifestyle.primaryTrack,
  // or the drawer's own saved prefs), re-read every time the drawer opens.
  const [mode, setMode] = useState<WeaveMode>('mixed');
  const [focus, setFocus] = useState(50);
  const [availableDayCount, setAvailableDayCount] = useState(3);
  const [saveState, setSaveState] = useState<'idle' | 'choose' | 'saving' | 'saved' | 'failed'>('idle');
  const [runningNote, setRunningNote] = useState<string | null>(null);
  const [runningTime, setRunningTime] = useState(DEFAULT_RUNNING_TIME);
  const [customTimeOpen, setCustomTimeOpen] = useState(false);
  // Behind SCHEDULE_BUILDER_SAVE_V1: a runner who just added strength has no strength day
  // in the template yet; propose the WHO minimum instead of an all-rest strength week.
  const unarrangedStrengthDays = isScheduleBuilderSaveEnabled() ? WHO_STRENGTH_TARGET_DAYS : undefined;
  useEffect(() => {
    if (!isOpen) return;
    setRunningTime(
      (profile as { lifestyle?: { reminders?: { runningTime?: string } } } | null)?.lifestyle?.reminders?.runningTime
        || DEFAULT_RUNNING_TIME,
    );
    setCustomTimeOpen(false);
    setRunningNote(null);
    const d = defaultWeaveControls(profile as WeaverInputProfile | null, { resolveSlug: resolveToSlug, unarrangedStrengthDays });
    setMode(d.mode);
    setFocus(d.focus);
    setAvailableDayCount(d.availableDayCount);
    setSaveState('idle');
    // eslint-disable-next-line react-hooks/exhaustive-deps -- defaults are taken once per open, not on every profile refresh
  }, [isOpen]);

  const asOfDate = useMemo(() => new Date(), []); // one fixed anchor per mount, not re-read on every render

  // The schedule advisor (pure) over the client adapter — the same rule families, plus
  // typed reasons rendered in Hebrew. Fails soft: a throw shows "no data", never a crash.
  const result: WeekAdvice | null = useMemo(() => {
    try {
      return adviseWeek(
        // enable_home_v2: runs by slot type, the same week home and signup show.
        toAdvisorInputFromClient({ profile, now: asOfDate, controls: { mode, focus, availableDayCount }, resolveSlug: resolveToSlug, unarrangedStrengthDays, runsByType: v2 }),
      );
    } catch (err) {
      console.error('[ScheduleBuilderDrawer] adviseWeek threw — showing no data instead of crashing:', err);
      return null;
    }
  }, [profile, mode, focus, availableDayCount, asOfDate, unarrangedStrengthDays, v2]);

  // ── Save (SCHEDULE_BUILDER_SAVE_V1; off → the approve button stays disabled) ──
  const saveEnabled = isScheduleBuilderSaveEnabled();
  const handleSave = async (scope: SaveScope) => {
    if (!result || !profile || !userId) return;
    setSaveState('saving');
    const plan = planScheduleSave({
      profile: profile as WeaverInputProfile,
      week: result.week,
      controls: result.controls,
      scope,
      todayKey: localDateKey(asOfDate),
      resolveSlug: resolveToSlug,
      runsByType: v2,
    });
    const outcome = await saveScheduleProposal(plan, { uid: userId, runningTime });
    setRunningNote(
      outcome.runningSkipped === 'this_week_scope'
        ? 'הריצות זזות רק ב"מכאן והלאה" — השבוע נשארו במקומן.'
        : outcome.runningSkipped === 'single_run'
          ? 'ריצה אחת בשבוע היא לא תוכנית — ימי הריצה לא שונו.'
          : outcome.running && !outcome.running.ok
            // The days + time are saved either way (completeRunningScheduleFirstChoice
            // writes them even when the plan build fails, with planBuildFailedAt);
            // the next-run card's existing retry rebuilds the plan.
            ? 'ימי הריצה נשמרו. את תוכנית הריצה נשלים ברקע.'
            : null,
    );
    setSaveState(outcome.ok ? 'saved' : 'failed');
    if (outcome.ok) onSaved?.();
  };
  // The time picker shows whenever this save can write running days (the running or
  // mixed tab of a user who owns running) — never for a strength-only week.
  const showRunningTime = saveEnabled && !runningLocked && mode !== 'strength';
  const matchedTimePreset = RUNNING_TIME_PRESETS.find((p) => p.time === runningTime)?.id ?? null;

  if (!isOpen) return null;

  const content = (
    <>

      {/* ── Area A — what's in the schedule ──
          Locked = visual only, this stage. Click is a no-op — mode
          never moves, computeWeaveResultSafely never runs for a
          locked pick. Navigation to the domain's own onboarding
          entry (and the confirmation drawer it opens through) is
          deliberately deferred: WorkoutBuilderSheet.tsx, home to the
          only reusable version of that confirmation UI, is being
          edited by a concurrent session right now — see
          parking-lot.md. */}
      <div className="flex gap-2 mb-4">
        <ChipButton label="כוח" active={mode === 'strength'} locked={strengthLocked} onClick={() => setMode('strength')} />
        <ChipButton label="ריצה" active={mode === 'running'} locked={runningLocked} onClick={() => setMode('running')} />
        <ChipButton label="משולב" active={mode === 'mixed'} locked={mixedLocked} onClick={() => setMode('mixed')} />
      </div>

      {mode === 'strength' && <OwnedProgramsList result={result} />}

      {/* ── Area B — dosage + availability ── */}
      {mode === 'mixed' && (
        <AerobicStrengthSlider
          aerobicShare={Math.min(0.7, Math.max(0.3, focus / 100))}
          onChange={(share) => setFocus(Math.round(share * 100))}
          goalType="time"
          timeBudgetMin={30}
        />
      )}
      <AvailabilityStepper value={availableDayCount} onChange={setAvailableDayCount} />

      {/* ── Running time — the running step's time picker (owner rule 01.09.2026) ── */}
      {showRunningTime && (
        <div className="bg-white rounded-2xl border border-slate-100 px-4 py-3 mb-2">
          <span className="text-sm font-black text-gray-700">באיזו שעה תרוץ?</span>
          <div className="mt-2 flex gap-2">
            {RUNNING_TIME_PRESETS.map(({ id, label, time, Icon }) => {
              const on = !customTimeOpen && matchedTimePreset === id;
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => { setCustomTimeOpen(false); setRunningTime(time); }}
                  className={`flex-1 flex flex-col items-center gap-0.5 py-2 rounded-xl text-[12px] font-black whitespace-nowrap transition-all ${
                    on ? 'bg-[#00C9F2] text-on-brand' : 'bg-white text-gray-600 border border-slate-200'
                  }`}
                >
                  <Icon size={14} />
                  {label}
                  <span dir="ltr" className="text-[11px] font-bold opacity-80">{time}</span>
                </button>
              );
            })}
            <button
              type="button"
              onClick={() => setCustomTimeOpen(true)}
              className={`flex-1 flex flex-col items-center gap-0.5 py-2 rounded-xl text-[12px] font-black whitespace-nowrap transition-all ${
                customTimeOpen || matchedTimePreset === null ? 'bg-[#00C9F2] text-on-brand' : 'bg-white text-gray-600 border border-slate-200'
              }`}
            >
              <Clock size={14} />
              אחר
              <span dir="ltr" className="text-[11px] font-bold opacity-80">{matchedTimePreset === null ? runningTime : '—'}</span>
            </button>
          </div>
          {(customTimeOpen || matchedTimePreset === null) && (
            <div className="mt-2">
              <DrumTimePicker value={runningTime} onChange={setRunningTime} />
            </div>
          )}
        </div>
      )}

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

      {/* Approval — disabled unless SCHEDULE_BUILDER_SAVE_V1 (default OFF: preview only, no write). */}
      {!saveEnabled && (
        <button
          type="button"
          disabled
          className="w-full mt-4 py-3 rounded-2xl bg-slate-200 text-slate-400 font-black text-sm cursor-not-allowed"
        >
          אישור (בקרוב)
        </button>
      )}
      {saveEnabled && result && (saveState === 'idle' || saveState === 'failed') && (
        <button
          type="button"
          onClick={() => (entry === 'second_track' ? handleSave('from_now') : setSaveState('choose'))}
          className="w-full mt-4 py-3 rounded-2xl bg-[#00C9F2] text-on-brand font-black text-sm"
        >
          זה מתאים לי
        </button>
      )}
      {saveEnabled && result && saveState === 'choose' && (
        <div className="mt-4 flex gap-2">
          <button type="button" onClick={() => handleSave('this_week')} className="flex-1 py-3 rounded-2xl bg-white border border-slate-200 font-black text-sm text-gray-700">
            רק השבוע
          </button>
          <button type="button" onClick={() => handleSave('from_now')} className="flex-1 py-3 rounded-2xl bg-[#00C9F2] text-on-brand font-black text-sm">
            מכאן והלאה
          </button>
        </div>
      )}
      {saveEnabled && saveState === 'saving' && <p className="mt-4 text-sm text-gray-500 text-center">שומר…</p>}
      {saveEnabled && saveState === 'saved' && (
        <p className="mt-4 text-sm font-black text-gray-700 text-center">נשמר.{runningNote ? ` ${runningNote}` : ''}</p>
      )}
      {saveEnabled && saveState === 'failed' && <p className="mt-4 text-sm text-red-600 text-center">השמירה לא הצליחה. אפשר לנסות שוב.</p>}
    </>
  );

  if (v2) {
    return (
      <ScheduleBuilderSheetV2
        isOpen={isOpen}
        onClose={handleClose}
        y={y}
        opacity={opacity}
        dragControls={dragControls}
        scrollRef={scrollRef}
        closeThreshold={CLOSE_THRESHOLD}
        spring={SPRING}
      >
        {content}
      </ScheduleBuilderSheetV2>
    );
  }

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
            onClick={handleClose}
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
                handleClose();
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
                onClick={handleClose}
                onPointerDown={(e) => e.stopPropagation()}
                aria-label="סגור"
                className="absolute left-3 top-2 w-9 h-9 rounded-full bg-white border border-slate-200 flex items-center justify-center shadow-sm active:scale-90 transition-all"
              >
                <X className="w-4 h-4 stroke-[2.5] text-gray-900" />
              </button>
            </div>

            <div ref={scrollRef} className="flex-1 overflow-y-auto overscroll-contain px-4 pb-8">
              <h2 className="text-base font-black text-gray-900 mb-3">בואו נבנה לוז</h2>
              {content}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}

/**
 * Locked visual matches WorkoutBuilderSheet.tsx's `isLocked` ProgramPill
 * state verbatim (opacity-40 + gray-400 Lock icon, corner-positioned,
 * non-clickable) — same meaning David wants here: "you can't reach this
 * yet." The click-through behavior that pattern's `isUnenrolled` state has
 * (opens a confirmation drawer to the domain's questionnaire) is NOT wired
 * yet — deferred, see the call site's comment and parking-lot.md.
 */
function ChipButton({
  label,
  active,
  locked,
  onClick,
}: {
  label: string;
  active: boolean;
  locked?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={locked ? undefined : onClick}
      className={`relative flex-1 py-2 rounded-xl text-sm font-black transition-all ${
        locked
          ? 'opacity-40 cursor-not-allowed bg-white text-gray-400 border border-slate-200'
          : active
            ? 'bg-[#00C9F2] text-on-brand'
            : 'bg-white text-gray-600 border border-slate-200'
      }`}
    >
      {locked && <Lock size={10} className="absolute top-1.5 right-1.5 text-gray-400" />}
      {label}
    </button>
  );
}

function AvailabilityStepper({ value, onChange }: { value: number; onChange: (n: number) => void }) {
  return (
    <div className="flex items-center justify-between bg-white rounded-2xl border border-slate-100 px-4 py-3 mb-2">
      <span className="text-sm font-black text-gray-700">כמה ימים תוכל להתאמן?</span>
      <div className="flex items-center gap-3">
        <button type="button" onClick={() => { if (value > 1) hapticTap('selection'); onChange(Math.max(1, value - 1)); }} className="w-8 h-8 rounded-full bg-slate-100 font-black text-gray-700">−</button>
        <span className="text-base font-black text-gray-900 w-4 text-center">{value}</span>
        <button type="button" onClick={() => { if (value < 7) hapticTap('selection'); onChange(Math.min(7, value + 1)); }} className="w-8 h-8 rounded-full bg-slate-100 font-black text-gray-700">+</button>
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
function OwnedProgramsList({ result }: { result: WeekAdvice | null }) {
  if (!result) return null;
  const programs = result.week.strength.flatMap((d) => d.sessions.map((s) => s.skillId));
  const unique = Array.from(new Set(programs));
  if (unique.length === 0) return null;
  // Bug #6: Hebrew names only — never an internal id like "UPPER_BODY".
  return (
    <div className="mb-3 flex flex-wrap gap-1.5">
      {unique.map((id) => (
        <span key={id} className="text-[11px] font-black px-2.5 py-1 rounded-full bg-white border border-slate-200 text-gray-600">{scheduleIdNameHe(id)}</span>
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
  result: Pick<WeekAdvice, 'week' | 'sharedDays'>;
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
