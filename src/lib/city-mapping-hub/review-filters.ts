/**
 * Pending-route review filters (owner 24.10.2026) — shared by the approval
 * center's routes tab and the hub's nationwide bulk approve, and RE-APPLIED by
 * the server at write time (bulk-routes.server.ts), so a filtered bulk action
 * can never write a route outside the filter the admin confirmed.
 *
 * Score comes from route_scores (the route doc carries none); lowConfidenceReason
 * too (e.g. 'low_score_fill' from the nationwide city low floor). Pure, no I/O.
 */

export type AuthorityKind = 'municipal' | 'regional';
export type AuthorityKindFilter = 'all' | AuthorityKind;
export type LowConfidenceFilter = 'any' | 'only' | 'exclude';
export type ActivityFilter = 'all' | 'pedestrian' | 'cycling';

export interface RouteReviewFilter {
  authorityKind: AuthorityKindFilter;
  /** Inclusive integer bounds; null = open. Any bound excludes a route with no score. */
  scoreMin: number | null;
  scoreMax: number | null;
  lowConfidence: LowConfidenceFilter;
  /** Approval-center list filters, re-checked on the server too (absent = not filtered). */
  city?: string | null;
  activity?: ActivityFilter;
  nameQuery?: string | null;
}

/** What the filter is judged on, per route. */
export interface RouteReviewFacts {
  score: number | null;
  lowConfidenceReason: string | null;
  authorityKind: AuthorityKind | null;
  city?: string | null;
  activityType?: string | null;
  name?: string | null;
}

export const DEFAULT_REVIEW_FILTER: RouteReviewFilter = { authorityKind: 'all', scoreMin: null, scoreMax: null, lowConfidence: 'any' };

/** The hub's nationwide approve default: ≥70 and never a low-confidence route unless the admin opts in. */
export const NATIONWIDE_APPROVE_DEFAULT_FILTER: RouteReviewFilter = { authorityKind: 'all', scoreMin: 70, scoreMax: null, lowConfidence: 'exclude' };

/** Same split as the nationwide runner's --kind (scripts/routes-nationwide): regional_council vs everything else. */
export function authorityKindOf(type: unknown): AuthorityKind {
  return type === 'regional_council' ? 'regional' : 'municipal';
}

export const AUTHORITY_KIND_LABELS: Record<AuthorityKindFilter, string> = { all: 'הכל', municipal: 'עירייה', regional: 'מועצה אזורית' };

export interface ScorePreset { id: string; label: string; min: number | null; max: number | null }
export const SCORE_PRESETS: readonly ScorePreset[] = [
  { id: 'all', label: 'כל הציונים', min: null, max: null },
  { id: '70+', label: '70+', min: 70, max: null },
  { id: '62-69', label: '62–69', min: 62, max: 69 },
  { id: '55-61', label: '55–61', min: 55, max: 61 },
  { id: 'lt55', label: '<55', min: null, max: 54 },
];

/** The preset matching a range, or 'custom'. */
export function presetIdOf(min: number | null, max: number | null): string {
  return SCORE_PRESETS.find((p) => p.min === min && p.max === max)?.id ?? 'custom';
}

const PEDESTRIAN = new Set(['walking', 'running']);

export function matchesReviewFilter(m: RouteReviewFacts, f: RouteReviewFilter): boolean {
  if (f.authorityKind !== 'all' && m.authorityKind !== f.authorityKind) return false;
  // A missing score never satisfies a bound (never "0 that isn't really 0").
  if (f.scoreMin != null && (m.score == null || m.score < f.scoreMin)) return false;
  if (f.scoreMax != null && (m.score == null || m.score > f.scoreMax)) return false;
  const low = !!m.lowConfidenceReason;
  if (f.lowConfidence === 'only' && !low) return false;
  if (f.lowConfidence === 'exclude' && low) return false;
  if (f.city && m.city !== f.city) return false;
  if (f.activity === 'cycling' && m.activityType !== 'cycling') return false;
  if (f.activity === 'pedestrian' && !PEDESTRIAN.has(String(m.activityType ?? ''))) return false;
  const q = f.nameQuery?.trim().toLowerCase();
  if (q && !String(m.name ?? '').toLowerCase().includes(q)) return false;
  return true;
}

export function describeScoreRange(min: number | null, max: number | null): string {
  if (min == null && max == null) return 'כל הציונים';
  if (min != null && max == null) return `ציון ${min}+`;
  if (min == null && max != null) return `ציון ≤${max}`;
  return `ציון ${min}–${max}`;
}

/** One Hebrew line for the confirmation dialogs. */
export function describeReviewFilter(f: RouteReviewFilter): string {
  const parts: string[] = [];
  if (f.city) parts.push(`עיר: ${f.city}`);
  if (f.activity === 'cycling') parts.push('אופניים');
  if (f.activity === 'pedestrian') parts.push('הליכה / ריצה');
  if (f.nameQuery?.trim()) parts.push(`שם מכיל "${f.nameQuery.trim()}"`);
  parts.push(`סוג רשות: ${AUTHORITY_KIND_LABELS[f.authorityKind]}`);
  parts.push(describeScoreRange(f.scoreMin, f.scoreMax));
  if (f.lowConfidence === 'only') parts.push('ביטחון נמוך בלבד');
  if (f.lowConfidence === 'exclude') parts.push('ללא ביטחון נמוך');
  return parts.join(' · ');
}

/** Parse a score bound typed by the admin: '' → null; non-integers are rounded; out-of-range clamps to 0..100. */
export function parseScoreBound(v: string): number | null {
  const t = v.trim();
  if (!t) return null;
  const n = Number(t);
  if (!Number.isFinite(n)) return null;
  return Math.max(0, Math.min(100, Math.round(n)));
}

const bound = (v: unknown): number | null | undefined => {
  if (v == null) return null;
  return typeof v === 'number' && Number.isInteger(v) && v >= 0 && v <= 100 ? v : undefined;
};
const shortStr = (v: unknown, max: number): string | null | undefined => {
  if (v == null || v === '') return null;
  return typeof v === 'string' && v.length <= max ? v : undefined;
};

/** Server-side parse of a filter sent with a bulk request. Strict: anything malformed is an error, never "no filter". */
export function parseReviewFilter(raw: unknown): { ok: true; value: RouteReviewFilter } | { ok: false; error: string } {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { ok: false, error: 'filter must be an object' };
  const r = raw as Record<string, unknown>;
  const authorityKind = r.authorityKind ?? 'all';
  if (authorityKind !== 'all' && authorityKind !== 'municipal' && authorityKind !== 'regional') return { ok: false, error: 'invalid filter.authorityKind' };
  const scoreMin = bound(r.scoreMin);
  const scoreMax = bound(r.scoreMax);
  if (scoreMin === undefined || scoreMax === undefined) return { ok: false, error: 'filter score bounds must be integers 0..100 or null' };
  if (scoreMin != null && scoreMax != null && scoreMin > scoreMax) return { ok: false, error: 'filter.scoreMin > filter.scoreMax' };
  const lowConfidence = r.lowConfidence ?? 'any';
  if (lowConfidence !== 'any' && lowConfidence !== 'only' && lowConfidence !== 'exclude') return { ok: false, error: 'invalid filter.lowConfidence' };
  const activity = r.activity ?? 'all';
  if (activity !== 'all' && activity !== 'pedestrian' && activity !== 'cycling') return { ok: false, error: 'invalid filter.activity' };
  const city = shortStr(r.city, 200);
  const nameQuery = shortStr(r.nameQuery, 200);
  if (city === undefined || nameQuery === undefined) return { ok: false, error: 'invalid filter.city / filter.nameQuery' };
  return { ok: true, value: { authorityKind, scoreMin, scoreMax, lowConfidence, city, activity, nameQuery } };
}

// ── Approval center: list rows + server meta → filtered set → per-authority plan ──

/** The server's per-route review data (a subset of bulk-approve.logic's PendingRouteCandidate). */
export interface ReviewMeta {
  authorityId: string;
  score: number | null;
  lowConfidenceReason: string | null;
  authorityKind: AuthorityKind | null;
  geometry: 'ok' | 'gap' | 'unmeasured';
}

/** A row of the approval center's routes queue. */
export interface ReviewRow {
  id: string;
  title: string;
  authorityId?: string | null;
  city?: string | null;
  activityType?: string | null;
}

export function reviewFactsOf(row: ReviewRow, meta: ReviewMeta | undefined): RouteReviewFacts {
  return {
    score: meta?.score ?? null,
    lowConfidenceReason: meta?.lowConfidenceReason ?? null,
    authorityKind: meta?.authorityKind ?? null,
    city: row.city ?? null,
    activityType: row.activityType ?? null,
    name: row.title,
  };
}

export function filterReviewRows<T extends ReviewRow>(rows: readonly T[], meta: ReadonlyMap<string, ReviewMeta>, f: RouteReviewFilter): T[] {
  return rows.filter((r) => matchesReviewFilter(reviewFactsOf(r, meta.get(r.id)), f));
}

export type FilteredAction = 'approve' | 'reject';

export interface FilteredActionPlan {
  perAuthority: Array<{ authorityId: string; name: string; count: number; ids: string[] }>;
  /** Ids that will be sent (the server re-checks every one). */
  total: number;
  /** No authority to scope the server call to — never sent. */
  unattributed: number;
  /** Approve only: a known straight-bridge gap / unmeasured path — never sent. */
  geometryExcluded: number;
}

/**
 * Group the filtered rows by authority (the server's attribution first, then the doc's own),
 * dropping what the server would refuse anyway. Biggest authority first.
 */
export function planFilteredAction(
  rows: readonly ReviewRow[], meta: ReadonlyMap<string, ReviewMeta>, action: FilteredAction, names: ReadonlyMap<string, string> = new Map(),
): FilteredActionPlan {
  const by = new Map<string, string[]>();
  let unattributed = 0;
  let geometryExcluded = 0;
  for (const r of rows) {
    const m = meta.get(r.id);
    const authorityId = m?.authorityId || r.authorityId || null;
    if (!authorityId) { unattributed++; continue; }
    if (action === 'approve' && m && m.geometry !== 'ok') { geometryExcluded++; continue; }
    const l = by.get(authorityId);
    if (l) l.push(r.id); else by.set(authorityId, [r.id]);
  }
  const perAuthority = Array.from(by, ([authorityId, ids]) => ({ authorityId, name: names.get(authorityId) ?? authorityId, count: ids.length, ids }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, 'he'));
  return { perAuthority, total: perAuthority.reduce((s, a) => s + a.count, 0), unattributed, geometryExcluded };
}
