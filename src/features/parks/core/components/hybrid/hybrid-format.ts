/**
 * Shared minute formatter for the hybrid overview (point 19). A leg/station shorter
 * than a minute rounds to 0 with a plain Math.round(sec/60) — which reads as a bug
 * ("0 דק׳") on very short routes. Show "< דק׳" instead. Used by BOTH the strip and
 * the axis — ONE source, so the two never drift.
 *
 * NB: this is display only; the underlying durationSec is real (>0). Route
 * generation / the degenerate-route guard (routeKm < 0.2) are a separate concern.
 */
export function formatMinutes(sec?: number): string {
  const s = sec ?? 0;
  const min = Math.round(s / 60);
  if (min >= 1) return `${min} דק׳`;
  return s > 0 ? '< דק׳' : '0 דק׳';
}
