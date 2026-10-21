/**
 * i18n wave 2 (profile namespace): StepsAnalyticsView's copy moved to
 * src/messages/he/profile.json. The snapshots below were recorded from the
 * component BEFORE the extraction (origin/main @ 1dd0a334); the extracted
 * component must render byte-identical markup in Hebrew, in every state that
 * shows text: day / week / month / year tabs, v1 bars and v2 line
 * (enable_home_v2), goal reached / not reached, loading, error, and the
 * connect-health teaser.
 */
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import StepsAnalyticsView, { type StepsAnalyticsViewProps } from '../StepsAnalyticsView';
import { deriveStepsChartData, deriveStepsStats, type StepsTimeRange } from '../../lib/steps-analytics.logic';
import type { DailyStepsSnapshot } from '../../services/activity-history.service';

const NOW = new Date('2026-10-15T12:00:00');

function snapshots(): DailyStepsSnapshot[] {
  const out: DailyStepsSnapshot[] = [];
  for (let i = 40; i >= 0; i--) {
    const d = new Date(NOW.getFullYear(), NOW.getMonth(), NOW.getDate() - i);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const steps = i === 0 ? 4321 : 3000 + ((i * 1237) % 7000);
    out.push({
      date: key,
      steps,
      floors: 0,
      stepsGoalMet: steps >= 8000,
      floorsGoalMet: false,
      stepsGoal: 8000,
      floorsGoal: 0,
      distanceMeters: i % 3 === 0 ? 0 : steps * 0.7,
    } as DailyStepsSnapshot);
  }
  return out;
}

function props(range: StepsTimeRange, over: Partial<StepsAnalyticsViewProps> = {}): StepsAnalyticsViewProps {
  const snaps = over.snapshots ?? snapshots();
  return {
    timeRange: range,
    onTimeRangeChange: () => {},
    snapshots: snaps,
    chartData: deriveStepsChartData(snaps, range, NOW),
    stats: deriveStepsStats(snaps, range),
    loading: false,
    error: false,
    hasPermissions: true,
    onConnect: () => {},
    onBack: () => {},
    ...over,
  };
}

const html = (p: StepsAnalyticsViewProps) => renderToStaticMarkup(<StepsAnalyticsView {...p} />);
const snap = (name: string) => `./__snapshots__/steps-analytics-i18n/${name}.html`;

beforeAll(() => {
  vi.useFakeTimers();
  vi.setSystemTime(NOW);
  vi.spyOn(Math, 'random').mockReturnValue(0.5);
});
afterAll(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('StepsAnalyticsView — Hebrew markup unchanged by the i18n extraction', () => {
  for (const range of ['day', 'week', 'month', 'year'] as const) {
    it(`${range} · v1 bars`, async () => {
      await expect(html(props(range))).toMatchFileSnapshot(snap(`${range}-v1`));
    });
    it(`${range} · v2 line`, async () => {
      await expect(html(props(range, { lineChart: true }))).toMatchFileSnapshot(snap(`${range}-v2`));
    });
  }

  it('week · goal reached today', async () => {
    const s = snapshots();
    s[s.length - 1] = { ...s[s.length - 1], steps: 9500, stepsGoalMet: true };
    await expect(html(props('week', { snapshots: s, lineChart: true }))).toMatchFileSnapshot(snap('week-goal-reached'));
  });

  it('loading', async () => {
    await expect(html(props('week', { loading: true, lineChart: true }))).toMatchFileSnapshot(snap('loading'));
  });

  it('error', async () => {
    await expect(html(props('month', { error: true, lineChart: true }))).toMatchFileSnapshot(snap('error'));
  });

  it('no health permission → connect teaser', async () => {
    await expect(html(props('week', { hasPermissions: false, lineChart: true }))).toMatchFileSnapshot(snap('connect'));
  });

  it('no data at all, day tab (no best day → dash)', async () => {
    await expect(html(props('day', { snapshots: [], lineChart: true }))).toMatchFileSnapshot(snap('day-empty'));
  });
});
