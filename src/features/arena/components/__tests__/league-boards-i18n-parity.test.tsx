/**
 * i18n wave 2 (namespace `community`, keys `leagues.*`): the league boards' free pieces in
 * src/features/arena/components — LeagueBoard (row / podium / rank tile), LeagueCarousel (sheet mode =
 * the live league picker; carousel mode is unreachable today, pinned anyway), LeaguesTabChrome
 * (selector button), LeagueFilterSheet + OpponentPickerSheet (v1 and v2, enable_home_v2),
 * UnitLeagueTableView and GroupLeagueStatsBoardView in every state a static render reaches.
 * The snapshots below were recorded BEFORE the extraction from unmodified origin/main.
 *
 * Static markup (react-dom/server, node env). useUserStore is a selector-hook fake (the real store
 * pulls Firebase in). `<!-- -->` is stripped before comparing (react-dom/server's separator between
 * adjacent text nodes — `{name} — …` is several nodes before, one `t()` string after; not rendered text).
 *
 * States behind a tap (the unit range dropdown open, the group board's km toggle / "show all") and the
 * data-loading wrappers are pinned by league-boards-i18n-jsdom-parity.test.tsx.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { ReactElement } from 'react';

const flags = { enableHomeV2: false };
const userState: { profile: Record<string, unknown> | null } = { profile: null };

vi.mock('@/hooks/useFeatureFlags', () => ({ useFeatureFlags: () => ({ flags }) }));
vi.mock('@/features/user', () => ({
  useUserStore: (sel?: (s: typeof userState) => unknown) => (sel ? sel(userState) : userState),
}));
vi.mock('@/lib/firebase', () => ({ db: {}, auth: {}, app: {} }));
vi.mock('@/features/arena/services/ranking.service', () => ({
  getGroupLeagueBoard: () => new Promise(() => {}),
  formatPaceSecPerKm: (s: number) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`,
}));
vi.mock('@/features/arena/services/unit-league.service', () => ({ getUnitLeagueLeaderboard: () => new Promise(() => {}) }));
vi.mock('@/components/ui/UnitIconBadge', () => ({
  default: (p: { name: string }) => <span data-stub="unit-icon" data-name={p.name} />,
}));

import { BoardCard, BoardMessage, BoardPodium, BoardRow, RankTile, type PodiumEntry } from '../LeagueBoard';
import LeagueCarousel, { type LeagueCardData } from '../LeagueCarousel';
import { LeagueSelectorButton } from '../LeaguesTabChrome';
import LeagueFilterSheet from '../LeagueFilterSheet';
import OpponentPickerSheet from '../OpponentPickerSheet';
import UnitLeagueTable, { UnitLeagueTableView } from '../UnitLeagueTable';
import GroupLeagueStatsBoard, { GroupLeagueStatsBoardView } from '../GroupLeagueStatsBoard';
import { useLocaleStore } from '@/store/useLocaleStore';
import { Trophy } from 'lucide-react';
import type { UnitLeagueRange, UnitLeagueResult } from '@/features/arena/services/unit-league.service';
import type { GroupBoard } from '@/features/arena/services/league-scope-keys';
import type { ScopeCompetitionEntry } from '@/features/arena/services/ranking.service';

// Monday 19.10.2026 09:00 local.
const NOW = new Date('2026-10-19T09:00:00');
const noop = () => {};
const html = (el: ReactElement) => renderToStaticMarkup(el).replaceAll('<!-- -->', '');
const snap = (name: string) => `./__snapshots__/league-boards-i18n/${name}.html`;
const V = [false, true] as const;
const vName = (v2: boolean) => (v2 ? 'v2' : 'v1');
const LOCALE_DEFAULTS = { ...useLocaleStore.getInitialState() };

beforeAll(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
});
afterAll(() => {
  vi.useRealTimers();
  Object.assign(useLocaleStore.getInitialState(), LOCALE_DEFAULTS);
});
beforeEach(() => {
  flags.enableHomeV2 = false;
  userState.profile = { id: 'u1', core: { name: 'דנה', isSuperAdmin: false } };
  Object.assign(useLocaleStore.getInitialState(), { gender: 'other' });
});

// ── LeagueBoard ──────────────────────────────────────────────────────────────

describe('LeagueBoard pieces', () => {
  it('rank tiles 1..4', async () => {
    await expect([1, 2, 3, 4].map((r) => html(<RankTile rank={r} />)).join('\n')).toMatchFileSnapshot(snap('rank-tiles'));
  });
  it('rows + card + message', async () => {
    const out = [
      html(
        <BoardCard title="כותרת" subtitle="תת" actions={<span />}>
          <BoardRow rank={1} name="נועה" nameTag="(את/ה)" sub="שורה" value="12" unit="ימים" isMe />
          <BoardRow rank={5} name="אבי" value="3" />
        </BoardCard>,
      ),
      html(<BoardMessage icon={Trophy} title="אין" body="גוף" />),
    ];
    await expect(out.join('\n\n')).toMatchFileSnapshot(snap('board-rows'));
  });
  it('podium, me in second / initials and buildings', async () => {
    const e = (key: string, extra: Partial<PodiumEntry> = {}): PodiumEntry => ({ key, name: `שם ${key}`, value: '1,234', unit: 'צעדים', ...extra });
    const out = [
      html(<BoardPodium entries={[e('a', { initial: 'א', sub: '3 פעילים' }), e('b', { isMe: true, initial: 'ב' }), e('c')]} />),
      html(<BoardPodium entries={[e('a'), e('b', { sub: 'x' }), e('c', { isMe: true })]} />),
    ];
    await expect(out.join('\n\n')).toMatchFileSnapshot(snap('podium'));
  });
});

// ── LeagueCarousel + selector button ─────────────────────────────────────────

const CARDS: LeagueCardData[] = [
  { key: 'city', name: 'ליגת העיר', subtitle: 'תל אביב', memberCount: 1234, rank: 7 },
  { key: 'national', name: 'ארצי', memberCount: null, rank: null },
  { key: 'park', name: 'ליגת הפארק', subtitle: 'פארק הירקון', logoUrl: 'https://cdn.example/l.png', memberCount: 12, rank: 1 },
];

describe('LeagueCarousel', () => {
  it.each(['sheet', 'carousel'] as const)('%s mode: data, active city / loading', async (mode) => {
    const out = [
      html(<LeagueCarousel mode={mode} leagues={CARDS} selectedKey="city" onSelect={noop} activeFilterLabel="ריצה • שבועי" />),
      html(<LeagueCarousel mode={mode} leagues={CARDS} selectedKey="park" onSelect={noop} activeFilterLabel="כללי" createHref="/community?openCreate=true" />),
      html(<LeagueCarousel mode={mode} leagues={[]} selectedKey="city" onSelect={noop} activeFilterLabel="" isLoading />),
    ];
    await expect(out.join('\n\n')).toMatchFileSnapshot(snap(`carousel-${mode}`));
  });
  it('selector button: loading / no card / card with subtitle + rank / no rank', async () => {
    const out = [
      html(<LeagueSelectorButton isLoading activeCard={undefined} filterLabel="x" rank={null} expanded={false} onOpen={noop} />),
      html(<LeagueSelectorButton isLoading={false} activeCard={undefined} filterLabel="כללי • שבועי" rank={undefined} expanded={false} onOpen={noop} />),
      html(<LeagueSelectorButton isLoading={false} activeCard={CARDS[0]} filterLabel="ריצה • חודשי" rank={3} expanded onOpen={noop} />),
      html(<LeagueSelectorButton isLoading={false} activeCard={CARDS[2]} filterLabel="כללי" rank={null} expanded={false} onOpen={noop} />),
    ];
    await expect(out.join('\n\n')).toMatchFileSnapshot(snap('selector-button'));
  });
});

// ── Sheets ───────────────────────────────────────────────────────────────────

const SCOPE = (rank: number, name: string, score: number): ScopeCompetitionEntry => ({
  rank,
  scopeId: `s${rank}`,
  scopeName: name,
  totalScore: score,
  activeMemberCount: 3,
});

describe('LeagueFilterSheet + OpponentPickerSheet', () => {
  it.each(V)('filter sheet v2=%s, each gender pill active / closed', async (v2) => {
    flags.enableHomeV2 = v2;
    const out = (['all', 'male', 'female'] as const).map((g) =>
      html(<LeagueFilterSheet isOpen onClose={noop} genderFilter={g} onGenderFilterChange={noop} />),
    );
    out.push(html(<LeagueFilterSheet isOpen={false} onClose={noop} genderFilter="all" onGenderFilterChange={noop} />));
    await expect(out.join('\n\n')).toMatchFileSnapshot(snap(`filter-sheet-${vName(v2)}`));
  });
  it.each(V)('opponent picker v2=%s', async (v2) => {
    flags.enableHomeV2 = v2;
    const out = [
      html(
        <OpponentPickerSheet
          isOpen
          onClose={noop}
          myEntry={SCOPE(3, 'נווה צדק', 12345)}
          candidates={[SCOPE(1, 'פלורנטין', 20000), SCOPE(2, 'רמת אביב', 1500), SCOPE(1234, 'yafo', 5)]}
          selectedOpponentId="s2"
          onSelect={noop}
        />,
      ),
      html(<OpponentPickerSheet isOpen={false} onClose={noop} myEntry={SCOPE(3, 'א', 1)} candidates={[]} selectedOpponentId={null} onSelect={noop} />),
    ];
    await expect(out.join('\n\n')).toMatchFileSnapshot(snap(`opponent-picker-${vName(v2)}`));
  });
});

// ── UnitLeagueTable ──────────────────────────────────────────────────────────

const UNIT = (i: number, extra: Partial<UnitLeagueResult['entries'][number]> = {}): UnitLeagueResult['entries'][number] => ({
  directoryId: `d${i}`,
  name: `פלוגה ${i}`,
  parentBreadcrumb: i % 2 ? 'גדוד 9307 · חטיבה 810' : null,
  avgSteps: 8000 - i * 900,
  avgKm: i === 2 ? null : 5.4 - i / 10,
  activeParticipantCount: 10 + i,
  isMyUnit: i === 4,
  unitId: `u${i}`,
  iconUrl: null,
  ...extra,
});
const RESULT = (n: number): UnitLeagueResult => ({
  entries: Array.from({ length: n }, (_, i) => UNIT(i + 1)),
  myUnitBelowFloor: null,
  updatedAt: new Date(NOW.getTime() - 25 * 60_000),
});
const RANGES: UnitLeagueRange[] = ['my_battalion_companies', 'my_brigade_battalions', 'all_companies', 'all_brigades'];

describe('UnitLeagueTableView', () => {
  it.each(RANGES)('range label %s (loading)', async (range) => {
    await expect(
      html(<UnitLeagueTableView range={range} onRangeChange={noop} isLoading result={null} onRefresh={noop} />),
    ).toMatchFileSnapshot(snap(`unit-range-${range}`));
  });
  it.each([false, true])('5 units + podium, showKm=%s', async (showKm) => {
    await expect(
      html(<UnitLeagueTableView range="all_companies" onRangeChange={noop} isLoading={false} result={RESULT(5)} onRefresh={noop} showKm={showKm} />),
    ).toMatchFileSnapshot(snap(`unit-five-km-${showKm}`));
  });
  it('2 units (no podium), updated just now / days ago, km', async () => {
    const out = [
      html(<UnitLeagueTableView range="all_brigades" onRangeChange={noop} isLoading={false} result={{ ...RESULT(2), updatedAt: NOW }} onRefresh={noop} showKm />),
      html(
        <UnitLeagueTableView
          range="all_brigades"
          onRangeChange={noop}
          isLoading={false}
          result={{ ...RESULT(2), updatedAt: new Date(NOW.getTime() - 3 * 86_400_000) }}
          onRefresh={noop}
        />,
      ),
    ];
    await expect(out.join('\n\n')).toMatchFileSnapshot(snap('unit-two'));
  });
  it('below floor / empty with and without updatedAt', async () => {
    const out = [
      html(
        <UnitLeagueTableView
          range="my_battalion_companies"
          onRangeChange={noop}
          isLoading={false}
          result={{ entries: [], myUnitBelowFloor: { name: 'פלוגה ג', activeParticipantCount: 2, needed: 3 }, updatedAt: null }}
          onRefresh={noop}
        />,
      ),
      html(<UnitLeagueTableView range="my_battalion_companies" onRangeChange={noop} isLoading={false} result={{ entries: [], myUnitBelowFloor: null, updatedAt: null }} onRefresh={noop} />),
      html(<UnitLeagueTableView range="my_battalion_companies" onRangeChange={noop} isLoading={false} result={null} onRefresh={noop} />),
    ];
    await expect(out.join('\n\n')).toMatchFileSnapshot(snap('unit-empty'));
  });
  it.each(V)('wrapper (loading) v2=%s', async (v2) => {
    flags.enableHomeV2 = v2;
    await expect(html(<UnitLeagueTable myOrgId="o1" myUnitPathIds={['a']} />)).toMatchFileSnapshot(snap(`unit-wrapper-${vName(v2)}`));
  });
});

// ── GroupLeagueStatsBoard ────────────────────────────────────────────────────

const MEMBERS = (n: number) =>
  Array.from({ length: n }, (_, i) => ({
    uid: `m${i}`,
    name: `חבר ${i}`,
    points: i === 3 ? 0 : 1500 - i * 50,
    stepsPoints: i % 3 === 0 ? 0 : 1200 - i * 10,
    km: i % 4 === 0 ? 0 : 12.34 - i / 10,
    isMe: i === 2,
  }));
const BOARD = (n: number): GroupBoard => ({
  totals: { points: 12345, stepsPoints: 4321, km: 123.4, activeMembers: n },
  members: MEMBERS(n),
});

describe('GroupLeagueStatsBoardView', () => {
  it.each(['weekly', 'monthly'] as const)('%s: loading / empty / no board / members / many', async (win) => {
    const out = [
      html(<GroupLeagueStatsBoardView board={null} loading timeWindow={win} onRefresh={noop} />),
      html(<GroupLeagueStatsBoardView board={null} loading={false} timeWindow={win} onRefresh={noop} />),
      html(<GroupLeagueStatsBoardView board={{ ...BOARD(0), members: [] }} loading={false} timeWindow={win} onRefresh={noop} />),
      html(<GroupLeagueStatsBoardView board={BOARD(5)} loading={false} timeWindow={win} onRefresh={noop} />),
      html(<GroupLeagueStatsBoardView board={BOARD(14)} loading timeWindow={win} onRefresh={noop} />),
    ];
    await expect(out.join('\n\n')).toMatchFileSnapshot(snap(`group-stats-${win}`));
  });
  it('wrapper (loading)', async () => {
    await expect(html(<GroupLeagueStatsBoard groupId="g1" timeWindow="daily" />)).toMatchFileSnapshot(snap('group-stats-wrapper'));
  });
});
