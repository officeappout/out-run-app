/**
 * src/lib/route-decisions/decide-accuracy.ts — the accuracy agent's Stage 1
 * decision engine. Pure, I/O-free: takes a route's already-PERSISTED
 * qualitySignals (composition + optional lighting) plus a distance
 * classification and a duplicate-name count, and proposes ONE of
 * approve/edit/drop with a confidence and a human-readable reason.
 *
 * NEVER writes anything, NEVER calls Overpass/live OSM — Stage 1 is scoped
 * to already-persisted signals only (see .claude/plans/vectorized-twirling-
 * tiger.md, "Future direction" — positional trim hints are a later,
 * separate fast-follow that persists at certification time, not a live
 * fetch here).
 *
 * v2 decision logic (revised 31.08.2026 per David's review of the v1
 * draft): the earlier `genuinePct + ordinaryPct < 20 -> drop` rule is
 * REMOVED — it effectively dropped on high `otherPct`, and `otherPct` means
 * "the composition classifier couldn't match this segment to any known way
 * or category" — UNKNOWN, not evidence of a problem. Same unknown != false
 * principle as the qualitySignals.lighting honesty fix (route-lighting-
 * street-segments.node.ts). `drop` is now reserved for POSITIVE evidence
 * only: degenerate geometry, or a confidently-high sidewalk fraction. A
 * route the classifier mostly couldn't read gets a low-confidence
 * edit/review flag, never a confident drop — matching David's explicit
 * preference to salvage via trim over dropping (he refused to drop
 * טיילת אריה גוראל despite its street-comb tail).
 */

export type AccuracyVerdict = 'approve' | 'edit' | 'drop';

export interface AccuracyFlag {
  tier: 'drop' | 'edit';
  code: string;
  confidence: number;
  message: string;
}

export interface AccuracyDecision {
  verdict: AccuracyVerdict;
  confidence: number;
  reason: string;
  flags: AccuracyFlag[];
}

export type DistanceClassification =
  | 'canonical-km' | 'needs-conversion-meters-stored' | 'ambiguous-or-corrupt' | 'missing-distance' | 'no-geometry';

export interface AccuracyInput {
  composition: { sidewalkPct: number; genuinePct: number; ordinaryPct: number; otherPct: number };
  lighting?: { status: 'computed' | 'unknown'; litCoveragePct: number | null; isLit: boolean | null };
  pathPointCount: number;
  distance: { classification: DistanceClassification; normalizedKm: number | null };
  duplicateNameCount: number;
}

// ── Thresholds (named so they're easy to revisit — none of these are
// literally validated numbers yet; Stage 1's own report cross-references
// the Haifa 77-route hand-validated triage baseline specifically to tune
// these before trusting them on the other 4 cities). ──
export const SIDEWALK_DROP_THRESHOLD_PCT = 60;   // reused from the per-way SIDEWALK_FRACTION_THRESHOLD (0.6), applied whole-route
export const SIDEWALK_EDIT_MIN_PCT = 25;
export const GENUINE_EDIT_FLOOR_PCT = 50;         // matches discovery's own RECREATIONAL_MAJORITY_MIN_FRAC (0.5)
export const OTHER_UNKNOWN_REVIEW_THRESHOLD_PCT = 40;
export const ABSURD_DISTANCE_KM = 30;             // ported from scripts/audit-city-coverage.ts (unmerged branch audit/city-coverage)
export const MIN_VALID_PATH_POINTS = 2;

export function decideRouteAccuracy(input: AccuracyInput): AccuracyDecision {
  const flags: AccuracyFlag[] = [];
  const { composition, lighting, pathPointCount, distance, duplicateNameCount } = input;

  // ── Drop tier: positive evidence only ──
  if (pathPointCount < MIN_VALID_PATH_POINTS) {
    flags.push({ tier: 'drop', code: 'degenerate-geometry', confidence: 95, message: `Degenerate geometry — only ${pathPointCount} path point(s), need at least ${MIN_VALID_PATH_POINTS}.` });
  }
  if (composition.sidewalkPct >= SIDEWALK_DROP_THRESHOLD_PCT) {
    flags.push({ tier: 'drop', code: 'majority-sidewalk', confidence: 85, message: `${composition.sidewalkPct}% classified as sidewalk (>=${SIDEWALK_DROP_THRESHOLD_PCT}% whole-route bar) — same threshold the discovery gate applies per-way.` });
  }

  // ── Edit tier ──
  if (composition.sidewalkPct >= SIDEWALK_EDIT_MIN_PCT && composition.sidewalkPct < SIDEWALK_DROP_THRESHOLD_PCT) {
    const span = SIDEWALK_DROP_THRESHOLD_PCT - SIDEWALK_EDIT_MIN_PCT;
    const frac = (composition.sidewalkPct - SIDEWALK_EDIT_MIN_PCT) / span;
    const confidence = Math.round(40 + frac * 35);
    flags.push({ tier: 'edit', code: 'partial-sidewalk', confidence, message: `${composition.sidewalkPct}% classified as sidewalk — likely trimmable.` });
  }
  if (composition.genuinePct < GENUINE_EDIT_FLOOR_PCT) {
    flags.push({ tier: 'edit', code: 'below-genuine-floor', confidence: 50, message: `${composition.genuinePct}% genuine/dedicated surface — below the ${GENUINE_EDIT_FLOOR_PCT}% majority bar discovery itself requires.` });
  }
  if (composition.otherPct >= OTHER_UNKNOWN_REVIEW_THRESHOLD_PCT) {
    // Low confidence, deliberately: this is "we don't know", not "this is bad".
    flags.push({ tier: 'edit', code: 'unclassified-review', confidence: 30, message: `${composition.otherPct}% of this route's length couldn't be classified (unmatched to any known way/category) — needs a human look, not a confident verdict.` });
  }
  if (distance.classification === 'needs-conversion-meters-stored') {
    flags.push({ tier: 'edit', code: 'distance-unit-mismatch', confidence: 90, message: 'Stored distance looks like it is in meters, not km — recompute from geometry.' });
  } else if (distance.classification === 'missing-distance') {
    flags.push({ tier: 'edit', code: 'distance-missing', confidence: 85, message: 'Distance is missing or non-numeric — recompute from geometry.' });
  } else if (distance.classification === 'ambiguous-or-corrupt') {
    flags.push({ tier: 'edit', code: 'distance-ambiguous', confidence: 55, message: "Stored distance doesn't reconcile with the path geometry under either unit interpretation." });
  }
  if (distance.normalizedKm !== null && distance.normalizedKm > ABSURD_DISTANCE_KM) {
    flags.push({ tier: 'edit', code: 'absurd-distance', confidence: 50, message: `${distance.normalizedKm}km is unusually long for this route type — verify this isn't a stitching/import artifact.` });
  }
  if (duplicateNameCount > 0) {
    flags.push({ tier: 'edit', code: 'duplicate-name', confidence: 40, message: `${duplicateNameCount} other route(s) in this city share this exact name.` });
  }

  const dropFlags = flags.filter((f) => f.tier === 'drop');
  const editFlags = flags.filter((f) => f.tier === 'edit');

  let verdict: AccuracyVerdict;
  let confidence: number;
  let reasonParts: string[];

  if (dropFlags.length > 0) {
    verdict = 'drop';
    const maxConf = Math.max(...dropFlags.map((f) => f.confidence));
    confidence = Math.min(95, maxConf + (dropFlags.length >= 2 ? 5 : 0));
    reasonParts = [...dropFlags.map((f) => f.message), ...editFlags.map((f) => f.message)];
  } else if (editFlags.length > 0) {
    verdict = 'edit';
    confidence = Math.max(...editFlags.map((f) => f.confidence));
    reasonParts = editFlags.map((f) => f.message);
  } else {
    verdict = 'approve';
    confidence = 90; // deliberately not 100 — v1's signal set is partial by design
    reasonParts = [`Clean composition (${composition.genuinePct}% genuine, ${composition.sidewalkPct}% sidewalk, ${composition.ordinaryPct}% ordinary) — no distance or naming anomalies detected.`];
  }

  if (lighting?.status === 'computed') {
    reasonParts.push(`Lighting: ${lighting.litCoveragePct}% coverage${lighting.isLit ? ' (lit)' : ''} — informational only, not a factor in this verdict.`);
  }

  return { verdict, confidence, reason: reasonParts.join(' '), flags };
}
