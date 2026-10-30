/**
 * The session list's side axis under enable_combo_flow_v1 (boards PlayerTransitionFrame / Rules,
 * round 4d): which section the "you" dot sits on, and how each block shows. PURE.
 *
 *   done / skipped   collapsed: title + status, "details" opens the rows
 *   active           open, marked "now", the dot on its node
 *   station ahead    closed: "opens when you reach the station"
 *   leg ahead        open (its target in one row)
 */

import type { LegStatus } from '../../../engines/hybrid/sequencer.selectors';
import type { ComboStage, ComboTransitionKind } from './combo-choreography';

export type ComboSectionMode = 'collapsed' | 'open' | 'closed';

export function comboSectionMode(kind: 'run' | 'station', status: LegStatus): ComboSectionMode {
  if (status === 'done' || status === 'skipped') return 'collapsed';
  if (status === 'active') return 'open';
  return kind === 'station' ? 'closed' : 'open';
}

/** The live section: the active one, else the last one reached (all done), else the first. */
export function liveIndex(statuses: readonly LegStatus[]): number {
  const active = statuses.indexOf('active');
  if (active >= 0) return active;
  for (let i = statuses.length - 1; i >= 0; i -= 1) if (statuses[i] !== 'not_reached') return i;
  return 0;
}

/**
 * Where the dot sits. While the list is dropping in on a stage change it still sits on the block
 * just left, so the "move" step visibly carries it to the new one.
 */
export function comboDotIndex(statuses: readonly LegStatus[], kind: ComboTransitionKind | null, stage: ComboStage | null): number {
  const live = liveIndex(statuses);
  const moving = kind === 'toStation' || kind === 'toWalk';
  return moving && stage === 'reveal' ? Math.max(0, live - 1) : live;
}

/** The choreography is on screen: taps on the list skip to the next player. */
export const comboSkippable = (stage: ComboStage | null) => stage === 'reveal' || stage === 'move';
