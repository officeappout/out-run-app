/**
 * `scripts/city-inventory/run.ts --all` (RC8 step 4): which authorities, in
 * which order, a resumable checkpoint, and the national readiness roll-up.
 * Pure — the script does the reads and the file I/O.
 *
 * Order (same idea as the nationwide routes runner): paying clients → big
 * cities (population ≥ 200k) → regional councils → everything else by
 * population. Only city / local_council / regional_council WITH a stored
 * boundary are inventoried (axioms §23: no boundary, no inventory).
 */
import type { AuthorityType, InventoryLayerKey, ReadinessLevel } from './types';

export type InventoryTier = 'client' | 'large_city' | 'regional_council' | 'other';
export const INVENTORY_TIERS: readonly InventoryTier[] = ['client', 'large_city', 'regional_council', 'other'];
export const LARGE_CITY_POPULATION = 200_000;
const INVENTORY_TYPES: readonly AuthorityType[] = ['city', 'local_council', 'regional_council'];

export interface InventoryAuthorityRow {
  id: string;
  name: string;
  type: string | null;
  population: number | null;
  isActiveClient: boolean;
  hasBoundary: boolean;
}

export interface OrderedInventoryAuthority extends InventoryAuthorityRow { tier: InventoryTier }

export function inventoryTier(a: InventoryAuthorityRow): InventoryTier {
  if (a.isActiveClient) return 'client';
  if (a.type !== 'regional_council' && (a.population ?? 0) >= LARGE_CITY_POPULATION) return 'large_city';
  if (a.type === 'regional_council') return 'regional_council';
  return 'other';
}

export function orderInventoryAuthorities(rows: InventoryAuthorityRow[]): { ordered: OrderedInventoryAuthority[]; skippedNoBoundary: InventoryAuthorityRow[] } {
  const eligible = rows.filter((r) => INVENTORY_TYPES.includes(r.type as AuthorityType));
  const skippedNoBoundary = eligible.filter((r) => !r.hasBoundary);
  const ordered = eligible
    .filter((r) => r.hasBoundary)
    .map((r) => ({ ...r, tier: inventoryTier(r) }))
    .sort((a, b) => INVENTORY_TIERS.indexOf(a.tier) - INVENTORY_TIERS.indexOf(b.tier) || (b.population ?? 0) - (a.population ?? 0) || a.name.localeCompare(b.name));
  return { ordered, skippedNoBoundary };
}

export interface InventoryDone {
  name: string;
  tier: InventoryTier;
  status: 'done' | 'error';
  finishedAt: string;
  level?: ReadinessLevel;
  score?: number;
  missing?: InventoryLayerKey[];
  blockers?: string[];
  approvedRoutes?: number;
  file?: string;
  note?: string;
}

export interface InventoryCheckpoint {
  kind: 'city-inventory-all';
  startedAt: string;
  apply: boolean;
  done: Record<string, InventoryDone>;
}

export function newInventoryCheckpoint(apply: boolean, now = new Date()): InventoryCheckpoint {
  return { kind: 'city-inventory-all', startedAt: now.toISOString(), apply, done: {} };
}

export function parseInventoryCheckpoint(raw: string): InventoryCheckpoint | null {
  try {
    const c = JSON.parse(raw);
    return c?.kind === 'city-inventory-all' && c.done && typeof c.done === 'object' ? c : null;
  } catch {
    return null;
  }
}

/** Ids still to run: not done, or errored when `retryErrors`. A dry-run checkpoint never continues an --apply run (or the reverse). */
export function inventoryTodo(cp: InventoryCheckpoint, ids: string[], retryErrors = false): string[] {
  return ids.filter((id) => !cp.done[id] || (retryErrors && cp.done[id].status === 'error'));
}

export interface ReadinessRollup {
  authorities: number;
  errors: number;
  levels: Record<ReadinessLevel, number>;
  byTier: Record<InventoryTier, Record<ReadinessLevel, number>>;
  /** Layers most often missing, most frequent first. */
  topMissing: Array<{ layer: string; count: number }>;
  /** Blocker texts most often seen, most frequent first. */
  topBlockers: Array<{ blocker: string; count: number }>;
  meanScore: number | null;
}

const zero = (): Record<ReadinessLevel, number> => ({ red: 0, yellow: 0, green: 0 });

/** Blocker texts carry numbers ("3/7 parks …"); bucket them by their wording. */
export function blockerKey(b: string): string {
  return b.replace(/\d+([.,]\d+)?/g, '#').replace(/\s+/g, ' ').trim();
}

export function rollupReadiness(done: Record<string, InventoryDone>, top = 8): ReadinessRollup {
  const rows = Object.values(done);
  const ok = rows.filter((r) => r.status === 'done' && r.level);
  const levels = zero();
  const byTier = Object.fromEntries(INVENTORY_TIERS.map((t) => [t, zero()])) as ReadinessRollup['byTier'];
  const missing = new Map<string, number>();
  const blockers = new Map<string, number>();
  for (const r of ok) {
    levels[r.level!]++;
    byTier[r.tier][r.level!]++;
    for (const m of r.missing ?? []) missing.set(m, (missing.get(m) ?? 0) + 1);
    for (const b of r.blockers ?? []) { const k = blockerKey(b); blockers.set(k, (blockers.get(k) ?? 0) + 1); }
  }
  const sorted = (m: Map<string, number>) => Array.from(m.entries()).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, top);
  const scores = ok.map((r) => r.score).filter((s): s is number => typeof s === 'number');
  return {
    authorities: ok.length,
    errors: rows.filter((r) => r.status === 'error').length,
    levels,
    byTier,
    topMissing: sorted(missing).map(([layer, count]) => ({ layer, count })),
    topBlockers: sorted(blockers).map(([blocker, count]) => ({ blocker, count })),
    meanScore: scores.length ? Math.round((scores.reduce((s, x) => s + x, 0) / scores.length) * 10) / 10 : null,
  };
}

export function formatRollupMarkdown(r: ReadinessRollup, done: Record<string, InventoryDone>): string {
  const lines: string[] = [];
  lines.push(`| | 🔴 red | 🟡 yellow | 🟢 green |`, `|---|---|---|---|`);
  lines.push(`| **all (${r.authorities})** | ${r.levels.red} | ${r.levels.yellow} | ${r.levels.green} |`);
  for (const t of INVENTORY_TIERS) lines.push(`| ${t} | ${r.byTier[t].red} | ${r.byTier[t].yellow} | ${r.byTier[t].green} |`);
  lines.push('', `Mean readiness score: ${r.meanScore ?? '—'} · errors: ${r.errors}`, '');
  lines.push('**Most often missing layers:** ' + (r.topMissing.map((m) => `${m.layer} (${m.count})`).join(', ') || '—'), '');
  lines.push('**Top blockers:**', ...r.topBlockers.map((b) => `- ${b.blocker} — ${b.count}`), '');
  lines.push('| authority | tier | readiness | score | approved routes | top blocker |', '|---|---|---|---|---|---|');
  const rows = Object.entries(done).sort((a, b) => INVENTORY_TIERS.indexOf(a[1].tier) - INVENTORY_TIERS.indexOf(b[1].tier) || (a[1].score ?? 0) - (b[1].score ?? 0));
  for (const [, d] of rows) {
    const badge = d.status === 'error' ? '✖ error' : d.level === 'green' ? '🟢' : d.level === 'yellow' ? '🟡' : '🔴';
    lines.push(`| ${d.name} | ${d.tier} | ${badge} | ${d.score ?? '—'} | ${d.approvedRoutes ?? '—'} | ${(d.status === 'error' ? d.note : d.blockers?.[0]) ?? ''} |`.replace(/\n/g, ' '));
  }
  return lines.join('\n');
}
