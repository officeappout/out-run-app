/**
 * JourneyStrip item model (pure, no React) — shared by the hybrid overview
 * and the run preview builders/tests.
 */

export type JourneyItemKind = 'aerobic' | 'strength' | 'transport' | 'repeat';

export interface JourneyStripItem {
  key: string;
  kind: JourneyItemKind;
  /** aerobic / repeat: 'walking' | 'running'; strength: the station's domainFocus. */
  subtype?: string;
  /** Display text ("6 × 400 מ׳"); when absent, `seconds` is formatted as minutes ("12 דק׳"). */
  label?: string;
  seconds?: number;
}
