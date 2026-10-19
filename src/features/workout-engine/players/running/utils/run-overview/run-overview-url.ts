/**
 * The planned-run map link (home week card → /map), pure. Same params the
 * home card always sent (workoutId · week · day · context=running ·
 * autoStart); the v2 overview adds two optional ones:
 *   variant=lighter|harder — the chosen variant (planned = omitted)
 *   suggest=1              — open the map overview straight into "הצע לי מסלול"
 * and the overview edits (boards M-7a/7b, run-edits.ts):
 *   swap=m:600.600.600.600~120          — the swapped-in main set
 *   pace=main.interval_short:280-290,…  — this workout's pace bands
 */

import { isRunVariantKey, type RunVariantKey } from './run-variants';
import { runEditsToParams, type RunEdits } from './run-edits';

export interface PlannedRunLink {
  workoutId?: string | null;
  week?: number | null;
  day?: number | null;
  autoStart?: boolean;
  suggest?: boolean;
  variant?: RunVariantKey | null;
  /** All the overview edits (wins over `variant`). */
  edits?: RunEdits | null;
}

export function plannedRunMapUrl(link: PlannedRunLink): string {
  const p = new URLSearchParams();
  if (link.workoutId) p.set('workoutId', link.workoutId);
  if (link.week) p.set('week', String(link.week));
  if (link.day != null) p.set('day', String(link.day));
  p.set('context', 'running');
  if (link.autoStart) p.set('autoStart', 'true');
  if (link.suggest) p.set('suggest', '1');
  if (link.edits) {
    for (const [k, v] of Object.entries(runEditsToParams(link.edits))) p.set(k, v);
  } else if (link.variant && link.variant !== 'planned') {
    p.set('variant', link.variant);
  }
  return `/map?${p.toString()}`;
}

export function readVariantParam(v: string | null | undefined): RunVariantKey | null {
  return isRunVariantKey(v) && v !== 'planned' ? v : null;
}
