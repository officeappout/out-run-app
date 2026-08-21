'use client';

import { useState, type ReactNode } from 'react';
import { Share2, Trash2 } from 'lucide-react';
import type { HybridFinalizeResult } from '@/features/workout-engine/hybrid/hybrid-orchestrator';
import SummaryDrawerShell, { type DrawerTab } from '../blocks/SummaryDrawerShell';
import SegmentRail, { type SegmentRailItem } from '../blocks/SegmentRail';
import IdentityUnitsRow from '../blocks/IdentityUnitsRow';
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
   * the live post-finish flow never passes this). Mirrors FreeRunSummary's
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
 * MVP-now: drawer chrome, tabs, segment rail (pill+chevron), inline identity
 * units, aggregates, both-halves banner, share + dismiss. Fast-follow (shared
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
}: HybridSummaryProps) {
  const [tab, setTab] = useState<string>('overview');
  const { summary, segments } = result;
  const totalDurationSec = segments.reduce((acc, s) => acc + (s.actual?.durationSec ?? 0), 0);
  const aerobicSec = summary.totalActualAerobicSec;

  const titleRow = (
    <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', padding: '12px 14px 2px' }}>
      <span style={{ fontSize: 15, fontWeight: 600, color: '#1b2220' }}>אימון משולב</span>
      <IdentityUnitsRow variant="inline" durationSeconds={totalDurationSec} calories={calories} xp={xpEarned} />
    </div>
  );

  const aggregates = (
    <div style={{ marginTop: 4, display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
      <MiniStat label="ק״מ" value={summary.totalActualDistanceKm.toFixed(2)} />
      <MiniStat label="סטים" value={String(summary.totalStrengthSets)} />
      <MiniStat
        label="מקטעים"
        value={`${summary.completedAerobicSegments + summary.completedStrengthSegments}/${summary.segmentCount}`}
      />
    </div>
  );

  const banner = summary.bothHalvesCompleted ? (
    <div
      style={{
        marginTop: 12,
        borderRadius: 12,
        background: '#E1F5EE',
        padding: '10px 14px',
        textAlign: 'center',
        fontSize: 13,
        fontWeight: 700,
        color: '#0F6E56',
      }}
    >
      אימון משולב מלא — גם ריצה וגם כוח! 🎯
    </div>
  ) : null;

  const tabBody: Record<string, ReactNode> = {
    overview: (
      <div style={{ padding: '0 0 12px' }}>
        {titleRow}
        <div style={{ padding: '0 14px' }}>
          <SectionLabel>מהלך האימון</SectionLabel>
          <SegmentRail items={buildRailItems(segments)} />
          {aggregates}
          {banner}
        </div>
      </div>
    ),
    aerobic: (
      <div style={{ padding: '12px 14px' }}>
        <StatLine label="מרחק ריצה" value={`${summary.totalActualDistanceKm.toFixed(2)} ק״מ`} />
        <StatLine label="זמן ריצה" value={aerobicSec > 0 ? formatDuration(aerobicSec) : '--'} />
        <SectionLabel>מקטעי ריצה</SectionLabel>
        <SegmentRail items={buildRailItems(segments, 'aerobic')} />
      </div>
    ),
    strength: (
      <div style={{ padding: '12px 14px' }}>
        <StatLine label="סטים שהושלמו" value={String(summary.totalStrengthSets)} />
        <StatLine label="תחנות כוח" value={String(summary.completedStrengthSegments)} />
        <SectionLabel>תחנות כוח</SectionLabel>
        <SegmentRail items={buildRailItems(segments, 'strength')} />
        <div style={{ marginTop: 10, fontSize: 12, color: '#9aa3a1', textAlign: 'center' }}>
          פירוט תרגילים (מתוכנן/בפועל) — בקרוב
        </div>
      </div>
    ),
    stats: (
      <div style={{ padding: '12px 14px' }}>
        <IdentityUnitsRow durationSeconds={totalDurationSec} calories={calories} xp={xpEarned} />
        <div style={{ marginTop: 12 }}>
          <StatLine label="מקטעים שהושלמו" value={`${summary.completedAerobicSegments + summary.completedStrengthSegments}/${summary.segmentCount}`} />
          <StatLine label="ריצה" value={`${summary.completedAerobicSegments} מקטעים`} />
          <StatLine label="כוח" value={`${summary.completedStrengthSegments} תחנות`} />
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

  const footer = (
    <div style={{ display: 'flex', gap: 9, padding: '10px 14px 14px', fontFamily: 'var(--font-simpler)' }}>
      <button
        onClick={handleShare}
        style={{
          flex: 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 6,
          padding: 12,
          borderRadius: 16,
          border: 'none',
          cursor: 'pointer',
          background: '#1D9E75',
          color: '#fff',
          fontSize: 14,
          fontWeight: 600,
        }}
      >
        <Share2 size={16} /> שתפו
      </button>
      {onDelete && (
        <button
          type="button"
          onClick={onDelete}
          aria-label="מחק אימון"
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 12,
            borderRadius: 16,
            border: 'none',
            cursor: 'pointer',
            background: '#FEF2F2',
            color: '#EF4444',
          }}
        >
          <Trash2 size={16} />
        </button>
      )}
      <button
        onClick={onFinish}
        style={{
          flex: 1,
          padding: 12,
          borderRadius: 16,
          border: '0.5px solid #d3d8d6',
          cursor: 'pointer',
          background: '#ffffff',
          color: '#1b2220',
          fontSize: 14,
          fontWeight: 600,
        }}
      >
        סיום
      </button>
    </div>
  );

  return (
    <SummaryDrawerShell
      tabs={HYBRID_TABS}
      activeTab={tab}
      onTabChange={setTab}
      onDismiss={onFinish}
      peekHeight={peekHeight}
      footer={footer}
    >
      {tabBody[tab] ?? tabBody.overview}
    </SummaryDrawerShell>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ borderRadius: 12, background: '#f4f7f6', padding: 12, textAlign: 'center' }}>
      <div style={{ fontSize: 18, fontWeight: 800, color: '#1b2220' }}>{value}</div>
      <div style={{ fontSize: 12, color: '#6b7472' }}>{label}</div>
    </div>
  );
}

function SectionLabel({ children }: { children: ReactNode }) {
  return <div style={{ fontSize: 12, color: '#9aa3a1', margin: '12px 2px 8px' }}>{children}</div>;
}

function StatLine({ label, value }: { label: string; value: string }) {
  return (
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        padding: '8px 0',
        borderBottom: '0.5px solid #e8ebea',
        fontSize: 13,
      }}
    >
      <span style={{ color: '#5b6664' }}>{label}</span>
      <span style={{ color: '#1b2220', fontWeight: 500 }}>{value}</span>
    </div>
  );
}
