'use client';

/**
 * RepSegmentTable — the summary's per-rep rows as the shared SegmentTable (enable_combo_flow_v1,
 * board PlayerSegmentTable), so the rows read the same live and in the summary. The caller passes it
 * to RepPaceTable only with the flag on (flag off = RepPaceTable keeps its own rows).
 */

import React from 'react';
import { SegmentTable } from '@/components/ui/v2';
import { useT } from '@/hooks/useT';
import { player } from '@/messages/ns/player';
import type { RepTableModel } from '../v2-summary.mapping';

export default function RepSegmentTable({ model }: { model: RepTableModel }) {
  const t = useT(player);
  if (!model.table || model.table.length === 0) return null;
  return (
    <SegmentTable
      columns={{ name: t('blocks.table.rep'), km: t('blocks.table.km'), time: t('blocks.table.time'), pace: t('blocks.table.pace') }}
      rows={model.table}
    />
  );
}
