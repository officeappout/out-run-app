/**
 * timed-labels — every string the timed player shows, from the engine's
 * state / view (pure; boards A-1*, A-2*, A-4*, A-5c, U-E*). No emoji.
 */
import type { TimedView } from '@/features/workout-engine/engines/timed/timed.selectors';
import { emomIntervalMs } from '@/features/workout-engine/engines/timed/emom.machine';
import type { AmrapState, EmomState, TimedBlockSpec, TimedItem, TimedState } from '@/features/workout-engine/engines/timed/timed.types';
import type { TimedBlockResult } from '@/features/workout-engine/engines/timed/timed-result';
import { makeT } from '@/lib/i18n/t';
import { unitLabel } from '@/lib/i18n/units';
import { player } from '@/messages/ns/player';

/** Hebrew translator, built once (these labels are rebuilt every tick mid-workout). */
const t = makeT('he', player);

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
  if (spec.format === 'tabata') return t('timedLabels.title.tabata', { work: String(spec.config.workSec), rest: String(spec.config.restSec) });
  return t('timedLabels.title.minutes', { format: spec.format, minutes: String(blockMinutes(spec)) });
}

/** The big number + its unit on the work card ("12" / "חזרות"). */
export function itemTarget(item: TimedItem | null | undefined): { value: string; unit: string } | null {
  if (!item) return null;
  if (item.kind === 'aerobic_leg') {
    if (item.distanceM) return { value: String(item.distanceM), unit: unitLabel('m') };
    if (item.durationSec) return { value: formatClock(item.durationSec), unit: unitLabel('min') };
    return null;
  }
  if (item.targetReps) return { value: String(item.targetReps), unit: t('timedLabels.unit.reps') };
  if (item.targetHoldSec) return { value: String(item.targetHoldSec), unit: t('timedLabels.unit.sec') };
  return null;
}

/** "12 חזרות" / "30 שנ׳" / "ריצה 400 מ׳" (empty when the plan gave no target). */
export function itemTargetText(item: TimedItem | null | undefined): string {
  if (!item) return '';
  if (item.kind === 'aerobic_leg') return item.name;
  const target = itemTarget(item);
  return target ? t('timedLabels.target.text', { value: target.value, unit: target.unit }) : '';
}

/** Unit of the reps picker for an item. */
export function itemUnit(item: TimedItem | null | undefined): 'reps' | 'time' {
  return item?.kind === 'exercise' && !item.targetReps && !!item.targetHoldSec ? 'time' : 'reps';
}

/** The coloured line above the work card. */
export function timedEyebrow(state: TimedState, view: TimedView, prefix: string | null = null): string {
  let core: string;
  if (state.spec.format === 'amrap') {
    const n = state.spec.items.length;
    core = t('timedLabels.eyebrow.amrap', { round: String(view.round), item: String((state as AmrapState).data.itemIndex + 1), total: String(n) });
  } else if (state.spec.format === 'emom') {
    core = t('timedLabels.eyebrow.emom', { round: String(view.round), total: String(view.roundsTotal ?? view.round) });
  } else {
    core = t('timedLabels.eyebrow.tabata', { round: String(view.round), total: String(view.roundsTotal ?? view.round), side: view.side ?? '' });
  }
  return prefix ? t('timedLabels.eyebrow.prefixed', { prefix, text: core }) : core;
}

/** Label over the header clock: "נותרו" / "פינישר · נותרו" / "הזמן נגמר". */
export function clockCaption(view: TimedView, prefix: string | null = null): string {
  if (view.status === 'awaiting_partial' || view.status === 'done') return t('timedLabels.clock.over');
  return prefix ? t('timedLabels.clock.leftPrefixed', { prefix }) : t('timedLabels.clock.left');
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
      return t('timedLabels.hint.emomLast', { sec: String(ceilSec(view.phaseRemainingMs)) });
    }
    return t('timedLabels.hint.emomRest');
  }
  if (view.format === 'amrap') return item?.kind === 'exercise' ? t('timedLabels.hint.amrapFixed') : null;
  return null;
}

/** "הבא בסבב" (AMRAP) / "דקה 6" (EMOM) / "התרגיל הבא" (tabata). */
export function nextCaption(view: TimedView): string {
  if (view.format === 'amrap') return t('timedLabels.next.amrap');
  if (view.format === 'emom') return t('timedLabels.next.emom', { n: String(view.round + 1) });
  return t('timedLabels.next.tabata');
}

/** EMOM rest line: "סיימת ב-0:39 · 21 שנ׳ מנוחה" (null when the minute was not finished by a tap). */
export function emomRestLine(state: EmomState, view: TimedView): string | null {
  const m = state.data.minutes[view.round - 1];
  if (!m || m.workMs == null || m.status !== 'done') return null;
  return t('timedLabels.emom.restLine', { work: formatClock(Math.round(m.workMs / 1000)), rest: String(ceilSec(view.phaseRemainingMs)) });
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
  const time = formatClock(cur);
  const prev = roundIndex > 0 ? dur(roundIndex - 1) : null;
  if (prev == null || prev === cur) return t('timedLabels.round.line', { time });
  const diff = formatClock(Math.abs(prev - cur));
  return prev > cur ? t('timedLabels.round.faster', { time, diff }) : t('timedLabels.round.slower', { time, diff });
}

/** The format explainer behind the "i" (explains the FORMAT only). */
export function formatInfo(spec: TimedBlockSpec): { title: string; lines: string[] } {
  if (spec.format === 'amrap') {
    const n = spec.items.length;
    return {
      title: t('timedLabels.info.amrap.title'),
      lines: [
        t('timedLabels.info.amrap.line1', { minutes: String(blockMinutes(spec)) }),
        t('timedLabels.info.amrap.line2', { n: String(n) }),
        t('timedLabels.info.amrap.line3'),
        t('timedLabels.info.amrap.line4'),
      ],
    };
  }
  if (spec.format === 'emom') {
    return {
      title: t('timedLabels.info.emom.title'),
      lines: [
        t('timedLabels.info.emom.line1', { sec: String(spec.config.intervalSec), times: String(spec.config.totalIntervals) }),
        t('timedLabels.info.emom.line2'),
        t('timedLabels.info.emom.line3'),
      ],
    };
  }
  return {
    title: t('timedLabels.info.tabata.title'),
    lines: [
      t('timedLabels.info.tabata.line1', { work: String(spec.config.workSec), rest: String(spec.config.restSec), rounds: String(spec.config.rounds) }),
      t('timedLabels.info.tabata.line2'),
      t('timedLabels.info.tabata.line3'),
    ],
  };
}

/** The "block done" line: "4 סבבים מלאים · ועוד 16 חזרות" / "11/12 דקות בזמן" / "8/8 אינטרוולים". */
export function resultLine(result: TimedBlockResult): string {
  if (result.amrap) {
    const { fullRounds, extraReps } = result.amrap.score;
    return extraReps > 0
      ? t('timedLabels.result.amrapExtra', { count: String(fullRounds), extra: String(extraReps) })
      : t('timedLabels.result.amrap', { count: String(fullRounds) });
  }
  if (result.emom) return t('timedLabels.result.emom', { done: String(result.emom.done), total: String(result.emom.total) });
  if (result.tabata) return t('strengthSummary.timed.tabata.line', { done: String(result.tabata.intervalsDone), total: String(result.tabata.intervalsTotal) });
  return '';
}

/** Per-item line on the ready card: "12 חזרות · בכל סבב" / "דקות אי-זוגיות · 12 חזרות". */
export function readyItemLine(spec: TimedBlockSpec, index: number): string {
  const item = spec.items[index];
  const target = itemTargetText(item);
  if (!item) return '';
  if (spec.format === 'amrap') return item.kind === 'aerobic_leg' || !target ? t('timedLabels.ready.amrapEach') : t('timedLabels.ready.amrapTargetEach', { target });
  if (spec.format === 'emom') {
    const n = spec.items.length;
    const which =
      n === 2
        ? index === 0
          ? t('timedLabels.ready.emomOdd')
          : t('timedLabels.ready.emomEven')
        : n > 2
          ? t('timedLabels.ready.emomEveryN', { n: String(n) })
          : t('timedLabels.ready.emomEveryMinute');
    return target && item.kind === 'exercise' ? t('timedLabels.ready.emomWithTarget', { which, target }) : which;
  }
  return t('timedLabels.ready.tabata', { sec: String(spec.config.workSec), unilateral: item.isUnilateral ? 'yes' : 'no' });
}

/** Mini-player line while the player is dragged down: name + "סבב 3 · נותרו 05:48". */
export function miniPlayerInfo(state: TimedState, view: TimedView, prefix: string | null = null): { name: string; label: string } {
  const name = view.current?.name ?? blockTitle(state.spec);
  if (state.status === 'idle') return { name: blockTitle(state.spec), label: t('timedLabels.mini.ready') };
  return { name, label: t('timedLabels.mini.line', { eyebrow: timedEyebrow(state, view, prefix), caption: clockCaption(view), clock: headerClock(view) }) };
}
