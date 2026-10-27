/**
 * timed-playlist — how a timed block reads in the classic session list
 * (WorkoutPlaylist) before and after it ran (pure). One block card: the
 * format title, a status line and one row per item — the plan target before,
 * the total done after (a block logs one value per round / minute, so per-set
 * pills would be meaningless there).
 */
import type { TimedBlockResult } from '@/features/workout-engine/engines/timed/timed-result';
import type { TimedBlockSpec } from '@/features/workout-engine/engines/timed/timed.types';
import type { ExerciseResultLog } from '../../hooks/useWorkoutStateMachine';
import { blockTitle, formatClock, readyItemLine, resultLine } from './timed-labels';
import { makeT } from '@/lib/i18n/t';
import { player } from '@/messages/ns/player';

/** Hebrew translator, built once. */
const t = makeT('he', player);

export type TimedPlaylistStatus = 'done' | 'active' | 'upcoming';

export interface TimedPlaylistModel {
  title: string;
  status: TimedPlaylistStatus;
  line: string;
  rows: Array<{ key: string; name: string; imageUrl?: string; detail: string; done: boolean }>;
}

/** Keys of the one-line rule of each format (translated when the model is built). */
const RULE_KEY = {
  amrap: 'timedLabels.playlist.rule.amrap',
  emom: 'timedLabels.playlist.rule.emom',
  tabata: 'timedLabels.playlist.rule.tabata',
} as const satisfies Record<TimedBlockSpec['format'], string>;

export function timedPlaylistModel(
  spec: TimedBlockSpec,
  status: TimedPlaylistStatus,
  segmentLog: readonly ExerciseResultLog[],
  result: TimedBlockResult | null,
): TimedPlaylistModel {
  const rows = spec.items.map((it, i) => {
    const entry = segmentLog.find((e) => e.exerciseId === (it.exerciseId ?? it.key));
    const values = entry?.confirmedReps ?? [];
    const done = values.filter((v) => v > 0);
    if (done.length === 0) {
      return { key: `${it.key}-${i}`, name: it.name, ...(it.imageUrl ? { imageUrl: it.imageUrl } : {}), detail: readyItemLine(spec, i), done: false };
    }
    const sum = done.reduce((a, v) => a + v, 0);
    const timed = entry?.repsSource?.includes('timer') ?? false;
    const value = timed ? formatClock(sum) : t('strengthSummary.hero.reps', { reps: String(sum) });
    const detail = t('timedLabels.playlist.doneDetail', { value, count: String(done.length) });
    return { key: `${it.key}-${i}`, name: it.name, ...(it.imageUrl ? { imageUrl: it.imageUrl } : {}), detail, done: true };
  });
  const totalReps = segmentLog.reduce((a, e) => a + (e.repsSource?.includes('timer') ? 0 : e.confirmedReps.reduce((b, v) => b + Math.max(0, v), 0)), 0);
  const line =
    status === 'active'
      ? t('timedLabels.now')
      : status === 'done'
        ? (result ? resultLine(result) : '') || t('strengthSummary.hero.reps', { reps: String(totalReps) })
        : t(RULE_KEY[spec.format]);
  return { title: blockTitle(spec), status, line, rows };
}
