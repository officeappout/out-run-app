'use client';

/** Muscle balance this month (PG-4): sets per program domain, one cyan bar each. */
import { Card } from '@/components/ui/v2';
import { useT } from '@/hooks/useT';
import { profile as profileNs } from '@/messages/ns/profile';
import { formatNumber } from '@/lib/i18n/core/fmt';
import { HUB_COLORS } from '../hub-colors';
import type { DomainSets } from './strength-page.model';

export default function MuscleBalanceCard({ domains }: { domains: readonly DomainSets[] }) {
  const t = useT(profileNs);
  if (domains.length === 0) return null;
  const max = Math.max(1, ...domains.map((d) => d.sets));
  return (
    <Card padding="none" className="px-4 py-3.5" data-strength-balance>
      <div className="mb-2.5 flex items-baseline justify-between gap-2">
        <h3 className="whitespace-nowrap text-[15px] font-black text-v2-ink">{t('hubV2.strength.balance.title')}</h3>
        <span className="whitespace-nowrap text-[12px] font-extrabold text-v2-muted">{t('hubV2.strength.balance.hint')}</span>
      </div>
      <ul className="space-y-2">
        {domains.map((d) => (
          <li key={d.domain} className="flex items-center gap-2.5">
            <span className="w-[84px] shrink-0 truncate text-[13.5px] font-extrabold text-v2-ink">{t('hubV2.strength.domain', { domain: d.domain })}</span>
            <span className="h-2.5 flex-1 overflow-hidden rounded-full bg-v2-surface">
              <span className="block h-full rounded-full" style={{ width: `${(d.sets / max) * 100}%`, background: HUB_COLORS.strength.fill }} />
            </span>
            <span className="whitespace-nowrap text-[13px] font-black tabular-nums text-v2-ink">
              {t('hubV2.strength.balance.sets', { sets: formatNumber(d.sets, t.locale) })}
            </span>
          </li>
        ))}
      </ul>
    </Card>
  );
}
