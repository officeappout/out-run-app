// @vitest-environment jsdom
/**
 * i18n wave 2 (namespace `profile`, `exerciseAnalytics.*` keys): the exercise page v2
 * (/profile/exercise/[id], enable_home_v2) moves its copy to src/messages/he/profile.json.
 * The snapshots below were recorded from the components BEFORE the extraction; the
 * extracted components must render the same Hebrew markup in every state that shows
 * text: loading, error, empty, full (goal ahead / goal reached, improvement up / down,
 * history rows with and without a target, load more / loading more), each range and
 * metric (incl. an empty range and the "chart shows the last N" note), and the goal
 * sheet (set / update, saving).
 *
 * Rendered with react-dom/client in jsdom: the goal sheet portals to document.body and
 * the range / metric / goal states need a tap, which static markup can't reach.
 * The data hooks are mocked (no Firestore). Only Date is faked (pinned "now").
 * Normalised (not text): React useId values and framer-motion animation state (style / opacity /
 * stroke-dash attributes), which depend on frame timing.
 * `<!-- -->` never appears in client-rendered markup; it is stripped anyway for symmetry
 * with the static-markup parity tests.
 */
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { act, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import type { RichExerciseSession } from '@/features/workout-engine/services/exercise-history.service';

vi.mock('next/navigation', () => ({ useRouter: () => ({ back() {}, push() {}, replace() {} }) }));
vi.mock('@/lib/firebase', () => ({ db: {}, auth: {}, app: {} }));

const DAY = 86_400_000;
const NOW = new Date(2026, 9, 15, 12, 0, 0).getTime();

interface PagedState {
  desc: RichExerciseSession[];
  hasMore: boolean;
  loading: boolean;
  loadingMore: boolean;
  error: boolean;
  customGoal: number | null;
  savingGoal: boolean;
}
const EMPTY: PagedState = { desc: [], hasMore: false, loading: false, loadingMore: false, error: false, customGoal: null, savingGoal: false };
const paged: PagedState = { ...EMPTY };
const meta: { name: string | null; imageUrl: string | null } = { name: 'מתח', imageUrl: null };

vi.mock('@/features/profile/hooks/useExerciseSessionsPaged', () => ({
  useExerciseSessionsPaged: () => ({
    ...paged,
    asc: [...paged.desc].reverse(),
    loadMore: async () => {},
    saveGoal: async () => {},
  }),
}));
vi.mock('@/features/profile/hooks/useExerciseMeta', () => ({ useExerciseMeta: () => meta }));

import { MotionGlobalConfig } from 'framer-motion';
import ExerciseAnalyticsV2 from '../ExerciseAnalyticsV2';

if (!window.matchMedia) {
  window.matchMedia = (q: string) =>
    ({ matches: false, media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} }) as unknown as MediaQueryList;
}
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
MotionGlobalConfig.skipAnimations = true;

/** A session `daysAgo` before NOW (newest-first lists are built by the caller). */
const s = (daysAgo: number, reps: number[], targetReps: number | null = 10): RichExerciseSession => ({
  date: null,
  dateMs: NOW - daysAgo * DAY,
  reps,
  maxReps: reps.length ? Math.max(...reps) : 0,
  totalVolume: reps.reduce((a, b) => a + b, 0),
  maxWeight: 0,
  targetReps: targetReps as number,
  exerciseName: 'מתח',
});

// Newest first. One session with a big volume so "חזרות בסה״כ" crosses 1,000.
const FULL_DESC = [s(1, [14, 12, 10]), s(8, [12, 11], null), s(20, [400, 400, 300]), s(45, [10, 9, 8]), s(120, [8, 7])];

let root: Root | null = null;
let host: HTMLElement | null = null;
// Not text, normalised: React's useId values (`:r5:` / `«r5»`, a global counter that shifts with
// test order and re-render count) and framer-motion's animation state — inline `style`, `opacity`
// and `stroke-dash*` land on start or end values depending on frame timing (chart fade / line draw,
// sheet backdrop). Class names, attributes and every text node are compared as rendered.
const clean = (h: string) =>
  h
    .replaceAll('<!-- -->', '')
    .replace(/:r[0-9a-z]+:|«r[0-9a-z]+»/g, ':r:')
    .replace(/ (style|opacity|stroke-dasharray|stroke-dashoffset)="[^"]*"/g, '');
async function mount(el: ReactElement): Promise<void> {
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => root!.render(el));
  for (let i = 0; i < 3; i++) await act(async () => { await Promise.resolve(); });
}
const body = () => clean(document.body.innerHTML);
async function tapText(text: string): Promise<void> {
  const el = Array.from(document.querySelectorAll('button')).find((b) => b.textContent?.trim() === text);
  if (!el) throw new Error(`no button "${text}"`);
  act(() => { el.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
  for (let i = 0; i < 3; i++) await act(async () => { await Promise.resolve(); });
}
async function tapSelector(sel: string): Promise<void> {
  const el = document.querySelector(sel);
  if (!el) throw new Error(`no element ${sel}`);
  act(() => { el.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
  for (let i = 0; i < 3; i++) await act(async () => { await Promise.resolve(); });
}
const snap = (name: string) => `./__snapshots__/exercise-analytics-i18n/${name}.html`;
const page = () => <ExerciseAnalyticsV2 exerciseId="pullup" userId="u1" exerciseNameHint="מתח" />;

beforeAll(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
});
afterAll(() => {
  vi.useRealTimers();
});
afterEach(() => {
  act(() => root?.unmount());
  host?.remove();
  document.body.innerHTML = '';
  root = null;
  host = null;
  Object.assign(paged, EMPTY);
  meta.name = 'מתח';
  meta.imageUrl = null;
});

describe('exercise page v2 — Hebrew markup parity', () => {
  it('loading', async () => {
    paged.loading = true;
    await mount(page());
    await expect(body()).toMatchFileSnapshot(snap('loading'));
  });

  it('error', async () => {
    paged.error = true;
    await mount(page());
    await expect(body()).toMatchFileSnapshot(snap('error'));
  });

  it('empty (no sessions, no goal)', async () => {
    await mount(page());
    await expect(body()).toMatchFileSnapshot(snap('empty'));
  });

  it('full — goal ahead, improvement up, load more', async () => {
    paged.desc = FULL_DESC;
    paged.customGoal = 500;
    paged.hasMore = true;
    await mount(page());
    await expect(body()).toMatchFileSnapshot(snap('full-goal-ahead'));
  });

  it('full — goal reached, improvement down, loading more, no custom goal (latest target)', async () => {
    paged.desc = [s(1, [9, 8]), ...FULL_DESC];
    paged.hasMore = true;
    paged.loadingMore = true;
    await mount(page());
    await expect(body()).toMatchFileSnapshot(snap('full-goal-reached'));
  });

  it('one session, no target anywhere (no delta, no improvement, no goal)', async () => {
    paged.desc = [s(2, [6, 5], null)];
    await mount(page());
    await expect(body()).toMatchFileSnapshot(snap('one-session'));
  });

  it('range 1m with nothing in range', async () => {
    paged.desc = [s(60, [6, 5]), s(70, [5])];
    await mount(page());
    await tapText('חודש');
    await expect(body()).toMatchFileSnapshot(snap('range-1m-empty'));
  });

  it('range all + more pages → "the chart shows the last N"', async () => {
    paged.desc = FULL_DESC;
    paged.hasMore = true;
    await mount(page());
    await tapText('הכל');
    await expect(body()).toMatchFileSnapshot(snap('range-all-has-more'));
  });

  it('metric total volume', async () => {
    paged.desc = FULL_DESC;
    paged.customGoal = 12;
    await mount(page());
    await tapText('נפח כולל');
    await expect(body()).toMatchFileSnapshot(snap('metric-volume'));
  });

  it('goal sheet — set a goal (no current goal)', async () => {
    paged.desc = FULL_DESC.map((x) => ({ ...x, targetReps: 1 }));
    await mount(page());
    await tapText('הגדרת יעד');
    await expect(body()).toMatchFileSnapshot(snap('goal-sheet-set'));
  });

  it('goal sheet — update the goal, saving', async () => {
    paged.desc = FULL_DESC;
    paged.customGoal = 20;
    paged.savingGoal = true;
    await mount(page());
    await tapSelector('button.bg-v2-tint');
    await expect(body()).toMatchFileSnapshot(snap('goal-sheet-update-saving'));
  });
});
