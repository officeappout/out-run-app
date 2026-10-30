'use client';

import { useState, type ReactNode } from 'react';
import { Share2, Trash2, Target, Sparkles } from 'lucide-react';
import {
  Button,
  Card,
  CardTile,
  Chip,
  ExerciseSetsTable,
  IconTile,
  MetricRings,
  StatNumber,
  StreakDotsStrip,
} from '@/components/ui/v2';
import { useFeatureFlags } from '@/hooks/useFeatureFlags';
import { useUserStore } from '@/features/user';
import { useActivityStore } from '@/features/activity/store/useActivityStore';
import { WHO_COMPLIANCE_BASELINE } from '@/features/activity/types/activity.types';
import { useSummaryStreakWeek } from '../hooks/useSummaryStreakWeek';
import { hybridRings, hybridStationTables } from '../v2-summary.mapping';
import { isWalkSession, relabelWalkRing, withWidgetRingColors } from '../park-summary';
import type { Lap } from '@/features/workout-engine/core/types/session.types';
import LapPaceChart from '../components/shared/LapPaceChart';
import HybridLapsTable from './HybridLapsTable';
import type { HybridFinalizeResult } from '@/features/workout-engine/hybrid/hybrid-orchestrator';
import SummaryDrawerShell, { type DrawerTab } from '../blocks/SummaryDrawerShell';
import type { SummarySnap } from '../blocks/summary-sheet.util';
import SegmentRail, { type SegmentRailItem } from '../blocks/SegmentRail';
import { railTypeFromKind, segmentLabel, type SegmentRailType } from '../blocks/segment-rail.util';
import { formatDuration } from '../format';
import ReportProblemButton from '@/features/generation-review/components/ReportProblemButton';
import { useT } from '@/hooks/useT';
import { summary as summaryNs, type SummaryT } from '@/messages/ns/summary';
import { common } from '@/messages/ns/common';
import { unitLabel, withUnit, type CommonT } from '@/lib/i18n/units';

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
  /** enable_park_live_v2 (board Park 12, pilot N2): walk label + title, the streak without the
   *  minutes bar. The caller reads the flag. Omitted → today's summary. */
  parkLive?: boolean;
  /** enable_combo_flow_v1 (board PlayerComboSummary): rings in the home widget's colours. */
  widgetRings?: boolean;
  /** enable_combo_flow_v1 (board PlayerSummaryCoverage): the aerobic legs' laps → chart + table. */
  laps?: Lap[];
  /** enable_park_live_v2 (pilot M7): no strength questionnaire yet → the card that opens it. */
  onStrengthQuiz?: () => void;
  /**
   * History (read-only) view. Only read by the enable_home_v2 overview: the
   * "this week" streak strip describes now, so it is hidden for a past workout.
   */
  isReadOnly?: boolean;
}

const HYBRID_TAB_IDS = ['overview', 'aerobic', 'strength', 'stats'] as const;

type Segments = HybridFinalizeResult['segments'];

function buildRailItems(segments: Segments, t: SummaryT, tc: CommonT, only?: SegmentRailType): SegmentRailItem[] {
  return segments
    .map((seg, i) => ({ seg, type: railTypeFromKind(seg.kind), i }))
    .filter(({ type }) => !only || type === only)
    .map(({ seg, type, i }) => {
      const dur = seg.actual?.durationSec ?? 0;
      const timeStr = dur > 0 ? formatDuration(dur) : '';
      const detail =
        seg.kind === 'strength'
          ? `${t('hybrid.sets', { n: String(seg.actual?.sets ?? 0) })}${timeStr ? ` · ${timeStr}` : ''}`
          : `${withUnit('km', (seg.actual?.distanceKm ?? 0).toFixed(2), tc)}${timeStr ? ` · ${timeStr}` : ''}`;
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
  isReadOnly = false,
  parkLive = false,
  widgetRings = false,
  laps,
  onStrengthQuiz,
}: HybridSummaryProps) {
  const t = useT(summaryNs);
  const tc = useT(common);
  const hybridTabs: DrawerTab[] = HYBRID_TAB_IDS.map((id) => ({ id, label: t(`hybrid.tab.${id}`) }));
  const [tab, setTab] = useState<string>('overview');
  // Home v2 (enable_home_v2): F-2f/F-3e overview (rings + streak strip, no XP)
  // and the F-3g strength table. Flag off ⇒ today's summary, unchanged.
  const isSuperAdmin = useUserStore((st) => !!(st.profile?.core as { isSuperAdmin?: boolean } | undefined)?.isSuperAdmin);
  const v2 = useFeatureFlags(isSuperAdmin).flags.enableHomeV2;
  const streakWeek = useSummaryStreakWeek({ todayDone: !isReadOnly });
  const weeklySummary = useActivityStore((s) => s.weeklySummary);
  const { summary, segments } = result;
  const totalDurationSec = segments.reduce((acc, s) => acc + (s.actual?.durationSec ?? 0), 0);
  const aerobicSec = summary.totalActualAerobicSec;
  const completedSegments = summary.completedAerobicSegments + summary.completedStrengthSegments;
  const xpVal = Math.round(xpEarned || 0);
  const stationTables = v2 ? hybridStationTables(segments) : [];
  // AG10: a walk session's aerobic tab says "walk", not "run" (every user; copy only).
  const walkSession = isWalkSession(segments);
  const parkWalk = parkLive && walkSession;
  const walkRings = relabelWalkRing(hybridRings(result), parkWalk, t('segment.walking'));
  const overviewRings = widgetRings ? withWidgetRingColors(walkRings) : walkRings;

  // Hero (drag zone): the combined number — total session time — with the two
  // halves as chips. Stays visible when the drawer is collapsed to its peek.
  const hero = (
    <div className="flex items-end justify-between gap-3 px-4 pt-1 pb-3">
      <div className="min-w-0">
        <div className="text-[13px] font-extrabold text-v2-deep">{parkWalk ? t('parkLive.title.walk') : t('hybrid.title')}</div>
        <StatNumber
          value={totalDurationSec}
          format={(v) => formatDuration(Math.round(v))}
          size="lg"
          label={t('hybrid.totalTime')}
          className="mt-1"
        />
      </div>
      <div className="flex flex-col items-end gap-1.5 shrink-0">
        <Chip tone="accent">{withUnit('km', summary.totalActualDistanceKm.toFixed(2), tc)}</Chip>
        <Chip tone="neutral">{t('hybrid.sets', { n: String(summary.totalStrengthSets) })}</Chip>
        {xpVal > 0 && !v2 && (
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
        {parkWalk ? t('parkLive.banner.walk') : t('hybrid.banner')}
      </span>
    </div>
  ) : null;

  const tabBody: Record<string, ReactNode> = {
    overview: v2 ? (
      <div className="space-y-3 px-4 pt-4 pb-6">
        <Card padding="md">
          <MetricRings rings={overviewRings} />
        </Card>
        {banner}
        {!isReadOnly && (
          <StreakDotsStrip
            streak={streakDays}
            best={Math.max(streakWeek.best, streakDays)}
            days={streakWeek.days}
            // Pilot N2 (enable_park_live_v2): the streak card without the minutes bar.
            bars={parkLive ? undefined : [
              {
                label: t('hybrid.activeMinutes'),
                value: (weeklySummary?.categoryTotals?.strength ?? 0) + (weeklySummary?.categoryTotals?.cardio ?? 0),
                max: WHO_COMPLIANCE_BASELINE.weeklyAerobicMinutes,
              },
            ]}
          />
        )}
        {parkLive && onStrengthQuiz && !isReadOnly && (
          <div className="flex flex-col items-start gap-2 rounded-v2-card bg-[#fff7ed] px-4 py-3">
            <span className="text-[13.5px] leading-[20px] text-[#7c2d12]">{t('parkLive.quiz.text')}</span>
            <Button variant="ghost" size="sm" onClick={onStrengthQuiz}>{t('parkLive.quiz.cta')}</Button>
          </div>
        )}
        <div>
          <SectionLabel>{t('hybrid.course')}</SectionLabel>
          <SegmentRail items={buildRailItems(segments, t, tc)} />
        </div>
      </div>
    ) : (
      <div className="px-4 pt-4 pb-6">
        <div className="grid grid-cols-2 gap-2">
          <StatTile value={summary.totalActualDistanceKm} decimals={2} unit={unitLabel('km', tc)} label={t('hybrid.tile.distance')} />
          <StatTile value={summary.totalStrengthSets} label={t('hybrid.tile.sets')} />
          <StatTile
            value={completedSegments}
            format={() => `${completedSegments}/${summary.segmentCount}`}
            label={t('hybrid.tile.segments')}
          />
          <StatTile value={Math.round(calories || 0)} unit={t('hybrid.kcal')} label={t('hybrid.tile.calories')} />
        </div>
        {banner}
        <SectionLabel>{t('hybrid.course')}</SectionLabel>
        <SegmentRail items={buildRailItems(segments, t, tc)} />
      </div>
    ),
    aerobic: (
      <div className="px-4 pt-4 pb-6">
        <div className="grid grid-cols-2 gap-2">
          <StatTile value={summary.totalActualDistanceKm} decimals={2} unit={unitLabel('km', tc)} label={t(walkSession ? 'hybrid.aerobic.distanceWalk' : 'hybrid.aerobic.distance')} />
          <StatTile
            value={aerobicSec}
            format={() => (aerobicSec > 0 ? formatDuration(aerobicSec) : '--')}
            label={t(walkSession ? 'hybrid.aerobic.timeWalk' : 'hybrid.aerobic.time')}
          />
        </div>
        <SectionLabel>{t(walkSession ? 'hybrid.aerobic.segmentsWalk' : 'hybrid.aerobic.segments')}</SectionLabel>
        <SegmentRail items={buildRailItems(segments, t, tc, 'aerobic')} />
        {laps && laps.length > 0 && (
          <div className="mt-4 space-y-3">
            {laps.length > 1 && <LapPaceChart laps={laps} />}
            <HybridLapsTable laps={laps} />
          </div>
        )}
      </div>
    ),
    strength: v2 && stationTables.length > 0 ? (
      <div className="space-y-4 px-4 pt-4 pb-6">
        {stationTables.map((t) => (
          <ExerciseSetsTable key={t.key} title={t.title} rows={t.rows} />
        ))}
      </div>
    ) : (
      <div className="px-4 pt-4 pb-6">
        <div className="grid grid-cols-2 gap-2">
          <StatTile value={summary.totalStrengthSets} label={t('hybrid.strength.setsDone')} />
          <StatTile value={summary.completedStrengthSegments} label={t('hybrid.strength.stations')} />
        </div>
        <SectionLabel>{t('hybrid.strength.stations')}</SectionLabel>
        <SegmentRail items={buildRailItems(segments, t, tc, 'strength')} />
      </div>
    ),
    stats: (
      <div className="px-4 pt-4 pb-6">
        <div className={`grid gap-2 ${v2 ? 'grid-cols-2' : 'grid-cols-3'}`}>
          <StatTile
            value={totalDurationSec}
            format={() => formatDuration(totalDurationSec)}
            label={t('hybrid.stats.time')}
          />
          <StatTile value={Math.round(calories || 0)} label={t('hybrid.stats.kcal')} />
          {!v2 && <StatTile value={xpVal} label="XP" />}
        </div>
        <div className="mt-2 grid grid-cols-3 gap-2">
          <StatTile
            value={completedSegments}
            format={() => `${completedSegments}/${summary.segmentCount}`}
            label={t('hybrid.stats.segments')}
          />
          <StatTile value={summary.completedAerobicSegments} label={t(walkSession ? 'hybrid.stats.aerobicSegmentsWalk' : 'hybrid.stats.aerobicSegments')} />
          <StatTile value={summary.completedStrengthSegments} label={t('hybrid.stats.strengthStations')} />
        </div>
        {banner}
      </div>
    ),
  };

  const handleShare = () => {
    const text = t('hybrid.shareText', {
      distance: withUnit('km', summary.totalActualDistanceKm.toFixed(2), tc),
      sets: t('hybrid.sets', { n: String(summary.totalStrengthSets) }),
    });
    if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
      navigator.share({ text }).catch(() => {});
    }
  };

  // Pinned footer — share (where it was), optional delete (history only) and
  // the ONE explicit exit action. The drawer itself never finishes on drag/tap.
  const footer = (
    <>
    <div className="flex items-center gap-2.5 px-4 py-3">
      <Button variant="ghost" size="lg" onClick={handleShare} className="flex-1">
        <Share2 size={18} strokeWidth={2.4} aria-hidden />
        {t('hybrid.share')}
      </Button>
      {onDelete && (
        <Button
          variant="ghost"
          size="lg"
          onClick={onDelete}
          aria-label={t('hybrid.deleteAria')}
          className="!px-4 !text-v2-down"
        >
          <Trash2 size={18} strokeWidth={2.4} aria-hidden />
        </Button>
      )}
      <Button variant="primary" size="lg" onClick={onFinish} className="flex-[1.4]">
        {t('hybrid.finish')}
      </Button>
    </div>
    {!isReadOnly && (
      <ReportProblemButton types={['hybrid_smart_walk', 'hybrid_full_park', 'hybrid_route_stops', 'hybrid_free_aerobic']} wrapperClassName="flex justify-center pb-2" />
    )}
    </>
  );

  return (
    <SummaryDrawerShell
      tabs={hybridTabs}
      activeTab={tab}
      onTabChange={setTab}
      header={hero}
      peekHeight={peekHeight}
      initialSnap={initialSnap}
      topBar={isReadOnly ? { title: t('hybrid.topBar.title'), onClose: onFinish } : undefined}
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
