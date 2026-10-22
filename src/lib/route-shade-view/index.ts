/**
 * Route shade for DISPLAY (panel flag enable_route_shade_tag, default OFF):
 * the "🌳 מוצל X%" tag on route cards and the shade row in route details.
 *
 * Pure, no I/O, no React. The numbers come from data we already compute:
 *   - curated / official routes: `route_scores/{routeId}` (RC6 `shade`, RC7
 *     `components.comfort.hourlyShade`), read server-side by POST
 *     /api/routes/shade (the collection has no client rule — axiom §25);
 *   - GraphHopper loops: `shadedPct` on the loop DTO (/api/routes/generate
 *     with `shadeTag`), measured with the same measureRouteShade.
 *
 * Honesty rules (owner, 22.10.2026):
 *   - the tag shows only when shade is MEASURED (layer covers ≥ 50% of the
 *     route) — otherwise nothing, never "0%";
 *   - every detail row hides when it has no data.
 */
import type { HourlyProfileSummary } from '../shade-hourly/route-hourly';
import { SHADE_MIN_COVERAGE } from '../shade/route-shade';
import { utcToIsraelLocal } from '../shade-hourly/israel-time';
import { routeScoreDocFromStored } from '../route-score/route-scores-doc';

/** What a Route carries (optional `Route.shadeInfo`) and what POST /api/routes/shade returns per id. */
export interface RouteShadeInfo {
  /** 0..100 — % of the measured length on shaded segments (SI ≥ 0.25). Null = not measured. */
  shadedPct: number | null;
  /** 21 July, 06…19 local: mean shade (0..1) per hour, null where the sun is down. Absent = no hourly layer. */
  julyByHour?: Array<number | null>;
}

/** julyByHour[0] is 06:00, the last entry 19:00 (shade-hourly/route-hourly.ts). */
export const JULY_FIRST_HOUR = 6;
export const JULY_LAST_HOUR = 19;
const JULY_LEN = JULY_LAST_HOUR - JULY_FIRST_HOUR + 1;
/** "בצהריים" = 12:00, "אחה״צ" = 16:00 (local). */
export const NOON_HOUR = 12;
export const AFTERNOON_HOUR = 16;

const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/** The tag's integer %, or null (not measured, or a measured 0% — a tag never says "0%"). */
export function shadeTagPct(info: RouteShadeInfo | null | undefined): number | null {
  const v = info?.shadedPct;
  if (!finite(v)) return null;
  const pct = Math.round(Math.max(0, Math.min(100, v)));
  return pct >= 1 ? pct : null;
}

export interface HourlyShadeView {
  /** Shade at the current Israel hour (null outside 06–19 or with the sun down). */
  now: number | null;
  noon: number | null;
  afternoon: number | null;
}

function julyPctAt(july: Array<number | null>, hour: number): number | null {
  if (hour < JULY_FIRST_HOUR || hour > JULY_LAST_HOUR) return null;
  const v = july[hour - JULY_FIRST_HOUR];
  return finite(v) ? Math.round(Math.max(0, Math.min(1, v)) * 100) : null;
}

/** "עכשיו · בצהריים · אחה״צ" from the hourly profile; null when there is no hourly data at all. */
export function hourlyShadeView(info: RouteShadeInfo | null | undefined, at: Date): HourlyShadeView | null {
  const july = info?.julyByHour;
  if (!Array.isArray(july) || july.length !== JULY_LEN) return null;
  const view: HourlyShadeView = {
    now: julyPctAt(july, utcToIsraelLocal(at).hour),
    noon: julyPctAt(july, NOON_HOUR),
    afternoon: julyPctAt(july, AFTERNOON_HOUR),
  };
  return view.now == null && view.noon == null && view.afternoon == null ? null : view;
}

/** Structural slice of Route.qualitySignals (no feature import from lib). */
export interface LightingSignalLike {
  lighting?: { status?: string; litCoveragePct?: number | null } | null;
}

/** "מואר בלילה X%" — only from a computed lighting measurement with X ≥ 1. */
export function litAtNightPct(qualitySignals: LightingSignalLike | null | undefined): number | null {
  const l = qualitySignals?.lighting;
  if (!l || l.status !== 'computed' || !finite(l.litCoveragePct)) return null;
  const pct = Math.round(Math.max(0, Math.min(100, l.litCoveragePct)));
  return pct >= 1 ? pct : null;
}

/** Everything the detail row shows; null = render nothing. */
export interface RouteShadeRowView {
  shadedPct: number | null;
  hourly: HourlyShadeView | null;
  litPct: number | null;
}

export function routeShadeRowView(
  info: RouteShadeInfo | null | undefined,
  qualitySignals: LightingSignalLike | null | undefined,
  at: Date,
): RouteShadeRowView | null {
  const view = { shadedPct: shadeTagPct(info), hourly: hourlyShadeView(info, at), litPct: litAtNightPct(qualitySignals) };
  return view.shadedPct == null && view.hourly == null && view.litPct == null ? null : view;
}

// ── Server side: route_scores → RouteShadeInfo ─────────────────────────────

function julyFromStored(h: Partial<HourlyProfileSummary> | null | undefined): Array<number | null> | null {
  const arr = h?.julyByHour;
  if (!Array.isArray(arr) || arr.length !== JULY_LEN) return null;
  const out = arr.map((v) => (finite(v) ? Math.max(0, Math.min(1, v)) : null));
  return out.some((v) => v != null) ? out : null;
}

/** One stored `route_scores` doc → what the app shows; null when there is nothing measured. */
export function shadeInfoFromScoreDoc(raw: Record<string, unknown> | null | undefined): RouteShadeInfo | null {
  if (!raw || typeof raw !== 'object') return null;
  const s = routeScoreDocFromStored(raw).shade;
  const shadedPct = s && s.status === 'measured' && s.coverage >= SHADE_MIN_COVERAGE && finite(s.shadedPct) ? s.shadedPct : null;
  const comfort = (raw.components as Record<string, { hourlyShade?: Partial<HourlyProfileSummary> } | undefined> | undefined)?.comfort;
  const july = julyFromStored(comfort?.hourlyShade);
  if (shadedPct == null && !july) return null;
  return { shadedPct, ...(july ? { julyByHour: july } : {}) };
}

// ── POST /api/routes/shade request ─────────────────────────────────────────

export const ROUTE_SHADE_MAX_IDS = 30;

/** Ids the app generates on the fly — never a stored route, never asked about. */
const GENERATED_ID = /^(gh|gen|gen-oab|corridor|chain|flow|commute|preview|temp|tmp)-/;
const DOC_ID = /^[A-Za-z0-9_-]{1,128}$/;

/** A Firestore route doc id (curated / official), not an on-the-fly generated route. */
export function isStoredRouteId(id: unknown): id is string {
  return typeof id === 'string' && DOC_ID.test(id) && !GENERATED_ID.test(id);
}

/** `{ ids }` → unique stored ids (max ROUTE_SHADE_MAX_IDS), or an error code. */
export function parseRouteShadeRequest(body: unknown): { ids: string[] } | { error: string } {
  const ids = (body as { ids?: unknown } | null)?.ids;
  if (!Array.isArray(ids) || ids.length === 0) return { error: 'bad_ids' };
  if (ids.length > ROUTE_SHADE_MAX_IDS) return { error: 'too_many_ids' };
  const clean = Array.from(new Set(ids.filter(isStoredRouteId)));
  if (clean.length === 0) return { error: 'bad_ids' };
  return { ids: clean };
}

export interface RouteShadeResponse {
  /** Only ids with something measured; a missing id = nothing to show. */
  routes: Record<string, RouteShadeInfo>;
}
