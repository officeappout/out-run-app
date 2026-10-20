'use client';

/**
 * P-2c — הליכה: walks saved as a workout this month vs last month, walking
 * minutes per week (8 weeks), the last 3 walks. Data: the last 40 walks.
 * The walking-plan card waits until walkPlan stores a week/progress state.
 */
import { useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { BarChart } from '@/components/ui/v2';
import { useRecentOfType } from '../../hooks/useProgressData';
import { PROGRESS_COLORS } from '../../utils/progress-model';
import { monthCompare, weeklySeries } from '../../utils/progress-series';
import { formatHours, formatKm, formatPace, monthName, relativeDay } from '../../utils/progress-format';
import { ChartCard, RecentRows, TabEmpty, TabHeaderCard, TabSkeleton } from './TabParts';

export default function WalkTab() {
  const router = useRouter();
  const { data, loading } = useRecentOfType('walking', true);
  const now = useMemo(() => new Date(), []);
  const walks = useMemo(() => data ?? [], [data]);
  const cmp = useMemo(() => monthCompare(walks, now), [walks, now]);
  const weekly = useMemo(() => weeklySeries(walks, 'minutes', now), [walks, now]);

  if (loading && !data) return <TabSkeleton />;
  if (walks.length === 0) return <TabEmpty kind="walk" text="עוד אין הליכות שתועדו כאימון. ההליכה הראשונה תופיע כאן." />;

  const recent = [...walks].reverse().slice(0, 3);
  return (
    <div className="space-y-3">
      <TabHeaderCard
        kind="walk"
        title={`הליכה · ${monthName(now.getMonth())}`}
        subtitle="הליכות שתועדו כאימון"
        current={cmp.current.km}
        previous={cmp.previous.km}
        hero={{ key: 'km', value: formatKm(cmp.current.km), unit: 'ק״מ', label: 'החודש' }}
        stats={[
          { key: 'n', value: String(cmp.current.count), label: 'הליכות' },
          { key: 'time', value: formatHours(cmp.current.minutes), unit: 'שע׳', label: 'זמן הליכה' },
          { key: 'pace', value: formatPace(cmp.current.pace), label: 'קצב ממוצע' },
        ]}
      />
      <ChartCard title="דקות הליכה לשבוע" hint="8 שבועות">
        <BarChart data={weekly} highlightKey="now" color={PROGRESS_COLORS.walk} height={170} ariaLabel="דקות הליכה לשבוע, 8 שבועות" />
      </ChartCard>
      <RecentRows
        title="הליכות אחרונות"
        kind="walk"
        rows={recent.map((w) => ({
          key: w.id,
          title: `${w.title ?? 'הליכה'} · ${formatKm(w.km)} ק״מ`,
          meta: `${relativeDay(w.date, now)} · ${Math.round(w.minutes)} דק׳`,
          onClick: () => router.push(`/workouts/${w.id}/history`),
        }))}
      />
    </div>
  );
}
