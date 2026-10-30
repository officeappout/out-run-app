'use client';

/**
 * HybridLapsTable — the combined summary's laps (enable_combo_flow_v1, board PlayerSummaryCoverage):
 * the same SegmentTable rows the live laps list shows, so live and summary read the same.
 */

import React from 'react';
import { SegmentTable } from '@/components/ui/v2';
import { useT } from '@/hooks/useT';
import { player } from '@/messages/ns/player';
import type { Lap } from '@/features/workout-engine/core/types/session.types';
import { lapRows } from '@/features/workout-engine/players/running/lib/continuous-run';
import { lapTableRows } from '@/features/workout-engine/players/running/lib/planned-segment-rows';

export default function HybridLapsTable({ laps }: { laps: Lap[] }) {
  const t = useT(player);
  const rows = lapTableRows(
    lapRows(laps.map((l) => ({ ...l, isActive: false }))),
    (n) => t('run.free.laps.row', { n: String(n) }),
  );
  return (
    <SegmentTable
      columns={{ name: t('run.free.laps.col.lap'), km: t('run.free.laps.col.km'), time: t('run.free.laps.col.time'), pace: t('run.free.laps.col.pace') }}
      rows={rows}
    />
  );
}
