'use client';

/**
 * The running page's walking variant (orange): this week's planned walks done
 * (ring), this month's walking vs last month, weekly volume (km / minutes, the
 * last 8 weeks) and the recent walks. Reads the last 40 walks (bounded).
 */
import { useCallback, useMemo } from 'react';
import { Card } from '@/components/ui/v2';
import MiniRing from '@/components/ui/v2/MiniRing';
import { useT } from '@/hooks/useT';
import { profile as profileNs } from '@/messages/ns/profile';
import { formatNumber } from '@/lib/i18n/core/fmt';
import { useRecentOfType } from '../../hooks/useProgressData';
import { monthCompare } from '../../utils/progress-series';
import { formatHours, formatKm, monthName } from '../../utils/progress-format';
import { TabSkeleton } from '../../components/tabs/TabParts';
import { HUB_COLORS } from '../hub-colors';
import type { WalkWeekModel } from '../model/domain-cards.model';
import { recentVolume, type VolumeUnit } from './run-page.model';
import RunVolumeCard from './RunVolumeCard';
import RecentActivityList from './RecentActivityList';

const ORANGE = HUB_COLORS.walk;

export default function WalkHubBody({ week }: { week: WalkWeekModel }) {
  const t = useT(profileNs);
  const n = (v: number) => formatNumber(v, t.locale);
  const { data, loading } = useRecentOfType('walking', true);
  const walks = useMemo(() => data ?? [], [data]);
  const now = useMemo(() => new Date(), []);
  const cmp = useMemo(() => monthCompare(walks, now), [walks, now]);
  const build = useCallback((unit: VolumeUnit) => recentVolume(walks, unit, now), [walks, now]);
  const recent = useMemo(() => [...walks].reverse().slice(0, 5), [walks]);

  return (
    <>
      <Card padding="none" className="p-4" data-walk-hero>
        <div className="flex items-center gap-4">
          <MiniRing pct={week.pct} color={ORANGE.fill} size={104} stroke={11} label={t('hubV2.card.ringAria', { pct: n(week.pct) })}>
            <span className="relative text-[24px] font-black tabular-nums text-v2-ink" dir="ltr">
              {n(week.done)}/{n(week.planned)}
            </span>
          </MiniRing>
          <div className="min-w-0 flex-1 space-y-0.5">
            <p className="text-[16px] font-black text-v2-ink">{t('hubV2.walk.card.title')}</p>
            <p className="text-[14px] font-extrabold" style={{ color: ORANGE.text }}>
              {t('hubV2.walk.card.week', { done: n(week.done), planned: n(week.planned) })}
            </p>
            <p className="text-[12.5px] font-bold text-v2-muted">
              {t('hubV2.walk.page.month', {
                month: monthName(now.getMonth(), t.locale),
                km: formatKm(cmp.current.km, t.locale),
                time: formatHours(cmp.current.minutes),
                count: cmp.current.count,
              })}
            </p>
          </div>
        </div>
      </Card>
      {loading && !data ? (
        <TabSkeleton />
      ) : (
        <>
          <RunVolumeCard build={build} tone={ORANGE} byPlanWeek={false} />
          <RecentActivityList kind="walk" items={recent} now={now} />
        </>
      )}
    </>
  );
}
