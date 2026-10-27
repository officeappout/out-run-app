/**
 * timed-list — the session list behind the timed player (pure).
 *   AMRAP (board A-2e3, "הסל"): what was done, summed per item, on top; the
 *     rest of the current round below, the current item marked "עכשיו".
 *   EMOM (A-4e): one row per item with a pill per minute (time it took /
 *     partial reps / missed); the next minutes below.
 *   Tabata (A-1d): intervals done per member; the next intervals below.
 */
import { activeMsAt } from '@/features/workout-engine/engines/timed/timed-clock';
import { syncTimed } from '@/features/workout-engine/engines/timed/timed-machine';
import { tabataPositionAt } from '@/features/workout-engine/engines/timed/tabata-schedule';
import { emomMinuteAt } from '@/features/workout-engine/engines/timed/emom.machine';
import { amrapScore } from '@/features/workout-engine/engines/timed/timed.selectors';
import type { AmrapState, EmomState, TabataState, TimedItem, TimedState } from '@/features/workout-engine/engines/timed/timed.types';
import { formatClock, itemTargetText } from './timed-labels';
import { makeT } from '@/lib/i18n/t';
import { player } from '@/messages/ns/player';

/** Hebrew translator, built once (the list model is rebuilt every tick). */
const t = makeT('he', player);

export type PillTone = 'done' | 'partial' | 'missed';

export interface TimedListRow {
  key: string;
  name: string;
  imageUrl?: string;
  kind: TimedItem['kind'];
  detail: string;
  /** "×3" / "עכשיו" / "דקה 7". */
  trailing?: string;
  pills?: Array<{ label: string; tone: PillTone }>;
  now?: boolean;
}

export interface TimedListModel {
  /** "10 פריטים בסל" */
  headline: string;
  /** "2 סבבים מלאים · 58 חזרות" */
  summary: string;
  done: TimedListRow[];
  queueTitle: string;
  queue: TimedListRow[];
}

const row = (item: TimedItem, key: string, detail: string, extra: Partial<TimedListRow> = {}): TimedListRow => ({
  key,
  name: item.name,
  ...(item.imageUrl ? { imageUrl: item.imageUrl } : {}),
  kind: item.kind,
  detail,
  ...extra,
});

const repsText = (n: number) => t('timedLabels.list.reps', { count: String(n) });

function amrapList(s: AmrapState): TimedListModel {
  const n = s.spec.items.length;
  const totals = s.spec.items.map(() => ({ reps: 0, sec: 0, count: 0 }));
  let doneItems = 0;
  for (const r of s.data.rounds) {
    for (const it of r.items) {
      const tot = totals[it.itemIndex];
      if (!tot) continue;
      const touched = !it.partial || (it.reps ?? 0) > 0 || (it.distanceM ?? 0) > 0;
      if (!touched) continue;
      doneItems += 1;
      tot.count += 1;
      tot.reps += it.reps ?? 0;
      tot.sec += Math.round(it.durationMs / 1000);
    }
  }
  const done = s.spec.items.flatMap((item, i) => {
    const tot = totals[i];
    if (tot.count === 0) return [];
    const isHold = item.kind === 'exercise' && !item.targetReps && !!item.targetHoldSec;
    const detail = item.kind === 'aerobic_leg' || isHold ? formatClock(isHold ? tot.reps : tot.sec) : repsText(tot.reps);
    return [row(item, `done-${i}`, detail, { trailing: `×${tot.count}` })];
  });
  const score = amrapScore(s);
  const totalReps = s.data.rounds.reduce((a, r) => a + r.items.reduce((b, it) => b + (it.reps ?? 0), 0), 0);
  const live = s.status === 'running' || s.status === 'paused';
  const queue = live
    ? s.spec.items.slice(s.data.itemIndex).map((item, k) => {
        const i = s.data.itemIndex + k;
        return row(item, `q-${i}`, itemTargetText(item), k === 0 ? { trailing: t('timedLabels.now'), now: true } : {});
      })
    : [];
  return {
    headline: t('timedLabels.list.basket', { count: String(doneItems) }),
    summary: t('timedLabels.list.roundsSummary', { rounds: String(score.fullRounds), reps: String(totalReps) }),
    done,
    queueTitle: live ? t('timedLabels.list.round', { n: String(s.data.rounds.length) }) : '',
    queue: n > 0 ? queue : [],
  };
}

function emomList(s: EmomState, activeMs: number): TimedListModel {
  const cur = s.status === 'done' ? s.data.minutes.length : emomMinuteAt(s, activeMs);
  const done = s.spec.items.map((item, i) => {
    const mins = s.data.minutes.filter((m) => m.itemIndex === i);
    const pills = mins
      .filter((m) => m.status !== 'pending')
      .map((m) => {
        const target = item.targetReps ?? item.targetHoldSec ?? null;
        if (m.status === 'done') return { label: m.workMs != null ? formatClock(Math.round(m.workMs / 1000)) : t('timedLabels.list.pillDone'), tone: 'done' as const };
        if (m.status === 'partial') return { label: target ? `${m.reps ?? 0}/${target}` : String(m.reps ?? 0), tone: 'partial' as const };
        return { label: '–', tone: 'missed' as const };
      });
    const next = s.status === 'done' ? undefined : mins.find((m) => m.status === 'pending' && m.index >= cur);
    return row(item, `item-${i}`, itemTargetText(item), { pills, ...(next ? { trailing: t('timedLabels.list.minute', { n: String(next.index + 1) }) } : {}) });
  });
  const doneMinutes = s.data.minutes.filter((m) => m.status === 'done').length;
  const queue = s.status === 'done'
    ? []
    : s.data.minutes.slice(cur, cur + 3).flatMap((m, k) => {
        const item = s.spec.items[m.itemIndex];
        return item ? [row(item, `q-${m.index}`, t('timedLabels.list.minuteTarget', { n: String(m.index + 1), target: itemTargetText(item) }), k === 0 ? { trailing: t('timedLabels.now'), now: true } : {})] : [];
      });
  return {
    headline: t('timedLabels.list.minutesDone', { count: String(doneMinutes) }),
    summary: t('timedLabels.list.emomSummary', { items: String(s.spec.items.length), minutes: String(s.data.minutes.length) }),
    done,
    queueTitle: s.status === 'done' ? '' : t('strengthPlayer.timed.list.queue'),
    queue,
  };
}

function tabataList(s: TabataState, activeMs: number): TimedListModel {
  const n = s.data.intervals.length;
  const pos = tabataPositionAt(s.spec.config, n, activeMs);
  const isDone = (idx: number) => (s.status === 'done' ? activeMs > 0 && idx <= pos.index : idx < pos.index || (idx === pos.index && pos.phase === 'rest'));
  const done = s.spec.items.map((item, i) => {
    const mine = s.data.intervals.filter((iv) => iv.itemIndex === i);
    const d = mine.filter((iv) => isDone(iv.index)).length;
    return row(item, `item-${i}`, t('timedLabels.list.tabataItem', { sec: String(s.spec.config.workSec), done: String(d), total: String(mine.length) }));
  });
  const doneCount = s.data.intervals.filter((iv) => isDone(iv.index)).length;
  const from = s.status === 'done' ? n : pos.phase === 'rest' ? pos.index + 1 : pos.index;
  const queue = s.data.intervals.slice(from, from + 3).flatMap((iv, k) => {
    const item = s.spec.items[iv.itemIndex];
    return item ? [row(item, `q-${iv.index}`, t('timedLabels.list.tabataInterval', { n: String(iv.index + 1), side: iv.side ?? '' }), k === 0 && pos.phase === 'work' ? { trailing: t('timedLabels.now'), now: true } : {})] : [];
  });
  return {
    headline: t('strengthSummary.timed.tabata.line', { done: String(doneCount), total: String(n) }),
    summary: t('timedLabels.list.tabataSummary', { work: String(s.spec.config.workSec), rest: String(s.spec.config.restSec) }),
    done,
    queueTitle: queue.length > 0 ? t('strengthPlayer.timed.list.queue') : '',
    queue,
  };
}

export function timedListModel(state: TimedState, nowMs: number): TimedListModel {
  const s = syncTimed(state, nowMs);
  const active = activeMsAt(s.clock, nowMs);
  switch (s.spec.format) {
    case 'amrap':
      return amrapList(s as AmrapState);
    case 'emom':
      return emomList(s as EmomState, active);
    case 'tabata':
      return tabataList(s as TabataState, active);
  }
}
