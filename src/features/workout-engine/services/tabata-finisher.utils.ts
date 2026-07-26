/**
 * tabata-finisher.utils — the SEPARATE (union) resolution track for the tabata
 * finisher (David 26.07).
 *
 * Tabata is a cross-program conditioning FINISHER, not a main block structure —
 * so it must not compete for the single winner-takes-all protocol slot. The main
 * protocol (antagonist_pair / supersets / pyramid / emom) is still resolved by
 * the first-with-a-non-tabata-protocol rule in home-workout.service. Tabata is
 * resolved here, in parallel: eligible if ANY enrolled program enables it.
 *
 * Pure — no Firestore, no React (LAW 0). The caller collects each scanned
 * program's settings in PRIORITY ORDER (scheduled → primary → level-desc) and
 * passes them here; the highest-priority enabler wins.
 */

export interface TabataCandidate {
  /** `${domainKey}@L${level}` — for source attribution / logs. */
  source: string;
  /** The program-level's raw preferredProtocols (may include 'tabata'). */
  preferredProtocols?: string[];
  /** The program-level's raw protocolProbability (NO antagonist_pair boost — that
   *  1.0 override is a main-protocol rule and must not leak into the finisher). */
  protocolProbability?: number;
}

export interface TabataFinisher {
  /** Base probability for the finisher roll (pre-periodization scaling). */
  probability: number;
  /** The program@level the finisher was resolved from. */
  source: string;
}

/** Matches the main-protocol default when a program enables a protocol but
 *  leaves protocolProbability unset. */
export const DEFAULT_TABATA_PROBABILITY = 1.0;

/**
 * The FIRST candidate (highest priority — caller supplies them in priority order)
 * whose preferredProtocols enables 'tabata'. Returns its RAW protocolProbability
 * (default 1.0) + source, or null when no enrolled program enables tabata.
 *
 * NOT max-probability: highest-priority is consistent with the existing scan
 * order (scheduled → primary → level-desc) so the admin controls frequency
 * per-program predictably, rather than a low-priority program silently winning
 * on a high number.
 */
export function resolveTabataFinisher(candidates: TabataCandidate[]): TabataFinisher | null {
  for (const c of candidates) {
    if (c.preferredProtocols?.includes('tabata')) {
      return { probability: c.protocolProbability ?? DEFAULT_TABATA_PROBABILITY, source: c.source };
    }
  }
  return null;
}
