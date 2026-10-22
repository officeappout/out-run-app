/**
 * i18n wave 2 (namespace `summary`, batch af): the legacy summary fallback
 * (SummaryOrchestrator and its blocks SummaryHeader / SummaryStatsGrid /
 * LapTableBlock / RunMapBlock) moves its copy to src/messages/he/summary.json.
 * These snapshots were recorded from the components BEFORE the extraction; the
 * extracted components must render the same Hebrew markup in every state.
 *
 * Static markup (react-dom/server), node environment. RunMapBlock mounts its
 * map only after an effect, so the static render covers its loading state
 * (the in-map overlay shares the same key — pinned by the key test).
 * `<!-- -->` is stripped before comparing (react-dom/server's separator between
 * adjacent text nodes; not rendered text).
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { ReactElement } from 'react';

vi.mock('@/lib/firebase', () => ({ db: {}, auth: {}, app: {} }));

import { useLocaleStore } from '@/store/useLocaleStore';
import type { Lap } from '@/features/workout-engine/core/types/session.types';
import SummaryHeader from '../shared/SummaryHeader';
import SummaryStatsGrid from '../shared/SummaryStatsGrid';
import LapTableBlock from '../running/LapTableBlock';
import RunMapBlock from '../running/RunMapBlock';
import SummaryOrchestrator, { type WorkoutData, type WorkoutType } from '../SummaryOrchestrator';

const NOW = new Date('2026-10-22T12:00:00');
const html = (el: ReactElement) => renderToStaticMarkup(el).replaceAll('<!-- -->', '');
const snap = (name: string) => `./__snapshots__/summary-fallbacks-i18n/${name}.html`;
const LOCALE_DEFAULTS = { ...useLocaleStore.getInitialState() };

beforeAll(() => { vi.useFakeTimers(); vi.setSystemTime(NOW); vi.spyOn(Math, 'random').mockReturnValue(0.5); });
afterAll(() => { vi.useRealTimers(); vi.restoreAllMocks(); });
beforeEach(() => { Object.assign(useLocaleStore.getInitialState(), LOCALE_DEFAULTS); });

const DATE = new Date('2026-10-20T08:00:00');
const laps: Lap[] = [
  { id: 'l1', lapNumber: 1, distanceMeters: 1000, durationSeconds: 330, splitPace: 5.5, isActive: false },
  { id: 'l2', lapNumber: 2, distanceMeters: 600, durationSeconds: 3725, splitPace: 0, isActive: true },
  { id: 'l3', lapNumber: 3, distanceMeters: 0, durationSeconds: 5, splitPace: 5.25, isActive: true },
];

describe('SummaryHeader', () => {
  it('default title', async () => {
    await expect(html(<SummaryHeader date={DATE} />)).toMatchFileSnapshot(snap('header-default'));
  });
  it('custom title + message', async () => {
    await expect(html(<SummaryHeader date={DATE} title="ריצה בבוקר" motivationalMessage="יפה מאוד" />))
      .toMatchFileSnapshot(snap('header-custom'));
  });
});

describe('SummaryStatsGrid', () => {
  const cases: Array<[string, Parameters<typeof SummaryStatsGrid>[0]]> = [
    ['basic', { time: 1750, distance: 5.123, calories: 301.9 }],
    ['pace', { time: 3725, distance: 10, calories: 640, pace: 5.5 }],
    ['elevation', { time: 600, distance: 1.5, calories: 90, elevationGain: 42.6 }],
    ['all', { time: 3725, distance: 21.1, calories: 1234.4, pace: 5.25, elevationGain: 1234 }],
  ];
  for (const [name, props] of cases) {
    it(name, async () => {
      await expect(html(<SummaryStatsGrid {...props} />)).toMatchFileSnapshot(snap(`stats-${name}`));
    });
  }
});

describe('LapTableBlock + RunMapBlock', () => {
  it('LapTableBlock', async () => {
    await expect(html(<LapTableBlock laps={laps} />)).toMatchFileSnapshot(snap('lap-table'));
  });
  it('LapTableBlock empty', () => {
    expect(html(<LapTableBlock laps={[]} />)).toBe('');
  });
  it('RunMapBlock loading', async () => {
    await expect(html(<RunMapBlock routeCoords={[[34.78, 32.08], [34.79, 32.09]]} />))
      .toMatchFileSnapshot(snap('run-map-loading'));
  });
});

describe('SummaryOrchestrator', () => {
  const data = (over: Partial<WorkoutData> = {}): WorkoutData => ({
    time: 1750, distance: 5.123, calories: 301.9, pace: 5.5, elevationGain: 40,
    routeCoords: [], laps, date: DATE, ...over,
  });
  const cases: Array<[string, WorkoutType, WorkoutData, number]> = [
    ['free-no-route', 'FREE_RUN', data(), 0],
    ['free-route-streak', 'FREE_RUN', data({ routeCoords: [[34.78, 32.08], [34.79, 32.09]], title: 'ריצה חופשית' }), 1234],
    ['plan-no-route', 'PLAN_RUN', data({ laps: [] }), 3],
    ['guided-no-route', 'GUIDED_RUN', data({ motivationalMessage: 'כל הכבוד' }), 0],
    ['strength', 'STRENGTH', data(), 2],
    ['hybrid', 'HYBRID', data(), 0],
  ];
  for (const [name, type, workoutData, streakDays] of cases) {
    it(name, async () => {
      await expect(html(<SummaryOrchestrator workoutData={workoutData} workoutType={type} streakDays={streakDays} />))
        .toMatchFileSnapshot(snap(`orchestrator-${name}`));
    });
  }
  it('unknown type falls to default', async () => {
    await expect(html(<SummaryOrchestrator workoutData={data()} workoutType={'X' as WorkoutType} />))
      .toMatchFileSnapshot(snap('orchestrator-default'));
  });
});
