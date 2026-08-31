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
 * v3 decision logic (revised 31.08.2026 per David's Stage-1 review — the v2
 * queue was 196/278 edit, not actionable). Three changes:
 *
 * 1. `genuinePct < floor` is NO LONGER a standalone edit trigger. It flagged
 *    legitimate urban/street routes (e.g. Ashkelon's street loops) as
 *    "defective" purely for being street-composed, which they're entitled
 *    to be. Low genuinePct is now an INFORMATIONAL NOTE only (same
 *    treatment as lighting) — appended to the reason when true, never a
 *    scored AccuracyFlag, never able to move the verdict off approve by
 *    itself.
 * 2. `drop` is reserved for genuinely unusable geometry ONLY (degenerate,
 *    <MIN_VALID_PATH_POINTS). The whole-route sidewalkPct>=60% rule that
 *    used to drop moved to the edit tier instead (a trimmable-tail signal,
 *    same as the 25-60% band) — this directly resolves the 2 Haifa
 *    routes (שביל חיפה - הדר הכרמל, טיילת לואי) that v2 dropped but the
 *    fresh triage baseline showed were positionally trim-salvageable to
 *    100% genuine: with no positional data, "high sidewalk" is real
 *    evidence something needs a look, but not evidence it's unsalvageable
 *    — that distinction needs a human with the map open, not this agent.
 * 3. Duplicate-name is suppressed entirely (not even a note) once a name is
 *    shared by DUPLICATE_NAME_CONVENTION_THRESHOLD+ other routes in the
 *    same city — that's a naming CONVENTION (e.g. "שביל מסומן חיפה" x11 in
 *    Haifa, all real, distinct trails), not evidence of an accidental
 *    duplicate. Below that, it's still a low-confidence edit flag.
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
export const SIDEWALK_EDIT_MIN_PCT = 25;          // below this, sidewalk presence isn't worth flagging at all
export const GENUINE_NOTE_FLOOR_PCT = 50;         // matches discovery's own RECREATIONAL_MAJORITY_MIN_FRAC (0.5) — informational only, see header
export const OTHER_UNKNOWN_REVIEW_THRESHOLD_PCT = 40;
export const ABSURD_DISTANCE_KM = 30;             // ported from scripts/audit-city-coverage.ts (unmerged branch audit/city-coverage)
export const MIN_VALID_PATH_POINTS = 2;
export const DUPLICATE_NAME_CONVENTION_THRESHOLD = 4; // duplicateNameCount >= this (5+ total routes sharing a name) reads as a naming convention, not a duplicate — suppressed entirely

export function decideRouteAccuracy(input: AccuracyInput): AccuracyDecision {
  const flags: AccuracyFlag[] = [];
  const { composition, lighting, pathPointCount, distance, duplicateNameCount } = input;

  // ── Drop tier: unusable geometry only ──
  if (pathPointCount < MIN_VALID_PATH_POINTS) {
    flags.push({ tier: 'drop', code: 'degenerate-geometry', confidence: 95, message: `Degenerate geometry — only ${pathPointCount} path point(s), need at least ${MIN_VALID_PATH_POINTS}.` });
  }

  // ── Edit tier: real defect signals only ──
  if (composition.sidewalkPct >= SIDEWALK_EDIT_MIN_PCT) {
    // Scales across the full 25-100% range now (was capped at the old drop
    // threshold) — a high sidewalk fraction is real evidence something
    // needs a look, but with no positional data this agent can't tell
    // "trimmable tail" from "pervasive" — that call is the human's, with
    // the map open, not something to pre-judge as unsalvageable here.
    const frac = Math.min(1, (composition.sidewalkPct - SIDEWALK_EDIT_MIN_PCT) / (100 - SIDEWALK_EDIT_MIN_PCT));
    const confidence = Math.round(40 + frac * 45);
    flags.push({ tier: 'edit', code: 'partial-sidewalk', confidence, message: `${composition.sidewalkPct}% classified as sidewalk — likely trimmable (position within the route not yet known — open the editor to find the affected range).` });
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
  if (duplicateNameCount > 0 && duplicateNameCount < DUPLICATE_NAME_CONVENTION_THRESHOLD) {
    flags.push({ tier: 'edit', code: 'duplicate-name', confidence: 25, message: `${duplicateNameCount} other route(s) in this city share this exact name.` });
  }
  // duplicateNameCount >= DUPLICATE_NAME_CONVENTION_THRESHOLD: suppressed
  // entirely, not even a note — a name shared by many routes in one city
  // (e.g. "שביל מסומן חיפה" x11 in Haifa) is a naming convention, and
  // repeating that fact on every one of those routes adds no information.

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

  // Informational notes — never scored, never able to move the verdict.
  if (composition.genuinePct < GENUINE_NOTE_FLOOR_PCT) {
    reasonParts.push(`Note: ${composition.genuinePct}% genuine/dedicated surface (below the ${GENUINE_NOTE_FLOOR_PCT}% bar discovery itself uses) — not a defect by itself (a valid street/urban route reads the same way), informational only.`);
  }
  if (lighting?.status === 'computed') {
    reasonParts.push(`Lighting: ${lighting.litCoveragePct}% coverage${lighting.isLit ? ' (lit)' : ''} — informational only, not a factor in this verdict.`);
  }

  return { verdict, confidence, reason: reasonParts.join(' '), flags };
}
