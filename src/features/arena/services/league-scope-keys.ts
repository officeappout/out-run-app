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
      return n && n.activeMemberCount > 0 ? { scopeId: d.scopeId, ...n } : null;
    })
    .filter((r): r is { scopeId: string; totalScore: number; activeMemberCount: number } => !!r)
    .sort((a, b) => b.totalScore - a.totalScore)
    .slice(0, maxEntries)
    .map((r, i) => ({ rank: i + 1, ...r, scopeName: names.get(r.scopeId) ?? r.scopeId }));
}
