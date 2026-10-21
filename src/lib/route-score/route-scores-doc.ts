/**
 * `route_scores/{routeId}` — the score lives in its OWN collection, not on the
 * OSM-derived route doc (owner decision Q4, keeps our enrichment clear of
 * ODbL share-alike). Derived data: every write is a full replace.
 *
 * Firestore returns `Timestamp` on read even for a field written as `Date`
 * (axioms §31) — `routeScoreDocFromStored` normalises it back to `Date`.
 * The db parameter is a minimal structural interface so the same code runs on
 * the Admin SDK, the emulator and the test fake.
 */
import type { SelectionDecision } from './select';
import type { SurfaceClass, SurfaceSource } from './surface-class';
import type { CertificateVerdict, RouteScore, RouteScoreInput, ScoreBand, ScoreComponentKey, SourceTier } from './types';
import type { RouteShadeStatus } from '../shade/route-shade';

export const ROUTE_SCORES_COLLECTION = 'route_scores';

export interface RouteScoreDoc {
  routeId: string;
  routeCollection: 'official_routes' | 'curated_routes';
  authorityId: string | null;
  city: string | null;
  name: string;
  score: number;
  confidence: number;
  band: ScoreBand;
  components: Record<ScoreComponentKey, { points: number; max: number; coverage: number }>;
  certificate: CertificateVerdict | null;
  sourceTier: SourceTier;
  /** Filter class for the app + the shares it came from (owner addition 21.10). */
  surfaceClass: SurfaceClass;
  surface: { pavedShare: number; unpavedShare: number; knownShare: number; source: SurfaceSource };
  /**
   * Shade (RC6): Technion summer SI. shadeShare/shadedPct are null unless
   * status is 'measured' (layer covers ≥ 50% of the route). Null = the city
   * has no shade layer / shade was not attempted.
   */
  shade: { status: RouteShadeStatus; shadeShare: number | null; shadedPct: number | null; coverage: number; source: string } | null;
  /** Null when the route was scored without a selection pass. */
  selection: SelectionDecision | null;
  selectionReason: string | null;
  scoreVersion: string;
  computedAt: Date;
}

export function buildRouteScoreDoc(
  input: RouteScoreInput,
  score: RouteScore,
  selection: { decision: SelectionDecision; reason: string } | null,
  opts: { routeCollection?: RouteScoreDoc['routeCollection']; now?: Date } = {},
): RouteScoreDoc {
  const components = {} as RouteScoreDoc['components'];
  for (const [k, c] of Object.entries(score.components) as [ScoreComponentKey, RouteScore['components'][ScoreComponentKey]][]) {
    components[k] = { points: c.points, max: c.max, coverage: Math.round(c.coverage * 100) / 100 };
  }
  return {
    routeId: input.id,
    routeCollection: opts.routeCollection ?? 'official_routes',
    authorityId: input.authorityId,
    city: input.city,
    name: input.name,
    score: score.score,
    confidence: score.confidence,
    band: score.band,
    components,
    certificate: input.certificate,
    sourceTier: input.sourceTier,
    surfaceClass: input.surfaceClass,
    surface: { ...input.surface },
    shade: input.shade
      ? { status: input.shade.status, shadeShare: input.shade.shadeShare, shadedPct: input.shade.shadedPct, coverage: input.shade.coverage, source: input.shade.source }
      : null,
    selection: selection?.decision ?? null,
    selectionReason: selection?.reason ?? null,
    scoreVersion: score.version,
    computedAt: opts.now ?? new Date(),
  };
}

/** Coerce a Timestamp-like (`toDate()`), a Date, or epoch millis to Date. */
export function toDateLike(v: unknown): Date | null {
  if (v instanceof Date) return v;
  if (v && typeof (v as { toDate?: unknown }).toDate === 'function') return (v as { toDate(): Date }).toDate();
  if (typeof v === 'number' && Number.isFinite(v)) return new Date(v);
  return null;
}

function shadeFromStored(v: any): RouteScoreDoc['shade'] {
  if (!v || typeof v !== 'object') return null;
  const n = (x: unknown) => (typeof x === 'number' && Number.isFinite(x) ? x : null);
  const status: RouteShadeStatus = v.status === 'measured' || v.status === 'low_coverage' ? v.status : 'no_data';
  return { status, shadeShare: n(v.shadeShare), shadedPct: n(v.shadedPct), coverage: n(v.coverage) ?? 0, source: String(v.source ?? '') };
}

/** Read-side normaliser — field-guarded; computedAt comes back as a real Date. */
export function routeScoreDocFromStored(raw: Record<string, any>): RouteScoreDoc {
  return {
    routeId: String(raw?.routeId ?? ''),
    routeCollection: raw?.routeCollection === 'curated_routes' ? 'curated_routes' : 'official_routes',
    authorityId: raw?.authorityId ?? null,
    city: raw?.city ?? null,
    name: String(raw?.name ?? ''),
    score: Number(raw?.score ?? 0),
    confidence: Number(raw?.confidence ?? 0),
    band: raw?.band === 'green' || raw?.band === 'red' ? raw.band : 'yellow',
    components: raw?.components ?? {},
    certificate: raw?.certificate ?? null,
    sourceTier: raw?.sourceTier ?? 'unknown',
    surfaceClass: raw?.surfaceClass ?? 'unknown',
    surface: {
      pavedShare: Number(raw?.surface?.pavedShare ?? 0),
      unpavedShare: Number(raw?.surface?.unpavedShare ?? 0),
      knownShare: Number(raw?.surface?.knownShare ?? 0),
      source: raw?.surface?.source ?? 'none',
    },
    shade: shadeFromStored(raw?.shade),
    selection: raw?.selection ?? null,
    selectionReason: raw?.selectionReason ?? null,
    scoreVersion: String(raw?.scoreVersion ?? ''),
    computedAt: toDateLike(raw?.computedAt) ?? new Date(0),
  };
}

export interface ScoreStoreDb {
  collection(name: string): {
    doc(id: string): {
      set(data: Record<string, unknown>): Promise<unknown>;
      get(): Promise<{ exists: boolean; data(): Record<string, any> | undefined }>;
    };
  };
}

/** Full-replace write of score docs, in chunks of `chunk` parallel sets. Returns the number written. */
export async function writeRouteScoreDocs(db: ScoreStoreDb, docs: RouteScoreDoc[], chunk = 50): Promise<number> {
  let n = 0;
  for (let k = 0; k < docs.length; k += chunk) {
    const part = docs.slice(k, k + chunk);
    await Promise.all(part.map((d) => db.collection(ROUTE_SCORES_COLLECTION).doc(d.routeId).set({ ...d })));
    n += part.length;
  }
  return n;
}

export async function readRouteScoreDoc(db: ScoreStoreDb, routeId: string): Promise<RouteScoreDoc | null> {
  const snap = await db.collection(ROUTE_SCORES_COLLECTION).doc(routeId).get();
  if (!snap.exists) return null;
  return routeScoreDocFromStored(snap.data() ?? {});
}
