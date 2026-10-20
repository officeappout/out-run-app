'use client';

/**
 * P-1a/b — "השבוע שלך" / "אוקטובר 2026 · עד היום": 4 numbers vs the
 * previous period at the same stage, then the split by activity (bar + rows).
 */
import { Card } from '@/components/ui/v2';
import type { PeriodSummary, PeriodRanges, ProgressPeriod } from '../utils/progress-period';
import { PROGRESS_COLORS } from '../utils/progress-model';
import { formatCount, formatKm, formatMinutes, monthName, weekRangeLabel } from '../utils/progress-format';
import StatCell from './StatCell';
import KindIcon from './KindIcon';

export interface PeriodSummaryCardProps {
  period: ProgressPeriod;
  ranges: PeriodRanges;
  current: PeriodSummary;
  previous: PeriodSummary;
}

function weekEnd(start: Date): Date {
  return new Date(start.getFullYear(), start.getMonth(), start.getDate() + 6);
}

export default function PeriodSummaryCard({ period, ranges, current, previous }: PeriodSummaryCardProps) {
  const start = ranges.current.start;
  const title =
    period === 'week'
      ? `השבוע שלך · ${weekRangeLabel(start, weekEnd(start))}`
      : `${monthName(start.getMonth())} ${start.getFullYear()} · עד היום`;
  const vs = period === 'week' ? 'מול שבוע שעבר' : `מול ${monthName(ranges.previous.start.getMonth())} באותו שלב`;
  const time = formatMinutes(current.minutes);
  const daysCount = Math.max(1, Math.round((ranges.current.end.getTime() - ranges.current.start.getTime()) / 86400000));
  const prevDays = Math.max(1, Math.round((ranges.previous.end.getTime() - ranges.previous.start.getTime()) / 86400000));
  const stepsValue = period === 'week' ? current.steps : Math.round(current.steps / daysCount);
  const stepsPrev = period === 'week' ? previous.steps : Math.round(previous.steps / prevDays);

  const rows = (
    [
      { kind: 'strength', label: 'כוח', color: PROGRESS_COLORS.strength, t: current.byKind.strength, sub: `${current.byKind.strength.count === 1 ? 'אימון אחד' : `${current.byKind.strength.count} אימונים`}${current.byKind.strength.sets ? ` · ${current.byKind.strength.sets} סטים` : ''}` },
      { kind: 'run', label: 'ריצה', color: PROGRESS_COLORS.run, t: current.byKind.run, sub: `${current.byKind.run.count === 1 ? 'ריצה אחת' : `${current.byKind.run.count} ריצות`} · ${formatKm(current.byKind.run.km)} ק״מ` },
      { kind: 'walk', label: 'הליכה', color: PROGRESS_COLORS.walk, t: current.byKind.walk, sub: `${current.byKind.walk.count === 1 ? 'הליכה אחת' : `${current.byKind.walk.count} הליכות`} · ${formatKm(current.byKind.walk.km)} ק״מ` },
    ] as const
  ).filter((r) => r.t.count > 0);
  const splitTotal = rows.reduce((s, r) => s + r.t.minutes, 0);

  return (
    <Card padding="none" className="p-4">
      <div className="flex items-center justify-between gap-2">
        <span className="truncate whitespace-nowrap text-[13px] font-extrabold text-v2-deep">{title}</span>
        <span className="whitespace-nowrap text-[12px] font-bold text-v2-muted">{vs}</span>
      </div>

      <div className="-mx-1 mt-1 grid grid-cols-2">
        <StatCell className="border-b border-l border-v2-hairline p-3" value={formatCount(current.workouts)} label="אימונים" current={current.workouts} previous={previous.workouts} />
        <StatCell className="border-b border-v2-hairline p-3" value={time.value} unit={time.unit} label="זמן פעילות" current={current.minutes} previous={previous.minutes} />
        <StatCell className="border-l border-v2-hairline p-3" value={formatKm(current.km)} unit="ק״מ" label="ריצה והליכה" current={current.km} previous={previous.km} />
        <StatCell
          className="p-3"
          value={formatCount(stepsValue)}
          label={period === 'week' ? 'צעדים' : 'צעדים ביום בממוצע'}
          current={stepsValue}
          previous={stepsPrev}
        />
      </div>

      {rows.length > 0 && splitTotal > 0 && (
        <>
          <div className="mt-3.5 flex items-center justify-between">
            <span className="whitespace-nowrap text-[13px] font-extrabold text-v2-deep">פילוח לפי פעילות</span>
            <span className="whitespace-nowrap text-[12px] font-bold text-v2-muted">סה״כ {formatMinutes(splitTotal).value} {formatMinutes(splitTotal).unit}</span>
          </div>
          <div className="mt-2 flex h-3 gap-[3px] overflow-hidden rounded-full" aria-hidden>
            {rows.map((r) => (
              <span key={r.kind} style={{ width: `${(r.t.minutes / splitTotal) * 100}%`, background: r.color }} />
            ))}
          </div>
          <ul className="mt-1.5">
            {rows.map((r) => {
              const m = formatMinutes(r.t.minutes);
              return (
                <li key={r.kind} className="flex items-center gap-2.5 py-2">
                  <KindIcon kind={r.kind} />
                  <div className="min-w-0 flex-1">
                    <p className="whitespace-nowrap text-[14px] font-extrabold text-v2-ink">{r.label}</p>
                    <p className="truncate whitespace-nowrap text-[12px] font-bold text-v2-muted">{r.sub}</p>
                  </div>
                  <span className="whitespace-nowrap text-[15px] font-black tabular-nums text-v2-ink">
                    {m.value}
                    <span className="text-[12px] font-bold text-v2-muted"> {m.unit}</span>
                  </span>
                </li>
              );
            })}
          </ul>
        </>
      )}
    </Card>
  );
}
