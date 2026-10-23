/**
 * i18n wave 2 (namespace `player`): the shared strength cards and the summary blocks that were not
 * covered yet — SwapIcon, StrengthExerciseCard, WeeklyAchievementsGrid, GainBreakdownCard,
 * SummaryStatsRow, ExerciseBreakdownCard (+ ExerciseCategory / ExerciseRow), PersonalRecords.
 * The snapshots below were recorded BEFORE the extraction from unmodified origin/main — every badge,
 * the range / per-side / ramped-target text, goals present and absent, bonus and "N more", known and
 * unknown categories, performed and not performed, male / female / other gender.
 *
 * Static markup (react-dom/server, node env). `<!-- -->` is stripped before comparing (react-dom/server's
 * separator between adjacent text nodes — `יעדים שהושגו ({a}/{b})` is several nodes before, one `t()`
 * string after; not rendered text). Framer-motion's initial inline style is part of the markup.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { ReactElement } from 'react';

vi.mock('@/lib/firebase', () => ({ db: {}, auth: { currentUser: null }, app: {} }));

import SwapIcon from '../SwapIcon';
import StrengthExerciseCard from '../cards/StrengthExerciseCard';
import WeeklyAchievementsGrid from '../strength/components/WeeklyAchievementsGrid';
import GainBreakdownCard from '../strength/components/GainBreakdownCard';
import SummaryStatsRow from '../strength/components/SummaryStatsRow';
import ExerciseBreakdownCard from '../strength/components/ExerciseBreakdownCard';
import PersonalRecords from '../strength/components/summary-atoms/PersonalRecords';
import { useLocaleStore } from '@/store/useLocaleStore';
import type { CompletedExercise } from '../strength/utils/summary.utils';

const html = (el: ReactElement) => renderToStaticMarkup(el).replaceAll('<!-- -->', '');
const snap = (name: string) => `./__snapshots__/strength-cards-i18n/${name}.html`;

beforeEach(() => {
  Object.assign(useLocaleStore.getInitialState(), { gender: 'other' });
});

const ex = (id: string, category: CompletedExercise['category'], over: Partial<CompletedExercise> = {}): CompletedExercise => ({
  id,
  name: `תרגיל ${id}`,
  category,
  sets: [10, 10, 8],
  totalReps: 28,
  ...over,
});

describe('SwapIcon', () => {
  it('button label', async () => {
    await expect([html(<SwapIcon />), html(<SwapIcon isSwapped size={30} />)].join('\n\n')).toMatchFileSnapshot(snap('swap-icon'));
  });
});

describe('StrengthExerciseCard', () => {
  it('every badge / range / suffix shape', async () => {
    const cases: ReactElement[] = [
      <StrengthExerciseCard key="a" title="מתח" repsOrDuration="15 חזרות" />,
      <StrengthExerciseCard key="b" title="מתח" isTargetGoal matchesGoal matchesUserEquipment repsRange={{ min: 6, max: 12 }} />,
      <StrengthExerciseCard key="c" title="מתח" matchesGoal repsRange={{ min: 6, max: 12 }} symmetry="unilateral" />,
      <StrengthExerciseCard key="d" title="מתח" matchesUserEquipment repsRange={{ min: 20, max: 40 }} isTimeBased rampedTarget={30} />,
      <StrengthExerciseCard key="e" title="מתח" repsRange={{ min: 8, max: 8 }} repsOrDuration="8 חזרות" />,
      <StrengthExerciseCard key="f" title="מתח" repsRange={{ min: 6, max: 12 }} rampedTarget={10} symmetry="unilateral" isTimeBased />,
      <StrengthExerciseCard key="g" title="מתח" onSwap={() => {}} isSwapped isInSuperset imageUrl="https://x/y.jpg" />,
      <StrengthExerciseCard key="h" title="מתח" onSwap={() => {}} imageUrl={null} />,
    ];
    await expect(cases.map(html).join('\n\n')).toMatchFileSnapshot(snap('exercise-card'));
  });
});

describe('WeeklyAchievementsGrid', () => {
  it('labels and rounding', async () => {
    const a = html(<WeeklyAchievementsGrid coins={120} weeklyStrengthSessions={2} weeklyGoalSessions={3} daysWithActivity={4} weeklyMinutes={87.6} />);
    const b = html(<WeeklyAchievementsGrid coins={0} weeklyStrengthSessions={0} weeklyGoalSessions={3} daysWithActivity={0} weeklyMinutes={0} xpStatusSlot={<i>slot</i>} />);
    await expect([a, b].join('\n\n')).toMatchFileSnapshot(snap('weekly-achievements'));
  });
});

describe('GainBreakdownCard', () => {
  const result = (goals: boolean[], completion = 83.33, total = 4.26) =>
    ({
      success: true,
      sessionCompletionPercent: completion,
      goalProgress: goals.map((achieved) => ({ achieved })),
      activeProgramGain: { totalGain: total },
    }) as never;
  it('null / failure render nothing', () => {
    expect(html(<GainBreakdownCard progressionResult={null} weeklyStrengthSessions={1} weeklyGoalSessions={3} />)).toBe('');
    expect(html(<GainBreakdownCard progressionResult={{ success: false } as never} weeklyStrengthSessions={1} weeklyGoalSessions={3} />)).toBe('');
  });
  it('goals present / absent, bonus / N more', async () => {
    const out = [
      html(<GainBreakdownCard progressionResult={result([true, false, true])} weeklyStrengthSessions={1} weeklyGoalSessions={3} />),
      html(<GainBreakdownCard progressionResult={result([])} weeklyStrengthSessions={3} weeklyGoalSessions={3} />),
      html(<GainBreakdownCard progressionResult={result([true])} weeklyStrengthSessions={5} weeklyGoalSessions={3} />),
      html(<GainBreakdownCard progressionResult={result([false, false], 100, 0)} weeklyStrengthSessions={0} weeklyGoalSessions={3} />),
    ];
    await expect(out.join('\n\n')).toMatchFileSnapshot(snap('gain-breakdown'));
  });
});

describe('SummaryStatsRow', () => {
  it('chain not ready / ready', async () => {
    const base = { calories: 213, formattedDuration: '12:34', streak: 4, streakFlameType: 'micro' as never };
    const out = [html(<SummaryStatsRow {...base} streakChainReady={false} />), html(<SummaryStatsRow {...base} streakChainReady />)];
    await expect(out.join('\n\n')).toMatchFileSnapshot(snap('summary-stats-row'));
  });
});

describe('ExerciseBreakdownCard + ExerciseRow', () => {
  it('known / unknown categories, performed / not performed, empty', async () => {
    const exercises = [
      ex('a', 'warmup'),
      ex('b', 'main', { sets: [], totalReps: 0 }),
      ex('c', 'superset', { sets: [10, 10], totalReps: 25 }),
      ex('d', 'stretch', { sets: [0, 0], totalReps: 0 }),
      ex('e', 'weird' as never, { sets: [5], totalReps: 5 }),
    ];
    const grouped: Record<string, CompletedExercise[]> = {};
    for (const e of exercises) (grouped[e.category] ??= []).push(e);
    const out = [
      html(<ExerciseBreakdownCard groupedExercises={grouped} completedExercises={exercises} />),
      html(<ExerciseBreakdownCard groupedExercises={{}} completedExercises={[]} />),
    ];
    await expect(out.join('\n\n')).toMatchFileSnapshot(snap('exercise-breakdown'));
  });
});

describe('PersonalRecords', () => {
  it('none render nothing; records list', async () => {
    expect(html(<PersonalRecords exercises={[ex('a', 'main')]} />)).toBe('');
    await expect(html(<PersonalRecords exercises={[ex('a', 'main', { isPersonalRecord: true }), ex('b', 'main'), ex('c', 'warmup', { isPersonalRecord: true, totalReps: 40 })]} />)).toMatchFileSnapshot(snap('personal-records'));
  });
});

describe('gender does not change this copy', () => {
  it('female render equals other render', () => {
    const el = <PersonalRecords exercises={[ex('a', 'main', { isPersonalRecord: true })]} />;
    const other = html(el);
    Object.assign(useLocaleStore.getInitialState(), { gender: 'female' });
    expect(html(el)).toBe(other);
  });
});
