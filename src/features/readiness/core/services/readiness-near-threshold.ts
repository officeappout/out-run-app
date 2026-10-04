/**
 * "קרובים לרף" (near-threshold proximity, 04.10.2026, 00-MASTER-PLAN.md
 * §13.85) — read-only derivation, zero new Firestore writes/fields/
 * collections. Today a soldier who missed the run by 30 seconds and one
 * who missed it by 4 minutes both just read "לא כשיר" — this file adds
 * the one thing that tells them apart: how far each failed component
 * actually is from its own threshold.
 *
 * Pure and Firestore-free on purpose — the exact same module runs
 * server-side (readiness-read.service.ts, readiness-dashboard.service.ts)
 * AND, via the already-fetched roster payload, informs client rendering
 * without re-deriving anything client-side.
 *
 * David's precision rule, locked: a soldier who failed MORE than one
 * component is "close" ONLY if close on EVERY component they failed —
 * missing 1 rep on pullups but 3 minutes on the run is NOT close. A
 * partial "close" would promise an easy win that doesn't exist.
 *
 * "Close" tolerance is configured the same way thresholds are — per
 * component, not one global number. No admin UI/Firestore config exists
 * for these yet (out of scope this round, per instruction: no new
 * field) — hardcoded defaults below, each independently overridable by
 * the caller for the "what if the tolerance changes" case.
 */

export const DEFAULT_CLOSE_TOLERANCES: Record<string, number> = {
  run_3000m: 60, // seconds
  pullups: 1, // reps
  dips: 1, // reps
};

export interface FailedComponentInput {
  testId: string;
  label: string;
  /** 'seconds' selects the Hebrew "שניות" wording; anything else is read as a rep count ("חזרה אחת" / "N חזרות"). */
  unit: string;
  value: number;
  thresholdValue: number;
  lowerIsBetter: boolean;
}

export interface NearThresholdInfo {
  isNear: boolean;
  /** Pre-formatted Hebrew, e.g. "ריצה · 30 שניות מהסף" or, with two close failed components, "עליות מתח · חזרה אחת מהסף, מקבילים · 2 חזרות מהסף". Null whenever isNear is false — never shown, never computed for a fail that isn't close (no partial-promise text). */
  note: string | null;
}

function formatDistance(unit: string, distance: number): string {
  const n = Math.round(distance);
  if (unit === 'seconds') return `${n} שניות`;
  return n === 1 ? 'חזרה אחת' : `${n} חזרות`;
}

/**
 * `failedComponents` must be exactly the soldier's FAILED tests (status
 * === 'fail') — callers gate on overall currentStatus === 'fail' before
 * building this list; an empty list here always yields isNear: false
 * (never "near" with nothing to be near to).
 *
 * Boundary rule: distance <= tolerance is close (60 is close at the
 * default 60s tolerance, 61 is not).
 */
export function computeNearThreshold(
  failedComponents: FailedComponentInput[],
  tolerances: Record<string, number> = DEFAULT_CLOSE_TOLERANCES,
): NearThresholdInfo {
  if (failedComponents.length === 0) return { isNear: false, note: null };

  const parts = failedComponents.map((c) => {
    const rawDistance = c.lowerIsBetter ? c.value - c.thresholdValue : c.thresholdValue - c.value;
    const distance = Math.max(0, rawDistance);
    const tolerance = tolerances[c.testId];
    const isClose = tolerance !== undefined && distance <= tolerance;
    return { label: c.label, text: formatDistance(c.unit, distance), isClose };
  });

  const isNear = parts.every((p) => p.isClose);
  if (!isNear) return { isNear: false, note: null };

  return { isNear: true, note: parts.map((p) => `${p.label} · ${p.text} מהסף`).join(', ') };
}
