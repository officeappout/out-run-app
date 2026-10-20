'use client';

/**
 * P-1c (owner pick pending: P-1c ring / P-1d hero / P-1e compare) — the period
 * summary: active minutes as the hero, in a ring split by activity (the same
 * colours as the week strip's flames); workouts / km / steps beside it, each
 * with its ▲▼ vs the previous period at the same stage and tiny per-day
 * (week) / per-week (month) bars; one chip per activity opens its tab.
 * With `onOpenCompare`, the "מול …" label is a pill and the ring / ▲▼ are
 * tap targets for the P-1e comparison sheet (PeriodCompareSheet).
 */
import { ChevronLeft } from 'lucide-react';
import { Card, DeltaBadge, SegmentedRing, SparkBars } from '@/components/ui/v2';
import type { PeriodSummary, PeriodRanges, ProgressPeriod } from '../utils/progress-period';
import { PROGRESS_COLORS, KIND_LABEL } from '../utils/progress-model';
import { formatCount, formatKm, formatMinutes, monthName, weekRangeLabel } from '../utils/progress-format';
import { activitySplit, type PeriodSpark, type SplitKind } from '../utils/period-spark';
import { KindGlyph } from './KindIcon';

export interface PeriodSummaryRingCardProps {
  period: ProgressPeriod;
  ranges: PeriodRanges;
  current: PeriodSummary;
  previous: PeriodSummary;
  spark: PeriodSpark;
  /** Tap an activity chip → open that activity's tab. */
  onSelectKind?: (kind: SplitKind) => void;
  /**
   * P-1e: open the comparison. When set, the "מול שבוע שעבר" label becomes a
   * pill and the ring and every ▲▼ open it too.
   */
  onOpenCompare?: () => void;
}

const CHIP: Record<SplitKind, { bg: string; fg: string }> = {
  strength: { bg: 'rgba(0,186,247,0.12)', fg: '#0284c7' },
  run: { bg: 'rgba(132,204,22,0.14)', fg: PROGRESS_COLORS.runText },
  walk: { bg: 'rgba(245,158,11,0.14)', fg: PROGRESS_COLORS.walkText },
};

function days(r: { start: Date; end: Date }): number {
  return Math.max(1, Math.round((r.end.getTime() - r.start.getTime()) / 86_400_000));
}

function StatRow({
  value,
  unit,
  label,
  current,
  previous,
  bars,
  color,
  currentIndex,
  last,
  onOpenCompare,
}: {
  value: string;
  unit?: string;
  label: string;
  current: number;
  previous: number;
  bars: number[];
  color: string;
  currentIndex: number;
  last?: boolean;
  onOpenCompare?: () => void;
}) {
  const badge = <DeltaBadge current={current} previous={previous} className="!h-[22px] shrink-0 !px-1.5 !text-[11px]" />;
  return (
    <div className={`flex items-center gap-2 py-2 ${last ? '' : 'border-b border-v2-hairline'}`}>
      <div className="min-w-0 flex-1">
        <span className="inline-flex items-baseline gap-1">
          <span className="text-[20px] font-black leading-none !tracking-[-0.02em] tabular-nums text-v2-ink">{value}</span>
          {unit && <span className="whitespace-nowrap text-[11.5px] font-bold text-v2-muted">{unit}</span>}
        </span>
        <div className="mt-1 flex items-center gap-1.5">
          <span className="truncate whitespace-nowrap text-[11.5px] font-bold text-v2-muted">{label}</span>
          {onOpenCompare ? (
            <button type="button" onClick={onOpenCompare} aria-label={`השוואה · ${label}`} className="shrink-0 rounded-full transition-transform duration-150 ease-v2 active:scale-[0.97]">
              {badge}
            </button>
          ) : (
            badge
          )}
        </div>
      </div>
      <SparkBars values={bars} color={color} currentIndex={currentIndex} width={56} height={26} />
    </div>
  );
}

export default function PeriodSummaryRingCard({ period, ranges, current, previous, spark, onSelectKind, onOpenCompare }: PeriodSummaryRingCardProps) {
  const start = ranges.current.start;
  const end = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 6);
  const title = period === 'week' ? `השבוע שלך · ${weekRangeLabel(start, end)}` : `${monthName(start.getMonth())} ${start.getFullYear()} · עד היום`;
  const vs = period === 'week' ? 'מול שבוע שעבר' : `מול ${monthName(ranges.previous.start.getMonth())} באותו שלב`;
  const time = formatMinutes(current.minutes);
  const split = activitySplit(current);
  const ring = (
    <SegmentedRing
      size={128}
      stroke={13}
      segments={split.map((s) => ({ key: s.kind, value: s.minutes, color: PROGRESS_COLORS[s.kind] }))}
      label={`${time.value} ${time.unit} פעילות`}
    >
      <span className="text-[32px] font-black leading-none !tracking-[-0.03em] tabular-nums text-v2-ink">{time.value}</span>
      <span className="mt-0.5 whitespace-nowrap text-[11.5px] font-bold text-v2-muted">{time.unit} פעילות</span>
      <DeltaBadge current={current.minutes} previous={previous.minutes} className="mt-1.5 !h-[22px] !px-1.5 !text-[11px]" />
    </SegmentedRing>
  );
  const stepsValue = period === 'week' ? current.steps : Math.round(current.steps / days(ranges.current));
  const stepsPrev = period === 'week' ? previous.steps : Math.round(previous.steps / days(ranges.previous));

  return (
    <Card padding="none" className="p-4">
      <div className="flex items-center justify-between gap-2">
        <span className="truncate whitespace-nowrap text-[13px] font-extrabold text-v2-deep">{title}</span>
        {onOpenCompare ? (
          <button
            type="button"
            onClick={onOpenCompare}
            data-open-compare
            className="inline-flex h-8 shrink-0 items-center gap-0.5 whitespace-nowrap rounded-full bg-white pe-2 ps-3 text-[12px] font-extrabold text-v2-deep shadow-v2-ring transition-transform duration-150 ease-v2 active:scale-[0.97]"
          >
            {vs}
            <ChevronLeft className="h-3.5 w-3.5" strokeWidth={2.6} aria-hidden />
          </button>
        ) : (
          <span className="whitespace-nowrap text-[12px] font-bold text-v2-muted">{vs}</span>
        )}
      </div>

      <div className="mt-2.5 flex items-center gap-3.5">
        {onOpenCompare ? (
          <button type="button" onClick={onOpenCompare} aria-label={`השוואה ${vs}`} className="shrink-0 rounded-full transition-transform duration-150 ease-v2 active:scale-[0.97]">
            {ring}
          </button>
        ) : (
          ring
        )}
        <div className="min-w-0 flex-1">
          <StatRow
            value={formatCount(current.workouts)}
            label="אימונים"
            current={current.workouts}
            previous={previous.workouts}
            bars={spark.workouts}
            color={PROGRESS_COLORS.strength}
            currentIndex={spark.todayIndex}
            onOpenCompare={onOpenCompare}
          />
          <StatRow
            value={formatKm(current.km)}
            unit="ק״מ"
            label="ריצה והליכה"
            current={current.km}
            previous={previous.km}
            bars={spark.km}
            color={PROGRESS_COLORS.run}
            currentIndex={spark.todayIndex}
            onOpenCompare={onOpenCompare}
          />
          <StatRow
            value={formatCount(stepsValue)}
            label={period === 'week' ? 'צעדים' : 'צעדים ליום'}
            current={stepsValue}
            previous={stepsPrev}
            bars={spark.steps}
            color={PROGRESS_COLORS.steps}
            currentIndex={spark.todayIndex}
            onOpenCompare={onOpenCompare}
            last
          />
        </div>
      </div>

      {split.length > 0 && (
        <div className="mt-3 flex gap-1.5">
          {split.map((s) => (
            <button
              key={s.kind}
              type="button"
              onClick={() => onSelectKind?.(s.kind)}
              className="flex h-10 min-w-0 flex-1 items-center gap-1.5 rounded-[14px] px-2.5 transition-transform duration-150 ease-v2 active:scale-[0.97]"
              style={{ background: CHIP[s.kind].bg, color: CHIP[s.kind].fg }}
              aria-label={`${KIND_LABEL[s.kind]} · ${s.minutes} דקות`}
            >
              <KindGlyph kind={s.kind} className="h-3.5 w-3.5 shrink-0" />
              <span className="truncate whitespace-nowrap text-[12.5px] font-extrabold">{KIND_LABEL[s.kind]}</span>
              <span className="ms-auto whitespace-nowrap text-[13px] font-black tabular-nums text-v2-ink">
                {s.minutes}
                <span className="text-[11px] font-bold text-v2-muted">′</span>
              </span>
            </button>
          ))}
        </div>
      )}
    </Card>
  );
}
