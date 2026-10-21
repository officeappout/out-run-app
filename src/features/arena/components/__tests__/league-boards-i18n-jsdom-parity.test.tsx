// @vitest-environment jsdom
/**
 * i18n wave 2 (namespace `community`, keys `leagues.*`): the league boards' states that only appear
 * after a tap or a load — the unit league's range dropdown open, the group board's km toggle and
 * "show all" / "show less", and both data wrappers after their service resolves.
 * Recorded BEFORE the extraction from unmodified origin/main.
 *
 * react-dom/client in jsdom, framer-motion animations skipped (MotionGlobalConfig.skipAnimations);
 * `style` attributes and React `:rN:` ids are normalised before comparing (animation / layout values,
 * not text). Static states live in league-boards-i18n-parity.test.tsx.
 */
process.env.TZ = 'UTC';

import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { act, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';

const flags = { enableHomeV2: true };
const userState: { profile: Record<string, unknown> | null } = { profile: { id: 'u1', core: { isSuperAdmin: false } } };
const svc = { board: null as unknown, units: null as unknown };

vi.mock('@/hooks/useFeatureFlags', () => ({ useFeatureFlags: () => ({ flags }) }));
vi.mock('@/features/user', () => ({
  useUserStore: (sel?: (s: typeof userState) => unknown) => (sel ? sel(userState) : userState),
}));
vi.mock('@/lib/firebase', () => ({ db: {}, auth: {}, app: {} }));
vi.mock('@/features/arena/services/ranking.service', () => ({
  getGroupLeagueBoard: async () => svc.board,
  formatPaceSecPerKm: () => '0:00',
}));
vi.mock('@/features/arena/services/unit-league.service', () => ({ getUnitLeagueLeaderboard: async () => svc.units }));
vi.mock('@/components/ui/UnitIconBadge', () => ({ default: () => <span data-stub="unit-icon" /> }));

import { MotionGlobalConfig } from 'framer-motion';
import UnitLeagueTable, { UnitLeagueTableView } from '../UnitLeagueTable';
import GroupLeagueStatsBoard, { GroupLeagueStatsBoardView } from '../GroupLeagueStatsBoard';
import type { GroupBoard } from '@/features/arena/services/league-scope-keys';

MotionGlobalConfig.skipAnimations = true;
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const NOW = new Date('2026-10-19T09:00:00Z');
const noop = () => {};
const snap = (name: string) => `./__snapshots__/league-boards-i18n/jsdom-${name}.html`;
const normalise = (s: string) =>
  s.replace(/ style="[^"]*"/g, '').replace(/:r[0-9a-z]+:/g, ':r:').replace(/«r[0-9a-z]+»/g, '«r»');
const body = () => normalise(document.body.innerHTML);

let root: Root | null = null;
async function flush() {
  for (let i = 0; i < 6; i++) await act(async () => { await Promise.resolve(); });
}
async function mount(el: ReactElement) {
  const host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => root!.render(el));
  await flush();
}
async function click(el: Element | null | undefined) {
  if (!el) throw new Error('missing element');
  await act(async () => { (el as HTMLElement).dispatchEvent(new MouseEvent('click', { bubbles: true })); });
  await flush();
}
const btn = (text: string) => Array.from(document.body.querySelectorAll('button')).find((b) => b.textContent?.includes(text));

beforeAll(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
});
afterAll(() => vi.useRealTimers());
afterEach(async () => {
  await act(async () => root?.unmount());
  root = null;
  document.body.innerHTML = '';
});

const BOARD = (n: number): GroupBoard => ({
  totals: { points: 12345, stepsPoints: 4321, km: 56.7, activeMembers: n },
  members: Array.from({ length: n }, (_, i) => ({
    uid: `m${i}`,
    name: `חבר ${i}`,
    points: 1500 - i * 50,
    stepsPoints: i % 3 === 0 ? 0 : 900,
    km: i % 4 === 0 ? 0 : 10 - i / 10,
    isMe: i === 1,
  })),
});

describe('UnitLeagueTable', () => {
  it('range dropdown open, then a range picked', async () => {
    await mount(<UnitLeagueTableView range="my_brigade_battalions" onRangeChange={noop} isLoading={false} result={null} onRefresh={noop} />);
    const out = [body()];
    await click(document.body.querySelector('button[aria-expanded]'));
    out.push(body());
    await expect(out.join('\n\n')).toMatchFileSnapshot(snap('unit-dropdown'));
  });
  it('wrapper after load (v2 → km)', async () => {
    svc.units = {
      entries: [
        { directoryId: 'd1', name: 'גדוד 1', parentBreadcrumb: 'חטיבה 810', avgSteps: 9000, avgKm: 6.2, activeParticipantCount: 30, isMyUnit: true, unitId: 'u1', iconUrl: null },
      ],
      myUnitBelowFloor: null,
      updatedAt: new Date(NOW.getTime() - 3 * 3_600_000),
    };
    await mount(<UnitLeagueTable myOrgId="o1" myUnitPathIds={['a', 'b']} />);
    await expect(body()).toMatchFileSnapshot(snap('unit-wrapper-loaded'));
  });
});

describe('GroupLeagueStatsBoard', () => {
  it.each(['weekly', 'monthly'] as const)('%s: km toggle, show all / show less', async (win) => {
    await mount(<GroupLeagueStatsBoardView board={BOARD(13)} loading={false} timeWindow={win} onRefresh={noop} />);
    const out = [body()];
    await click(btn('הצג את כל'));
    out.push(body());
    await click(btn('הצג פחות'));
    await click(document.body.querySelectorAll('[role="radio"]')[1]);
    out.push(body());
    await expect(out.join('\n\n')).toMatchFileSnapshot(snap(`group-stats-taps-${win}`));
  });
  it('km toggle with nobody walking → empty km message', async () => {
    const b = BOARD(3);
    b.members = b.members.map((m) => ({ ...m, km: 0 }));
    await mount(<GroupLeagueStatsBoardView board={b} loading={false} timeWindow="monthly" onRefresh={noop} />);
    await click(document.body.querySelectorAll('[role="radio"]')[1]);
    await expect(body()).toMatchFileSnapshot(snap('group-stats-km-empty'));
  });
  it('wrapper after load / failed load renders nothing', async () => {
    svc.board = BOARD(2);
    await mount(<GroupLeagueStatsBoard groupId="g1" timeWindow="monthly" />);
    const out = [body()];
    await act(async () => root?.unmount());
    document.body.innerHTML = '';
    svc.board = null;
    await mount(<GroupLeagueStatsBoard groupId="g2" timeWindow="weekly" />);
    out.push(body());
    await expect(out.join('\n\n')).toMatchFileSnapshot(snap('group-stats-wrapper'));
  });
});
