/**
 * i18n wave 2 batch 1 (namespace `profile`, keys `hub.*`): the progress tab v2
 * (enable_home_v2) — ProgressScreenV2 and every live card / tab in
 * src/features/progression-hub/v2/components. The snapshots below were recorded
 * from the components BEFORE the extraction (origin/main @ 1959587e); the
 * extracted components must render byte-identical markup in Hebrew.
 *
 * - `<!-- -->` is stripped before comparing (react-dom/server's separator between
 *   adjacent text nodes — not rendered text). The BEFORE snapshots were recorded
 *   already stripped.
 * - Stores that pull in Firebase (useUserStore, useActivityStore) are replaced by
 *   selector-hook fakes; the locale store is real and its INITIAL state is written
 *   (renderToStaticMarkup reads getInitialState()).
 * - Data hooks, next/dynamic, the Sheet portal and WidgetBoundary are stubbed so
 *   every state renders statically (the Sheet renders its children inline; the
 *   boundary can be switched to its fallback).
 * - Text only reachable by a tap ("הצג פחות") is pinned by src/lib/i18n/__tests__/profile-he.test.ts.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { ReactElement, ReactNode } from 'react';

// ── module stubs ─────────────────────────────────────────────────────────────
vi.mock('@/lib/firebase', () => ({ db: {}, auth: { currentUser: null }, app: {} }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: () => {}, replace: () => {}, back: () => {} }) }));
vi.mock('next/dynamic', () => ({
  default: () =>
    function DynamicStub() {
      return <div data-dynamic-stub="" />;
    },
}));

const userState: { profile: Record<string, unknown> | null } = { profile: null };
vi.mock('@/features/user/identity/store/useUserStore', () => ({
  useUserStore: (sel: (s: typeof userState) => unknown) => sel(userState),
}));
const activityState = { currentStreak: 0, longestStreak: 0 };
vi.mock('@/features/activity/store/useActivityStore', () => ({
  useActivityStore: (sel: (s: typeof activityState) => unknown) => sel(activityState),
}));

const data: {
  period: { data: unknown; loading: boolean; error: unknown };
  ofType: Record<string, { data: unknown; loading: boolean }>;
  days: { data: unknown; loading: boolean };
  exercises: { data: unknown; loading: boolean };
} = {
  period: { data: null, loading: false, error: null },
  ofType: {},
  days: { data: null, loading: false },
  exercises: { data: null, loading: false },
};
vi.mock('../../hooks/useProgressData', async () => {
  const { periodRanges } = await import('../../utils/progress-period');
  return {
    usePeriodData: (period: 'week' | 'month') => ({ ...data.period, ranges: periodRanges(period, new Date()), now: new Date() }),
    useRecentOfType: (type: string) => data.ofType[type] ?? { data: null, loading: false },
    useRecentDays: () => data.days,
    useRecentExercises: () => data.exercises,
  };
});

const records: { tiles: unknown[] } = { tiles: [] };
vi.mock('@/features/profile/hooks/useProfileRecords', () => ({ useProfileRecords: () => ({ tiles: records.tiles, loading: false }) }));
vi.mock('@/components/ui/AppHeader', () => ({ default: () => <header data-app-header="" /> }));
vi.mock('@/components/ui/v2/StreakFlame', () => ({
  default: ({ tones }: { tones: string[] }) => <i data-flame={tones.join('-')} />,
}));
vi.mock('@/components/ui/v2/Sheet', async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  default: ({ open, title, children }: { open: boolean; title: string; children: ReactNode }) =>
    open ? <section data-sheet={title}>{children}</section> : null,
}));
const boundary = { fail: false };
vi.mock('@/components/system/WidgetBoundary', () => ({
  default: ({ children, fallback }: { children: ReactNode; fallback?: (retry: () => void) => ReactNode }) =>
    boundary.fail ? (fallback ? fallback(() => {}) : null) : children,
}));
vi.mock('@/features/home/components/SmartWeeklySchedule', () => ({ default: () => <div data-week-strip="" /> }));
vi.mock('@/features/home/hooks/useWeekStripProps', () => ({ useWeekStripProps: () => ({ props: {} }) }));
vi.mock('@/features/progression-map/hooks/useProgressHubBuckets', () => ({
  useProgressHubBuckets: () => ({ ready: true, buckets: { discover: [] } }),
}));
vi.mock('../../../components/DiscoverMoreSection', () => ({ DiscoverMoreSection: () => <div data-discover="" /> }));

// ── components under test ────────────────────────────────────────────────────
import ProgressScreenV2 from '../ProgressScreenV2';
import ActivityTabs from '../ActivityTabs';
import ActivityDaysCard from '../ActivityDaysCard';
import ConsistencyCard from '../ConsistencyCard';
import NewRecordHighlight from '../NewRecordHighlight';
import PeriodCompareSheet from '../PeriodCompareSheet';
import PeriodSummaryRingCard from '../PeriodSummaryRingCard';
import ProgramsBlock from '../ProgramsBlock';
import ProgressWeekStrip from '../ProgressWeekStrip';
import RunningPlanCard from '../RunningPlanCard';
import RunTab from '../tabs/RunTab';
import WalkTab from '../tabs/WalkTab';
import StepsTab from '../tabs/StepsTab';
import StrengthTab from '../tabs/StrengthTab';
import { useLocaleStore } from '@/store/useLocaleStore';
import { longestActiveRun, monthCells, periodRanges, summarizePeriod } from '../../utils/progress-period';
import { periodSpark } from '../../utils/period-spark';
import { consistencyDays } from '../../utils/consistency-days';
import { runningPlanProgress } from '../../utils/running-plan-progress';
import type { ProgressDay, ProgressWorkout } from '../../utils/progress-model';

const NOW = new Date(2026, 9, 21, 12);
const html = (el: ReactElement) => renderToStaticMarkup(el).replaceAll('<!-- -->', '');
const snap = (name: string) => `./__snapshots__/progress-hub-i18n/${name}.html`;

let seq = 0;
const w = (over: Partial<ProgressWorkout> & { date: Date }): ProgressWorkout => ({
  id: `w${++seq}`, kind: 'strength', type: 'strength', minutes: 30, km: 0, pace: 0, sets: 10, domainSets: {}, ...over,
});
const day = (d: Date, steps: number, over: Partial<ProgressDay> = {}): ProgressDay => ({
  date: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`,
  steps, stepsGoal: 8000, distanceMeters: steps * 0.7, activeMinutes: 0, ...over,
});
const at = (dd: number, h = 9) => new Date(2026, 9, dd, h);

function workouts(): ProgressWorkout[] {
  seq = 0;
  return [
    w({ date: at(21, 8), minutes: 25, sets: 14, domainSets: { push: 8, legs: 6 } }),
    w({ date: at(20), kind: 'run', type: 'running', minutes: 62, km: 11.4, pace: 5.45, sets: 0, title: 'ריצת בוקר' }),
    w({ date: at(19), minutes: 96, sets: 22, domainSets: { pull: 12 } }),
    w({ date: at(18), kind: 'walk', type: 'walking', minutes: 45, km: 4.2, pace: 10.7, sets: 0 }),
    w({ date: at(14), kind: 'run', type: 'running', minutes: 33, km: 6, pace: 5.5, sets: 0 }),
    w({ date: at(12), minutes: 70, sets: 18 }),
    w({ date: at(13), kind: 'run', type: 'running', minutes: 66, km: 12, pace: 5.5, sets: 0 }),
    w({ date: at(2), kind: 'walk', type: 'walking', minutes: 30, km: 3, pace: 10, sets: 0, title: 'הליכה בפארק' }),
    w({ date: new Date(2026, 8, 24, 9), kind: 'run', type: 'running', minutes: 40, km: 7, pace: 5.7, sets: 0 }),
  ];
}
function stepDays(): ProgressDay[] {
  const out: ProgressDay[] = [];
  for (let i = 40; i >= 0; i--) {
    const d = new Date(2026, 9, 21 - i);
    out.push(day(d, i === 0 ? 4321 : 3000 + ((i * 1237) % 9000), { activeMinutes: i % 4 === 0 ? 25 : 0 }));
  }
  return out;
}

const LOCALE_DEFAULTS = { ...useLocaleStore.getInitialState() };
beforeAll(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  vi.spyOn(Math, 'random').mockReturnValue(0.5);
});
afterAll(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});
beforeEach(() => {
  Object.assign(useLocaleStore.getInitialState(), LOCALE_DEFAULTS, { gender: 'other' });
  userState.profile = { id: 'u1', progression: { currentStreak: 0, longestStreak: 0 } };
  activityState.currentStreak = 0;
  activityState.longestStreak = 0;
  data.period = { data: null, loading: false, error: null };
  data.ofType = {};
  data.days = { data: null, loading: false };
  data.exercises = { data: null, loading: false };
  records.tiles = [];
  boundary.fail = false;
});

function period(p: 'week' | 'month', ws = workouts(), ds = stepDays()) {
  const ranges = periodRanges(p, NOW);
  return {
    ranges,
    current: summarizePeriod(ws, ds, ranges.current),
    previous: summarizePeriod(ws, ds, ranges.previous),
    spark: periodSpark(p, ranges.current, ws, ds, NOW),
  };
}

const PLAN_RUNNING = {
  activeProgram: {
    currentWeek: 3,
    startDate: new Date(2026, 9, 1),
    schedule: [1, 1, 1, 2, 2, 2, 3, 3, 3, 4, 4, 4].map((wk, i) => ({ week: wk, status: i < 7 ? 'completed' : 'pending' })),
  },
  generatedProgramTemplate: { targetDistance: '5k', canonicalWeeks: 8 },
  paceProfile: { basePace: 330 },
};

describe('ProgressScreenV2 — Hebrew markup unchanged by the i18n extraction', () => {
  it('loading', async () => {
    data.period = { data: null, loading: true, error: null };
    await expect(html(<ProgressScreenV2 />)).toMatchFileSnapshot(snap('screen-loading'));
  });
  it('error', async () => {
    data.period = { data: null, loading: false, error: new Error('x') };
    await expect(html(<ProgressScreenV2 />)).toMatchFileSnapshot(snap('screen-error'));
  });
  for (const gender of ['other', 'female'] as const) {
    it(`week with data · ${gender}`, async () => {
      Object.assign(useLocaleStore.getInitialState(), { gender });
      userState.profile = { id: 'u1', progression: { currentStreak: 3, longestStreak: 9 }, running: PLAN_RUNNING };
      data.period = { data: { workouts: workouts(), days: stepDays() }, loading: false, error: null };
      records.tiles = [{ key: 'r', icon: 'trophy', value: '12', unit: 'חזרות', label: 'מתח', at: at(20).getTime(), isNew: true }];
      await expect(html(<ProgressScreenV2 />)).toMatchFileSnapshot(snap(`screen-week-${gender}`));
    });
  }
});

describe('summary + comparison', () => {
  for (const p of ['week', 'month'] as const) {
    it(`PeriodSummaryRingCard ${p} · plain`, async () => {
      await expect(html(<PeriodSummaryRingCard period={p} {...period(p)} />)).toMatchFileSnapshot(snap(`summary-${p}-plain`));
    });
    it(`PeriodSummaryRingCard ${p} · compare taps`, async () => {
      await expect(html(<PeriodSummaryRingCard period={p} {...period(p)} onOpenCompare={() => {}} onSelectKind={() => {}} />)).toMatchFileSnapshot(
        snap(`summary-${p}-compare`),
      );
    });
    it(`PeriodCompareSheet ${p}`, async () => {
      const { ranges, current, previous } = period(p);
      await expect(
        html(<PeriodCompareSheet open onClose={() => {}} period={p} ranges={ranges} current={current} previous={previous} now={NOW} />),
      ).toMatchFileSnapshot(snap(`compare-${p}`));
    });
    it(`PeriodCompareSheet ${p} · nothing to compare`, async () => {
      const { ranges, current, previous } = period(p, [], []);
      await expect(
        html(<PeriodCompareSheet open onClose={() => {}} period={p} ranges={ranges} current={current} previous={previous} now={NOW} />),
      ).toMatchFileSnapshot(snap(`compare-${p}-empty`));
    });
  }
});

describe('days, consistency, records, week strip', () => {
  it('ActivityDaysCard · best run', async () => {
    const m = monthCells(workouts(), stepDays(), NOW);
    await expect(html(<ActivityDaysCard cells={m.cells} lead={m.lead} bestRun={Math.max(2, longestActiveRun(m.cells))} />)).toMatchFileSnapshot(
      snap('days-best'),
    );
  });
  it('ActivityDaysCard · no run', async () => {
    const m = monthCells([], [], NOW);
    await expect(html(<ActivityDaysCard cells={m.cells} lead={m.lead} bestRun={1} />)).toMatchFileSnapshot(snap('days-none'));
  });
  it('ConsistencyCard · streak, best, more than 7 days', async () => {
    const days = consistencyDays(workouts(), stepDays(), new Date(2026, 9, 1), NOW);
    await expect(html(<ConsistencyCard days={days} currentStreak={4} longestStreak={12} />)).toMatchFileSnapshot(snap('consistency-full'));
  });
  it('ConsistencyCard · no streak, today not counted', async () => {
    const days = consistencyDays([w({ date: at(19), minutes: 40 })], [], new Date(2026, 9, 15), NOW);
    await expect(html(<ConsistencyCard days={days} currentStreak={0} longestStreak={1} />)).toMatchFileSnapshot(snap('consistency-empty'));
  });
  it('NewRecordHighlight · unit, date, more', async () => {
    records.tiles = [
      { key: 'a', icon: 'trophy', value: '12', unit: 'חזרות', label: 'מתח', at: at(20).getTime(), isNew: true },
      { key: 'b', icon: 'trophy', value: '5:12', label: 'קצב', at: at(18).getTime(), isNew: true },
      { key: 'c', icon: 'trophy', value: '9', label: 'רצף', at: null, isNew: true },
    ];
    await expect(html(<NewRecordHighlight />)).toMatchFileSnapshot(snap('record-more'));
  });
  it('NewRecordHighlight · bare value', async () => {
    records.tiles = [{ key: 'c', icon: 'trophy', value: '9', label: 'רצף', at: null, isNew: true }];
    await expect(html(<NewRecordHighlight />)).toMatchFileSnapshot(snap('record-bare'));
  });
  it('ProgressWeekStrip · streak / none', async () => {
    await expect(html(<ProgressWeekStrip activeDays={4} currentStreak={3} />)).toMatchFileSnapshot(snap('weekstrip-streak'));
    await expect(html(<ProgressWeekStrip activeDays={0} currentStreak={0} />)).toMatchFileSnapshot(snap('weekstrip-none'));
  });
});

describe('programs', () => {
  it('ProgramsBlock · with a running plan', async () => {
    userState.profile = { id: 'u1', running: PLAN_RUNNING };
    await expect(html(<ProgramsBlock />)).toMatchFileSnapshot(snap('programs-plan'));
  });
  it('ProgramsBlock · no plan', async () => {
    await expect(html(<ProgramsBlock />)).toMatchFileSnapshot(snap('programs-none'));
  });
  it('RunningPlanCard', async () => {
    const plan = runningPlanProgress(PLAN_RUNNING)!;
    await expect(html(<RunningPlanCard plan={plan} />)).toMatchFileSnapshot(snap('running-plan-card'));
  });
});

describe('activity tabs', () => {
  for (const value of ['run', 'walk', 'steps', 'strength'] as const) {
    it(`ActivityTabs · ${value}`, async () => {
      await expect(html(<ActivityTabs value={value} onChange={() => {}} />)).toMatchFileSnapshot(snap(`tabs-${value}`));
    });
  }
  it('ActivityTabs · failed tab', async () => {
    boundary.fail = true;
    await expect(html(<ActivityTabs value="run" onChange={() => {}} />)).toMatchFileSnapshot(snap('tabs-error'));
  });

  it('RunTab · loading / empty / data', async () => {
    data.ofType.running = { data: null, loading: true };
    await expect(html(<RunTab />)).toMatchFileSnapshot(snap('run-loading'));
    data.ofType.running = { data: [], loading: false };
    await expect(html(<RunTab />)).toMatchFileSnapshot(snap('run-empty'));
    userState.profile = { id: 'u1', running: PLAN_RUNNING };
    data.ofType.running = { data: workouts().filter((x) => x.kind === 'run').reverse(), loading: false };
    await expect(html(<RunTab />)).toMatchFileSnapshot(snap('run-data'));
  });

  it('WalkTab · empty / data', async () => {
    data.ofType.walking = { data: [], loading: false };
    await expect(html(<WalkTab />)).toMatchFileSnapshot(snap('walk-empty'));
    data.ofType.walking = { data: workouts().filter((x) => x.kind === 'walk').reverse(), loading: false };
    await expect(html(<WalkTab />)).toMatchFileSnapshot(snap('walk-data'));
  });

  it('StepsTab · empty / full / minimal', async () => {
    data.days = { data: [], loading: false };
    await expect(html(<StepsTab />)).toMatchFileSnapshot(snap('steps-empty'));
    data.days = { data: stepDays().slice(-30), loading: false };
    await expect(html(<StepsTab />)).toMatchFileSnapshot(snap('steps-full'));
    data.days = { data: [day(NOW, 0, { distanceMeters: 0 })], loading: false };
    await expect(html(<StepsTab />)).toMatchFileSnapshot(snap('steps-minimal'));
  });

  it('StrengthTab · empty / data', async () => {
    data.ofType.strength = { data: [], loading: false };
    await expect(html(<StrengthTab />)).toMatchFileSnapshot(snap('strength-empty'));
    data.ofType.strength = { data: workouts().filter((x) => x.kind === 'strength').reverse(), loading: false };
    data.exercises = {
      data: [
        { exerciseId: 'pull-up', name: 'מתח', lastBest: 12, updatedAt: at(20) },
        { exerciseId: 'dips', name: 'מקבילים', lastBest: 0, updatedAt: null },
      ],
      loading: false,
    };
    await expect(html(<StrengthTab />)).toMatchFileSnapshot(snap('strength-data'));
  });
});
