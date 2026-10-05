/**
 * Demonstrated-run-level derivation (05.10.2026, §13.89). Read-only,
 * zero writes anywhere, no UI, no API route — same exact pattern as
 * readiness-strength-level.service.ts, built specifically because that
 * module only covers pull/push: David's own correction mid-build on the
 * trends screen — "קו כחול של כוח בלבד שמסומן 'הכל', מול קו ירוק של
 * כשירות מלאה, זו בדיוק ההשוואה בין שני דברים שונים שאסרתי" (a
 * strength-only blue line labeled "everything" against a full-fitness
 * green line is exactly the comparing-two-different-things this whole
 * build has been built to avoid). The trends screen is paused until
 * this module exists.
 *
 * Given a uid and a fixed 30-day window, returns the fastest run
 * normalized to a 3,000m-equivalent time (seconds), or null. It never
 * decides "meets threshold" — that comparison, including the male/
 * female distinction, happens wherever readiness thresholds already
 * live; duplicating that logic here is explicitly out of scope.
 *
 * === Source, and the SAME segments[] lesson as the strength module ===
 * workouts → segments[], each segment filtered by its OWN
 * `kind === 'aerobic'` (and `aerobicType === 'running'` — a brisk walk
 * is not a run, and `aerobicType` only ever takes 'running'|'walking',
 * storage.service.ts:88), never by the top-level `workoutType`. A pure
 * running workout's save path ALSO wraps its data in a one-element
 * `segments` array (useRunningPlayer.ts:1652: `segments: [aerobicSegment]`)
 * — confirmed directly in the save code, not assumed — so the exact
 * same "iterate every segment, never index by position" approach the
 * strength module needed for hybrid workouts applies here too, and
 * covers pure-running workouts for free.
 *
 * === Fields, confirmed against a real production document ===
 * `segment.actual.distanceKm` / `durationSec` / `paceMinKm?` — the last
 * is conditionally written (only when pace > 0) and never relied on
 * here; this module computes pace itself as `durationSec / distanceKm`
 * rather than trusting a separately-stored field that could in
 * principle disagree with it. "Missing GPS" (David's spec) has no
 * separate stored field anywhere in the save path (confirmed: the live
 * in-session `gpsAccuracy`/`gpsStatus` state in useRunningPlayer.ts is
 * never written into the saved document) — a GPS fix that never
 * resolved simply means `distanceKm`/`durationSec` never got populated
 * with real values, which the presence/validity check below already
 * catches on its own; no separate "GPS" field exists to check.
 *
 * === Rules ===
 * 1. Counts as a run only within 2.8–3.2km — outside that range, not
 *    counted at all (neither toward the minimum-evidence count nor
 *    the fastest-time selection).
 * 2. Normalized to 3,000m by `(durationSec / distanceKm) * 3` — a
 *    straight scale of the per-km pace, never extrapolated from a 1km
 *    or 10km run (which this module never sees in the first place,
 *    since rule 1 already excludes anything outside 2.8–3.2km).
 * 3. The result is the FASTEST (lowest normalized time) among counted
 *    runs.
 * 4. Minimum 2 counted runs in the window — same rule and same reason
 *    as the strength module's per-level minimum: one run isn't enough
 *    evidence to set a level.
 * 5. A run faster than 2:30/km is a measurement glitch, not a real
 *    performance — excluded from selection entirely, but counted and
 *    reported (`excludedImpossiblePaceCount`), never silently dropped.
 */
import type { Firestore } from 'firebase-admin/firestore';

export const RUN_LEVEL_WINDOW_DAYS = 30;
const MIN_COUNTED_RUN_KM = 2.8;
const MAX_COUNTED_RUN_KM = 3.2;
const MIN_COUNTED_RUNS = 2;
/** 2:30/km, in seconds — faster than this is a measurement glitch (GPS jump, a bike/car misclassified as a run), never a real demonstrated pace. */
const FASTEST_PLAUSIBLE_PACE_SEC_PER_KM = 150;

export interface RunLevelResult {
  /** null = not enough evidence in the window (zero runs, or fewer than MIN_COUNTED_RUNS valid 2.8-3.2km runs) — "unknown," never a real time and never "fails to meet." */
  normalizedTimeSeconds: number | null;
  /** How many of this uid's runs were excluded as an impossible pace — always present, 0 when none were excluded. A real count, never silently swallowed. */
  excludedImpossiblePaceCount: number;
}

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

/**
 * Given a list of uids, returns each one's fastest demonstrated 3,000m-
 * normalized run time from the last RUN_LEVEL_WINDOW_DAYS days. Every
 * requested uid is present in the result (never silently missing).
 */
export async function computeDemonstratedRunLevels(
  db: Firestore,
  uids: string[],
): Promise<Record<string, RunLevelResult>> {
  const result: Record<string, RunLevelResult> = {};
  for (const uid of uids) {
    result[uid] = { normalizedTimeSeconds: null, excludedImpossiblePaceCount: 0 };
  }
  if (uids.length === 0) return result;

  const cutoff = new Date(Date.now() - RUN_LEVEL_WINDOW_DAYS * 24 * 60 * 60 * 1000);
  const countedRunsByUid = new Map<string, number[]>();
  const excludedCountByUid = new Map<string, number>();

  for (const uidChunk of chunk(uids, 30)) {
    if (uidChunk.length === 0) continue;
    const snap = await db.collection('workouts')
      .where('userId', 'in', uidChunk)
      .where('date', '>=', cutoff)
      .get();

    snap.docs.forEach((doc) => {
      const data = doc.data();
      const uid = data.userId;
      if (typeof uid !== 'string') return;
      const segments = Array.isArray(data.segments) ? data.segments as { kind?: unknown; aerobicType?: unknown; actual?: { distanceKm?: unknown; durationSec?: unknown } }[] : [];

      for (const segment of segments) {
        if (segment.kind !== 'aerobic' || segment.aerobicType !== 'running') continue;

        const distanceKm = segment.actual?.distanceKm;
        const durationSec = segment.actual?.durationSec;
        if (typeof distanceKm !== 'number' || typeof durationSec !== 'number' || distanceKm <= 0 || durationSec <= 0) continue; // missing/invalid distance or duration ("missing GPS") — not determinable from this entry, never 0

        if (distanceKm < MIN_COUNTED_RUN_KM || distanceKm > MAX_COUNTED_RUN_KM) continue; // not a 3,000m-range run — not counted at all

        const paceSecPerKm = durationSec / distanceKm;
        if (paceSecPerKm < FASTEST_PLAUSIBLE_PACE_SEC_PER_KM) {
          excludedCountByUid.set(uid, (excludedCountByUid.get(uid) ?? 0) + 1);
          continue; // measurement glitch — excluded from selection, but counted
        }

        const normalizedTimeSeconds = paceSecPerKm * 3;
        const list = countedRunsByUid.get(uid) ?? [];
        list.push(normalizedTimeSeconds);
        countedRunsByUid.set(uid, list);
      }
    });
  }

  for (const uid of uids) {
    const runs = countedRunsByUid.get(uid) ?? [];
    result[uid] = {
      normalizedTimeSeconds: runs.length >= MIN_COUNTED_RUNS ? Math.min(...runs) : null,
      excludedImpossiblePaceCount: excludedCountByUid.get(uid) ?? 0,
    };
  }

  return result;
}
