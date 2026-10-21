/**
 * i18n wave 2 (player namespace, `run.*` keys): the run overview's copy moves
 * to src/messages/he/player.json. The snapshots below were recorded from the
 * components BEFORE the extraction (origin/main @ fea3d25b); the extracted
 * components must render byte-identical Hebrew markup in every state that
 * shows text: free / easy / on a chosen route / swapped / pace-edited /
 * read-only overview, every CTA mode, the M-6j fit card, the route carousel.
 *
 * react-dom/server writes `<!-- -->` between adjacent text nodes; merging
 * `{a} text` into one t() call drops that comment without changing what the
 * user sees, so every snapshot is recorded with `<!-- -->` stripped.
 * The sheets (התאם קצב / החלף מקטע, the home sheet) portal after mount and render nothing
 * statically — their keys are pinned in src/lib/i18n/__tests__/player-he.test.ts.
 */
import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { ReactElement } from 'react';

vi.mock('@/features/user/identity/store/useUserStore', () => {
  const state = { profile: { running: { paceProfile: { basePace: 330, profileType: 1 } }, core: { weight: 70 } } };
  const useUserStore = (sel: (s: typeof state) => unknown) => sel(state);
  (useUserStore as unknown as { getState: () => typeof state }).getState = () => state;
  return { useUserStore };
});
vi.mock('@/features/user', () => {
  const state = { profile: { core: { gender: 'male', weight: 70 } } };
  const useUserStore = (sel: (s: typeof state) => unknown) => sel(state);
  return { useUserStore };
});
vi.mock('@/features/workout-engine/core/store/useRunningConfigStore', async () => {
  const { DEFAULT_PACE_MAP_CONFIG } = await import('@/features/workout-engine/core/config/pace-map-config');
  return { useRunningConfigStore: (sel: (s: { config: unknown }) => unknown) => sel({ config: DEFAULT_PACE_MAP_CONFIG }) };
});
vi.mock('@/features/parks/core/store/useMapStore', () => {
  const noop = () => {};
  const useMapStore = (sel: (s: Record<string, unknown>) => unknown) => sel({ setOverviewSheetHeightPx: noop, setIsOverviewActive: noop });
  return { useMapStore };
});
vi.mock('@/components/system/report-boundary-error', () => ({ reportBoundaryError: () => {} }));

import RunWorkoutOverview from '../RunWorkoutOverview';
import TodayWorkoutFitCard from '../TodayWorkoutFitCard';
import RunOverviewCta from '../RunOverviewCta';
import RunRouteSuggestCarousel from '../RunRouteSuggestCarousel';
import { NO_RUN_EDITS, withPace, withSwap } from '../../../utils/run-overview/run-edits';
import type RunWorkout from '../../../types/run-workout.type';
import type { RunBlock } from '../../../types/run-block.type';
import type { Route } from '@/features/parks/core/types/route.types';
import type { RouteSuggestion } from '../../../lib/route-fit';

const strip = (html: string) => html.replace(/<!-- -->/g, '');
const html = (el: ReactElement) => strip(renderToStaticMarkup(el));
const snap = (name: string) => `./__snapshots__/run-overview-i18n/${name}.html`;

beforeAll(() => { vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-19T08:40:00')); });
afterAll(() => { vi.useRealTimers(); });

let n = 0;
const blk = (over: Partial<RunBlock>): RunBlock => ({ id: `b${++n}`, type: 'run', label: 'ריצה', colorHex: '#000', ...over });
function intervals(): RunWorkout {
  n = 0;
  const blocks: RunBlock[] = [blk({ type: 'warmup', label: 'חימום', durationSeconds: 600, zoneType: 'easy', _isDynamicWrapper: true })];
  for (let i = 0; i < 6; i++) {
    blocks.push(blk({ type: 'interval', label: `400 מ׳ (${i + 1}/6)`, distanceMeters: 400, zoneType: 'interval_short' }));
    if (i < 5) blocks.push(blk({ type: 'recovery', label: 'ריצת התאוששות', durationSeconds: 90, _isSynthesizedRest: true }));
  }
  blocks.push(blk({ type: 'cooldown', label: 'שחרור', durationSeconds: 480, zoneType: 'easy', _isDynamicWrapper: true }));
  return { id: 'w', title: 'אינטרוולים', isQualityWorkout: true, blocks, category: 'short_intervals' };
}
const easy = (): RunWorkout => ({
  id: 'e', title: 'ריצה קלה', isQualityWorkout: false, category: 'easy_run', logicCue: 'קצב שיחה: אם אפשר לדבר — זה הקצב.',
  blocks: [blk({ type: 'run', label: 'ריצה קלה', durationSeconds: 35 * 60, zoneType: 'easy' })],
});
const noop = () => {};

const lat = 32.08, lng = 34.78;
const route = {
  id: 'r', name: 'לולאת הירקון', distance: 4, routeShape: 'loop', difficulty: 'easy',
  path: [[lng, lat], [lng + 0.0105, lat], [lng + 0.0105, lat + 0.0045], [lng, lat + 0.0045], [lng, lat]],
  elevationProfile: { stepM: 100, elevationsM: Array.from({ length: 41 }, (_, i) => 10 + (i % 10)) },
  qualitySignals: { lighting: { status: 'computed', isLit: true } },
} as unknown as Route;
const fit = { verdict: 'laps' as const, laps: 1.5, endsAtStart: true, turnaroundKm: null, score: 1, reason: null, caution: null };

describe('RunWorkoutOverview — Hebrew markup unchanged by the i18n extraction', () => {
  it('free intervals (M-6a) with week', async () => {
    await expect(html(
      <RunWorkoutOverview workout={intervals()} week={{ week: 3, day: 2, totalWeeks: 8 }} edits={NO_RUN_EDITS} onEditsChange={noop}
        ctaMode="free" onBack={noop} onStart={noop} onSuggest={noop} />,
    )).toMatchFileSnapshot(snap('free-intervals'));
  });
  it('easy run (M-6d)', async () => {
    await expect(html(
      <RunWorkoutOverview workout={easy()} edits={NO_RUN_EDITS} onEditsChange={noop} ctaMode="free" onBack={noop} onStart={noop} onSuggest={noop} />,
    )).toMatchFileSnapshot(snap('easy'));
  });
  it('on a chosen route, walk there / back (M-6f / 6i)', async () => {
    await expect(html(
      <RunWorkoutOverview workout={intervals()} edits={NO_RUN_EDITS} onEditsChange={noop} ctaMode="route"
        chosen={{ route, score: { fit } }} origin={{ lat: lat - 0.0054, lng }} routeLineInHeader
        onBack={noop} onStart={noop} onStartOnRoute={noop} onClearRoute={noop} onShowOnMap={noop} />,
    )).toMatchFileSnapshot(snap('route-chosen'));
  });
  it('on a chosen route, starting right here', async () => {
    await expect(html(
      <RunWorkoutOverview workout={easy()} edits={NO_RUN_EDITS} onEditsChange={noop} ctaMode="route"
        chosen={{ route, score: { fit } }} origin={{ lat, lng }}
        onBack={noop} onStart={noop} onStartOnRoute={noop} onClearRoute={noop} onShowOnMap={noop} />,
    )).toMatchFileSnapshot(snap('route-here'));
  });
  it('swapped main set (M-7c)', async () => {
    await expect(html(
      <RunWorkoutOverview workout={intervals()} edits={withSwap(NO_RUN_EDITS, 'm:600.600.600.600~120')} onEditsChange={noop}
        ctaMode="free" onBack={noop} onStart={noop} />,
    )).toMatchFileSnapshot(snap('swapped'));
  });
  it('edited pace (M-7a)', async () => {
    await expect(html(
      <RunWorkoutOverview workout={intervals()} edits={withPace(NO_RUN_EDITS, 'main.interval_short', { min: 270, max: 280 })}
        onEditsChange={noop} ctaMode="searching" onBack={noop} onStart={noop} onSuggest={noop} />,
    )).toMatchFileSnapshot(snap('pace-edited'));
  });
  it('read-only, no route found', async () => {
    await expect(html(
      <RunWorkoutOverview workout={intervals()} edits={NO_RUN_EDITS} ctaMode="none" onBack={noop} onStart={noop} onPickOnMap={noop} />,
    )).toMatchFileSnapshot(snap('readonly-none'));
  });
});

describe('overview parts', () => {
  it('CTA modes', async () => {
    const all = [
      html(<RunOverviewCta mode="free" onStart={noop} onSuggest={noop} />),
      html(<RunOverviewCta mode="searching" onStart={noop} onSuggest={noop} />),
      html(<RunOverviewCta mode="none" onStart={noop} onPickOnMap={noop} />),
      html(<RunOverviewCta mode="route" onStart={noop} onStartOnRoute={noop} onClearRoute={noop} />),
    ].join('\n');
    await expect(all).toMatchFileSnapshot(snap('cta-modes'));
  });
  it('M-6j fit card', async () => {
    const all = [
      html(<TodayWorkoutFitCard model={{ kind: 'interval', title: '6 × 400 מ׳', minutes: 42 }} fitLabel="מתאים ב-2 סיבובים" onOpen={noop} />),
      html(<TodayWorkoutFitCard model={{ kind: 'easy', title: 'ריצה קלה', minutes: null }} fitLabel="מתאים" onOpen={noop} />),
    ].join('\n');
    await expect(all).toMatchFileSnapshot(snap('fit-card'));
  });
  it('route suggestion carousel', async () => {
    const generated = { ...route, id: 'g', name: '' } as Route;
    const out = { ...route, id: 'o', name: 'הלוך חזור', routeShape: 'out_and_back' } as unknown as Route;
    const sug = (r: Route, isGenerated: boolean, laps: number | null): RouteSuggestion =>
      ({ route: r, isGenerated, score: { fit: { ...fit, laps } } } as unknown as RouteSuggestion);
    const all = [
      html(<RunRouteSuggestCarousel suggestions={[sug(route, false, 1.5), sug(generated, true, 1)]} selectedId="r" onSelect={noop}
        onBack={noop} workoutLabel="6 × 400" minutes={42} journey={[]} />),
      html(<RunRouteSuggestCarousel suggestions={[sug(generated, true, null)]} selectedId="g" onSelect={noop}
        onBack={noop} workoutLabel="ריצה קלה" minutes={null} journey={[]} />),
      html(<RunRouteSuggestCarousel suggestions={[sug(out, false, 2), sug(route, false, 1), sug(generated, true, 3)]} selectedId={null}
        onSelect={noop} onBack={noop} workoutLabel="טמפו" minutes={30} journey={[]} />),
      html(<RunRouteSuggestCarousel suggestions={[]} selectedId={null} onSelect={noop} onBack={noop} workoutLabel="x" minutes={null} journey={[]} />),
    ].join('\n');
    await expect(all).toMatchFileSnapshot(snap('suggest-carousel'));
  });
});
