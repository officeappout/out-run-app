/**
 * P-1e — "this period vs the previous one at the same stage": the headline
 * ("זזת 12% יותר") and the paired rows per activity. Works on the two
 * PeriodSummary objects the summary card already has — no extra reads. Pure.
 */
import { computeDelta } from '@/components/ui/v2/logic';
import type { DayRange, PeriodSummary, ProgressPeriod } from './progress-period';
import { WEEKDAY_SHORT, formatCount, formatKm, monthName } from './progress-format';
import { PROGRESS_COLORS } from './progress-model';

export type CompareKey = 'strength' | 'run' | 'walk' | 'steps';

export interface CompareRow {
  key: CompareKey;
  label: string;
  current: number;
  previous: number;
  currentText: string;
  previousText: string;
  color: string;
}

export type HeadlineTone = 'up' | 'down' | 'flat' | 'new' | 'none';

export interface CompareHeadline {
  tone: HeadlineTone;
  title: string;
  /** "214 דק׳ עד יום ה׳ · בשבוע שעבר 191 דק׳ באותו שלב" */
  detail: string;
}

function dayCount(r: { start: Date; end: Date }): number {
  return Math.max(1, Math.round((r.end.getTime() - r.start.getTime()) / 86_400_000));
}

/** "בשבוע שעבר" / "בספטמבר". */
export function previousLabel(period: ProgressPeriod, previous: DayRange): string {
  return period === 'week' ? 'בשבוע שעבר' : `ב${monthName(previous.start.getMonth())}`;
}

/** "עד יום ה׳" / "עד ה-21 בחודש". */
export function stageLabel(period: ProgressPeriod, now: Date): string {
  return period === 'week' ? `עד יום ${WEEKDAY_SHORT[now.getDay()]}` : `עד ה-${now.getDate()} בחודש`;
}

/** The big line on top: active minutes now vs before. */
export function compareHeadline(
  period: ProgressPeriod,
  current: PeriodSummary,
  previous: PeriodSummary,
  ranges: { previous: DayRange },
  now: Date,
): CompareHeadline {
  const cur = Math.round(current.minutes);
  const prev = Math.round(previous.minutes);
  const before = previousLabel(period, ranges.previous);
  const detail = `${formatCount(cur)} דק׳ ${stageLabel(period, now)} · ${before} ${formatCount(prev)} דק׳ באותו שלב`;
  if (cur <= 0 && prev <= 0) {
    return { tone: 'none', title: period === 'week' ? 'השבוע עוד לפניך' : 'החודש עוד לפניך', detail };
  }
  const d = computeDelta(cur, prev);
  if (!d) return { tone: 'new', title: `זזת ${formatCount(cur)} דק׳`, detail };
  if (d.direction === 'flat') return { tone: 'flat', title: `זזת בדיוק כמו ${before}`, detail };
  return { tone: d.direction, title: `זזת ${d.pct}% ${d.direction === 'up' ? 'יותר' : 'פחות'}`, detail };
}

/**
 * One row per activity that has something in either period: strength minutes,
 * run km, walk km, steps (month → per day, like the summary card, since the
 * two months can have a different number of days).
 */
export function compareRows(
  period: ProgressPeriod,
  current: PeriodSummary,
  previous: PeriodSummary,
  ranges: { current: DayRange; previous: DayRange },
): CompareRow[] {
  const minutes = (n: number) => `${formatCount(n)}′`;
  const stepsCur = period === 'week' ? current.steps : Math.round(current.steps / dayCount(ranges.current));
  const stepsPrev = period === 'week' ? previous.steps : Math.round(previous.steps / dayCount(ranges.previous));
  const r1 = (n: number) => Math.round(n * 10) / 10;
  const rows: CompareRow[] = [
    {
      key: 'strength',
      label: 'כוח · דקות',
      current: Math.round(current.byKind.strength.minutes),
      previous: Math.round(previous.byKind.strength.minutes),
      currentText: '',
      previousText: '',
      color: PROGRESS_COLORS.strength,
    },
    { key: 'run', label: 'ריצה · ק״מ', current: r1(current.byKind.run.km), previous: r1(previous.byKind.run.km), currentText: '', previousText: '', color: PROGRESS_COLORS.run },
    { key: 'walk', label: 'הליכה · ק״מ', current: r1(current.byKind.walk.km), previous: r1(previous.byKind.walk.km), currentText: '', previousText: '', color: PROGRESS_COLORS.walk },
    { key: 'steps', label: period === 'week' ? 'צעדים' : 'צעדים ליום', current: stepsCur, previous: stepsPrev, currentText: '', previousText: '', color: PROGRESS_COLORS.steps },
  ];
  return rows
    .filter((r) => r.current > 0 || r.previous > 0)
    .map((r) => {
      const fmt = r.key === 'strength' ? minutes : r.key === 'steps' ? formatCount : formatKm;
      return { ...r, currentText: fmt(r.current), previousText: fmt(r.previous) };
    });
}
