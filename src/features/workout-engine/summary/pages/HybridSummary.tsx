'use client';

import { useState, type ReactNode } from 'react';
import { Share2, Trash2, Target, Sparkles } from 'lucide-react';
import { Button, CardTile, Chip, IconTile, StatNumber } from '@/components/ui/v2';
import type { HybridFinalizeResult } from '@/features/workout-engine/hybrid/hybrid-orchestrator';
import SummaryDrawerShell, { type DrawerTab } from '../blocks/SummaryDrawerShell';
import type { SummarySnap } from '../blocks/summary-sheet.util';
import SegmentRail, { type SegmentRailItem } from '../blocks/SegmentRail';
import { railTypeFromKind, segmentLabel, type SegmentRailType } from '../blocks/segment-rail.util';
import { formatDuration } from '../format';

export interface HybridSummaryProps {
  result: HybridFinalizeResult;
  /** Total calories from the saved hybrid doc (plan estimate for MVP). */
  calories?: number;
  streakDays?: number;
  /** Display-only until single-save closes (CLAUDE.md gate). */
  xpEarned?: number;
  /** Finish/dismiss — the caller does clearSession + navigate(/home). */
  onFinish: () => void;
  /**
   * Delete trigger — shown only when the caller wires it (the history view;
   * the live post-finish flow never passes this). Mirrors AerobicSummaryView's
   * onDelete contract: this component doesn't own the confirm/delete flow,
   * tapping just calls the caller's onDelete().
   */
  onDelete?: () => void;
  /**
   * Transparent gap above the drawer, forwarded to SummaryDrawerShell — it
   * exists so the live Mapbox behind SummaryLayer peeks through on /map.
   * There's no map mounted behind the history view, so history callers
   * should pass 0 rather than leave an empty gap. Defaults to 150 (the live
   * post-finish flow's existing behavior).
   */
  peekHeight?: number;
  /** Snap the drawer opens at — 'full' (default) or 'peek' (dev preview). */
  initialSnap?: SummarySnap;
}

const HYBRID_TABS: DrawerTab[] = [
  { id: 'overview', label: 'סקירה' },
  { id: 'aerobic', label: 'אירובי' },
  { id: 'strength', label: 'כוח' },
  { id: 'stats', label: 'סטטיסטיקה' },
];

type Segments = HybridFinalizeResult['segments'];

function buildRailItems(segments: Segments, only?: SegmentRailType): SegmentRailItem[] {
  return segments
    .map((seg, i) => ({ seg, type: railTypeFromKind(seg.kind), i }))
    .filter(({ type }) => !only || type === only)
    .map(({ seg, type, i }) => {
      const dur = seg.actual?.durationSec ?? 0;
      const timeStr = dur > 0 ? formatDuration(dur) : '';
      const detail =
        seg.kind === 'strength'
          ? `${seg.actual?.sets ?? 0} סטים${timeStr ? ` · ${timeStr}` : ''}`
          : `${(seg.actual?.distanceKm ?? 0).toFixed(2)} ק״מ${timeStr ? ` · ${timeStr}` : ''}`;
      return {
        id: `seg-${seg.index ?? i}`,
        type,
        label: segmentLabel(type, seg.aerobicType),
        detail,
        completed: (seg.endedAtMs ?? 0) > 0,
      };
    });
}

/**
 * HybridSummary — the unified run+strength recap (design spec v0.9), rendered as
 * a drawer-over-map via the shared SummaryDrawerShell (live map peeks behind).
 * Behind HYBRID_SUMMARY_ENABLED (default false). Stage-3 data comes from the
 * stashed HybridFinalizeResult.
 *
 * MVP-now: v2 draggable drawer (drag collapses to a peek, never exits), tabs,
 * hero (total time), segment rail, aggregate tiles, both-halves banner, share +
 * one explicit "סיום" footer action. Fast-follow (shared
 * blocks): lemur/weekly streak, weekly+program progress, per-exercise strength
 * tab, pace-chart sheets. XP display-only (0) per the single-save gate.
 */
export default function HybridSummary({
  result,
  calories = 0,
  streakDays = 0,
  xpEarned = 0,
  onFinish,
  onDelete,
  peekHeight = 150,
  initialSnap = 'full',
}: HybridSummaryProps) {
  const [tab, setTab] = useState<string>('overview');
  const { summary, segments } = result;
  const totalDurationSec = segments.reduce((acc, s) => acc + (s.actual?.durationSec ?? 0), 0);
  const aerobicSec = summary.totalActualAerobicSec;
  const completedSegments = summary.completedAerobicSegments + summary.completedStrengthSegments;
  const xpVal = Math.round(xpEarned || 0);
  void streakDays;

  // Hero (drag zone): the combined number — total session time — with the two
  // halves as chips. Stays visible when the drawer is collapsed to its peek.
  const hero = (
    <div className="flex items-end justify-between gap-3 px-4 pt-1 pb-3">
      <div className="min-w-0">
        <div className="text-[13px] font-extrabold text-v2-deep">אימון משולב</div>
        <StatNumber
          value={totalDurationSec}
          format={(v) => formatDuration(Math.round(v))}
          size="lg"
          label="זמן כולל"
          className="mt-1"
        />
      </div>
      <div className="flex flex-col items-end gap-1.5 shrink-0">
        <Chip tone="accent">{`${summary.totalActualDistanceKm.toFixed(2)} ק״מ`}</Chip>
        <Chip tone="neutral">{`${summary.totalStrengthSets} סטים`}</Chip>
        {xpVal > 0 && (
          <Chip tone="accent" icon={<Sparkles size={13} strokeWidth={2.4} aria-hidden />}>
            {`+${xpVal} XP`}
          </Chip>
        )}
      </div>
    </div>
  );

  const banner = summary.bothHalvesCompleted ? (
    <div className="mt-4 flex items-center gap-3 rounded-v2-card bg-v2-tint px-4 py-3">
      <IconTile icon={Target} tone="accent" size="sm" className="!bg-white" />
      <span className="text-[14px] font-extrabold text-v2-deep">
        אימון משולב מלא — גם ריצה וגם כוח!
      </span>
    </div>
  ) : null;

  const tabBody: Record<string, ReactNode> = {
    overview: (
      <div className="px-4 pt-4 pb-6">
        <div className="grid grid-cols-2 gap-2">
          <StatTile value={summary.totalActualDistanceKm} decimals={2} unit="ק״מ" label="מרחק" />
          <StatTile value={summary.totalStrengthSets} label="סטים" />
          <StatTile
            value={completedSegments}
            format={() => `${completedSegments}/${summary.segmentCount}`}
            label="מקטעים"
          />
          <StatTile value={Math.round(calories || 0)} unit="קק״ל" label="קלוריות" />
        </div>
        {banner}
        <SectionLabel>מהלך האימון</SectionLabel>
        <SegmentRail items={buildRailItems(segments)} />
      </div>
    ),
    aerobic: (
      <div className="px-4 pt-4 pb-6">
        <div className="grid grid-cols-2 gap-2">
          <StatTile value={summary.totalActualDistanceKm} decimals={2} unit="ק״מ" label="מרחק ריצה" />
          <StatTile
            value={aerobicSec}
            format={() => (aerobicSec > 0 ? formatDuration(aerobicSec) : '--')}
            label="זמן ריצה"
          />
        </div>
        <SectionLabel>מקטעי ריצה</SectionLabel>
        <SegmentRail items={buildRailItems(segments, 'aerobic')} />
      </div>
    ),
    strength: (
      <div className="px-4 pt-4 pb-6">
        <div className="grid grid-cols-2 gap-2">
          <StatTile value={summary.totalStrengthSets} label="סטים שהושלמו" />
          <StatTile value={summary.completedStrengthSegments} label="תחנות כוח" />
        </div>
        <SectionLabel>תחנות כוח</SectionLabel>
        <SegmentRail items={buildRailItems(segments, 'strength')} />
        <div className="mt-3 text-center text-[12px] font-semibold text-v2-muted">
          פירוט תרגילים (מתוכנן/בפועל) — בקרוב
        </div>
      </div>
    ),
    stats: (
      <div className="px-4 pt-4 pb-6">
        <div className="grid grid-cols-3 gap-2">
          <StatTile
            value={totalDurationSec}
            format={() => formatDuration(totalDurationSec)}
            label="זמן"
          />
          <StatTile value={Math.round(calories || 0)} label="קק״ל" />
          <StatTile value={xpVal} label="XP" />
        </div>
        <div className="mt-2 grid grid-cols-3 gap-2">
          <StatTile
            value={completedSegments}
            format={() => `${completedSegments}/${summary.segmentCount}`}
            label="מקטעים"
          />
          <StatTile value={summary.completedAerobicSegments} label="מקטעי ריצה" />
          <StatTile value={summary.completedStrengthSegments} label="תחנות כוח" />
        </div>
        {banner}
      </div>
    ),
  };

  const handleShare = () => {
    const text = `סיימתי אימון משולב — ${summary.totalActualDistanceKm.toFixed(2)} ק״מ · ${summary.totalStrengthSets} סטים 🏃💪`;
    if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
      navigator.share({ text }).catch(() => {});
    }
  };

  // Pinned footer — share (where it was), optional delete (history only) and
  // the ONE explicit exit action. The drawer itself never finishes on drag/tap.
  const footer = (
    <div className="flex items-center gap-2.5 px-4 py-3">
      <Button variant="ghost" size="lg" onClick={handleShare} className="flex-1">
        <Share2 size={18} strokeWidth={2.4} aria-hidden />
        שתפו
      </Button>
      {onDelete && (
        <Button
          variant="ghost"
          size="lg"
          onClick={onDelete}
          aria-label="מחק אימון"
          className="!px-4 !text-v2-down"
        >
          <Trash2 size={18} strokeWidth={2.4} aria-hidden />
        </Button>
      )}
      <Button variant="primary" size="lg" onClick={onFinish} className="flex-[1.4]">
        סיום
      </Button>
    </div>
  );

  return (
    <SummaryDrawerShell
      tabs={HYBRID_TABS}
      activeTab={tab}
      onTabChange={setTab}
      header={hero}
      peekHeight={peekHeight}
      initialSnap={initialSnap}
      footer={footer}
    >
      {tabBody[tab] ?? tabBody.overview}
    </SummaryDrawerShell>
  );
}

function StatTile({
  value,
  label,
  unit,
  decimals = 0,
  format,
}: {
  value: number;
  label: string;
  unit?: string;
  decimals?: number;
  format?: (v: number) => string;
}) {
  return (
    <CardTile className="px-3 py-3 ring-1 ring-inset ring-v2-hairline">
      <StatNumber value={value} decimals={decimals} unit={unit} label={label} format={format} size="sm" />
    </CardTile>
  );
}

function SectionLabel({ children }: { children: ReactNode }) {
  return <div className="mt-5 mb-2.5 text-[14px] font-extrabold text-v2-ink">{children}</div>;
}
