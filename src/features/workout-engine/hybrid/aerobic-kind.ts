/**
 * aerobic-kind — the hybrid session's aerobic activity (walk / run / ride) in ONE place:
 * its Hebrew label, its speed, and a safe runner base pace. PURE — no I/O.
 *
 * Cycling (19.10.2026 owner report): the free aerobic drawer with "רכיבה" + strength stations
 * used to compose a RUNNING session ("ריצה + כוח", running legs). The kind now flows through
 * the compose as 'cycling', with a fixed riding pace (the drawer's own SPEED_KMH.cycling).
 */

export type HybridAerobicKind = 'walking' | 'running' | 'cycling';

/** Riding pace window (sec/km): 18–22.5 km/h, midpoint 180 s/km = the drawer's 20 km/h. */
export const CYCLING_PACE_SEC_PER_KM = { min: 160, max: 200 } as const;
/** Riding minutes per km (20 km/h) — same speed the free-run drawer uses for cycling goals. */
export const CYCLING_MIN_PER_KM = 3;

/** Base pace used when the profile has none — the hybrid composer's long-standing default. */
export const DEFAULT_BASE_PACE_SEC_PER_KM = 390;

/** "הליכה" / "ריצה" / "רכיבה" — the verb shown for an aerobic leg or session. */
export function aerobicKindLabel(kind: string | null | undefined): string {
  if (kind === 'cycling') return 'רכיבה';
  if (kind === 'walking') return 'הליכה';
  return 'ריצה';
}

/** "הליכה + כוח" / "ריצה + כוח" / "רכיבה + כוח". */
export function hybridSessionTitle(kind: string | null | undefined): string {
  return `${aerobicKindLabel(kind)} + כוח`;
}

/**
 * A usable base pace (sec/km). A profile can carry `basePace: 0` (never ran) — `?? 390` kept the
 * 0, so every running leg came out at 0 min/km ("ריצה · 3.30 ק״מ · 0 דק׳").
 */
export function safeBasePaceSecPerKm(basePace: number | null | undefined): number {
  return typeof basePace === 'number' && Number.isFinite(basePace) && basePace > 0
    ? basePace
    : DEFAULT_BASE_PACE_SEC_PER_KM;
}

/** The runtime player knows walk / run only; a ride runs on the running player's thresholds. */
export function toRuntimeAerobicKind(kind: HybridAerobicKind): 'walking' | 'running' {
  return kind === 'walking' ? 'walking' : 'running';
}
