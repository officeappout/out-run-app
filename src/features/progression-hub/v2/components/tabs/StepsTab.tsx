'use client';

/**
 * P-2d — צעדים: daily average this week vs last week, today vs goal, best
 * day / days in goal / goal streak / distance, a 30-day chart, and the link
 * to the full steps page (/activity/steps keeps day·week·month·year).
 * Reads 30 dailyActivity docs only — never the 365 of the steps page.
 */
import { useMemo } from 'react';
import Link from 'next/link';
import { BarChart, Card, DeltaBadge } from '@/components/ui/v2';
import { DAILY_STEP_GOAL } from '@/config/health-goals';
import { useRecentDays } from '../../hooks/useProgressData';
import { PROGRESS_COLORS } from '../../utils/progress-model';
import { stepsStats } from '../../utils/progress-series';
import { formatCount, formatKm, isoDayLabel } from '../../utils/progress-format';
import StatCell from '../StatCell';
import KindIcon from '../KindIcon';
import { ChartCard, TabEmpty, TabSkeleton } from './TabParts';

export default function StepsTab() {
  const { data, loading } = useRecentDays(true);
  const now = useMemo(() => new Date(), []);
  const s = useMemo(() => stepsStats(data ?? [], now, DAILY_STEP_GOAL), [data, now]);

  if (loading && !data) return <TabSkeleton />;
  if (!data || data.length === 0) return <TabEmpty kind="steps" text="עוד אין נתוני צעדים. חברו את אפליקציית הבריאות כדי לראות אותם כאן." />;

  const pct = s.goal > 0 ? Math.min(100, Math.round((s.today / s.goal) * 100)) : 0;
  return (
    <div className="space-y-3">
      <Card padding="none" className="p-4">
        <div className="flex items-start gap-2.5">
          <KindIcon kind="steps" size={36} />
          <div className="min-w-0 flex-1">
            <p className="whitespace-nowrap text-[15px] font-black text-v2-ink">ממוצע יומי · השבוע</p>
            <p className="whitespace-nowrap text-[12px] font-bold text-v2-muted">מול שבוע שעבר</p>
          </div>
          <DeltaBadge current={s.weekAvg} previous={s.prevWeekAvg} />
        </div>
        <StatCell className="mt-3" value={formatCount(s.weekAvg)} unit="צעדים" label={`היום ${formatCount(s.today)} · ${pct}% מהיעד (${formatCount(s.goal)})`} />
        <div className="mt-2 h-2 overflow-hidden rounded-full bg-v2-surface ring-1 ring-inset ring-v2-hairline">
          <div className="h-full rounded-full" style={{ width: `${pct}%`, background: PROGRESS_COLORS.steps }} />
        </div>
      </Card>

      <div className="grid grid-cols-2 gap-2">
        {s.best && (
          <Card padding="none" className="p-3.5">
            <StatCell size="md" value={formatCount(s.best.steps)} unit="צעדים" label={`שיא · ${isoDayLabel(s.best.date)}`} />
          </Card>
        )}
        <Card padding="none" className="p-3.5">
          <StatCell size="md" value={`${s.daysInGoal}/${s.daysCounted}`} label="ימים ביעד השבוע" />
        </Card>
        <Card padding="none" className="p-3.5">
          <StatCell size="md" value={String(s.goalStreak)} unit="ימים" label="רצף ביעד" />
        </Card>
        {s.weekKm > 0 && (
          <Card padding="none" className="p-3.5">
            <StatCell size="md" value={formatKm(s.weekKm)} unit="ק״מ" label="מרחק השבוע" />
          </Card>
        )}
      </div>

      <ChartCard title="30 הימים האחרונים" hint="צעדים ביום">
        <BarChart data={s.chart} goal={s.goal} goalLabel={`יעד ${formatCount(s.goal)}`} highlightKey={s.chart[s.chart.length - 1]?.key} color={PROGRESS_COLORS.steps} height={170} ariaLabel="צעדים ב-30 הימים האחרונים" />
      </ChartCard>

      <Link
        href="/activity/steps"
        className="flex h-11 items-center justify-center whitespace-nowrap rounded-full bg-white text-[14px] font-extrabold text-v2-deep shadow-v2-ring transition-transform duration-150 ease-v2 active:scale-[0.97]"
      >
        לניתוח הצעדים המלא · יום · שבוע · חודש · שנה
      </Link>
    </div>
  );
}
