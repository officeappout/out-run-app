'use client';

import type { ReactNode } from 'react';
import { Activity, ChevronLeft, Footprints } from 'lucide-react';
import { Card, CardTile, IconTile, MetricRings, ProgramProgressRing, RepPaceTable } from '@/components/ui/v2';
import SegmentRail from '../../blocks/SegmentRail';
import type { RunTypeModel } from '../../run-type/run-type.mapping';
import type { RepTableModel } from '../../v2-summary.mapping';
import { SPLIT_BAR_COLOR, splitsLegendKey } from './run-type-ui';
import { useT } from '@/hooks/useT';
import { summary } from '@/messages/ns/summary';

/**
 * Home v2 (enable_home_v2) — the run summary's overview tab by workout type
 * (F-1f for intervals; R4-prop-easy / -long in the approved v2 language:
 * metric rings, program ring, flame streak, no XP). Render-only: the model
 * comes from run-type.mapping. `improvementSlot` / `recordSlot` are empty
 * until a cheap "previous time" / personal-record source exists.
 */
export interface RunTypeOverviewProps {
  model: RunTypeModel;
  activityType: 'walking' | 'running';
  /** Per-rep table model (intervals). */
  repTable: RepTableModel | null;
  lapCount: number;
  /** The streak strip (owned by the view). */
  streakSlot?: ReactNode;
  /** "שיפור מהפעם הקודמת" — hidden until there is a bounded source. */
  improvementSlot?: ReactNode;
  /** Personal-record banner — hidden until there is a bounded source. */
  recordSlot?: ReactNode;
  onOpenSegments: () => void;
}

function OpenSegmentsRow({
  icon,
  title,
  chip,
  chipTone,
  onClick,
}: {
  icon: typeof Activity;
  title: string;
  chip: string;
  chipTone: 'in' | 'tint';
  onClick: () => void;
}) {
  const t = useT(summary);
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-3 rounded-v2-card bg-white px-4 py-3 text-start shadow-v2-card active:scale-[0.97] transition-transform duration-150 ease-v2"
    >
      <IconTile icon={icon} tone="run" size="sm" />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[14.5px] font-black text-v2-ink">{title}</span>
        <span className="block truncate text-[12px] font-bold text-v2-muted">{t('runType.openSegments.hint')}</span>
      </span>
      <span
        className={`inline-flex h-7 shrink-0 items-center whitespace-nowrap rounded-full px-3 text-[12px] font-extrabold tabular-nums ${
          chipTone === 'in' ? 'bg-[#ecfdf5] text-[#047857]' : 'bg-v2-tint text-v2-deep'
        }`}
      >
        {chip}
      </span>
      <ChevronLeft size={18} strokeWidth={2.4} className="shrink-0 text-v2-muted" aria-hidden />
    </button>
  );
}

export default function RunTypeOverview({
  model,
  activityType,
  repTable,
  lapCount,
  streakSlot,
  improvementSlot,
  recordSlot,
  onOpenSegments,
}: RunTypeOverviewProps) {
  const t = useT(summary);
  const { kind, rings, extras, plan, splits, course } = model;
  return (
    <>
      <Card padding="md">
        <MetricRings rings={rings} />
      </Card>

      {extras.length > 0 && (
        <div className="grid grid-cols-2 gap-2">
          {extras.map((x) => (
            <CardTile key={x.key} className="px-3 py-2.5 ring-1 ring-inset ring-v2-hairline">
              <div dir="ltr" className="text-right text-[20px] font-black leading-none tabular-nums tracking-[-0.02em] text-v2-ink">
                {x.value}
              </div>
              <div className="mt-1 whitespace-nowrap text-[12px] font-bold text-v2-muted">{x.label}</div>
            </CardTile>
          ))}
        </div>
      )}

      {recordSlot}
      {improvementSlot}

      {plan && (
        <div className="space-y-2">
          <ProgramProgressRing
            items={[
              {
                key: 'run-plan',
                name: plan.name,
                icon: Activity,
                levelLabel: plan.weekLabel,
                nextLabel: plan.positionLabel,
                ring: plan.ring,
                gain: plan.gain,
              },
            ]}
          />
          {plan.nextLabel && (
            <div className="truncate whitespace-nowrap rounded-[18px] bg-v2-tint px-3.5 py-2.5 text-[13.5px] font-extrabold text-v2-deep">
              {plan.nextLabel}
            </div>
          )}
        </div>
      )}

      {streakSlot}

      {kind === 'intervals' && repTable && (
        <OpenSegmentsRow
          icon={Activity}
          title={t('runType.reps.title')}
          chip={repTable.shortLabel ?? t('runType.reps.chip', { reps: String(repTable.reps) })}
          chipTone="in"
          onClick={onOpenSegments}
        />
      )}

      {course.length > 0 && (
        <Card padding="md">
          <div className="mb-2 text-[15px] font-black text-v2-ink">{t('runType.course.title')}</div>
          <SegmentRail items={course.map((c) => ({ id: c.id, type: 'aerobic' as const, label: c.label, detail: c.detail }))} />
        </Card>
      )}

      {kind !== 'intervals' && splits && (
        <button type="button" onClick={onOpenSegments} className="block w-full text-start active:scale-[0.97] transition-transform duration-150 ease-v2">
          <Card padding="md">
            <RepPaceTable
              variant="chart"
              title={t('runType.splits.chartTitle')}
              rows={splits.rows}
              band={splits.band}
              summaryLabel={splits.fastestLabel}
              barColor={SPLIT_BAR_COLOR}
              legend={t(splitsLegendKey(!!splits.band))}
            />
          </Card>
        </button>
      )}

      {kind !== 'intervals' && !splits && lapCount > 0 && (
        <OpenSegmentsRow
          icon={activityType === 'walking' ? Footprints : Activity}
          title={t('runType.laps.title')}
          chip={t('runType.laps.chip', { count: String(lapCount) })}
          chipTone="tint"
          onClick={onOpenSegments}
        />
      )}
    </>
  );
}
