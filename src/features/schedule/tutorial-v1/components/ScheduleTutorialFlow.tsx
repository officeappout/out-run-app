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
import SchedPersonaStep from './SchedPersonaStep';
import SchedDaysStep from './SchedDaysStep';
import WeekPlanStep from './WeekPlanStep';
import ExplainFlamesStep from './ExplainFlamesStep';

type Step = 'persona' | 'days' | 'week' | 'flames';
const QUESTION_STEPS = 3;

export default function ScheduleTutorialFlow({ onDone }: { onDone: (r: { startWorkout: boolean }) => void }) {
  useSuppressBottomNav();
  const t = useT(schedule);
  const tc = useT(common);
  const locale = useLocaleStore((s) => s.locale);
  const profile = useUserStore((s) => s.profile);
  const { todayActivity, stepsToday } = useDailyActivity();
  const inputs = useTutorialInputs();

  const [step, setStep] = useState<Step>('persona');
  const [days, setDays] = useState(inputs.initial);
  const [editingDow, setEditingDow] = useState<number | null>(null);
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
      stepsGoal: todayActivity?.stepsGoal ?? DAILY_STEP_GOAL, order: inputs.order,
    }),
    [inputs, days, minutes, twoPerDay, longRunDay, todayActivity?.stepsGoal],
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
      await saveTutorialWeek(uid, week.strengthWeek, profile as Parameters<typeof saveTutorialWeek>[2]);
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
      <div className="min-h-0 flex-1 overflow-y-auto overscroll-none">
        {step === 'persona' && <SchedPersonaStep step={1} total={QUESTION_STEPS} onNext={() => setStep('days')} />}
        {step === 'days' && (
          <SchedDaysStep
            step={2}
            total={QUESTION_STEPS}
            order={inputs.order}
            dates={inputs.dates}
            days={days}
            editingDow={editingDow}
            minutes={minutes}
            note={note}
            running={inputs.running ? {
              twoPerDay,
              onTwoPerDay: setTwoPerDay,
              longRunLabel: longRunDay === lastFreeDay(days) ? t('tutorial.days.longRunLast', { day: longShort }) : longShort,
              longRunAria: t('tutorial.days.longRunAria', { day: longShort }),
              onCycleLongRun: () => setLongRunPick(nextFreeDay(days, longRunDay)),
            } : null}
            onToggleDay={(dow) => { setEditingDow(null); setDays((s) => toggleDay(s, dow, inputs.defaultWindow)); }}
            onWindow={(dow, w) => {
              const r = tapWindow(days, dow, w);
              setDays(r.state);
              setEditingDow(r.editTime ? dow : null);
            }}
            onTime={(dow, time) => setDays((s) => setDayTime(s, dow, time))}
            onTimeDone={() => setEditingDow(null)}
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
            onTrainNow={() => void confirm(true)}
            onChange={() => setStep('days')}
          />
        )}
        {step === 'flames' && <ExplainFlamesStep onDone={() => onDone({ startWorkout })} />}
      </div>
    </div>
  );
}
