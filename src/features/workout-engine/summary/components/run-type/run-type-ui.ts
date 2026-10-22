/** Shared bits of the v2 run-type summary blocks (no JSX). */
import type { SummaryKey } from '@/messages/ns/summary';

/** In-band / unscored km bars — the easy-run green. */
export const SPLIT_BAR_COLOR = '#84cc16';

/** The splits chart caption (a `summary` key — the component translates it). */
export function splitsLegendKey(hasBand: boolean): SummaryKey {
  return hasBand ? 'runType.legend.band' : 'runType.legend.fastest';
}
