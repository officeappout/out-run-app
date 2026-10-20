'use client';

/**
 * P-2a — ריצה: this month vs last month (same stage), km per week (8 weeks,
 * plan goal line when a running plan sets one), pace trend (up = faster),
 * race prediction from running.paceProfile.basePace, the last 3 runs.
 * Data: the last 40 runs (one bounded read, only while this tab is open).
 */
import { useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { BarChart, Card, LineChart } from '@/components/ui/v2';
import { useUserStore } from '@/features/user/identity/store/useUserStore';
import { formatRaceClock, selectRacePrediction } from '@/features/home/utils/race-prediction';
import { useRecentOfType } from '../../hooks/useProgressData';
import { PROGRESS_COLORS } from '../../utils/progress-model';
import { monthCompare, paceOf, paceSeries, weeklySeries } from '../../utils/progress-series';
import { formatHours, formatKm, formatPace, monthName, relativeDay } from '../../utils/progress-format';
import { ChartCard, RecentRows, TabEmpty, TabHeaderCard, TabSkeleton } from './TabParts';

export default function RunTab() {
  const router = useRouter();
  const running = useUserStore((s) => s.profile?.running);
  const { data, loading } = useRecentOfType('running', true);
  const now = useMemo(() => new Date(), []);
  const runs = useMemo(() => data ?? [], [data]);
  const cmp = useMemo(() => monthCompare(runs, now), [runs, now]);
  const weekly = useMemo(() => weeklySeries(runs, 'km', now), [runs, now]);
  const pace = useMemo(() => paceSeries(runs), [runs]);
  const prediction = useMemo(
    () =>
      selectRacePrediction({
        basePace: running?.paceProfile?.basePace ?? null,
        targetDistance: running?.generatedProgramTemplate?.targetDistance,
        history: null,
        isRunner: true,
        runningProgramsEnabled: false,
        now,
      }),
    [running, now],
  );

  if (loading && !data) return <TabSkeleton />;
  if (runs.length === 0) return <TabEmpty kind="run" text="עוד אין ריצות שמורות. הריצה הראשונה תופיע כאן." />;

  const month = monthName(now.getMonth());
  const prevMonth = monthName(now.getMonth() - 1);
  const recent = [...runs].reverse().slice(0, 3);

  return (
    <div className="space-y-3">
      <TabHeaderCard
        kind="run"
        title={`ריצה · ${month}`}
        subtitle={`עד היום, מול ${prevMonth} באותו שלב`}
        current={cmp.current.km}
        previous={cmp.previous.km}
        hero={{ key: 'km', value: formatKm(cmp.current.km), unit: 'ק״מ', label: 'החודש' }}
        stats={[
          { key: 'n', value: String(cmp.current.count), label: 'ריצות' },
          { key: 'pace', value: formatPace(cmp.current.pace), label: 'קצב ממוצע' },
          { key: 'time', value: formatHours(cmp.current.minutes), unit: 'שע׳', label: 'זמן ריצה' },
        ]}
      />

      <ChartCard title="ק״מ לשבוע" hint="8 שבועות">
        <BarChart data={weekly} highlightKey="now" color={PROGRESS_COLORS.run} height={170} ariaLabel="ק״מ ריצה לשבוע, 8 שבועות" />
      </ChartCard>

      {pace.length >= 2 && (
        <ChartCard title="מגמת קצב" hint="דק׳ לק״מ · למעלה = מהיר יותר">
          <LineChart data={pace} color={PROGRESS_COLORS.run} formatValue={(v) => formatPace(paceOf(v))} ariaLabel="קצב ב-10 הריצות האחרונות" />
        </ChartCard>
      )}

      {prediction.state === 'ready' && (
        <Card padding="none" className="px-4 py-3.5">
          <div className="mb-2 flex items-baseline justify-between">
            <h3 className="whitespace-nowrap text-[15px] font-black text-v2-ink">חיזוי זמנים</h3>
            <span className="whitespace-nowrap text-[12px] font-extrabold text-v2-muted">לפי קצב הבסיס שלך</span>
          </div>
          <div className="grid grid-cols-3 gap-2">
            {[prediction.main, ...prediction.others].slice(0, 3).map((r) => (
              <div key={r.km} className="rounded-[16px] bg-v2-surface px-2 py-2.5 text-center ring-1 ring-inset ring-v2-hairline">
                <p className="whitespace-nowrap text-[12px] font-bold text-v2-muted">{r.label}</p>
                <p className="mt-0.5 text-[17px] font-black tabular-nums text-v2-ink" dir="ltr">
                  {formatRaceClock(r.seconds)}
                </p>
              </div>
            ))}
          </div>
        </Card>
      )}

      <RecentRows
        title="ריצות אחרונות"
        kind="run"
        rows={recent.map((r) => ({
          key: r.id,
          title: `${r.title ?? 'ריצה'} · ${formatKm(r.km)} ק״מ`,
          meta: `${relativeDay(r.date, now)} · ${formatPace(r.pace)} דק׳/ק״מ · ${Math.round(r.minutes)} דק׳`,
          onClick: () => router.push(`/workouts/${r.id}/history`),
        }))}
      />
    </div>
  );
}
