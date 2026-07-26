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
  /** The program-level's DEDICATED tabataProbability field (separate from the main
   *  protocolProbability). Used only when 'tabata' is enabled; unset ⇒ default. */
  tabataProbability?: number;
}

export interface TabataFinisher {
  /** Base probability for the finisher roll (pre-periodization scaling). */
  probability: number;
  /** The program@level the finisher was resolved from. */
  source: string;
}

/** Fallback when 'tabata' is enabled but the dedicated tabataProbability field is
 *  unset. Conservative ("occasional variety") so a flag-on/field-missing doc never
 *  fires every workout — the rollout writes explicit per-level values. */
export const DEFAULT_TABATA_PROBABILITY = 0.15;

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
      return { probability: c.tabataProbability ?? DEFAULT_TABATA_PROBABILITY, source: c.source };
    }
  }
  return null;
}
