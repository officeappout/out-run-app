/**
 * timed-summary.model — the format cards of the v2 strength summary (pure;
 * boards A-2f AMRAP "התוצאה שלך", A-4f EMOM "דקה אחר דקה"). Input is the
 * timed engine's block result of THIS session (in memory; see
 * players/strength/timed/state/timed-results).
 */
import type { TimedBlockResult } from '@/features/workout-engine/engines/timed/timed-result';

const clock = (sec: number) => {
  const s = Math.max(0, Math.round(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};

const ORDINAL = ['', 'הראשון', 'השני', 'השלישי', 'הרביעי', 'החמישי', 'השישי', 'השביעי', 'השמיני', 'התשיעי', 'העשירי'];
/** "בסבב החמישי" (1-based round). */
export function roundOrdinal(n: number): string {
  return ORDINAL[n] ? `בסבב ${ORDINAL[n]}` : `בסבב ה-${n}`;
}

export interface AmrapSummaryModel {
  title: string;
  fullRounds: number;
  /** "ועוד 16 חזרות בסבב החמישי" — null when the last round was full. */
  extraLine: string | null;
  rounds: Array<{ key: string; label: string; time: string }>;
  /** The unfinished round's tile: "16/34" + its fill. */
  partial: { label: string; fraction: number } | null;
}

export function amrapSummaryModel(r: TimedBlockResult): AmrapSummaryModel | null {
  if (!r.amrap) return null;
  const { fullRounds, extraReps } = r.amrap.score;
  const roundTarget = r.exerciseLog.reduce((a, e) => a + (e.repsSource?.includes('timer') ? 0 : e.targetReps || 0), 0);
  const rounds = r.amrap.rounds
    .filter((x) => x.complete)
    .map((x, i) => ({ key: `r${x.index}`, label: `סבב ${i + 1}`, time: clock(x.durationSec) }));
  const hasExtra = extraReps > 0;
  return {
    title: `AMRAP ${Math.max(1, Math.round(r.plannedSec / 60))}′`,
    fullRounds,
    extraLine: hasExtra ? `ועוד ${extraReps} חזרות ${roundOrdinal(fullRounds + 1)}` : null,
    rounds,
    partial: hasExtra
      ? { label: roundTarget > 0 ? `${extraReps}/${roundTarget}` : String(extraReps), fraction: roundTarget > 0 ? Math.min(1, extraReps / roundTarget) : 1 }
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

export function emomSummaryModel(r: TimedBlockResult): EmomSummaryModel | null {
  if (!r.emom) return null;
  const { minutes, done, total } = r.emom;
  const intervalSec = total > 0 ? r.plannedSec / total : 60;
  const finished = minutes.filter((m) => m.status === 'done' && m.workSec != null);
  const avgWorkSec = finished.length ? finished.reduce((a, m) => a + (m.workSec ?? 0), 0) / finished.length : null;
  const targetOf = (key: string) => r.exerciseLog.find((e) => e.exerciseId === key || e.exerciseName === key)?.targetReps ?? null;
  const firstPartial = minutes.find((m) => m.status === 'partial');
  return {
    title: `EMOM ${Math.max(1, Math.round(r.plannedSec / 60))}′`,
    doneLabel: `${done}/${total}`,
    percent: total > 0 ? Math.round((done / total) * 100) : 0,
    totalReps: minutes.reduce((a, m) => a + (m.status === 'missed' ? 0 : m.reps ?? 0), 0),
    avgWork: avgWorkSec != null ? clock(avgWorkSec) : null,
    avgRest: avgWorkSec != null ? clock(intervalSec - avgWorkSec) : null,
    bars: Array.from({ length: total }, (_, i) => {
      const m = minutes.find((x) => x.index === i);
      const tone: MinuteTone = m?.status === 'done' ? 'done' : m?.status === 'partial' ? 'partial' : 'missed';
      const fraction = tone === 'done' ? Math.min(1, (m?.workSec ?? intervalSec) / intervalSec) : tone === 'partial' ? 1 : 0.06;
      return { key: `m${i}`, label: String(i + 1), fraction, tone };
    }),
    note: firstPartial
      ? (() => {
          const t = targetOf(firstPartial.itemKey);
          return `דקה ${firstPartial.index + 1} (כתום): ${firstPartial.reps ?? 0}${t ? ` מתוך ${t}` : ''} חזרות`;
        })()
      : null,
  };
}

/** Tabata: "8/8 אינטרוולים". */
export function tabataSummaryLine(r: TimedBlockResult): string | null {
  return r.tabata ? `${r.tabata.intervalsDone}/${r.tabata.intervalsTotal} אינטרוולים` : null;
}
