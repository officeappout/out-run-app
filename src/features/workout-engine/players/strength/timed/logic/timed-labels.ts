/**
 * timed-labels — every string the timed player shows, from the engine's
 * state / view (pure; boards A-1*, A-2*, A-4*, A-5c, U-E*). No emoji.
 */
import type { TimedView } from '@/features/workout-engine/engines/timed/timed.selectors';
import { emomIntervalMs } from '@/features/workout-engine/engines/timed/emom.machine';
import type { AmrapState, EmomState, TimedBlockSpec, TimedItem, TimedState } from '@/features/workout-engine/engines/timed/timed.types';
import type { TimedBlockResult } from '@/features/workout-engine/engines/timed/timed-result';

export const FORMAT_NAME: Record<TimedBlockSpec['format'], string> = { tabata: 'טבטה', emom: 'EMOM', amrap: 'AMRAP' };

/** Whole seconds left of a countdown (rounded UP, so 0.2 s left still reads 0:01). */
export function ceilSec(ms: number): number {
  return Math.max(0, Math.ceil(Math.max(0, ms) / 1000 - 1e-9));
}

/** "5:48" — or "05:48" with `pad`. */
export function formatClock(totalSec: number, pad = false): string {
  const s = Math.max(0, Math.round(totalSec));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${pad ? String(m).padStart(2, '0') : m}:${String(r).padStart(2, '0')}`;
}

/** Block length in whole minutes ("AMRAP 10′"). */
export function blockMinutes(spec: TimedBlockSpec): number {
  const sec =
    spec.format === 'amrap'
      ? spec.config.capSec
      : spec.format === 'emom'
        ? spec.config.intervalSec * spec.config.totalIntervals
        : spec.config.rounds * spec.config.workSec + Math.max(0, spec.config.rounds - 1) * spec.config.restSec;
  return Math.max(1, Math.round(sec / 60));
}

/** "AMRAP 10′" / "EMOM 12′" / "טבטה 20/10". */
export function blockTitle(spec: TimedBlockSpec): string {
  if (spec.format === 'tabata') return `${FORMAT_NAME.tabata} ${spec.config.workSec}/${spec.config.restSec}`;
  return `${FORMAT_NAME[spec.format]} ${blockMinutes(spec)}′`;
}

/** The big number + its unit on the work card ("12" / "חזרות"). */
export function itemTarget(item: TimedItem | null | undefined): { value: string; unit: string } | null {
  if (!item) return null;
  if (item.kind === 'aerobic_leg') {
    if (item.distanceM) return { value: String(item.distanceM), unit: 'מ׳' };
    if (item.durationSec) return { value: formatClock(item.durationSec), unit: 'דק׳' };
    return null;
  }
  if (item.targetReps) return { value: String(item.targetReps), unit: 'חזרות' };
  if (item.targetHoldSec) return { value: String(item.targetHoldSec), unit: 'שנ׳' };
  return null;
}

/** "12 חזרות" / "30 שנ׳" / "ריצה 400 מ׳" (empty when the plan gave no target). */
export function itemTargetText(item: TimedItem | null | undefined): string {
  if (!item) return '';
  if (item.kind === 'aerobic_leg') return item.name;
  const t = itemTarget(item);
  return t ? `${t.value} ${t.unit}` : '';
}

/** Unit of the reps picker for an item. */
export function itemUnit(item: TimedItem | null | undefined): 'reps' | 'time' {
  return item?.kind === 'exercise' && !item.targetReps && !!item.targetHoldSec ? 'time' : 'reps';
}

const sideLabel = (side: TimedView['side']) => (side === 'right' ? ' · ימין' : side === 'left' ? ' · שמאל' : '');

/** The coloured line above the work card. */
export function timedEyebrow(state: TimedState, view: TimedView, prefix: string | null = null): string {
  let core: string;
  if (state.spec.format === 'amrap') {
    const n = state.spec.items.length;
    core = `סבב ${view.round} · תרגיל ${(state as AmrapState).data.itemIndex + 1} מתוך ${n}`;
  } else if (state.spec.format === 'emom') {
    core = `דקה ${view.round}/${view.roundsTotal ?? view.round}`;
  } else {
    core = `אינטרוול ${view.round}/${view.roundsTotal ?? view.round}${sideLabel(view.side)}`;
  }
  return prefix ? `${prefix} · ${core}` : core;
}

/** Label over the header clock: "נותרו" / "פינישר · נותרו" / "הזמן נגמר". */
export function clockCaption(view: TimedView, prefix: string | null = null): string {
  if (view.status === 'awaiting_partial' || view.status === 'done') return 'הזמן נגמר';
  return prefix ? `${prefix} · נותרו` : 'נותרו';
}

/** The header clock ("05:48"): block time left. */
export function headerClock(view: TimedView): string {
  return formatClock(ceilSec(view.remainingMs), true);
}

/** The phase clock on the cards: EMOM minute / tabata interval / rest. */
export function phaseClock(view: TimedView): string {
  return formatClock(ceilSec(view.phaseRemainingMs));
}

/** Under the "סיימתי" CTA of a minute / round. */
export function workHint(view: TimedView, item: TimedItem | null): string | null {
  if (view.format === 'emom') {
    if (view.isLastSeconds && item?.kind === 'exercise') {
      return `עוד ${ceilSec(view.phaseRemainingMs)} שנ׳ — לא סיימת? נרשום כמה הספקת`;
    }
    return 'סיימת? מה שנשאר מהדקה הוא המנוחה';
  }
  if (view.format === 'amrap') return item?.kind === 'exercise' ? 'יעד קבוע בכל סבב' : null;
  return null;
}

/** "הבא בסבב" (AMRAP) / "דקה 6" (EMOM) / "התרגיל הבא" (tabata). */
export function nextCaption(view: TimedView): string {
  if (view.format === 'amrap') return 'הבא בסבב';
  if (view.format === 'emom') return `דקה ${view.round + 1}`;
  return 'התרגיל הבא';
}

/** EMOM rest line: "סיימת ב-0:39 · 21 שנ׳ מנוחה" (null when the minute was not finished by a tap). */
export function emomRestLine(state: EmomState, view: TimedView): string | null {
  const m = state.data.minutes[view.round - 1];
  if (!m || m.workMs == null || m.status !== 'done') return null;
  return `סיימת ב-${formatClock(Math.round(m.workMs / 1000))} · ${ceilSec(view.phaseRemainingMs)} שנ׳ מנוחה`;
}

/** EMOM: the minute's full length (for the minute ring). */
export function emomMinuteMs(state: EmomState): number {
  return emomIntervalMs(state);
}

/**
 * AMRAP round-done line (board A-2c): "2:38 לסבב · מהיר ב-0:04 מהסבב הקודם".
 * `roundIndex` is 0-based and must be a finished round.
 */
export function amrapRoundLine(state: AmrapState, roundIndex: number): string | null {
  const dur = (i: number): number | null => {
    const r = state.data.rounds[i];
    return r && r.endedActiveMs != null ? Math.round((r.endedActiveMs - r.startedActiveMs) / 1000) : null;
  };
  const cur = dur(roundIndex);
  if (cur == null) return null;
  const base = `${formatClock(cur)} לסבב`;
  const prev = roundIndex > 0 ? dur(roundIndex - 1) : null;
  if (prev == null || prev === cur) return base;
  const diff = formatClock(Math.abs(prev - cur));
  return prev > cur ? `${base} · מהיר ב-${diff} מהסבב הקודם` : `${base} · איטי ב-${diff} מהסבב הקודם`;
}

/** The format explainer behind the "i" (explains the FORMAT only). */
export function formatInfo(spec: TimedBlockSpec): { title: string; lines: string[] } {
  if (spec.format === 'amrap') {
    const n = spec.items.length;
    return {
      title: 'מה זה AMRAP?',
      lines: [
        `AMRAP = כמה שיותר סבבים בזמן הקצוב. כאן: ${blockMinutes(spec)} דקות.`,
        `סבב = ${n === 1 ? 'התרגיל' : `${n} התרגילים לפי הסדר`}. מסיימים אחד ועוברים מיד לבא.`,
        'סופרים סבבים מלאים, ובסוף מוסיפים את החזרות של הסבב שלא נגמר.',
        'אין מנוחה קבועה: נחים כשצריך, השעון ממשיך.',
      ],
    };
  }
  if (spec.format === 'emom') {
    const sec = spec.config.intervalSec;
    const every = sec === 60 ? 'כל דקה' : `כל ${sec} שנ׳`;
    return {
      title: 'מה זה EMOM?',
      lines: [
        `EMOM = ${every} מתחילים משימה חדשה. כאן: ${spec.config.totalIntervals} פעמים.`,
        'מסיימים את המשימה ולוחצים סיימתי — מה שנשאר מהזמן הוא המנוחה.',
        'לא הספקת עד הסוף? רושמים כמה עשית, והמשימה הבאה מתחילה בזמן.',
      ],
    };
  }
  return {
    title: 'מה זה טבטה?',
    lines: [
      `${spec.config.workSec} שניות עבודה, ${spec.config.restSec} שניות מנוחה — ${spec.config.rounds} אינטרוולים.`,
      'הטיימר מוביל: עוברים לבד בין עבודה למנוחה, אין צורך ללחוץ.',
      'עובדים בעצימות גבוהה לאורך כל האינטרוול.',
    ],
  };
}

/** The "block done" line: "4 סבבים מלאים · ועוד 16 חזרות" / "11/12 דקות בזמן" / "8/8 אינטרוולים". */
export function resultLine(result: TimedBlockResult): string {
  if (result.amrap) {
    const { fullRounds, extraReps } = result.amrap.score;
    const rounds = `${fullRounds} ${fullRounds === 1 ? 'סבב מלא' : 'סבבים מלאים'}`;
    return extraReps > 0 ? `${rounds} · ועוד ${extraReps} חזרות` : rounds;
  }
  if (result.emom) return `${result.emom.done}/${result.emom.total} דקות בזמן`;
  if (result.tabata) return `${result.tabata.intervalsDone}/${result.tabata.intervalsTotal} אינטרוולים`;
  return '';
}

/** Per-item line on the ready card: "12 חזרות · בכל סבב" / "דקות אי-זוגיות · 12 חזרות". */
export function readyItemLine(spec: TimedBlockSpec, index: number): string {
  const item = spec.items[index];
  const target = itemTargetText(item);
  if (!item) return '';
  if (spec.format === 'amrap') return item.kind === 'aerobic_leg' ? 'בכל סבב' : target ? `${target} · בכל סבב` : 'בכל סבב';
  if (spec.format === 'emom') {
    const n = spec.items.length;
    const which = n === 2 ? (index === 0 ? 'דקות אי-זוגיות' : 'דקות זוגיות') : n > 2 ? `כל ${n} דקות` : 'כל דקה';
    return target && item.kind === 'exercise' ? `${which} · ${target}` : which;
  }
  return `${spec.config.workSec} שנ׳${item.isUnilateral ? ' לכל צד' : ''}`;
}

/** Mini-player line while the player is dragged down: name + "סבב 3 · נותרו 05:48". */
export function miniPlayerInfo(state: TimedState, view: TimedView, prefix: string | null = null): { name: string; label: string } {
  const name = view.current?.name ?? blockTitle(state.spec);
  if (state.status === 'idle') return { name: blockTitle(state.spec), label: 'מוכן להתחלה' };
  return { name, label: `${timedEyebrow(state, view, prefix)} · ${clockCaption(view)} ${headerClock(view)}` };
}
