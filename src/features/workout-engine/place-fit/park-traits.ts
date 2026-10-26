/**
 * What a park's equipment says about the workouts it can host. Pure.
 *
 * A park always hosts a bodyweight workout (the park generator's Block B runs
 * with no machines at all), so "fits" never depends on equipment; the bars
 * only decide whether a short pull / push card is worth offering and what its
 * meta line names. Matching is by iconKey / movementPattern first, then by
 * name (Hebrew or English), because older equipment docs carry only a name.
 */

import type { PlaceEquipment } from './types';

type BarKind = 'pull' | 'push';

const PULL_ICON = /pull|chin|bar(?!s)|high.?bar|rings?/i;
const PUSH_ICON = /parallel|dip/i;
const PULL_NAME = /מתח|טבעות|pull|chin|rings?/i;
const PUSH_NAME = /מקבילים|דיפ|parallel|dip/i;

export function barKindOf(eq: PlaceEquipment): BarKind | null {
  const icon = eq.iconKey ?? '';
  if (icon && PUSH_ICON.test(icon)) return 'push';
  if (icon && PULL_ICON.test(icon)) return 'pull';
  const mp = eq.movementPattern ?? '';
  if (/vertical_pull|horizontal_pull/.test(mp)) return 'pull';
  if (/vertical_push|dip/.test(mp)) return 'push';
  if (PUSH_NAME.test(eq.name)) return 'push';
  if (PULL_NAME.test(eq.name)) return 'pull';
  return null;
}

export interface ParkTraits {
  hasPullBar: boolean;
  hasDipBars: boolean;
  /** Up to 3 names for the short card's meta line: bars first, then the rest. */
  highlightNames: string[];
}

export function parkTraits(equipment: readonly PlaceEquipment[]): ParkTraits {
  let hasPullBar = false;
  let hasDipBars = false;
  const bars: string[] = [];
  const rest: string[] = [];
  for (const eq of equipment) {
    const name = eq.name?.trim();
    if (!name) continue;
    const kind = barKindOf(eq);
    if (kind === 'pull') hasPullBar = true;
    if (kind === 'push') hasDipBars = true;
    const list = kind ? bars : rest;
    if (!bars.includes(name) && !rest.includes(name)) list.push(name);
  }
  return { hasPullBar, hasDipBars, highlightNames: [...bars, ...rest].slice(0, 3) };
}
