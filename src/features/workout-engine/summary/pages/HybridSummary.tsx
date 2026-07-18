'use client';

import { useState } from 'react';
import type { HybridFinalizeResult } from '@/features/workout-engine/hybrid/hybrid-orchestrator';
import SummaryTabs, { type SummaryTab } from '../blocks/SummaryTabs';
import SegmentRail, { type SegmentRailItem } from '../blocks/SegmentRail';
import IdentityUnitsRow from '../blocks/IdentityUnitsRow';
import StreakBlock from '../blocks/StreakBlock';
import { railTypeFromKind, segmentLabel } from '../blocks/segment-rail.util';

export interface HybridSummaryProps {
  result: HybridFinalizeResult;
  /** Total calories from the saved hybrid doc (Stage 3 passes the real value). */
  calories?: number;
  streakDays?: number;
  /** Display-only until the hybrid single-save lands (CLAUDE.md gate). */
  xpEarned?: number;
  onFinish: () => void;
}

const HYBRID_TABS: SummaryTab[] = [
  { id: 'overview', label: 'סקירה' },
  { id: 'aerobic', label: 'אירובי' },
  { id: 'strength', label: 'כוח' },
  { id: 'stats', label: 'סטטיסטיקה' },
];

function railItemsFromSegments(segments: HybridFinalizeResult['segments']): SegmentRailItem[] {
  return segments.map((seg, i) => {
    const type = railTypeFromKind(seg.kind);
    const detail =
      seg.kind === 'strength'
        ? `${seg.actual?.sets ?? 0} סטים`
        : `${(seg.actual?.distanceKm ?? 0).toFixed(2)} ק״מ`;
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
 * HybridSummary — the unified run+strength recap (design spec v0.9). Stage 2
 * lands the kit composition; Stage 3 routes the real HybridFinalizeResult
 * through useHybridRun + SummaryLayer (plus the drawer-over-map chrome and the
 * false "too short" fix). Behind HYBRID_SUMMARY_ENABLED (default false).
 *
 * MVP = aggregates + segment rail (fully served by result.summary +
 * result.segments). The per-exercise strength tab (segments[].content + plan)
 * is a fast-follow. XP display-only (0) per the single-save gate.
 */
export default function HybridSummary({
  result,
  calories = 0,
  streakDays = 0,
  xpEarned = 0,
  onFinish,
}: HybridSummaryProps) {
  const [tab, setTab] = useState<string>('overview');
  const { summary, segments } = result;
  const railItems = railItemsFromSegments(segments);
  const totalDurationSec = segments.reduce((acc, s) => acc + (s.actual?.durationSec ?? 0), 0);
  const completedSegments = summary.completedAerobicSegments + summary.completedStrengthSegments;

  return (
    <div
      dir="rtl"
      className="fixed inset-0 z-[200] flex flex-col bg-gray-50 text-gray-900"
      style={{ fontFamily: 'var(--font-simpler)' }}
    >
      <div className="flex-1 overflow-y-auto px-4 pb-6 pt-4">
        {streakDays > 1 && (
          <div className="mb-4">
            <StreakBlock streakDays={streakDays} />
          </div>
        )}

        <div className="mb-4">
          <IdentityUnitsRow durationSeconds={totalDurationSec} calories={calories} xp={xpEarned} />
        </div>

        <div className="mb-4">
          <SummaryTabs tabs={HYBRID_TABS} active={tab} onChange={setTab} />
        </div>

        {/* MVP: every tab shows the session rail; the aerobic/strength deep tabs
            are the fast-follow (need segments[].content + plan). */}
        <div className="rounded-2xl bg-white p-4 shadow-sm">
          <div className="mb-3 text-sm font-bold text-gray-500">מבנה האימון</div>
          <SegmentRail items={railItems} />
        </div>

        <div className="mt-4 grid grid-cols-3 gap-2">
          <MiniStat label="ק״מ" value={summary.totalActualDistanceKm.toFixed(2)} />
          <MiniStat label="סטים" value={String(summary.totalStrengthSets)} />
          <MiniStat label="מקטעים" value={`${completedSegments}/${summary.segmentCount}`} />
        </div>

        {summary.bothHalvesCompleted && (
          <div className="mt-3 rounded-xl bg-emerald-50 px-4 py-3 text-center text-sm font-bold text-emerald-700">
            השלמת גם ריצה וגם כוח — אימון משולב מלא! 🎯
          </div>
        )}
      </div>

      <div className="shrink-0 border-t border-gray-100 bg-white p-4 pb-[env(safe-area-inset-bottom)]">
        <button
          onClick={onFinish}
          className="mx-auto block w-full max-w-4xl rounded-xl bg-[#00E5FF] py-4 font-bold text-black shadow-lg transition-all hover:bg-[#00D4EE]"
        >
          סיום וחזרה לבית
        </button>
      </div>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl bg-white p-3 text-center shadow-sm">
      <div className="text-lg font-black text-gray-900">{value}</div>
      <div className="text-xs text-gray-500">{label}</div>
    </div>
  );
}
