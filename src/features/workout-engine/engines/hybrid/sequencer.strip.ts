/**
 * sequencer.strip — strip items of a hybrid session (F-3 row: run + 8 sets
 * + run). A run leg is one item; a station expands into its PLANNED sets
 * (from the block content), filled as SET_DONE / the station log arrives.
 * A skipped station's sets stay undone. Pure.
 */
import type { HybridPlannedSegment } from '../../hybrid/compose-hybrid-session.service';
import { STRIP_COLORS, stripModel, type StripItem, type StripModel } from '../strip-item';
import type { SequencerState } from './sequencer.types';

/** Planned set count of a station (≥1 so an empty block still shows). */
export function plannedStationSets(seg: HybridPlannedSegment): number {
  const list = (seg.content?.exercises ?? []) as unknown as Array<{ sets?: number }>;
  const fromList = list.reduce((a, e) => a + (typeof e?.sets === 'number' && e.sets > 0 ? e.sets : 0), 0);
  return Math.max(1, seg.content?.totalPlannedSets ?? fromList ?? 1);
}

export function sequencerStrip(s: SequencerState): StripModel {
  const items: StripItem[] = [];
  let currentIndex = -1;
  let progress = 0;
  const cursor = s.inner.cursor;
  s.inner.plan.forEach((seg, i) => {
    const a = s.inner.actuals[i];
    const isCurrent = s.phase !== 'idle' && s.phase !== 'done' && i === cursor;
    if (seg.kind === 'aerobic') {
      if (isCurrent) {
        currentIndex = items.length;
        const targetM = seg.distanceKm ? seg.distanceKm * 1000 : 0;
        const targetS = seg.durationSec ?? 0;
        progress = targetM > 0 ? ((a?.distanceKm ?? 0) * 1000) / targetM : targetS > 0 ? (a?.durationSec ?? 0) / targetS : 0;
      }
      items.push({ key: `leg-${i}`, kind: 'run', color: STRIP_COLORS.cardio, done: !!a?.completed });
      return;
    }
    const log = a?.exerciseLog ?? s.stationLogs[i] ?? [];
    const doneSets = log.reduce((n, e) => n + e.confirmedReps.filter((v) => v > 0).length, 0);
    const planned = Math.max(plannedStationSets(seg), doneSets);
    if (isCurrent) currentIndex = items.length + Math.min(doneSets, planned - 1);
    for (let k = 0; k < planned; k++) {
      items.push({ key: `st-${i}-${k}`, kind: 'set', color: STRIP_COLORS.strength, done: k < doneSets });
    }
  });
  if (currentIndex < 0) currentIndex = s.phase === 'idle' ? 0 : items.length;
  return stripModel(items, currentIndex, progress);
}
