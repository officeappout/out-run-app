/**
 * i18n wave 2 batch x (namespace `community`, keys `leagues.*`): the league boards #615 left —
 * NeighborhoodLeaderboardView (the individuals board), ScopeCompetitionLeaderboardView,
 * ScopeBattleCardView, GroupLeaderboardView, NationalLeagueBoard (loading) and the LeagueBoardSheets
 * contents (ParticipantPeek, HowPointsContent, ScopePointsContent), in every state a static render reaches.
 * The snapshots below were recorded BEFORE the extraction from unmodified origin/main.
 *
 * Static markup (react-dom/server, node env). useUserStore is a selector-hook fake (the real store
 * pulls Firebase in); gender cases write useLocaleStore.getInitialState(). `<!-- -->` is stripped
 * before comparing (react-dom/server's separator between adjacent text nodes — `מתוך {n}` is two
 * nodes before, one `t()` string after; not rendered text).
 *
 * States behind a tap or a load (dropdowns open, share / invite text, sheets, filters panel, measure
 * toggle, NationalLeagueBoard / containers after their service resolves or fails) are pinned by
 * league-boards-x-i18n-jsdom-parity.test.tsx.
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
  getScopeCompetitionLeaderboard: () => new Promise(() => {}),
  getGroupCompetitionLeaderboard: () => new Promise(() => {}),
  getLeagueBoard: () => new Promise(() => {}),
  formatPaceSecPerKm: (s: number) => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`,
}));
vi.mock('@/features/arena/hooks/useLeaderboard', () => ({ useLeaderboard: () => ({}) }));
vi.mock('@/features/content/programs/core/program.service', () => ({ getAllPrograms: () => new Promise(() => {}) }));
vi.mock('@/features/safecity/components/ViralUnlockSheet', () => ({ default: () => null }));

import { NeighborhoodLeaderboardView, type NeighborhoodLeaderboardViewProps } from '../NeighborhoodLeaderboard';
import { ScopeCompetitionLeaderboardView } from '../ScopeCompetitionLeaderboard';
import { ScopeBattleCardView } from '../ScopeBattleCard';
import { GroupLeaderboardView } from '../GroupLeaderboard';
import NationalLeagueBoard from '../NationalLeagueBoard';
import { HowPointsContent, ParticipantPeek, ScopePointsContent } from '../LeagueBoardSheets';
import { useLocaleStore } from '@/store/useLocaleStore';
import type {
  GroupCompetitionEntry,
  LeaderboardEntry,
  LeaderboardTimeWindow,
  ScopeCompetitionEntry,
} from '@/features/arena/services/ranking.service';
import type { Program } from '@/features/content/programs/core/program.types';

// Monday 19.10.2026 09:00 local.
const NOW = new Date('2026-10-19T09:00:00');
const noop = () => {};
const html = (el: ReactElement) => renderToStaticMarkup(el).replaceAll('<!-- -->', '');
const snap = (name: string) => `./__snapshots__/league-boards-x-i18n/${name}.html`;
const GENDERS = ['male', 'female', 'other'] as const;
const WINDOWS: LeaderboardTimeWindow[] = ['daily', 'weekly', 'monthly'];
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
const setGender = (g: 'male' | 'female' | 'other') => Object.assign(useLocaleStore.getInitialState(), { gender: g });

// ── NeighborhoodLeaderboardView ──────────────────────────────────────────────

const person = (rank: number, extra: Partial<LeaderboardEntry> = {}): LeaderboardEntry => ({
  rank,
  uid: `u${rank}`,
  name: `משתתף ${rank}`,
  totalCredit: 40 - rank,
  workoutCount: 10 - (rank % 5),
  isCurrentUser: false,
  ...extra,
});
const PEOPLE = (n: number, meAt = 5) =>
  Array.from({ length: n }, (_, i) => person(i + 1, i + 1 === meAt ? { isCurrentUser: true, name: 'דנה' } : {}));

const PROGRAMS = [{ id: 'p1', name: 'מתח', isMaster: false, movementPattern: 'pull' }] as unknown as Program[];

function nb(extra: Partial<NeighborhoodLeaderboardViewProps> = {}): ReactElement {
  const entries = extra.entries ?? PEOPLE(12);
  const props: NeighborhoodLeaderboardViewProps = {
    scope: 'city',
    scopeLabel: 'תל אביב',
    entries,
    myEntry: entries.find((e) => e.isCurrentUser) ?? null,
    totalParticipants: entries.length,
    isLoading: false,
    onRefresh: noop,
    localMode: 'general',
    onSetMode: noop,
    runSegment: 'all',
    setRunSegment: noop,
    strengthProgramId: null,
    setStrengthProgram: noop,
    programs: PROGRAMS,
    timeWindow: 'weekly',
    setTimeWindow: noop,
    genderFilter: 'all',
    setGenderFilter: noop,
    shouldBlur: false,
    socialUnlocked: true,
    myStreak: 4,
    ...extra,
  };
  return <NeighborhoodLeaderboardView {...props} />;
}

describe('NeighborhoodLeaderboardView', () => {
  it('loading, city / global / tenant / no scope label', async () => {
    const out = [
      html(nb({ isLoading: true })),
      html(nb({ isLoading: true, isGlobal: true, scopeLabel: undefined })),
      html(nb({ isLoading: true, scope: 'tenant', scopeLabel: 'יחידה 8200' })),
    ];
    await expect(out.join('\n\n')).toMatchFileSnapshot(snap('nb-loading'));
  });

  it.each(GENDERS)('empty board (3-step guide), %s', async (g) => {
    setGender(g);
    await expect(html(nb({ entries: [], myEntry: null, totalParticipants: 0 }))).toMatchFileSnapshot(snap(`nb-empty-${g}`));
  });

  it.each(WINDOWS)('full board, me at #5, %s', async (w) => {
    await expect(html(nb({ timeWindow: w }))).toMatchFileSnapshot(snap(`nb-full-${w}`));
  });

  it('tenant scope (active days), global, no scope label, 1234 participants', async () => {
    const out = [
      html(nb({ scope: 'tenant', scopeLabel: 'ארגון' })),
      html(nb({ isGlobal: true, scopeLabel: undefined, totalParticipants: 1234 })),
    ];
    await expect(out.join('\n\n')).toMatchFileSnapshot(snap('nb-tenant-global'));
  });

  it.each(['steps', 'distance', 'running', 'strength'] as const)('mode %s', async (mode) => {
    const out = [
      html(nb({ localMode: mode })),
      ...(mode === 'running'
        ? (['3k', '5k', '10k'] as const).map((seg) => html(nb({ localMode: mode, runSegment: seg })))
        : []),
      ...(mode === 'strength' ? [html(nb({ localMode: mode, strengthProgramId: 'p1' }))] : []),
    ];
    await expect(out.join('\n\n')).toMatchFileSnapshot(snap(`nb-mode-${mode}`));
  });

  it.each(GENDERS)('locked table (not unlocked / unlocked but city inactive), %s', async (g) => {
    setGender(g);
    const out = [
      html(nb({ shouldBlur: true, socialUnlocked: false })),
      html(nb({ shouldBlur: true, socialUnlocked: true })),
    ];
    await expect(out.join('\n\n')).toMatchFileSnapshot(snap(`nb-locked-${g}`));
  });

  it('sparse boards (1 and 3), me missing, me first, zero streak, active filters', async () => {
    const one = PEOPLE(1, 1);
    const three = PEOPLE(3, 9);
    const out = [
      html(nb({ entries: one, myEntry: one[0] })),
      html(nb({ entries: three, myEntry: null })),
      html(nb({ entries: PEOPLE(4, 1), timeWindow: 'monthly', genderFilter: 'female' })),
      html(nb({ entries: PEOPLE(6, 2).map((e) => ({ ...e, totalCredit: 0 })) })),
      html(nb({ scope: 'reserve', timeWindow: 'daily' })),
    ];
    await expect(out.join('\n\n')).toMatchFileSnapshot(snap('nb-sparse-misc'));
  });
});

// ── ScopeCompetitionLeaderboardView ──────────────────────────────────────────

const scope = (rank: number, extra: Partial<ScopeCompetitionEntry> = {}): ScopeCompetitionEntry => ({
  rank,
  scopeId: `s${rank}`,
  scopeName: `שכונה ${rank}`,
  totalScore: 5000 - rank * 700,
  activeMemberCount: rank === 4 ? 1 : 3 + rank,
  totalKm: rank === 2 ? 0 : 120.5 - rank * 10,
  kmPerMember: 12.3 - rank,
  ...extra,
});
const SCOPES = [1, 2, 3, 4, 5].map((r) => scope(r));

describe('ScopeCompetitionLeaderboardView', () => {
  it.each(['city', 'neighborhood'] as const)('%s: loading / error / empty per window', async (granularity) => {
    const out = [
      ...WINDOWS.map((w) =>
        html(<ScopeCompetitionLeaderboardView granularity={granularity} timeWindow={w} category="overall" isLoading error={null} entries={[]} onRefresh={noop} />),
      ),
      html(<ScopeCompetitionLeaderboardView granularity={granularity} timeWindow="weekly" category="overall" isLoading={false} error="שגיאה בטעינת הדירוג" entries={[]} onRefresh={noop} />),
      html(<ScopeCompetitionLeaderboardView granularity={granularity} timeWindow="weekly" category="overall" isLoading={false} error={null} entries={[]} onRefresh={noop} />),
      html(<ScopeCompetitionLeaderboardView granularity={granularity} timeWindow="weekly" category="overall" isLoading={false} error={null} entries={[]} onRefresh={noop} metric="km" onMetricChange={noop} />),
    ];
    await expect(out.join('\n\n')).toMatchFileSnapshot(snap(`scopes-states-${granularity}`));
  });

  it.each(GENDERS)('error retry button, %s', async (g) => {
    setGender(g);
    await expect(
      html(<ScopeCompetitionLeaderboardView granularity="city" timeWindow="weekly" category="overall" isLoading={false} error="שגיאה בטעינת הדירוג" entries={[]} onRefresh={noop} />),
    ).toMatchFileSnapshot(snap(`scopes-error-${g}`));
  });

  it.each(['overall', 'strength', 'cardio'] as const)('entries, category %s: v1 / v2 points / v2 km / chips', async (category) => {
    const out = [
      html(<ScopeCompetitionLeaderboardView granularity="neighborhood" timeWindow="monthly" category={category} isLoading={false} error={null} entries={SCOPES} onRefresh={noop} />),
      html(<ScopeCompetitionLeaderboardView granularity="neighborhood" timeWindow="weekly" category={category} isLoading={false} error={null} entries={SCOPES} onRefresh={noop} metric="points" onMetricChange={noop} onCategoryChange={noop} />),
      html(<ScopeCompetitionLeaderboardView granularity="city" timeWindow="daily" category={category} isLoading={false} error={null} entries={SCOPES} onRefresh={noop} metric="km" onMetricChange={noop} onCategoryChange={noop} />),
      html(<ScopeCompetitionLeaderboardView granularity="city" timeWindow="weekly" category={category} isLoading={false} error={null} entries={SCOPES.slice(0, 2)} onRefresh={noop} />),
    ];
    await expect(out.join('\n\n')).toMatchFileSnapshot(snap(`scopes-entries-${category}`));
  });
});

// ── ScopeBattleCardView ──────────────────────────────────────────────────────

describe('ScopeBattleCardView', () => {
  const me = scope(2, { scopeName: 'הצפון הישן', totalScore: 12345, activeMemberCount: 10, totalKm: 1240.4 });
  const them = scope(1, { scopeName: 'פלורנטין', totalScore: 9000, activeMemberCount: 5 });
  const third = scope(3, { scopeName: 'נווה צדק', totalScore: 100, activeMemberCount: 1, totalKm: 0 });

  it('no opponent yet (with / without group walk)', async () => {
    const out = [
      html(<ScopeBattleCardView myScopeId={me.scopeId} myEntry={me} entries={[me]} opponentScopeId={null} onSelectOpponent={noop} category="overall" />),
      html(<ScopeBattleCardView myScopeId={me.scopeId} myEntry={me} entries={[me]} opponentScopeId={null} onSelectOpponent={noop} category="overall" timeWindow="weekly" onGroupWalk={noop} />),
    ];
    await expect(out.join('\n\n')).toMatchFileSnapshot(snap('battle-empty'));
  });

  it.each(['overall', 'strength', 'cardio'] as const)('leading / trailing / km / windows, category %s', async (category) => {
    const out = [
      html(<ScopeBattleCardView myScopeId={me.scopeId} myEntry={me} entries={[them, me, third]} opponentScopeId={them.scopeId} onSelectOpponent={noop} category={category} />),
      ...WINDOWS.map((w) =>
        html(<ScopeBattleCardView myScopeId={me.scopeId} myEntry={me} entries={[them, me, third]} opponentScopeId={third.scopeId} onSelectOpponent={noop} category={category} timeWindow={w} showKm />),
      ),
      html(<ScopeBattleCardView myScopeId={third.scopeId} myEntry={third} entries={[them, me, third]} opponentScopeId={me.scopeId} onSelectOpponent={noop} category={category} timeWindow="weekly" showKm onGroupWalk={noop} />),
      html(<ScopeBattleCardView myScopeId={me.scopeId} myEntry={me} entries={[them, me]} opponentScopeId="missing" onSelectOpponent={noop} category={category} />),
    ];
    await expect(out.join('\n\n')).toMatchFileSnapshot(snap(`battle-${category}`));
  });
});

// ── GroupLeaderboardView ─────────────────────────────────────────────────────

const group = (rank: number, active: number): GroupCompetitionEntry => ({
  rank,
  groupId: `g${rank}`,
  groupName: `קבוצה ${rank}`,
  totalScore: 9999 - rank,
  avgScore: 2500 - rank * 300,
  activeMemberCount: active,
});

describe('GroupLeaderboardView', () => {
  it.each(WINDOWS)('%s: loading / empty / 5 groups / 2 groups', async (w) => {
    const out = [
      html(<GroupLeaderboardView timeWindow={w} isLoading error={null} entries={[]} onRefresh={noop} />),
      html(<GroupLeaderboardView timeWindow={w} isLoading={false} error={null} entries={[]} onRefresh={noop} />),
      html(<GroupLeaderboardView timeWindow={w} isLoading={false} error={null} entries={[group(1, 4), group(2, 1), group(3, 2), group(4, 1), group(5, 7)]} onRefresh={noop} />),
      html(<GroupLeaderboardView timeWindow={w} isLoading={false} error={null} entries={[group(1, 1), group(2, 3)]} onRefresh={noop} />),
    ];
    await expect(out.join('\n\n')).toMatchFileSnapshot(snap(`groups-${w}`));
  });
  it.each(GENDERS)('error + retry, %s', async (g) => {
    setGender(g);
    await expect(html(<GroupLeaderboardView timeWindow="weekly" isLoading={false} error="שגיאה בטעינת הדירוג" entries={[]} onRefresh={noop} />)).toMatchFileSnapshot(snap(`groups-error-${g}`));
  });
});

// ── NationalLeagueBoard (loading — the rest is jsdom) ────────────────────────

describe('NationalLeagueBoard', () => {
  it('settlements / neighborhoods per window (loading)', async () => {
    const out = (['settlements', 'neighborhoods'] as const).flatMap((mode) =>
      WINDOWS.map((w) => html(<NationalLeagueBoard mode={mode} timeWindow={w} category="overall" />)),
    );
    await expect(out.join('\n\n')).toMatchFileSnapshot(snap('national-loading'));
  });
});

// ── LeagueBoardSheets contents ───────────────────────────────────────────────

describe('LeagueBoardSheets contents', () => {
  it('participant peek: me with streak / first / ahead / behind / tie / running workouts / no total', async () => {
    const meE = person(4, { isCurrentUser: true, name: 'דנה', totalCredit: 20 });
    const out = [
      html(<ParticipantPeek entry={meE} myEntry={meE} totalParticipants={1234} mode="general" isSegmentMode={false} myStreak={6} onInvite={noop} />),
      html(<ParticipantPeek entry={meE} myEntry={meE} totalParticipants={12} mode="steps" isSegmentMode={false} myStreak={0} onInvite={noop} />),
      html(<ParticipantPeek entry={person(1, { totalCredit: 30 })} myEntry={meE} totalParticipants={12} mode="general" isSegmentMode={false} onInvite={noop} />),
      html(<ParticipantPeek entry={person(7, { totalCredit: 12 })} myEntry={meE} totalParticipants={12} mode="steps" isSegmentMode={false} onInvite={noop} />),
      html(<ParticipantPeek entry={person(5, { totalCredit: 20 })} myEntry={meE} totalParticipants={12} mode="distance" isSegmentMode={false} onInvite={noop} />),
      html(<ParticipantPeek entry={person(2)} myEntry={meE} totalParticipants={12} mode="running" isSegmentMode={false} onInvite={noop} />),
      html(<ParticipantPeek entry={person(3)} myEntry={null} totalParticipants={0} mode="general" isSegmentMode={false} onInvite={noop} />),
    ];
    await expect(out.join('\n\n')).toMatchFileSnapshot(snap('sheets-peek'));
  });
  it('how points work (tenant / not) + scope points', async () => {
    const out = [html(<HowPointsContent isTenant={false} />), html(<HowPointsContent isTenant />), html(<ScopePointsContent />)];
    await expect(out.join('\n\n')).toMatchFileSnapshot(snap('sheets-how'));
  });
});
