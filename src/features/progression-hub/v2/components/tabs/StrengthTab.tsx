'use client';

/**
 * P-2b — כוח: sets / workouts / time this week vs last week, sets per muscle
 * group (workouts saved with exerciseLog.domain), sets per week (8 weeks),
 * "התרגילים שלך" → the exercise page.
 * Data: the last 40 strength workouts + the 5 most recent exerciseHistory
 * docs (top-level only — no per-exercise sessions reads, no N+1).
 */
import { useMemo, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronLeft } from 'lucide-react';
import { BarChart, Card } from '@/components/ui/v2';
import { useRecentExercises, useRecentOfType } from '../../hooks/useProgressData';
import { PROGRESS_COLORS } from '../../utils/progress-model';
import { domainBreakdown, weekCompare, weeklySeries } from '../../utils/progress-series';
import { formatHours, relativeDay } from '../../utils/progress-format';
import KindIcon from '../KindIcon';
import { ChartCard, TabEmpty, TabHeaderCard, TabSkeleton } from './TabParts';
import { useT } from '@/hooks/useT';
import { profile as profileNs } from '@/messages/ns/profile';

export default function StrengthTab() {
  const t = useT(profileNs);
  const router = useRouter();
  const { data, loading } = useRecentOfType('strength', true);
  const exercises = useRecentExercises(true);
  const now = useMemo(() => new Date(), []);
  const ws = useMemo(() => data ?? [], [data]);
  const cmp = useMemo(() => weekCompare(ws, now), [ws, now]);
  const weekly = useMemo(() => weeklySeries(ws, 'sets', now), [ws, now]);
  const domains = useMemo(() => domainBreakdown(ws, now), [ws, now]);

  if (loading && !data) return <TabSkeleton />;
  if (ws.length === 0) return <TabEmpty kind="strength" text={t('hub.strength.empty')} />;

  const maxDomain = Math.max(1, ...domains.map((d) => d.sets));
  return (
    <div className="space-y-3">
      <TabHeaderCard
        kind="strength"
        title={t('hub.strength.title')}
        subtitle={t('hub.strength.subtitle')}
        current={cmp.current.sets}
        previous={cmp.previous.sets}
        hero={{ key: 'sets', value: String(cmp.current.sets), unit: t('hub.strength.hero.unit'), label: t('hub.strength.hero.label') }}
        stats={[
          { key: 'n', value: String(cmp.current.count), label: t('hub.strength.stat.count') },
          { key: 'time', value: formatHours(cmp.current.minutes), unit: t('hub.strength.stat.timeUnit'), label: t('hub.strength.stat.time') },
        ]}
      />

      {domains.length > 0 && (
        <Card padding="none" className="px-4 py-3.5">
          <h3 className="mb-2 whitespace-nowrap text-[15px] font-black text-v2-ink">{t('hub.strength.domains.title')}</h3>
          <ul className="space-y-2">
            {domains.map((d) => (
              <li key={d.domain} className="flex items-center gap-2.5">
                <span className="w-[72px] shrink-0 truncate whitespace-nowrap text-[13.5px] font-extrabold text-v2-ink">{d.label}</span>
                <span className="h-2.5 flex-1 overflow-hidden rounded-full bg-v2-surface">
                  <span className="block h-full rounded-full" style={{ width: `${(d.sets / maxDomain) * 100}%`, background: PROGRESS_COLORS.strength }} />
                </span>
                <span className="whitespace-nowrap text-[13px] font-black tabular-nums text-v2-ink">
                  {t.rich('hub.strength.domains.sets', {
                    sets: String(d.sets),
                    unit: (chunks: ReactNode) => <span className="text-[12px] font-bold text-v2-muted">{chunks}</span>,
                  })}
                </span>
              </li>
            ))}
          </ul>
        </Card>
      )}

      <ChartCard title={t('hub.strength.chart.title')} hint={t('hub.strength.chart.hint')}>
        <BarChart data={weekly} highlightKey="now" color={PROGRESS_COLORS.strength} height={170} ariaLabel={t('hub.strength.chart.aria')} />
      </ChartCard>

      {(exercises.data?.length ?? 0) > 0 && (
        <section>
          <h3 className="mb-2 whitespace-nowrap text-[15px] font-black text-v2-ink">{t('hub.strength.exercises.title')}</h3>
          <div className="space-y-2">
            {exercises.data!.map((ex) => (
              <button
                key={ex.exerciseId}
                type="button"
                onClick={() => router.push(`/profile/exercise/${encodeURIComponent(ex.exerciseId)}?name=${encodeURIComponent(ex.name)}`)}
                className="flex w-full items-center gap-3 rounded-[20px] bg-white p-3 text-right shadow-v2-ring transition-transform duration-150 ease-v2 active:scale-[0.97]"
              >
                <KindIcon kind="strength" size={36} />
                <div className="min-w-0 flex-1">
                  <p className="truncate whitespace-nowrap text-[14.5px] font-extrabold text-v2-ink">{ex.name}</p>
                  <p className="truncate whitespace-nowrap text-[12px] font-bold text-v2-muted">
                    {ex.lastBest > 0 ? t('hub.strength.exercises.lastBest', { best: String(ex.lastBest) }) : t('hub.strength.exercises.lastWorkout')}
                    {ex.updatedAt ? ` · ${relativeDay(ex.updatedAt, now)}` : ''}
                  </p>
                </div>
                <ChevronLeft className="h-4 w-4 shrink-0 text-v2-muted" aria-hidden />
              </button>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
