/**
 * One templated line per adaptive change (owner 30.10.2026). Five-ish templates in the `player`
 * catalog; the exercise, numbers and unit are variables, so every exercise gets its line.
 */
import type { AdaptiveChange } from '@/features/workout-engine/logic/adaptive/adaptive-change';
import type { PlayerKey, PlayerT } from '@/messages/ns/player';

function unit(t: PlayerT, isHold: boolean, n: number): string {
  return t(isHold ? 'adaptiveChanges.unit.seconds' : 'adaptiveChanges.unit.reps', { n });
}

const LINE_KEY: Record<AdaptiveChange['kind'], PlayerKey> = {
  harder_variation: 'adaptiveChanges.line.harderStreak',
  jump_top: 'adaptiveChanges.line.jumpTop',
  up: 'adaptiveChanges.line.up',
  extra_set: 'adaptiveChanges.line.extraSet',
  down: 'adaptiveChanges.line.down',
  easier_variation: 'adaptiveChanges.line.easier',
};

export function adaptiveChangeLine(t: PlayerT, c: AdaptiveChange): string {
  const done = c.doneMin === c.doneMax
    ? String(c.doneMax)
    : t('adaptiveChanges.range', { min: String(c.doneMin), max: String(c.doneMax) });
  const key = c.kind === 'harder_variation' && c.overshoot ? 'adaptiveChanges.line.harderJump' : LINE_KEY[c.kind];
  return t(key, {
    done,
    unit: unit(t, c.isHold, c.doneMax),
    from: String(c.from),
    to: String(c.to),
    toUnit: unit(t, c.isHold, c.to),
  });
}
