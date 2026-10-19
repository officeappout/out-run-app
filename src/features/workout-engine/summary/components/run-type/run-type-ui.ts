/** Shared bits of the v2 run-type summary blocks (no JSX). */

/** In-band / unscored km bars — the easy-run green. */
export const SPLIT_BAR_COLOR = '#84cc16';

export function splitsLegend(hasBand: boolean): string {
  return hasBand ? 'ירוק = בטווח · כתום = מחוץ לטווח · כחול = הכי מהיר' : 'כחול = הק״מ המהיר ביותר';
}
