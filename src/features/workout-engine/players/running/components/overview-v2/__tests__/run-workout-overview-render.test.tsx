/**
 * The run workout overview on the ONE overview drawer (boards M-6a / 6c /
 * 6d / 6f / 6j) — static-markup render tests (node env).
 */
import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';

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

import RunWorkoutOverview from '../RunWorkoutOverview';
import TodayWorkoutFitCard from '../TodayWorkoutFitCard';
import RunOverviewCta from '../RunOverviewCta';
import type RunWorkout from '../../../types/run-workout.type';
import type { RunBlock } from '../../../types/run-block.type';
import type { Route } from '@/features/parks/core/types/route.types';

beforeAll(() => { vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-19T08:40:00')); });
afterAll(() => { vi.useRealTimers(); });

let n = 0;
const blk = (over: Partial<RunBlock>): RunBlock => ({ id: `b${++n}`, type: 'run', label: 'ריצה', colorHex: '#000', ...over });
function intervals(): RunWorkout {
  const blocks: RunBlock[] = [blk({ type: 'warmup', label: 'חימום', durationSeconds: 600, zoneType: 'easy', _isDynamicWrapper: true })];
  for (let i = 0; i < 6; i++) {
    blocks.push(blk({ type: 'interval', label: `400 מ׳ (${i + 1}/6)`, distanceMeters: 400, zoneType: 'interval_short' }));
    if (i < 5) blocks.push(blk({ type: 'recovery', label: 'ריצת התאוששות', durationSeconds: 90, _isSynthesizedRest: true }));
  }
  blocks.push(blk({ type: 'cooldown', label: 'שחרור', durationSeconds: 480, zoneType: 'easy', _isDynamicWrapper: true }));
  return { id: 'w', title: 'אינטרוולים', isQualityWorkout: true, blocks, category: 'short_intervals' };
}
const easy: RunWorkout = {
  id: 'e', title: 'ריצה קלה', isQualityWorkout: false, category: 'easy_run', logicCue: 'קצב שיחה: אם אפשר לדבר — זה הקצב.',
  blocks: [blk({ type: 'run', label: 'ריצה קלה', durationSeconds: 35 * 60, zoneType: 'easy' })],
};
const noop = () => {};
const count = (html: string, s: string) => html.split(s).length - 1;

describe('free run from here (M-6a)', () => {
  let html = '';
  beforeAll(() => {
    html = renderToStaticMarkup(
      <RunWorkoutOverview workout={intervals()} week={{ week: 3, day: 2, totalWeeks: 8 }} variant="planned" onVariantChange={noop}
        ctaMode="free" onBack={noop} onStart={noop} onSuggest={noop} />,
    );
  });
  it('#462 header: type pill, title, time · km · finish, week line', () => {
    expect(html).toContain('אינטרוולים קצרים');
    expect(html).toContain('6 × 400 מ׳');
    expect(html).toMatch(/מסיים ~09:\d\d/);
    expect(html).toContain('שבוע 3 מתוך 8');
  });
  it('axis: your location · leaving from here → warm-up → ONE group (6 ×, rows with paces) → cool-down', () => {
    expect(html).toContain('המיקום שלך');
    expect(html).toContain('יוצאים מכאן · ה-GPS מודד את הדרך');
    expect(html).toContain('תחילת האימון');
    expect(html).toContain('סיום האימון');
    expect(html).toContain('6 ×');
    expect(html).toContain('חזרות');
    expect(html).toMatch(/400 מ׳ מהיר · ~/);
    expect(count(html, '400 מ׳ מהיר')).toBe(1); // one rep's rows, never one card per rep
    expect(html).not.toContain('סיום המסלול');
  });
  it('variant selector + one gradient CTA + "הצע לי מסלול"', () => {
    expect(html).toContain('aria-label="בחירת עומס"');
    expect(html).toMatch(/4 × 400 · \d+׳/);
    expect(html).toMatch(/8 × 400 · \d+׳/);
    expect(count(html, 'bg-v2-cta')).toBe(1);
    expect(html).toContain('התחל אימון');
    expect(html).toContain('הצע לי מסלול');
  });
  it('intensity page only (no route → no elevation page)', () => {
    expect(html).toContain('עיקר · 6 חזרות');
    expect(html).not.toContain('גובה לאורך האימון');
  });
});

describe('easy run (M-6d): one steady leg + the tip', () => {
  it('renders one leg with the conversational pace badge', () => {
    const html = renderToStaticMarkup(
      <RunWorkoutOverview workout={easy} variant="planned" onVariantChange={noop} ctaMode="free" onBack={noop} onStart={noop} onSuggest={noop} />,
    );
    expect(html).toContain('קצב שיחה');
    expect(html).toContain('35 דק׳');
    expect(html).toContain('30 דק׳');
    expect(html).toContain('45 דק׳');
    expect(html).toContain('אם אפשר לדבר');
  });
});

describe('on a chosen route (M-6f / 6i)', () => {
  const lat = 32.08, lng = 34.78;
  const route = {
    id: 'r', name: 'לולאת הירקון', distance: 4, routeShape: 'loop',
    path: [[lng, lat], [lng + 0.0105, lat], [lng + 0.0105, lat + 0.0045], [lng, lat + 0.0045], [lng, lat]],
    elevationProfile: { stepM: 100, elevationsM: Array.from({ length: 41 }, (_, i) => 10 + (i % 10)) },
    qualitySignals: { lighting: { status: 'computed', isLit: true } },
  } as unknown as Route;
  const fit = { verdict: 'laps' as const, laps: 1.5, endsAtStart: true, turnaroundKm: null, score: 1, reason: null, caution: null };
  let html = '';
  beforeAll(() => {
    html = renderToStaticMarkup(
      <RunWorkoutOverview workout={intervals()} variant="planned" onVariantChange={noop} ctaMode="route"
        chosen={{ route, score: { fit } }} origin={{ lat: lat - 0.0054, lng }}
        onBack={noop} onStart={noop} onStartOnRoute={noop} onClearRoute={noop} onShowOnMap={noop} />,
    );
  });
  it('the chosen-route card heads the axis; walk there / back; laps note', () => {
    expect(html).toContain('המסלול שבחרת');
    expect(html).toContain('לולאת הירקון');
    expect(html).toContain('1.5 סיבובים');
    expect(html).toContain('הצג במפה');
    expect(html).toContain('הליכה אל המסלול');
    expect(html).toContain('הליכה חזרה');
    expect(html).toContain('על לולאת הירקון — 1.5 סיבובים');
    expect(html).not.toContain('יוצאים מכאן');
  });
  it('graph page 2 = elevation with the workout bands; CTA on the route', () => {
    expect(html).toContain('גובה לאורך האימון');
    expect(html).toContain('החלק לגובה המסלול');
    expect(html).toContain('סיבוב 2');
    expect(html).toContain('התחל אימון במסלול');
    expect(html).toContain('בלי מסלול');
    expect(count(html, 'bg-v2-cta')).toBe(1);
  });
});

describe('CTA states + reverse card', () => {
  it('no route near (M-6c): notice + "בחר במפה"', () => {
    const html = renderToStaticMarkup(<RunOverviewCta mode="none" onStart={noop} onPickOnMap={noop} onSuggest={noop} />);
    expect(html).toContain('לא מצאנו מסלול מתאים קרוב — אפשר לרוץ מכאן');
    expect(html).toContain('בחר במפה');
    expect(html).not.toContain('הצע לי מסלול');
  });
  it('searching: a spinner line, still "התחל אימון"', () => {
    const html = renderToStaticMarkup(<RunOverviewCta mode="searching" onStart={noop} onSuggest={noop} />);
    expect(html).toContain('מחפש מסלולים');
    expect(html).toContain('התחל אימון');
  });
  it('M-6j card: today + fit + "לאימון הזה כאן"', () => {
    const html = renderToStaticMarkup(
      <TodayWorkoutFitCard model={{ kind: 'interval', title: '6 × 400 מ׳', minutes: 42 }} fitLabel="מתאים ב-2 סיבובים" onOpen={noop} />,
    );
    expect(html).toContain('יש לך היום: 6 × 400 מ׳');
    expect(html).toContain('מתאים ב-2 סיבובים · 42 דק׳');
    expect(html).toContain('לאימון הזה כאן');
  });
});
