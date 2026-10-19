'use client';

import { Card, RepPaceTable } from '@/components/ui/v2';
import SegmentRail from '../../blocks/SegmentRail';
import type { RunTypeModel } from '../../run-type/run-type.mapping';
import type { RepTableModel } from '../../v2-summary.mapping';
import { SPLIT_BAR_COLOR, splitsLegend } from './run-type-ui';

/**
 * Home v2 — the run summary's מקטעים tab by type: intervals get the per-rep
 * table (F-1g) and the course rail; steady runs get the per-km splits with
 * the fastest km highlighted (R4-prop-splits). Returns null when it has
 * nothing to add — the view then shows today's laps UI.
 */
export default function RunTypeSegments({ model, repTable }: { model: RunTypeModel; repTable: RepTableModel | null }) {
  const showReps = model.kind === 'intervals' && repTable;
  const showSplits = model.kind !== 'intervals' && model.splits;
  if (!showReps && !showSplits) return null;
  return (
    <div className="space-y-3">
      {showReps && (
        <Card padding="md">
          <RepPaceTable rows={repTable.rows} band={repTable.band} summaryLabel={repTable.summaryLabel} />
        </Card>
      )}
      {showReps && model.course.length > 0 && (
        <Card padding="md">
          <div className="mb-2 text-[15px] font-black text-v2-ink">מהלך האימון</div>
          <SegmentRail items={model.course.map((c) => ({ id: c.id, type: 'aerobic' as const, label: c.label, detail: c.detail }))} />
        </Card>
      )}
      {showSplits && model.splits && (
        <Card padding="md">
          <RepPaceTable
            title="פיצולים לפי ק״מ"
            rows={model.splits.rows}
            band={model.splits.band}
            summaryLabel={model.splits.fastestLabel}
            barColor={SPLIT_BAR_COLOR}
            legend={splitsLegend(!!model.splits.band)}
          />
        </Card>
      )}
    </div>
  );
}
