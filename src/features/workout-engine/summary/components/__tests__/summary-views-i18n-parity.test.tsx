// @vitest-environment jsdom
/**
 * i18n wave 2 (namespace `summary`, batch ap): AerobicSummaryView and HybridSummary. Snapshots recorded BEFORE the
 * extraction from unmodified origin/main. jsdom + react-dom/client (shared harness from the onboarding tests): every
 * tab is opened by a click, the delete confirmation, the route rating and the expanded map are walked through,
 * framer-motion is the plain-element stub. `<!-- -->` is stripped and React ids normalised by the harness.
 * Map / drawer / child blocks with their own tests are stubs that print the props under test.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createElement, type ReactNode } from 'react';
import { mount, motionStub, type Mounted } from '@/features/user/onboarding/components/steps/__tests__/i18n-dom-harness';

const S = vi.hoisted(() => ({ v2: false, deleteExpanded: false }));

vi.mock('framer-motion', () => motionStub);
vi.mock('@/lib/firebase', () => ({ db: {}, auth: { currentUser: null }, app: {} }));
vi.mock('@/features/user', () => ({ useUserStore: (sel?: (s: unknown) => unknown) => (sel ? sel({ profile: null }) : { profile: null }) }));
vi.mock('@/hooks/useFeatureFlags', () => ({ useFeatureFlags: () => ({ flags: { enableHomeV2: S.v2 } }) }));
vi.mock('@/features/activity/store/useActivityStore', () => ({
  useActivityStore: (sel: (s: unknown) => unknown) => sel({ weeklySummary: { categoryTotals: { strength: 20, cardio: 35 }, categorySessions: { cardio: 2 } } }),
}));
vi.mock('../../hooks/useSummaryStreakWeek', () => ({ useSummaryStreakWeek: () => ({ best: 4, days: [] }) }));
vi.mock('@/config/feature-flags', async (orig) => ({ ...(await orig<Record<string, unknown>>()), get WORKOUT_DELETE_EXPANDED_ENABLED() { return S.deleteExpanded; } }));
vi.mock('@/lib/safe-area/useSafeAreaTop', () => ({ useSafeAreaTop: () => 0 }));
vi.mock('@/components/ui/v2', async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  DraggableSheet: (p: { header: ReactNode; children: ReactNode; footer?: ReactNode }) => createElement('div', { 'data-stub': 'sheet' }, p.header, p.children, p.footer),
}));
vi.mock('../aerobic/TogetherSummaryLayer', () => ({ default: () => null }));
vi.mock('@/features/generation-review/components/ReportProblemButton', () => ({ default: () => null }));
vi.mock('@/components/ui/DeleteWorkoutConfirmModal', () => ({ default: (p: { isOpen: boolean }) => createElement('div', { 'data-stub': 'delete-modal', 'data-open': String(p.isOpen) }) }));

import AerobicSummaryView from '../aerobic/AerobicSummaryView';
import HybridSummary from '../../pages/HybridSummary';
import { useLocaleStore } from '@/store/useLocaleStore';

const noop = () => {};
const asyncNoop = async () => {};
let m: Mounted | null = null;
const out: string[] = [];

beforeEach(() => {
  Object.assign(useLocaleStore.getInitialState(), { gender: 'other' });
  S.v2 = false;
  S.deleteExpanded = false;
  out.length = 0;
});
afterEach(() => { m?.unmount(); m = null; });

const lap = (n: number, over = {}) => ({ lapNumber: n, distanceMeters: 1000, durationSeconds: 330 + n * 5, paceSecPerKm: 330 + n * 5, ...over });
const workout = (over: Record<string, unknown> = {}) => ({
  userId: 'u1', date: new Date('2026-10-20T07:00:00'), activityType: 'running', workoutType: 'running', category: 'cardio', displayIcon: 'run-fast',
  distance: 5.234, duration: 1710, calories: 312, pace: 5.45, earnedCoins: 0, laps: [lap(1), lap(2)], elevationGain: 34, parkId: 'p1', ...over,
});
const base = {
  variant: 'solo' as const, activityType: 'running' as const, workout: workout() as never, currentUid: 'u1', streakDays: 3, onSave: noop, onClose: noop, groupCtx: null, groupLoading: false,
  savedWorkoutId: 'w1', renderMap: () => createElement('div', { 'data-stub': 'map' }), submitRating: asyncNoop, deleteLastWorkout: asyncNoop, deleteWorkoutWithReversal: asyncNoop,
};
const groupCtx = (n: number) => ({
  collectiveDistanceKm: 12.34, participantCount: n,
  participants: Array.from({ length: n }, (_, i) => ({ uid: `u${i}`, name: `משתתף ${i}`, distanceKm: 4.1, durationSeconds: 1500, pace: 5.5 })),
}) as never;

async function snapshotTabs(open: (el: Parameters<typeof mount>[0]) => Promise<Mounted>, el: Parameters<typeof mount>[0], tabs: string[]) {
  m = await open(el);
  out.push(m.html());
  for (const tab of tabs) {
    await m.clickText(tab);
    out.push(m.html());
  }
}

describe('AerobicSummaryView', () => {
  it.each([false, true])('solo run, every tab, v2=%s', async (v2) => {
    const v2Data = v2 ? { streak: { days: [], best: 5 }, plan: null } : undefined;
    S.v2 = v2;
    await snapshotTabs(mount, <AerobicSummaryView {...base} v2={v2Data as never} />, ['סטטיסטיקה', 'מקטעים', 'מפה']);
    await expect(out.join('\n\n')).toMatchFileSnapshot(`./__snapshots__/summary-views-i18n/aerobic-solo-v${v2 ? 2 : 1}.html`);
  });
  it('walk / ride / read-only / group / pair / no laps', async () => {
    const cases: Array<[string, Record<string, unknown>]> = [
      ['walk', { activityType: 'walking', workout: workout({ activityType: 'walking', workoutType: 'walking' }) }],
      ['ride', { activityType: 'cycling', v2: { streak: null, plan: null }, workout: workout({ workoutType: 'cycling' }) }],
      ['readonly', { isReadOnly: true, onDelete: noop, savedWorkoutId: null }],
      ['readonly-nodelete', { isReadOnly: true }],
      ['group', { variant: 'group', groupCtx: groupCtx(4) }],
      ['pair', { variant: 'group', groupCtx: groupCtx(2) }],
      ['nolaps', { workout: workout({ laps: [], elevationGain: 0, distance: 0, duration: 0, pace: 0, calories: 0, parkId: undefined }), savedWorkoutId: null }],
      ['rated', { v2: { streak: { days: [], best: 1 }, plan: null }, workout: workout({ blockResults: [{ blockIndex: 0, rep: 1, label: 'חזרה 1', distanceMeters: 400, durationSeconds: 100, plannedDistanceMeters: 400, avgPaceSec: 250, inRange: true }, { blockIndex: 1, rep: 2, label: 'חזרה 2', distanceMeters: 400, durationSeconds: 100, plannedDistanceMeters: 400, avgPaceSec: 250, inRange: false }] }) }],
    ];
    for (const [name, over] of cases) {
      S.v2 = !!over.v2;
      m = await mount(<AerobicSummaryView {...base} {...(over as object)} />);
      out.push(`<!-- ${name} -->`, m.html());
      if (name === 'group') { for (const tab of ['סטטיסטיקה']) { await m.clickText(tab); out.push(m.html()); } }
      if (name === 'rated' || name === 'walk' || name === 'nolaps') { for (const tab of ['מקטעים', 'סטטיסטיקה']) { await m.clickText(tab); out.push(m.html()); } }
      m.unmount(); m = null;
    }
    await expect(out.join('\n\n')).toMatchFileSnapshot('./__snapshots__/summary-views-i18n/aerobic-cases.html');
  });
  it('rating + delete flows, expanded map', async () => {
    m = await mount(<AerobicSummaryView {...base} />);
    await m.click('button[aria-label="3 כוכבים"]');
    out.push(m.html());
    await m.clickText('שלח דירוג');
    out.push(m.html());
    await m.clickText('בטל / מחק אימון');
    out.push(m.html());
    await m.clickText('בטל');
    out.push(m.html());
    await m.click('button[aria-label="הגדל מפה"]');
    out.push(m.html());
    m.unmount();
    S.deleteExpanded = true;
    m = await mount(<AerobicSummaryView {...base} />);
    out.push(m.html());
    await m.clickText('בטל / מחק אימון');
    out.push(m.html());
    await expect(out.join('\n\n')).toMatchFileSnapshot('./__snapshots__/summary-views-i18n/aerobic-flows.html');
  });
});

describe('HybridSummary', () => {
  const seg = (i: number, kind: 'aerobic' | 'strength', over: Record<string, unknown> = {}) => ({ index: i, kind, ...(kind === 'aerobic' ? { aerobicType: 'running' } : {}), actual: kind === 'aerobic' ? { durationSec: 600, distanceKm: 1.5 } : { sets: 4, durationSec: 420 }, startedAtMs: 1, endedAtMs: 2, ...over });
  const result = (over: Record<string, unknown> = {}) => ({
    segments: [seg(0, 'aerobic'), seg(1, 'strength'), seg(2, 'aerobic', { actual: undefined, endedAtMs: undefined })],
    summary: { segmentCount: 3, completedAerobicSegments: 1, completedStrengthSegments: 1, totalActualAerobicSec: 600, totalActualDistanceKm: 1.5, totalStrengthSets: 4, bothHalvesCompleted: true, ...over },
  }) as never;
  it.each([false, true])('every tab, v2=%s', async (v2) => {
    S.v2 = v2;
    await snapshotTabs(mount, <HybridSummary result={result()} calories={250} streakDays={2} xpEarned={40} onFinish={noop} onDelete={noop} />, ['אירובי', 'כוח', 'סטטיסטיקה']);
    await expect(out.join('\n\n')).toMatchFileSnapshot(`./__snapshots__/summary-views-i18n/hybrid-v${v2 ? 2 : 1}.html`);
  });
  it('read-only, not both halves, empty', async () => {
    for (const v2 of [false, true]) {
      S.v2 = v2;
      m = await mount(<HybridSummary result={result({ bothHalvesCompleted: false })} isReadOnly onFinish={noop} />);
      out.push(m.html());
      m.unmount(); m = null;
      m = await mount(<HybridSummary result={{ segments: [], summary: { segmentCount: 0, completedAerobicSegments: 0, completedStrengthSegments: 0, totalActualAerobicSec: 0, totalActualDistanceKm: 0, totalStrengthSets: 0, bothHalvesCompleted: false } } as never} onFinish={noop} />);
      for (const tab of ['אירובי', 'כוח']) { await m.clickText(tab); out.push(m.html()); }
      m.unmount(); m = null;
    }
    await expect(out.join('\n\n')).toMatchFileSnapshot('./__snapshots__/summary-views-i18n/hybrid-cases.html');
  });
});
