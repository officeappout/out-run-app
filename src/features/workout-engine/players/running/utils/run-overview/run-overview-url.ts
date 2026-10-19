/**
 * The planned-run map link (home week card → /map), pure. Same params the
 * home card always sent (workoutId · week · day · context=running ·
 * autoStart); the v2 overview adds two optional ones:
 *   variant=lighter|harder — the chosen variant (planned = omitted)
 *   suggest=1              — open the map overview straight into "הצע לי מסלול"
 */

import { isRunVariantKey, type RunVariantKey } from './run-variants';

export interface PlannedRunLink {
  workoutId?: string | null;
  week?: number | null;
  day?: number | null;
  autoStart?: boolean;
  suggest?: boolean;
  variant?: RunVariantKey | null;
}

export function plannedRunMapUrl(link: PlannedRunLink): string {
  const p = new URLSearchParams();
  if (link.workoutId) p.set('workoutId', link.workoutId);
  if (link.week) p.set('week', String(link.week));
  if (link.day != null) p.set('day', String(link.day));
  p.set('context', 'running');
  if (link.autoStart) p.set('autoStart', 'true');
  if (link.suggest) p.set('suggest', '1');
  if (link.variant && link.variant !== 'planned') p.set('variant', link.variant);
  return `/map?${p.toString()}`;
}

export function readVariantParam(v: string | null | undefined): RunVariantKey | null {
  return isRunVariantKey(v) && v !== 'planned' ? v : null;
}
