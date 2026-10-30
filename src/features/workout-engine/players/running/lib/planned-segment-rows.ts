/**
 * Rows of the planned run's rep table in the block language (enable_combo_flow_v1, boards
 * PlayerIntervalsTabata / PlayerSegmentTable). PURE. One row per rep: planned leg, km covered,
 * time (the live block's remaining while it runs), pace coloured by the target with its word.
 * Legs under 400 m carry no pace (the record never stores one).
 */

import type { RunBlock } from '../types/run-block.type';
import type { SegmentTableRow } from '@/components/ui/v2/SegmentTable';
import { fmtClock, fmtDistance, fmtPace, paceClassText, recordClass, type PlannedBlockRecord } from './planned-rep-results';

export interface PlannedRepRowsInput {
  blocks: readonly RunBlock[];
  /** Indices of the rep blocks, in order. */
  indices: readonly number[];
  reps: { byIndex: Map<number, number> };
  records: Map<number, PlannedBlockRecord>;
  currentBlockIndex: number;
  /** The row carrying the countdown (the next rep during a recovery). */
  focusIndex: number;
  /** Remaining of the live block ("0:54" / "212 מ׳"). */
  currentRemaining: string;
}

export function plannedRepRows(i: PlannedRepRowsInput): Omit<SegmentTableRow, 'onClick'>[] {
  return i.indices.map((idx, k) => {
    const b = i.blocks[idx];
    const rec = i.records.get(idx);
    const done = idx < i.currentBlockIndex && !!rec;
    const focus = idx === i.focusIndex;
    const c = rec ? recordClass(rec) : null;
    const planned = b?.distanceMeters ? fmtDistance(b.distanceMeters) : b?.durationSeconds ? fmtClock(b.durationSeconds) : '';
    return {
      key: String(b?.id ?? idx),
      n: i.reps.byIndex.get(idx) || k + 1,
      name: planned,
      km: done ? (rec!.distanceMeters / 1000).toFixed(2) : '–',
      time: done ? fmtClock(rec!.durationSeconds) : focus ? i.currentRemaining : '–',
      pace: done && rec!.avgPaceSec ? fmtPace(rec!.avgPaceSec) : null,
      paceTone: done && c ? (c.band === 'in' ? 'in' : 'off') : 'none',
      paceNote: done && c ? paceClassText(c) : undefined,
      current: focus,
      muted: !done && !focus && idx < i.currentBlockIndex,
    };
  });
}

/** Status of a group of blocks for its section: all behind the live one = done. */
export function sectionStatus(indices: readonly number[], currentBlockIndex: number, focusIndex: number): 'done' | 'now' | 'ahead' {
  if (indices.length === 0) return 'ahead';
  if (indices.includes(focusIndex) || indices.includes(currentBlockIndex)) return 'now';
  return indices.every((x) => x < currentBlockIndex) ? 'done' : 'ahead';
}
