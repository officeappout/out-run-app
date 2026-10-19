/**
 * Validate any week layout (engine output, a user's drag, a makeup trial) against the hard
 * rules — the same predicates the search uses, plus H5 (in-day order).
 */
import { isQualitySlot } from './config';
import { maxLoad, profileOf } from './programProfiles';
import { checkHardRules, emptyGrid, type CapacityCtx, type Grid, type HardViolation } from './rules';
import { makeRunUnit, makeStrengthUnit, type Unit } from './units';
import type { PlacedSession, TrainingLevel } from './types';

/** Main sessions only; combined / several strength sessions on a day become one unit. */
export function gridFromLayout(days: ReadonlyArray<readonly PlacedSession[]>): Grid {
  const g = emptyGrid();
  for (let d = 0; d < 7; d++) {
    for (const s of days[d] ?? []) {
      if (s.optional) continue;
      if (s.kind === 'run' && s.slot) g.run[d] = makeRunUnit(s.slot, `run:${s.slot}:${d}`);
      if (s.kind === 'strength' && s.slug && profileOf(s.slug).slotKind === 'main') {
        const u = makeStrengthUnit(s.slug, `strength:${s.slug}:${d}`);
        const prev: Unit | null = g.strength[d];
        g.strength[d] = prev
          ? { ...prev, slugs: [...prev.slugs, ...u.slugs], load: maxLoad(prev.load, u.load), minRecH: Math.max(prev.minRecH, u.minRecH), combined: true }
          : u;
      }
    }
  }
  return g;
}

/** H5: on a day with a quality run, no main strength before it. */
export function breaksH5(day: readonly PlacedSession[]): boolean {
  const qi = day.findIndex((s) => s.kind === 'run' && isQualitySlot(s.slot) && !s.optional);
  if (qi < 0) return false;
  return day.slice(0, qi).some((s) => s.kind === 'strength' && !!s.slug && profileOf(s.slug).slotKind === 'main');
}

export function validateLayout(
  days: ReadonlyArray<readonly PlacedSession[]>,
  cap: CapacityCtx,
  runLevel: TrainingLevel | null,
): HardViolation[] {
  const out = checkHardRules(gridFromLayout(days), cap, runLevel);
  for (let d = 0; d < 7; d++) if (breaksH5(days[d] ?? [])) out.push({ rule: 'H5', days: [d] });
  return out;
}
