/** Per-authority and national roll-ups for the runner's summary.json. Pure. */
import type { AuthorityRunResult, StageKey } from './stages';
import type { OrderTier } from './order';

export interface AuthoritySummary {
  authorityId: string;
  name: string;
  tier: OrderTier;
  sizeClass: string;
  populationKnown: boolean;
  quota: { min: number; max: number };
  pool: number;
  existing: number;
  newProposed: number;
  selected: { total: number; existing: number; new: number };
  selection: Record<string, number>;
  bands: { green: number; yellow: number; red: number };
  surface: { all: Record<string, number>; selected: Record<string, number> };
  selectedBySource: Partial<Record<StageKey, number>>;
  quotaMetAfter: StageKey | null;
  /** RC9: selected count at each urban floor (62 / 65 / 70 — the 70 row is the pre-RC9 rule). */
  floorCalibration?: Record<string, number>;
  stages: AuthorityRunResult['stages'];
  routes: Array<{
    id: string; name: string; stage: StageKey; isNew: boolean; score: number; band: string; surfaceClass: string; selection: string | null; reason: string | null; km: number | null;
    /** RC9: points per component (surface/geometry/safety/source/comfort/experience) and which inputs the urban measurement filled. */
    pts?: Record<string, number>;
    measured?: string[];
  }>;
}

export function summarizeAuthority(r: AuthorityRunResult, meta: { name: string; tier: OrderTier }): AuthoritySummary {
  const docById = new Map(r.score.docs.map((d) => [d.routeId, d]));
  const scoredById = new Map(r.score.scored.map((x) => [x.input.id, x]));
  const selectedIds = new Set(r.score.selection.selectedIds);
  const selectedBySource: Partial<Record<StageKey, number>> = {};
  let selExisting = 0, selNew = 0;
  for (const p of r.pool) {
    if (!selectedIds.has(p.id)) continue;
    selectedBySource[p.stage] = (selectedBySource[p.stage] ?? 0) + 1;
    if (p.isNew) selNew++; else selExisting++;
  }
  return {
    authorityId: r.authorityId,
    name: meta.name,
    tier: meta.tier,
    sizeClass: r.score.quota.sizeClass,
    populationKnown: r.score.quota.populationKnown,
    quota: { min: r.score.quota.total.min, max: r.score.quota.total.max },
    pool: r.pool.length,
    existing: r.pool.filter((p) => !p.isNew).length,
    newProposed: r.pool.filter((p) => p.isNew).length,
    selected: { total: selectedIds.size, existing: selExisting, new: selNew },
    selection: { ...r.score.selection.counts },
    bands: r.score.bands,
    surface: { all: r.score.bySurface, selected: { ...r.score.selection.selectedBySurface } },
    selectedBySource,
    quotaMetAfter: r.quotaMetAfter,
    floorCalibration: r.score.floorCalibration,
    stages: r.stages,
    routes: r.pool.map((p) => {
      const d = docById.get(p.id);
      return {
        id: p.id, name: String(p.data?.name ?? ''), stage: p.stage, isNew: p.isNew,
        score: d?.score ?? 0, band: d?.band ?? 'yellow', surfaceClass: d?.surfaceClass ?? 'unknown',
        selection: d?.selection ?? null, reason: d?.selectionReason ?? null,
        km: typeof p.data?.distance === 'number' ? p.data.distance : null,
        ...componentPoints(scoredById.get(p.id)),
      };
    }),
  };
}

function componentPoints(x: AuthorityRunResult['score']['scored'][number] | undefined): { pts?: Record<string, number>; measured?: string[] } {
  if (!x) return {};
  const pts: Record<string, number> = {};
  for (const [k, c] of Object.entries(x.score.components)) pts[k] = c.points;
  const measured = Object.keys(x.input.measuredBy ?? {});
  return { pts, ...(measured.length ? { measured } : {}) };
}

export interface NationalSummary {
  authorities: number;
  byTier: Record<string, number>;
  pool: number;
  newProposed: number;
  selected: number;
  selectedNew: number;
  quotaMet: number;
  bands: { green: number; yellow: number; red: number };
  surfaceSelected: Record<string, number>;
  perCity: Array<{ name: string; authorityId: string; selected: number; quotaMin: number; quotaMax: number; surfaceSelected: Record<string, number>; newProposed: number }>;
}

export function summarizeNation(rows: AuthoritySummary[]): NationalSummary {
  const n: NationalSummary = { authorities: rows.length, byTier: {}, pool: 0, newProposed: 0, selected: 0, selectedNew: 0, quotaMet: 0, bands: { green: 0, yellow: 0, red: 0 }, surfaceSelected: {}, perCity: [] };
  for (const r of rows) {
    n.byTier[r.tier] = (n.byTier[r.tier] ?? 0) + 1;
    n.pool += r.pool;
    n.newProposed += r.newProposed;
    n.selected += r.selected.total;
    n.selectedNew += r.selected.new;
    if (r.quotaMetAfter) n.quotaMet++;
    n.bands.green += r.bands.green; n.bands.yellow += r.bands.yellow; n.bands.red += r.bands.red;
    for (const [k, v] of Object.entries(r.surface.selected)) n.surfaceSelected[k] = (n.surfaceSelected[k] ?? 0) + v;
    n.perCity.push({ name: r.name, authorityId: r.authorityId, selected: r.selected.total, quotaMin: r.quota.min, quotaMax: r.quota.max, surfaceSelected: r.surface.selected, newProposed: r.newProposed });
  }
  return n;
}
