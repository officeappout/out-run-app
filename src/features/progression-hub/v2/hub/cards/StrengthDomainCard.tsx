'use client';

/**
 * Strength card (PG-2): the main program's level ring, "<program> · level N of M",
 * "N% to level N+1", and the period's strength workouts. No program yet → the
 * icon and the period line only. Tap → /progress/strength.
 */
import { useRouter } from 'next/navigation';
import { useProgramProgress } from '@/features/home/hooks/useProgramProgress';
import { useT } from '@/hooks/useT';
import { profile as profileNs } from '@/messages/ns/profile';
import { formatNumber } from '@/lib/i18n/core/fmt';
import type { ProgressPeriod } from '../../utils/progress-period';
import { strengthCardModel } from '../model/domain-cards.model';
import { HUB_ROUTES } from '../hub-routes';
import DomainCard from '../components/DomainCard';

export default function StrengthDomainCard({ period, workouts }: { period: ProgressPeriod; workouts: number }) {
  const t = useT(profileNs);
  const router = useRouter();
  const m = strengthCardModel(useProgramProgress());
  const n = (v: number) => formatNumber(v, t.locale);
  const periodLine = t('hubV2.strength.card.period', { period, count: workouts });
  const lines = m
    ? [
        t('hubV2.strength.card.level', { program: m.programName, level: n(m.level), max: n(m.maxLevel) }),
        m.toNext != null && m.nextLevel != null
          ? t('hubV2.strength.card.next', { pct: n(m.toNext), next: n(m.nextLevel) })
          : t('hubV2.strength.card.top'),
        periodLine,
      ]
    : [t('hubV2.strength.card.empty'), periodLine];
  return (
    <DomainCard
      kind="strength"
      title={t('hubV2.strength.card.title')}
      pct={m ? m.pct : null}
      ringLabel={m ? t('hubV2.card.ringAria', { pct: n(m.pct) }) : undefined}
      lines={lines}
      onOpen={() => router.push(HUB_ROUTES.strength)}
      ariaLabel={t('hubV2.card.open', { name: t('hubV2.strength.card.title') })}
      locale={t.locale}
    />
  );
}
