/**
 * timed-summary.model — the format cards of the v2 strength summary (pure;
 * boards A-2f AMRAP "התוצאה שלך", A-4f EMOM "דקה אחר דקה"). Input is the
 * compact TimedBlockRecord — built from this session's block results in the
 * live summary, or read back from the saved doc (`timedBlocks`) in history,
 * so both paths draw the exact same cards.
 */
import type { TimedBlockRecord } from '@/features/workout-engine/engines/timed/timed-record';

const clock = (sec: number) => {
  const s = Math.max(0, Math.round(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

const ORDINAL = ['', 'הראשון', 'השני', 'השלישי', 'הרביעי', 'החמישי', 'השישי', 'השביעי', 'השמיני', 'התשיעי', 'העשירי'];
/** "בסבב החמישי" (1-based round). */
export function roundOrdinal(n: number): string {
  return ORDINAL[n] ? `בסבב ${ORDINAL[n]}` : `בסבב ה-${n}`;
}

const minutesTitle = (name: string, sec: number) => `${name} ${Math.max(1, Math.round(sec / 60))}′`;

export interface AmrapSummaryModel {
  title: string;
  fullRounds: number;
  /** "ועוד 16 חזרות בסבב החמישי" — null when the last round was full. */
  extraLine: string | null;
  rounds: Array<{ key: string; label: string; time: string }>;
  /** The unfinished round's tile: "16/34" + its fill. */
  partial: { label: string; fraction: number } | null;
}

export function amrapSummaryModel(r: TimedBlockRecord): AmrapSummaryModel | null {
  if (!r.amrap) return null;
  const { fullRounds, partialReps, partialTarget, roundTimesSec } = r.amrap;
  const hasExtra = partialReps > 0;
  return {
    title: minutesTitle('AMRAP', r.plannedSec),
    fullRounds,
    extraLine: hasExtra ? `ועוד ${partialReps} חזרות ${roundOrdinal(fullRounds + 1)}` : null,
    rounds: roundTimesSec.map((t, i) => ({ key: `r${i}`, label: `סבב ${i + 1}`, time: clock(t) })),
    partial: hasExtra
      ? {
          label: partialTarget > 0 ? `${partialReps}/${partialTarget}` : String(partialReps),
          fraction: partialTarget > 0 ? Math.min(1, partialReps / partialTarget) : 1,
        }
      : null,
  };
}

export type MinuteTone = 'done' | 'partial' | 'missed';

export interface EmomSummaryModel {
  title: string;
  doneLabel: string;
  percent: number;
  totalReps: number;
  /** Average work per finished minute ("0:46"), null when none. */
  avgWork: string | null;
  /** Average rest after a finished minute ("0:14"), null when none. */
  avgRest: string | null;
  bars: Array<{ key: string; label: string; fraction: number; tone: MinuteTone }>;
  /** "דקה 10 (כתום): 8 מתוך 10 חזרות" for the first partial minute. */
  note: string | null;
}

export function emomSummaryModel(r: TimedBlockRecord): EmomSummaryModel | null {
  if (!r.emom) return null;
  const minutes = r.emom.minutes;
  const total = minutes.length;
  const done = minutes.filter((m) => m.status === 'done').length;
  const intervalSec = total > 0 && r.plannedSec > 0 ? r.plannedSec / total : 60;
  const finished = minutes.filter((m) => m.status === 'done' && m.workSec != null);
  const avgWorkSec = finished.length ? finished.reduce((a, m) => a + (m.workSec ?? 0), 0) / finished.length : null;
  const pIdx = minutes.findIndex((m) => m.status === 'partial');
  const p = pIdx >= 0 ? minutes[pIdx] : null;
  return {
    title: minutesTitle('EMOM', r.plannedSec),
    doneLabel: `${done}/${total}`,
    percent: total > 0 ? Math.round((done / total) * 100) : 0,
    totalReps: minutes.reduce((a, m) => a + (m.status === 'missed' ? 0 : m.reps ?? 0), 0),
    avgWork: avgWorkSec != null ? clock(avgWorkSec) : null,
    avgRest: avgWorkSec != null ? clock(intervalSec - avgWorkSec) : null,
    bars: minutes.map((m, i) => ({
      key: `m${i}`,
      label: String(i + 1),
      tone: m.status,
      fraction: m.status === 'done' ? Math.min(1, (m.workSec ?? intervalSec) / intervalSec) : m.status === 'partial' ? 1 : 0.06,
    })),
    note: p ? `דקה ${pIdx + 1} (כתום): ${p.reps ?? 0}${p.target ? ` מתוך ${p.target}` : ''} חזרות` : null,
  };
}

/** Tabata: "8/8 אינטרוולים". */
export function tabataSummaryLine(r: TimedBlockRecord): string | null {
  return r.tabata ? `${r.tabata.intervals}/${r.tabata.intervalsTotal} אינטרוולים` : null;
}
