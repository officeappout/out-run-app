/**
 * Client mirror of functions/src/lib/league-scope-stats.ts periodKeysFor()
 * (Asia/Jerusalem, the Israeli week starts Sunday). Keep the two identical —
 * both test files pin the same dates.
 */
export type LeagueWindow = 'weekly' | 'monthly';

const pad = (n: number) => String(n).padStart(2, '0');

export function periodKeysFor(d: Date): Record<LeagueWindow, string> {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Jerusalem',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    weekday: 'short',
  }).formatToParts(d);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
  const y = Number(get('year'));
  const m = Number(get('month'));
  const day = Number(get('day'));
  const weekday = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(get('weekday'));
  const sunday = new Date(Date.UTC(y, m - 1, day - weekday));
  return {
    weekly: `W${sunday.getUTCFullYear()}-${pad(sunday.getUTCMonth() + 1)}-${pad(sunday.getUTCDate())}`,
    monthly: `M${y}-${pad(m)}`,
  };
}

/** One stats doc → the board's numbers for a category / gender filter. */
export interface ScopeStatsDoc {
  scopeId: string;
  totalCredit?: number;
  activeMemberCount?: number;
  byActivity?: Partial<Record<'strength' | 'cardio' | 'maintenance', { credit: number; members: number }>>;
  byGender?: Partial<Record<'male' | 'female', { credit: number; members: number }>>;
  /** The scope's km tally in meters (leagueStepsRollup) — shown, never points. */
  distanceMeters?: number;
}

/** Meters → km, one decimal. */
export function kmOf(meters: unknown): number {
  const m = typeof meters === 'number' && Number.isFinite(meters) && meters > 0 ? meters : 0;
  return Math.round(m / 100) / 10;
}

/**
 * km for a board row. Distance is one scope-wide tally (not split by
 * activity or gender), so it is only reported for the unfiltered board.
 */
function kmFields(
  d: ScopeStatsDoc,
  activeMemberCount: number,
  category: string,
  gender: string,
): { totalKm?: number; kmPerMember?: number } {
  if (category !== 'overall' || gender !== 'all') return {};
  const totalKm = kmOf(d.distanceMeters);
  return { totalKm, kmPerMember: activeMemberCount > 0 ? Math.round((totalKm / activeMemberCount) * 10) / 10 : 0 };
}

/**
 * Score + active members for one filter. Category and gender are stored as
 * separate breakdowns, so a category AND a gender together isn't answerable
 * from the sums — returns null and the caller falls back to the legacy path.
 */
export function pickScopeNumbers(
  d: ScopeStatsDoc,
  category: 'overall' | 'strength' | 'cardio' | 'maintenance',
  gender: 'all' | 'male' | 'female',
): { totalScore: number; activeMemberCount: number } | null {
  if (category !== 'overall' && gender !== 'all') return null;
  if (category !== 'overall') {
    const b = d.byActivity?.[category];
    return { totalScore: b?.credit ?? 0, activeMemberCount: b?.members ?? 0 };
  }
  if (gender !== 'all') {
    const b = d.byGender?.[gender];
    return { totalScore: b?.credit ?? 0, activeMemberCount: b?.members ?? 0 };
  }
  return { totalScore: d.totalCredit ?? 0, activeMemberCount: d.activeMemberCount ?? 0 };
}

/** A board row built from a stats doc. */
export interface ScopeStatsEntry {
  rank: number;
  scopeId: string;
  scopeName: string;
  totalScore: number;
  activeMemberCount: number;
  /** Unfiltered boards only (category overall, gender all). */
  totalKm?: number;
  /** totalKm ÷ active members, one decimal. */
  kmPerMember?: number;
}

/**
 * Stats docs → ranked board rows (by total; the board re-ranks by average
 * itself). Docs with no active member for the filter are dropped. null when
 * the filter can't be answered from the sums (category AND gender).
 */
export function buildScopeEntries(
  docs: ScopeStatsDoc[],
  names: Map<string, string>,
  category: 'overall' | 'strength' | 'cardio' | 'maintenance',
  gender: 'all' | 'male' | 'female',
  maxEntries: number,
): ScopeStatsEntry[] | null {
  if (category !== 'overall' && gender !== 'all') return null;
  return docs
    .map((d) => {
      const n = pickScopeNumbers(d, category, gender);
      return n && n.activeMemberCount > 0 ? { scopeId: d.scopeId, ...n, ...kmFields(d, n.activeMemberCount, category, gender) } : null;
    })
    .filter((r): r is Omit<ScopeStatsEntry, 'rank' | 'scopeName'> => !!r)
    .sort((a, b) => b.totalScore - a.totalScore)
    .slice(0, maxEntries)
    .map((r, i) => ({ rank: i + 1, ...r, scopeName: names.get(r.scopeId) ?? r.scopeId }));
}

/** The period before `key` — 'W2026-10-11' → 'W2026-10-04', 'M2026-01' → 'M2025-12'. */
export function previousPeriodKey(window: LeagueWindow, key: string): string {
  if (window === 'weekly') {
    const [y, m, d] = key.slice(1).split('-').map(Number);
    const prev = new Date(Date.UTC(y, m - 1, d - 7));
    return `W${prev.getUTCFullYear()}-${pad(prev.getUTCMonth() + 1)}-${pad(prev.getUTCDate())}`;
  }
  const [y, m] = key.slice(1).split('-').map(Number);
  return m === 1 ? `M${y - 1}-12` : `M${y}-${pad(m - 1)}`;
}

/** A row on the "most improved" board: this period's numbers + the gain. */
export interface ImprovedEntry extends ScopeStatsEntry {
  previousScore: number;
  delta: number;
}

/**
 * Most improved: this period's score minus the previous period's, per scope,
 * gains only, biggest first. null for an unanswerable filter (category AND
 * gender), like buildScopeEntries.
 */
export function buildImprovedEntries(
  current: ScopeStatsDoc[],
  previous: ScopeStatsDoc[],
  names: Map<string, string>,
  category: 'overall' | 'strength' | 'cardio' | 'maintenance',
  gender: 'all' | 'male' | 'female',
  maxEntries: number,
): ImprovedEntry[] | null {
  if (category !== 'overall' && gender !== 'all') return null;
  const prevScore = new Map<string, number>();
  for (const d of previous) prevScore.set(d.scopeId, pickScopeNumbers(d, category, gender)?.totalScore ?? 0);
  return current
    .map((d) => {
      const n = pickScopeNumbers(d, category, gender);
      if (!n || n.activeMemberCount <= 0) return null;
      const before = prevScore.get(d.scopeId) ?? 0;
      return { scopeId: d.scopeId, ...n, ...kmFields(d, n.activeMemberCount, category, gender), previousScore: before, delta: n.totalScore - before };
    })
    .filter((r): r is Omit<ImprovedEntry, 'rank' | 'scopeName'> => !!r && r.delta > 0)
    .sort((a, b) => b.delta - a.delta)
    .slice(0, maxEntries)
    .map((r, i) => ({ rank: i + 1, ...r, scopeName: names.get(r.scopeId) ?? r.scopeId }));
}

/**
 * The km board (measure=distance): scopes with any distance this period,
 * most km first. km are one scope-wide tally, so there is no category /
 * gender split — the caller sends the unfiltered board.
 */
export function buildDistanceEntries(docs: ScopeStatsDoc[], names: Map<string, string>, maxEntries: number): ScopeStatsEntry[] {
  return docs
    .map((d) => {
      const n = pickScopeNumbers(d, 'overall', 'all')!;
      return { scopeId: d.scopeId, ...n, ...kmFields(d, n.activeMemberCount, 'overall', 'all') };
    })
    .filter((r) => (r.totalKm ?? 0) > 0)
    .sort((a, b) => (b.totalKm ?? 0) - (a.totalKm ?? 0))
    .slice(0, maxEntries)
    .map((r, i) => ({ rank: i + 1, ...r, scopeName: names.get(r.scopeId) ?? r.scopeId }));
}

/** What a scope is, for the national boards (from its authorities doc). */
export type ScopeKind = 'city' | 'regional_council' | 'local_council' | 'neighborhood' | 'settlement' | 'other';

export function scopeKindOf(type: unknown, parentAuthorityId: unknown): ScopeKind {
  const t = String(type ?? '');
  if (t === 'settlement') return 'settlement';
  // Older seeds wrote kibbutzim/moshavim as local_council under a regional council.
  if (t === 'local_council' && typeof parentAuthorityId === 'string' && parentAuthorityId) return 'settlement';
  if (t === 'city' || t === 'regional_council' || t === 'local_council' || t === 'neighborhood') return t;
  return 'other';
}

// ── Group leagues (home v2, 18.10.2026) ─────────────────────────────────────

/** One member row of a group's league_scope_stats doc (members/{uid}). */
export interface GroupMemberStatsRow {
  uid: string;
  credit?: unknown;
  /** The part of `credit` that came from steps (leagueStepsRollup). */
  stepsCredit?: unknown;
  distanceMeters?: unknown;
}

export interface GroupBoardMember {
  uid: string;
  name: string;
  /** All league points this period (workouts + steps). */
  points: number;
  /** Of those, the points from steps (3 per 1,000). */
  stepsPoints: number;
  /** km this period — shown, never points. */
  km: number;
  isMe: boolean;
}

export interface GroupBoard {
  totals: { points: number; stepsPoints: number; km: number; activeMembers: number };
  members: GroupBoardMember[];
}

const num = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : 0);

/**
 * A group's own league board for one period, from its aggregate doc and its
 * member rows: totals (points, the steps share, km) and members ranked by
 * points — km and steps points ride along for display, never re-rank it.
 * Rows with neither points nor km are dropped; ties keep the input order.
 */
export function buildGroupBoard(
  doc: (ScopeStatsDoc & { byActivity?: Record<string, { credit?: number } | undefined> }) | null | undefined,
  rows: GroupMemberStatsRow[],
  names: Map<string, string>,
  myUid: string,
): GroupBoard {
  const members = rows
    .map((r, i) => ({
      i,
      m: {
        uid: r.uid,
        name: names.get(r.uid) ?? 'חבר/ת קבוצה',
        points: num(r.credit),
        // Never more than the points themselves (older rows have no split).
        stepsPoints: Math.min(num(r.stepsCredit), num(r.credit)),
        km: kmOf(r.distanceMeters),
        isMe: r.uid === myUid,
      },
    }))
    .filter(({ m }) => m.points > 0 || m.km > 0)
    .sort((a, b) => b.m.points - a.m.points || a.i - b.i)
    .map(({ m }) => m);
  return {
    totals: {
      points: num(doc?.totalCredit),
      stepsPoints: num(doc?.byActivity?.steps?.credit),
      km: kmOf(doc?.distanceMeters),
      activeMembers: num(doc?.activeMemberCount),
    },
    members,
  };
}
