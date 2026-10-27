/**
 * Schedule tutorial v1: static-markup render of ל3, ל4 and ל5 (Hebrew, male / female / other), and the
 * shared day cards. Checks the board copy is there, logical classes only, and no long dash.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { ReactElement } from 'react';

vi.mock('@/lib/firebase', () => ({ db: {}, auth: {}, app: {} }));
// The shared sticky CTA (not this feature's markup) is a plain button here.
vi.mock('@/components/ui/StickyActionButton', () => ({
  default: ({ label, disabled }: { label: string; disabled?: boolean }) => <button type="button" disabled={disabled}>{label}</button>,
}));
vi.mock('@/hooks/useFeatureFlags', () => ({ useFeatureFlags: () => ({ flags: {}, loading: false }) }));

import { useLocaleStore } from '@/store/useLocaleStore';
import { DayCardsRow, OptionalSessionCard, StepsDayCard, WorkoutDayCard } from '@/features/schedule/day-cards';
import SchedDaysStep from '../components/SchedDaysStep';
import WeekPlanStep from '../components/WeekPlanStep';
import ExplainFlamesStep from '../components/ExplainFlamesStep';
import { initialDays, setDayTime } from '../model/days';
import { buildTutorialWeek } from '../model/tutorialWeek';
import { runSlotsFor } from '../model/profileInputs';

const html = (el: ReactElement) => renderToStaticMarkup(el).replaceAll('<!-- -->', '');
const PHYSICAL = /\b(ml|mr|pl|pr)-\d|\b(left|right)-\d|\btext-(left|right)\b|dir="rtl"/;
const noop = () => {};
const order = [0, 1, 2, 3, 4, 5, 6];
const dates = [25, 26, 27, 28, 29, 30, 31];

const week = (running = false) => buildTutorialWeek({
  seed: { programs: ['FULL_BODY'], skills: [] },
  levels: { push: 3, pull: 3, legs: 3 },
  engineLevel: 'beginner',
  days: initialDays([0, 1, 2, 3, 4], 'morning'),
  minutes: 30,
  running: running ? { slots: runSlotsFor(3), level: 'intermediate' } : null,
  twoPerDay: true,
  longRunDay: 4,
  stepsGoal: 8000,
  order,
});

beforeEach(() => { Object.assign(useLocaleStore.getInitialState(), { gender: 'male', locale: 'he' }); });

describe('day cards', () => {
  it('workout, steps (ring, check when full) and optional cards in a row', () => {
    const out = html(
      <DayCardsRow label="x">
        <WorkoutDayCard card={{ tone: 'strength', title: 'כל הגוף · דחיפה', subtitle: '30 דק׳', time: '07:00', timeTone: 'morning' }} />
        <StepsDayCard card={{ goalLabel: '8,000 צעדים', subtitle: '2,400 עד עכשיו', pct: 30 }} />
        <StepsDayCard card={{ goalLabel: '8,000 צעדים', pct: 100 }} />
        <OptionalSessionCard card={{ title: 'בטן טבטה 8′', subtitle: 'רשות' }} />
      </DayCardsRow>,
    );
    expect(out).toContain('כל הגוף · דחיפה');
    expect(out).toContain('dir="ltr"');
    expect(out).toContain('2,400 עד עכשיו');
    expect(out).toContain('lucide-check');
    expect(out).not.toMatch(PHYSICAL);
  });
});

describe('screens', () => {
  it.each(['male', 'female', 'other'] as const)('ל3 days, %s', (gender) => {
    Object.assign(useLocaleStore.getInitialState(), { gender });
    const days = setDayTime(initialDays([0, 1, 2, 3, 4], 'morning'), 0, '07:30');
    const out = html(
      <SchedDaysStep
        step={2} total={3} order={order} dates={dates} days={days} editingDow={null} minutes={30} note="note"
        running={{ twoPerDay: true, onTwoPerDay: noop, longRunLabel: 'ה׳ · היום הפנוי האחרון', longRunAria: 'a', onCycleLongRun: noop }}
        onToggleDay={noop} onWindow={noop} onTime={noop} onTimeDone={noop} onMinutes={noop} onBack={noop} onNext={noop}
      />,
    );
    for (const s of ['באילו ימים?', 'כמה זמן לאימון?', '5 מתוך 7', '30 דק׳', 'לא פנוי', '07:30', 'שני אימונים באותו יום, בסדר', 'יום הריצה הארוכה']) {
      expect(out).toContain(s);
    }
    expect(out).not.toContain('—');
    expect(out).not.toMatch(PHYSICAL);
  });

  it('ל4 simple week: hero, ring legend, rows, confirm', () => {
    const out = html(<WeekPlanStep week={week()} dates={dates} todayDow={0} stepsToday={2400} saving={false} error={false} onConfirm={noop} onTrainNow={noop} onChange={noop} />);
    for (const s of ['השבוע שלך מוכן!', 'שבוע 1', 'כוח 90', 'הליכה', '3 אימוני כוח, 2 ימי תנועה ויעד צעדים בכל יום.', 'אישור השבוע', 'לשנות', 'כל הגוף · דחיפה', '2,400 עד עכשיו', '×3', 'יום תנועה']) {
      expect(out).toContain(s);
    }
    expect(out).not.toContain('—');
    expect(out).not.toMatch(PHYSICAL);
  });

  it('ל4ב with runs: run cards and the run chip', () => {
    const out = html(<WeekPlanStep week={week(true)} dates={dates} todayDow={0} stepsToday={0} saving={false} error={false} onConfirm={noop} onTrainNow={noop} onChange={noop} />);
    expect(out).toContain('ריצה');
    expect(out).toContain('/icons/programs/Run.svg');
    expect(out).not.toMatch(PHYSICAL);
  });

  it('ל5 flames', () => {
    const out = html(<ExplainFlamesStep onDone={noop} />);
    for (const s of ['איך סופרים התמדה', 'כל יום פעיל מדליק להבה', 'א׳', 'ש׳', '<b>מגן</b>', 'יאללה, להדליק את הראשונה']) expect(out).toContain(s);
  });
});
