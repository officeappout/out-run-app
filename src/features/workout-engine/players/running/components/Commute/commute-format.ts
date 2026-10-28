/**
 * commute-format: pure text helpers for a commute (navigate-to-a-place) session, shared by the old
 * ETA carousel (CommuteStatsCarousel) and the v2 player header (commuteHeaderText).
 */
import type { ReactTFunction } from '@/hooks/useT';
import type { PlayerKey } from '@/messages/ns/player';
import type { CommuteEta } from './useCommuteEta';

export function formatRemainingDistance(km: number | null, t: ReactTFunction<PlayerKey>): string {
  if (km === null || !Number.isFinite(km)) return '--';
  if (km < 1) return t('run.commute.remainingM', { m: String(Math.round(km * 1000)) });
  return t('run.commute.remainingKm', { km: km.toFixed(km < 10 ? 2 : 1) });
}

export function formatArrivalClock(date: Date | null): string {
  if (!date) return '--:--';
  const hh = date.getHours().toString().padStart(2, '0');
  const mm = date.getMinutes().toString().padStart(2, '0');
  return `${hh}:${mm}`;
}

/** v2 player header for a commute: the destination over "remaining · arrival HH:MM" (or "arrived"). */
export function commuteHeaderText(
  eta: CommuteEta,
  label: string | null | undefined,
  t: ReactTFunction<PlayerKey>,
): { eyebrow: string; title: string } {
  const eyebrow = label?.trim() || t('run.commute.destinationFallback');
  if (eta.hasArrived) return { eyebrow, title: t('run.commute.arrived') };
  if (eta.distanceRemainingKm === null) return { eyebrow, title: t('run.commute.waitingGps') };
  return {
    eyebrow,
    title: `${formatRemainingDistance(eta.distanceRemainingKm, t)} · ${t('run.commute.arrival')} ${formatArrivalClock(eta.etaArrival)}`,
  };
}
