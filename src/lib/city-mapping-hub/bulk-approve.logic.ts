/**
 * Pure logic for the hub's nationwide "approve pending routes" action:
 * filters, per-authority preview, typed-count confirmation, batching and
 * result aggregation. No I/O — everything here is unit-tested.
 */

/** 499 updates + 1 audit_logs row = 500, Firestore's per-batch write limit. */
import { GEOMETRY_GAP_REVIEW_M, GEOMETRY_GAP_SUSPICIOUS_M, maxVertexGapM } from '../route-geometry/gaps';
import { normalizeStoredRoutePath } from '@/features/parks/core/utils/routePath';

export const BULK_APPROVE_BATCH = 499;

/**
 * Straight-bridge guard. `ok` = measured and below the cut; `gap` = a suspicious
 * jump (excluded); `unmeasured` = no stored gap and no usable path (excluded —
 * never silently treated as clean).
 */
export type GeometryStatus = 'ok' | 'gap' | 'unmeasured';

export interface GeometryVerdict {
  status: GeometryStatus;
  gapM: number | null;
  source: 'stored' | 'path' | null;
}

/**
 * A stored route_scores.geometryGapM (exact segment test) is judged at ≥ 500 m.
 * Without it the gap is measured on the fly from the stored path's vertex steps,
 * judged at ≥ 1000 m instead (≈2 % of legitimate routes have a 500 m–1 km vertex step).
 */
export function classifyGeometry(storedGapM: unknown, rawPath: unknown): GeometryVerdict {
  if (typeof storedGapM === 'number' && Number.isFinite(storedGapM)) {
    return { status: storedGapM >= GEOMETRY_GAP_SUSPICIOUS_M ? 'gap' : 'ok', gapM: storedGapM, source: 'stored' };
  }
  const path = normalizeStoredRoutePath(rawPath);
  if (path.length < 2) return { status: 'unmeasured', gapM: null, source: null };
  const gapM = maxVertexGapM(path);
  return { status: gapM >= GEOMETRY_GAP_REVIEW_M ? 'gap' : 'ok', gapM, source: 'path' };
}

export interface PendingRouteCandidate {
  id: string;
  authorityId: string;
  name: string;
  distanceKm: number | null;
  score: number | null;
  origin: string | null;
  geometry: GeometryStatus;
  gapM: number | null;
}

export type OriginFilter = 'all' | 'known' | 'other';

export interface BulkApproveFilters {
  minScore: number;
  minKm: number;
  origin: OriginFilter;
  /** Authority ids the owner left selected. */
  authorityIds: ReadonlySet<string>;
}

/** "Known routes from research" are stamped origin:'web_research' by the nationwide pipeline. */
export const isKnownRouteOrigin = (origin: string | null): boolean => origin === 'web_research';

export function applyBulkFilters(cands: readonly PendingRouteCandidate[], f: BulkApproveFilters): PendingRouteCandidate[] {
  return cands.filter((c) => {
    if (!f.authorityIds.has(c.authorityId)) return false;
    if (c.geometry !== 'ok') return false; // suspicious / unmeasured geometry is never in the approve set
    // A missing score / length can never satisfy a positive minimum (never "0 that isn't really 0").
    if (f.minScore > 0 && (c.score == null || c.score < f.minScore)) return false;
    if (f.minKm > 0 && (c.distanceKm == null || c.distanceKm < f.minKm)) return false;
    const known = isKnownRouteOrigin(c.origin);
    if (f.origin === 'known' && !known) return false;
    if (f.origin === 'other' && known) return false;
    return true;
  });
}

export interface AuthorityPreview {
  authorityId: string;
  name: string;
  count: number;
  ids: string[];
}

export interface BulkPreview {
  perAuthority: AuthorityPreview[];
  total: number;
}

/** Group filtered candidates per authority (biggest first), with the exact total. */
export function buildBulkPreview(filtered: readonly PendingRouteCandidate[], names: ReadonlyMap<string, string>): BulkPreview {
  const by = new Map<string, string[]>();
  for (const c of filtered) {
    const l = by.get(c.authorityId);
    if (l) l.push(c.id); else by.set(c.authorityId, [c.id]);
  }
  const perAuthority = Array.from(by, ([authorityId, ids]) => ({ authorityId, name: names.get(authorityId) ?? authorityId, count: ids.length, ids }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, 'he'));
  return { perAuthority, total: perAuthority.reduce((s, a) => s + a.count, 0) };
}

/** Authorities that have pending candidates, for the checkbox list (unfiltered counts). */
export function authorityOptions(cands: readonly PendingRouteCandidate[], names: ReadonlyMap<string, string>): Array<{ authorityId: string; name: string; pending: number }> {
  const m = new Map<string, number>();
  for (const c of cands) m.set(c.authorityId, (m.get(c.authorityId) ?? 0) + 1);
  return Array.from(m, ([authorityId, pending]) => ({ authorityId, name: names.get(authorityId) ?? authorityId, pending }))
    .sort((a, b) => a.name.localeCompare(b.name, 'he'));
}

export interface GeometryExclusions { gap: number; unmeasured: number }

/** Counts of excluded routes among the selected authorities (before the other filters). */
export function geometryExclusions(cands: readonly PendingRouteCandidate[], authorityIds: ReadonlySet<string>): GeometryExclusions {
  const out = { gap: 0, unmeasured: 0 };
  for (const c of cands) {
    if (!authorityIds.has(c.authorityId)) continue;
    if (c.geometry === 'gap') out.gap++;
    else if (c.geometry === 'unmeasured') out.unmeasured++;
  }
  return out;
}

export const confirmPhrase = (total: number): string => `אשר ${total}`;

/** Accepts exactly "אשר N" or the bare number N, N being the preview total (> 0). */
export function isConfirmValid(input: string, total: number): boolean {
  if (!Number.isInteger(total) || total <= 0) return false;
  const t = input.trim().replace(/\s+/g, ' ');
  return t === confirmPhrase(total) || t === String(total);
}

export function chunk<T>(items: readonly T[], size = BULK_APPROVE_BATCH): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

export type SkipReason = 'not_found' | 'other_authority' | 'not_pending' | 'conflict' | 'geometry_gap' | 'geometry_unmeasured';

export interface BatchOutcome {
  updated: string[];
  skipped: Array<{ id: string; reason: SkipReason }>;
}

export interface AuthorityRunResult {
  authorityId: string;
  name: string;
  requested: number;
  approved: number;
  skipped: number;
  error: string | null;
}

export interface RunSummary {
  authorities: AuthorityRunResult[];
  requested: number;
  approved: number;
  skipped: number;
  failedAuthorities: AuthorityRunResult[];
}

export function summarizeRun(results: readonly AuthorityRunResult[]): RunSummary {
  return {
    authorities: [...results],
    requested: results.reduce((s, r) => s + r.requested, 0),
    approved: results.reduce((s, r) => s + r.approved, 0),
    skipped: results.reduce((s, r) => s + r.skipped, 0),
    failedAuthorities: results.filter((r) => r.error),
  };
}

export type ApproveBatchFn = (authorityId: string, ids: string[]) => Promise<BatchOutcome>;

/**
 * Sequential run, authority by authority, ≤ 500 ids per call. A failing batch is
 * recorded against its authority and the run CONTINUES; what was already
 * approved stays approved. Re-running is safe (the server re-checks pending).
 */
export async function runBulkApprove(
  preview: BulkPreview,
  approveBatch: ApproveBatchFn,
  onProgress?: (done: number, totalAuthorities: number, last: AuthorityRunResult) => void,
): Promise<RunSummary> {
  const results: AuthorityRunResult[] = [];
  for (const a of preview.perAuthority) {
    const r: AuthorityRunResult = { authorityId: a.authorityId, name: a.name, requested: a.count, approved: 0, skipped: 0, error: null };
    for (const ids of chunk(a.ids)) {
      try {
        const out = await approveBatch(a.authorityId, ids);
        r.approved += out.updated.length;
        r.skipped += out.skipped.length;
      } catch (err) {
        r.error = (err as Error)?.message || 'שגיאה';
        break;
      }
    }
    results.push(r);
    onProgress?.(results.length, preview.perAuthority.length, r);
  }
  return summarizeRun(results);
}
