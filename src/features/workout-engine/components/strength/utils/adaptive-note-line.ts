/**
 * The next-workout tag's text (owner 30.10.2026): one templated line per change kind in the
 * `player` catalog; exercise, numbers and unit are variables.
 */
import type { AdaptiveNote } from '@/features/workout-engine/logic/adaptive/adaptive-note';
import type { PlayerKey, PlayerT } from '@/messages/ns/player';

const KEY: Record<AdaptiveNote['kind'], PlayerKey> = {
  up: 'adaptiveNote.up',
  jump_top: 'adaptiveNote.jumpTop',
  harder_variation: 'adaptiveNote.harder',
  extra_set: 'adaptiveNote.extraSet',
  down: 'adaptiveNote.down',
  easier_variation: 'adaptiveNote.easier',
};

function unit(t: PlayerT, isHold: boolean, n: number): string {
  return t(isHold ? 'adaptiveChanges.unit.seconds' : 'adaptiveChanges.unit.reps', { n });
}

export function adaptiveNoteLine(t: PlayerT, n: AdaptiveNote): string {
  const done = n.doneMin === n.doneMax
    ? String(n.doneMax)
    : t('adaptiveChanges.range', { min: String(n.doneMin), max: String(n.doneMax) });
  return t(KEY[n.kind], {
    to: String(n.to),
    toUnit: unit(t, n.isHold, n.to),
    done,
    unit: unit(t, n.isHold, n.doneMax),
    name: n.prevName ?? '',
  });
}
