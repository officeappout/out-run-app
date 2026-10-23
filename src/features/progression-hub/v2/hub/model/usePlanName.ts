'use client';

/** The running plan's display name: "5 km plan" / "fitness plan" / the template's own name. */
import { useT } from '@/hooks/useT';
import { profile as profileNs } from '@/messages/ns/profile';
import { formatNumber } from '@/lib/i18n/core/fmt';
import { planDistanceKm } from './domain-cards.model';

export function usePlanName(distKey: string | null, fallback: string): string {
  const t = useT(profileNs);
  if (distKey === 'maintenance') return t('hubV2.run.planMaintenance');
  const km = planDistanceKm(distKey);
  return km != null ? t('hubV2.run.planKm', { km: formatNumber(km, t.locale) }) : fallback || t('hubV2.run.planGeneric');
}
