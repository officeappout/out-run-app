// @vitest-environment jsdom
/**
 * i18n wave 2 batch x (namespace `community`, keys `leagues.*`): the league boards' states that only
 * appear after a tap or a load — the individuals board's dropdowns, its share / invite texts and its
 * two sheets (participant peek, how points work; v1 portal and v2 Sheet), the battle card's invite
 * text, the scopes board's filters panel and measure toggle, NationalLeagueBoard after its service
 * resolves / fails (filters, settlement regions, km, measures), and the scope / group containers' error.
 * Recorded BEFORE the extraction from unmodified origin/main.
 *
 * react-dom/client in jsdom, framer-motion animations skipped (MotionGlobalConfig.skipAnimations);
 * `style` attributes and React `:rN:` ids are normalised before comparing (animation / layout values,
 * not text). Static states live in league-boards-x-i18n-parity.test.tsx.
 */
process.env.TZ = 'UTC';

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, type ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';

const flags = { enableHomeV2: false };
const userState: { profile: Record<string, unknown> | null } = { profile: { id: 'u1', core: { isSuperAdmin: false } } };
const svc = vi.hoisted(() => ({
  scopes: null as null | (() => Promise<unknown>),
  groups: null as null | (() => Promise<unknown>),
  board: null as null | ((p: Record<string, unknown>) => Promise<unknown>),
}));

vi.mock('@/hooks/useFeatureFlags', () => ({ useFeatureFlags: () => ({ flags }) }));
vi.mock('@/features/user', () => ({
  useUserStore: (sel?: (s: typeof userState) => unknown) => (sel ? sel(userState) : userState),
}));
vi.mock('@/lib/firebase', () => ({ db: {}, auth: {}, app: {} }));
vi.mock('@/features/arena/services/ranking.service', () => ({
  getScopeCompetitionLeaderboard: () => svc.scopes!(),
  getGroupCompetitionLeaderboard: () => svc.groups!(),
  getLeagueBoard: (p: Record<string, unknown>) => svc.board!(p),
  formatPaceSecPerKm: () => '0:00',
}));
vi.mock('@/features/arena/hooks/useLeaderboard', () => ({ useLeaderboard: () => ({}) }));
vi.mock('@/features/content/programs/core/program.service', () => ({ getAllPrograms: () => new Promise(() => {}) }));
vi.mock('@/features/safecity/components/ViralUnlockSheet', () => ({ default: () => null }));

import { MotionGlobalConfig } from 'framer-motion';
import { NeighborhoodLeaderboardView, type NeighborhoodLeaderboardViewProps } from '../NeighborhoodLeaderboard';
import ScopeCompetitionLeaderboard, { ScopeCompetitionLeaderboardView } from '../ScopeCompetitionLeaderboard';
import { ScopeBattleCardView } from '../ScopeBattleCard';
import GroupLeaderboard from '../GroupLeaderboard';
import NationalLeagueBoard from '../NationalLeagueBoard';
import { useLocaleStore } from '@/store/useLocaleStore';
import type {
  LeaderboardEntry,
  LeaderboardTimeWindow,
  LeagueBoardEntry,
  ScopeCompetitionEntry,
} from '@/features/arena/services/ranking.service';

MotionGlobalConfig.skipAnimations = true;
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
if (!(globalThis as { ResizeObserver?: unknown }).ResizeObserver) {
  (globalThis as { ResizeObserver?: unknown }).ResizeObserver = class { observe() {} unobserve() {} disconnect() {} };
}
if (!window.matchMedia) {
  window.matchMedia = ((q: string) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, onchange: null, dispatchEvent: () => false })) as typeof window.matchMedia;
}

const NOW = new Date('2026-10-19T09:00:00Z');
const noop = () => {};
const snap = (name: string) => `./__snapshots__/league-boards-x-i18n/jsdom-${name}.html`;
const normalise = (s: string) =>
  s.replace(/ style="[^"]*"/g, '').replace(/:r[0-9a-z]+:/g, ':r:').replace(/«r[0-9a-z]+»/g, '«r»');
const body = () => normalise(document.body.innerHTML);
const WINDOWS: LeaderboardTimeWindow[] = ['daily', 'weekly', 'monthly'];
const LOCALE_DEFAULTS = { ...useLocaleStore.getInitialState() };

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
async function unmount() {
  await act(async () => root?.unmount());
  root = null;
  document.body.innerHTML = '';
}
async function click(el: Element | null | undefined) {
  if (!el) throw new Error('missing element');
  await act(async () => { (el as HTMLElement).dispatchEvent(new MouseEvent('click', { bubbles: true })); });
  await flush();
}
const btn = (text: string) =>
  Array.from(document.body.querySelectorAll('button')).find((b) => b.textContent?.trim() === text) ??
  Array.from(document.body.querySelectorAll('button')).find((b) => b.textContent?.includes(text));

const shared: string[] = [];
beforeAll(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
  Object.defineProperty(navigator, 'share', {
    configurable: true,
    value: (d: { text: string }) => { shared.push(d.text); return Promise.resolve(); },
  });
});
afterAll(() => {
  vi.useRealTimers();
  Object.assign(useLocaleStore.getInitialState(), LOCALE_DEFAULTS);
  useLocaleStore.setState(LOCALE_DEFAULTS);
});
beforeEach(() => {
  flags.enableHomeV2 = false;
  shared.length = 0;
  useLocaleStore.setState({ gender: 'other' });
});
afterEach(unmount);

// ── NeighborhoodLeaderboardView ──────────────────────────────────────────────

const person = (rank: number, extra: Partial<LeaderboardEntry> = {}): LeaderboardEntry => ({
  rank, uid: `u${rank}`, name: `משתתף ${rank}`, totalCredit: 40 - rank, workoutCount: 3, isCurrentUser: false, ...extra,
});
const PEOPLE = Array.from({ length: 6 }, (_, i) => person(i + 1, i === 4 ? { isCurrentUser: true, name: 'דנה' } : {}));

function nb(extra: Partial<NeighborhoodLeaderboardViewProps> = {}): ReactElement {
  const props: NeighborhoodLeaderboardViewProps = {
    scope: 'city', scopeLabel: 'תל אביב', entries: PEOPLE, myEntry: PEOPLE[4], totalParticipants: 6, isLoading: false,
    onRefresh: noop, localMode: 'general', onSetMode: noop, runSegment: 'all', setRunSegment: noop,
    strengthProgramId: null, setStrengthProgram: noop, programs: [], timeWindow: 'weekly', setTimeWindow: noop,
    genderFilter: 'all', setGenderFilter: noop, shouldBlur: false, socialUnlocked: true, myStreak: 4, ...extra,
  };
  return <NeighborhoodLeaderboardView {...props} />;
}

describe('NeighborhoodLeaderboardView', () => {
  it.each(['city', 'reserve'] as const)('%s: category dropdown open, then time dropdown open', async (scope) => {
    await mount(nb({ scope }));
    await click(btn('כללי'));
    const cat = body();
    await click(btn('שבועי'));
    await expect(`${cat}\n\n${body()}`).toMatchFileSnapshot(snap(`nb-dropdowns-${scope}`));
  });

  it('share + invite texts per window, with and without a scope label', async () => {
    for (const label of ['תל אביב', undefined]) {
      for (const w of WINDOWS) {
        await mount(nb({ timeWindow: w, scopeLabel: label }));
        await click(btn('שיתוף המיקום שלי'));
        await click(btn('הזמנת חברים'));
        await unmount();
      }
    }
    await expect(shared.join('\n')).toMatchFileSnapshot(snap('nb-share-texts'));
  });

  it.each([false, true])('peek + how-points sheets, v2=%s', async (v2) => {
    flags.enableHomeV2 = v2;
    const out: string[] = [];
    await mount(nb({ initialPeekUid: 'u2' }));
    out.push(body());
    await unmount();
    await mount(nb({ initialPeekUid: 'u5', localMode: 'steps' }));
    out.push(body());
    await unmount();
    for (const scope of ['city', 'tenant'] as const) {
      await mount(nb({ scope, initialHowOpen: true }));
      out.push(body());
      await unmount();
    }
    await expect(out.join('\n\n')).toMatchFileSnapshot(snap(`nb-sheets-v${v2 ? 2 : 1}`));
  });
});

// ── ScopeBattleCardView ──────────────────────────────────────────────────────

const scope = (rank: number, extra: Partial<ScopeCompetitionEntry> = {}): ScopeCompetitionEntry => ({
  rank, scopeId: `s${rank}`, scopeName: `שכונה ${rank}`, totalScore: 5000 - rank * 700,
  activeMemberCount: rank === 4 ? 1 : 3 + rank, totalKm: 120.5 - rank * 10, kmPerMember: 12.3 - rank, ...extra,
});
const SCOPES = [1, 2, 3, 4, 5].map((r) => scope(r));

describe('ScopeBattleCardView', () => {
  it('invite text with no opponent', async () => {
    const me = scope(2, { scopeName: 'הצפון הישן' });
    await mount(<ScopeBattleCardView myScopeId={me.scopeId} myEntry={me} entries={[me]} opponentScopeId={null} onSelectOpponent={noop} category="overall" />);
    await click(btn('הזמנת חברים'));
    await expect(shared.join('\n')).toMatchFileSnapshot(snap('battle-invite-text'));
  });
});

// ── ScopeCompetitionLeaderboard ──────────────────────────────────────────────

describe('ScopeCompetitionLeaderboard', () => {
  it.each(['points', 'km'] as const)('v2 %s: filters panel open, measure total', async (metric) => {
    await mount(
      <ScopeCompetitionLeaderboardView granularity="neighborhood" timeWindow="weekly" category="strength" isLoading={false} error={null} entries={SCOPES} onRefresh={noop} metric={metric} onMetricChange={noop} onCategoryChange={noop} />,
    );
    await click(btn(metric === 'km' ? 'ק״מ' : 'סינון'));
    const open = body();
    await click(btn('סה״כ'));
    await expect(`${open}\n\n${body()}`).toMatchFileSnapshot(snap(`scopes-filters-${metric}`));
  });

  it('container: load error (v1) and loaded (v2)', async () => {
    svc.scopes = () => Promise.reject(new Error('x'));
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    await mount(<ScopeCompetitionLeaderboard granularity="city" timeWindow="monthly" />);
    const err = body();
    await unmount();
    flags.enableHomeV2 = true;
    svc.scopes = () => Promise.resolve({ entries: SCOPES, generatedAt: NOW });
    await mount(<ScopeCompetitionLeaderboard granularity="neighborhood" timeWindow="weekly" cityAuthorityId="c1" onCategoryChange={noop} />);
    spy.mockRestore();
    await expect(`${err}\n\n${body()}`).toMatchFileSnapshot(snap('scopes-container'));
  });
});

// ── GroupLeaderboard ─────────────────────────────────────────────────────────

describe('GroupLeaderboard', () => {
  it('container: load error', async () => {
    svc.groups = () => Promise.reject(new Error('x'));
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    await mount(<GroupLeaderboard scope="global" scopeId={null} />);
    spy.mockRestore();
    await expect(body()).toMatchFileSnapshot(snap('groups-container-error'));
  });
});

// ── NationalLeagueBoard ──────────────────────────────────────────────────────

const lb = (rank: number, extra: Partial<LeagueBoardEntry> = {}): LeagueBoardEntry => ({
  ...scope(rank, { scopeName: `יישוב ${rank}` }),
  parentId: rank % 2 ? `p${rank}` : null,
  parentName: rank % 2 ? `מועצה ${rank}` : null,
  kind: 'city',
  delta: rank * 37,
  ...extra,
});
const LB = [1, 2, 3, 4, 5].map((r) => lb(r));
const REGIONS = [{ id: 'r1', name: 'גליל' }, { id: 'r2', name: 'נגב' }];

describe('NationalLeagueBoard', () => {
  it('unavailable / load error / empty per measure', async () => {
    const out: string[] = [];
    svc.board = async () => ({ entries: [], unavailable: true });
    await mount(<NationalLeagueBoard mode="settlements" timeWindow="daily" category="overall" />);
    out.push(body());
    await unmount();
    svc.board = () => Promise.reject(new Error('x'));
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    await mount(<NationalLeagueBoard mode="neighborhoods" timeWindow="weekly" category="overall" />);
    out.push(body());
    await unmount();
    spy.mockRestore();
    svc.board = async () => ({ entries: [] });
    await mount(<NationalLeagueBoard mode="settlements" timeWindow="weekly" category="overall" />);
    out.push(body());
    await click(btn('הכי משתפרים'));
    out.push(body());
    await click(btn('סינון'));
    await click(btn('ק״מ'));
    out.push(body());
    await expect(out.join('\n\n')).toMatchFileSnapshot(snap('national-states'));
  });

  it.each(['weekly', 'monthly'] as const)('%s: entries — avg / total / improved, mine marked', async (w) => {
    svc.board = async () => ({ entries: LB, regions: REGIONS });
    const out: string[] = [];
    await mount(<NationalLeagueBoard mode="settlements" timeWindow={w} category="cardio" myScopeIds={['s2', null]} />);
    out.push(body());
    await click(btn('סה״כ'));
    out.push(body());
    await click(btn('הכי משתפרים'));
    out.push(body());
    await expect(out.join('\n\n')).toMatchFileSnapshot(snap(`national-entries-${w}`));
  });

  it('filters: type chips, settlement regions, km (avg / total)', async () => {
    svc.board = async (p) => ({ entries: p.board === 'settlement' ? LB.slice(0, 2) : LB, regions: REGIONS });
    const out: string[] = [];
    await mount(<NationalLeagueBoard mode="settlements" timeWindow="weekly" category="overall" />);
    await click(btn('סינון'));
    out.push(body());
    await click(btn('מועצות'));
    out.push(body());
    await click(btn('קיבוצים ומושבים'));
    out.push(body());
    await click(btn('נגב'));
    out.push(body());
    await click(btn('ק״מ'));
    out.push(body());
    await click(btn('סה״כ'));
    out.push(body());
    await unmount();
    await mount(<NationalLeagueBoard mode="neighborhoods" timeWindow="monthly" category="strength" />);
    await click(btn('סינון'));
    out.push(body());
    await expect(out.join('\n\n')).toMatchFileSnapshot(snap('national-filters'));
  });
});
