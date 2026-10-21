'use client';

/**
 * P-1e — the comparison, opened from the summary card (its "מול שבוע שעבר"
 * pill or any ▲▼): "זזת 12% יותר", this period's minutes split by activity
 * (P-1d's segmented bar), then now-vs-before paired bars per activity.
 * Built from the two summaries the card already has — no extra reads.
 */
import { DeltaBadge, PairedBarRow, PAIRED_PREVIOUS_COLOR, Sheet, SplitBar } from '@/components/ui/v2';
import type { PeriodRanges, PeriodSummary, ProgressPeriod } from '../utils/progress-period';
import { KIND_LABEL, PROGRESS_COLORS } from '../utils/progress-model';
import { activitySplit } from '../utils/period-spark';
import { compareHeadline, compareRows, type HeadlineTone } from '../utils/period-compare';
import { monthName, weekRangeLabel } from '../utils/progress-format';
import { KindGlyph } from './KindIcon';
import { useT } from '@/hooks/useT';
import { profile as profileNs } from '@/messages/ns/profile';

export interface PeriodCompareSheetProps {
  open: boolean;
  onClose: () => void;
  period: ProgressPeriod;
  ranges: PeriodRanges;
  current: PeriodSummary;
  previous: PeriodSummary;
  now: Date;
}

const TEXT: Record<'strength' | 'run' | 'walk', string> = {
  strength: '#0284c7',
  run: PROGRESS_COLORS.runText,
  walk: PROGRESS_COLORS.walkText,
};

const HEADLINE: Record<HeadlineTone, { bg: string; fg: string }> = {
  up: { bg: 'rgba(0,168,106,0.08)', fg: '#00845a' },
  new: { bg: 'rgba(0,168,106,0.08)', fg: '#00845a' },
  flat: { bg: 'rgba(0,186,247,0.08)', fg: '#0284c7' },
  // Fewer minutes is information, not a scolding — neutral, never red.
  down: { bg: '#f6fbfd', fg: '#0e1419' },
  none: { bg: '#f6fbfd', fg: '#0e1419' },
};

export default function PeriodCompareSheet({ open, onClose, period, ranges, current, previous, now }: PeriodCompareSheetProps) {
  const t = useT(profileNs);
  const start = ranges.current.start;
  const end = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 6);
  const title =
    period === 'week'
      ? t('hub.compare.title.week', { range: weekRangeLabel(start, end) })
      : t('hub.compare.title.month', { month: monthName(start.getMonth()), year: String(start.getFullYear()) });
  const nowLabel = period === 'week' ? t('hub.compare.now.week') : t('hub.compare.now.month');
  const beforeLabel = period === 'week' ? t('hub.compare.before.week') : monthName(ranges.previous.start.getMonth());
  const headline = compareHeadline(period, current, previous, ranges, now);
  const rows = compareRows(period, current, previous, ranges);
  const split = activitySplit(current);
  const tone = HEADLINE[headline.tone];

  return (
    <Sheet open={open} onClose={onClose} title={t('hub.compare.sheetTitle')} closeOnEscape respectReducedMotion dragToDismiss className="max-h-[88dvh]" bodyClassName="px-5 pb-2">
      <div className="flex items-center justify-between gap-2">
        <span className="truncate whitespace-nowrap text-[13px] font-extrabold text-v2-deep">{title}</span>
        <span className="whitespace-nowrap text-[12px] font-bold text-v2-muted">{t('hub.compare.vs', { before: beforeLabel })}</span>
      </div>

      <div className="mt-2.5 rounded-[18px] p-3" style={{ background: tone.bg }} data-compare-tone={headline.tone}>
        <div className="text-[20px] font-black !tracking-[-0.02em]" style={{ color: tone.fg }}>{headline.title}</div>
        <div className="text-[12.5px] font-bold text-v2-ink-2">{headline.detail}</div>
      </div>

      {split.length > 0 && (
        <div className="mt-3.5">
          <div className="mb-1.5 text-[13px] font-extrabold text-v2-ink">{t('hub.compare.splitTitle', { now: nowLabel })}</div>
          <SplitBar
            ariaLabel={t('hub.compare.splitTitle', { now: nowLabel })}
            segments={split.map((s) => ({
              key: s.kind,
              value: s.minutes,
              color: PROGRESS_COLORS[s.kind],
              textColor: TEXT[s.kind],
              label: `${KIND_LABEL[s.kind]} ${s.minutes}′`,
              icon: <KindGlyph kind={s.kind} className="h-3.5 w-3.5 shrink-0" />,
            }))}
          />
        </div>
      )}

      {rows.length > 0 ? (
        <div className="mt-3.5">
          <div className="flex gap-3 text-[11.5px] font-extrabold text-v2-muted">
            <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
              <span className="h-2 w-3.5 rounded-full bg-v2-ink" />
              {nowLabel}
            </span>
            <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
              <span className="h-[5px] w-3.5 rounded-full" style={{ background: PAIRED_PREVIOUS_COLOR }} />
              {beforeLabel}
            </span>
          </div>
          {rows.map((r, i) => (
            <PairedBarRow
              key={r.key}
              label={
                <>
                  <span className="inline-flex shrink-0" style={{ color: r.key === 'steps' ? PROGRESS_COLORS.walkText : TEXT[r.key] }}>
                    <KindGlyph kind={r.key} className="h-4 w-4" />
                  </span>
                  {r.label}
                </>
              }
              badge={<DeltaBadge current={r.current} previous={r.previous} className="!h-[22px] shrink-0 !px-2 !text-[11.5px]" />}
              current={r.current}
              previous={r.previous}
              currentText={r.currentText}
              previousText={r.previousText}
              color={r.color}
              last={i === rows.length - 1}
            />
          ))}
        </div>
      ) : (
        <p className="mt-4 text-center text-[13px] font-bold text-v2-muted">{t('hub.compare.empty')}</p>
      )}
    </Sheet>
  );
}
