/**
 * timed.strip — strip items of a timed block (pure).
 *   tabata: one item per work interval;  EMOM: one per minute;
 *   AMRAP: target rounds × round items (board A-2b: target = personal best
 *   + 1, passed by the caller; default = rounds reached so far). Rounds
 *   beyond the target are appended as they happen. Warm-up / cool-down
 *   items belong to the surrounding workout, not to the block.
 */
import { activeMsAt } from './timed-clock';
import { syncTimed } from './timed-machine';
import { tabataPositionAt } from './tabata-schedule';
import { emomIntervalMs, emomMinuteAt } from './emom.machine';
import { STRIP_COLORS, stripModel, type StripItem, type StripModel } from '../strip-item';
import type { AmrapState, EmomState, TabataState, TimedItem, TimedState } from './timed.types';

const colorOf = (it: TimedItem | undefined) => (it?.kind === 'aerobic_leg' ? STRIP_COLORS.cardio : STRIP_COLORS.strength);

function tabataStrip(s: TabataState, active: number): StripModel {
  const n = s.data.intervals.length;
  const pos = tabataPositionAt(s.spec.config, n, active);
  const done = s.status === 'done';
  const workMs = s.spec.config.workSec * 1000;
  const items = s.data.intervals.map((iv): StripItem => ({
    key: `iv-${iv.index}`,
    kind: 'interval',
    color: colorOf(s.spec.items[iv.itemIndex]),
    done: done ? iv.index <= pos.index && active > 0 : iv.index < pos.index || (iv.index === pos.index && pos.phase === 'rest'),
  }));
  const cur = done ? n : pos.phase === 'rest' ? pos.index + 1 : pos.index;
  return stripModel(items, cur, pos.phase === 'work' ? pos.phaseElapsedMs / workMs : 0);
}

function emomStrip(s: EmomState, active: number): StripModel {
  const intervalMs = emomIntervalMs(s);
  const cur = s.status === 'done' ? s.data.minutes.length : emomMinuteAt(s, active);
  const items = s.data.minutes.map((m): StripItem => ({
    key: `min-${m.index}`,
    kind: 'minute',
    color: colorOf(s.spec.items[m.itemIndex]),
    done: m.status === 'done' || m.status === 'partial',
  }));
  return stripModel(items, cur, s.status === 'done' ? 1 : (active - cur * intervalMs) / intervalMs);
}

function amrapStrip(s: AmrapState, targetRounds?: number): StripModel {
  const n = s.spec.items.length;
  const reached = s.data.rounds.length;
  const rounds = Math.max(1, targetRounds ?? 0, reached);
  const items: StripItem[] = [];
  for (let r = 0; r < rounds; r++) {
    const rec = s.data.rounds[r];
    for (let i = 0; i < n; i++) {
      const it = rec?.items.find((x) => x.itemIndex === i);
      items.push({ key: `r${r}-i${i}`, kind: 'round_item', color: colorOf(s.spec.items[i]), done: !!it && (!it.partial || (it.reps ?? 0) > 0 || (it.distanceM ?? 0) > 0) });
    }
  }
  const cur = s.status === 'done' ? items.length : (reached - 1) * n + s.data.itemIndex;
  return stripModel(items, cur, 0);
}

export function timedStrip(state: TimedState, nowMs: number, opts: { targetRounds?: number } = {}): StripModel {
  const s = syncTimed(state, nowMs);
  const active = activeMsAt(s.clock, nowMs);
  switch (s.spec.format) {
    case 'tabata':
      return tabataStrip(s as TabataState, active);
    case 'emom':
      return emomStrip(s as EmomState, active);
    case 'amrap':
      return amrapStrip(s as AmrapState, opts.targetRounds);
  }
}
