'use client';

/**
 * The schedule tutorial after ל1: ל2 routine → ל3 days → ל4 the week → ל5 flames. A full-screen
 * overlay on home. Owns the answers; the week is rebuilt from engine v2 on every change.
 * `onDone` fires once, after ל5 (the week is saved by then).
 */
import { useMemo, useState, type ReactNode } from 'react';
import { auth } from '@/lib/firebase';
import { useT } from '@/hooks/useT';
import { schedule } from '@/messages/ns/schedule';
import { common } from '@/messages/ns/common';
import { useLocaleStore } from '@/store/useLocaleStore';
import { weekdayLabel } from '@/lib/i18n/units';
import { useUserStore } from '@/features/user/identity/store/useUserStore';
import { useDailyActivity } from '@/features/activity/hooks/useDailyActivity';
import { DAILY_STEP_GOAL } from '@/features/activity/config/health-goals.config';
import { useSuppressBottomNav } from '@/features/parks/core/hooks/useSuppressBottomNav';
import { DEFAULT_SESSION_MINUTES, freeDays, lastFreeDay, nextFreeDay, setDayTime, tapWindow, toggleDay } from '../model/days';
import { buildTutorialWeek } from '../model/tutorialWeek';
import { programsList } from '../model/weekCards';
import { saveTutorialWeek } from '../saveTutorialWeek';
import { useTutorialInputs } from '../useTutorialInputs';
import { useTutorialGoals } from '../useTutorialGoals';
import SchedPersonaStep from './SchedPersonaStep';
import SchedDaysStep from './SchedDaysStep';
import WeekPlanStep from './WeekPlanStep';
import ExplainFlamesStep from './ExplainFlamesStep';
import { ArrowRight } from 'lucide-react';
import { usePilotAhV1 } from '@/hooks/usePilotAhV1';

type Step = 'persona' | 'days' | 'week' | 'flames';
const QUESTION_STEPS = 3;

export default function ScheduleTutorialFlow({ onDone, onExit }: {
  onDone: (r: { startWorkout: boolean }) => void;
  /** enable_pilot_ah_v1 (AH14): back from the first step leaves the flow. */
  onExit?: () => void;
}) {
  // enable_pilot_ah_v1 (AH14): a back button on the steps that had none (routine → leave, week → days).
  const pilotAh = usePilotAhV1();
  useSuppressBottomNav();
  const t = useT(schedule);
  const tc = useT(common);
  const locale = useLocaleStore((s) => s.locale);
  const profile = useUserStore((s) => s.profile);
  const { todayActivity, stepsToday } = useDailyActivity();
  const inputs = useTutorialInputs();
  const goals = useTutorialGoals();

  const [step, setStep] = useState<Step>('persona');
  const [days, setDays] = useState(inputs.initial);
  const [minutes, setMinutes] = useState<number>(DEFAULT_SESSION_MINUTES);
  const [twoPerDay, setTwoPerDay] = useState(true);
  const [longRunPick, setLongRunPick] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(false);
  const [startWorkout, setStartWorkout] = useState(false);

  const longRunDay = longRunPick != null && days[longRunPick] ? longRunPick : lastFreeDay(days);
  const week = useMemo(
    () => buildTutorialWeek({
      seed: inputs.seed, levels: inputs.levels, engineLevel: inputs.engineLevel, days, minutes,
      running: inputs.running, twoPerDay, longRunDay,
      stepsGoal: goals.steps?.goal ?? todayActivity?.stepsGoal ?? DAILY_STEP_GOAL, order: inputs.order,
      ramp: goals.ramp,
    }),
    [inputs, days, minutes, twoPerDay, longRunDay, todayActivity?.stepsGoal, goals.steps?.goal, goals.ramp],
  );

  const b = (c: ReactNode) => <b>{c}</b>;
  const count = freeDays(days).length;
  const note = week.complex
    ? t.rich('tutorial.days.note.complex', { days: count, programs: programsList(t, week, locale), runs: week.runCount > 0 ? 'yes' : 'no', b })
    : t.rich('tutorial.days.note.simple', { days: count, strength: week.strengthCount, movement: week.movementCount, b });

  const confirm = async (andTrain: boolean) => {
    const uid = auth.currentUser?.uid ?? profile?.id;
    if (!uid || saving) return;
    setSaving(true);
    setError(false);
    try {
      await saveTutorialWeek(uid, week, profile as Parameters<typeof saveTutorialWeek>[2], {
        sessionMinutes: minutes,
        running: inputs.running ? { longRunDay, twoPerDay } : null,
        steps: goals.steps,
      });
      setStartWorkout(andTrain);
      setStep('flames');
    } catch (err) {
      console.error('[ScheduleTutorial] save failed', err);
      setError(true);
    } finally {
      setSaving(false);
    }
  };

  const longShort = longRunDay != null ? weekdayLabel(longRunDay, 'short', tc) : '';
  return (
    <div
      className="fixed inset-0 z-[120] flex flex-col bg-v2-surface text-v2-ink"
      style={{ paddingTop: 'env(safe-area-inset-top, 0px)', paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
    >
      {pilotAh && (step === 'persona' || step === 'week') && (
        <div className="flex justify-start px-4 pt-2">
          <button
            type="button"
            onClick={() => (step === 'week' ? setStep('days') : onExit?.())}
            aria-label={t('tutorial.back')}
            className="grid h-9 w-9 place-items-center rounded-full bg-white shadow-v2-ring transition-transform duration-150 ease-v2 active:scale-[0.97]"
          >
            <ArrowRight size={17} strokeWidth={2.4} className="ltr:-scale-x-100" aria-hidden />
          </button>
        </div>
      )}
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-none">
        {step === 'persona' && <SchedPersonaStep step={1} total={QUESTION_STEPS} onNext={() => setStep('days')} />}
        {step === 'days' && (
          <SchedDaysStep
            step={2}
            total={QUESTION_STEPS}
            order={inputs.order}
            dates={inputs.dates}
            days={days}
            target={freeDays(inputs.initial).length}
            minutes={minutes}
            note={note}
            running={inputs.running ? {
              twoPerDay,
              onTwoPerDay: setTwoPerDay,
              longRunLabel: longRunDay === lastFreeDay(days) ? t('tutorial.days.longRunLast', { day: longShort }) : longShort,
              longRunAria: t('tutorial.days.longRunAria', { day: longShort }),
              onCycleLongRun: () => setLongRunPick(nextFreeDay(days, longRunDay)),
            } : null}
            onToggleDay={(dow) => setDays((s) => toggleDay(s, dow, inputs.defaultWindow))}
            onWindow={(dow, w) => setDays((s) => tapWindow(s, dow, w).state)}
            onTime={(dow, time) => setDays((s) => setDayTime(s, dow, time))}
            onMinutes={setMinutes}
            onBack={() => setStep('persona')}
            onNext={() => setStep('week')}
          />
        )}
        {step === 'week' && (
          <WeekPlanStep
            week={week}
            dates={inputs.dates}
            todayDow={inputs.todayDow}
            stepsToday={stepsToday}
            saving={saving}
            error={error}
            onConfirm={() => void confirm(false)}
            onChange={() => setStep('days')}
          />
        )}
        {step === 'flames' && <ExplainFlamesStep onDone={() => onDone({ startWorkout })} />}
      </div>
    </div>
  );
}
