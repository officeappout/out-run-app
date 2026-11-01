'use client';

/**
 * The attached run chrome's content for the PLANNED players (intervals and
 * steady runs): data strip, compact (3 equal columns) and large (pace, gauge,
 * metres left | time left) drawer contents, the presence status. The blocks
 * layer (story bars) stays with each player. Boards H-1 / H-2.
 */

import React, { useMemo } from 'react';
import { Zap } from 'lucide-react';
import { Chip, IntervalsCompact, IntervalsLarge } from '../../../../shared/v2/run-chrome/RunDrawerBlocks';
import type { RunDataStripItem } from '../../../../shared/v2/run-chrome/RunDataStrip';
import type { TogetherLiveStatus } from '@/features/workout-engine/together/hooks/useTogetherSession';
import { useRunningPlayer } from '../../../store/useRunningPlayer';
import type { RunBlock } from '../../../types/run-block.type';
import type { PlannedRunEngine } from '../../../hooks/usePlannedRunEngine';
import { PACE_BAND_COLORS, blockDisplayLabel, classifyPace, fmtBand, fmtClock, fmtDistance, fmtPace, isWorkBlock, liveCardMode } from '../../../lib/planned-rep-results';
import { comparesPace, unifiedPaceTone } from '../../../../shared/v2/run-chrome/unified-chrome-logic';
import { useT } from '@/hooks/useT';
import { together } from '@/messages/ns/together';

const planned = (b: RunBlock) => (b.distanceMeters ? fmtDistance(b.distanceMeters) : b.durationSeconds ? fmtClock(b.durationSeconds) : '');

export function usePlannedChromeNodes(p: {
  engine: PlannedRunEngine;
  blocks: RunBlock[];
  reps: { byIndex: Map<number, number>; total: number };
  totals: { durationSec: number; distanceKm: number };
  blockElapsedSeconds: number;
  isPaused: boolean;
  /** enable_unified_player_v1: recovery legs compare the pace too; green in range, orange either side. */
  unified?: boolean;
}) {
  const t = useT(together);
  const elevationGain = useRunningPlayer((s) => s.elevationGain);
  const { engine, blocks, reps, totals } = p;
  const { currentBlock: block, currentBlockIndex: idx, currentPaceSeconds, targetMinPace, targetMaxPace, blockTimeRemaining, blockDistanceRemaining } = engine;

  return useMemo(() => {
    const hasTarget = targetMinPace > 0 && targetMaxPace > 0;
    const mode = liveCardMode(block, hasTarget);
    const cls = comparesPace(mode, !!p.unified) && hasTarget ? classifyPace(currentPaceSeconds, targetMinPace, targetMaxPace) : null;
    const tone = p.unified ? unifiedPaceTone(cls?.band) : cls ? PACE_BAND_COLORS[cls.band].text : undefined;
    const paceNow = currentPaceSeconds > 0 ? fmtPace(currentPaceSeconds) : '--:--';
    const rep = reps.byIndex.get(idx) ?? 0;
    const isRep = !!block && isWorkBlock(block) && reps.total > 1;
    const meta = block ? planned(block) : '';
    const chipText = !block
      ? ''
      : isRep ? t('chrome.repChip', { n: rep, total: reps.total, len: meta }) : blockDisplayLabel(block);
    const chip = block ? <Chip icon={<Zap size={12} strokeWidth={2.4} color="#e5484d" aria-hidden />}>{chipText}</Chip> : null;
    const caption = !block ? '' : isRep ? t('chrome.repCaption', { n: rep, total: reps.total, len: meta }) : blockDisplayLabel(block);

    const hasDistance = !!block?.distanceMeters && block.distanceMeters > 0;
    const hasDuration = !!block?.durationSeconds && block.durationSeconds > 0;
    const leftRep = !block ? '--' : hasDuration ? fmtClock(blockTimeRemaining) : hasDistance ? fmtDistance(blockDistanceRemaining) : fmtClock(p.blockElapsedSeconds);
    const targetText = hasTarget ? fmtBand(targetMinPace, targetMaxPace) : '--';

    const next = blocks[idx + 1] ?? null;
    const nextText = next ? t('chrome.nextBlock', { name: blockDisplayLabel(next), meta: planned(next) }) : undefined;

    const strip: RunDataStripItem[] = [
      { value: paceNow, label: t('chrome.label.pace'), tone },
      { value: fmtClock(totals.durationSec), label: t('chrome.label.time') },
      { value: totals.distanceKm.toFixed(2), label: t('chrome.label.km') },
    ];

    const compact = (
      <IntervalsCompact chip={chip} paceNow={paceNow} paceTone={tone} target={targetText} left={leftRep} />
    );
    // Left cell: metres left on a distance leg, else the running km; right: time left, else elapsed.
    const metersLeft = hasDistance ? fmtDistance(blockDistanceRemaining) : totals.distanceKm.toFixed(2);
    const timeLeft = hasDuration ? fmtClock(blockTimeRemaining) : fmtClock(p.blockElapsedSeconds);
    const large = (
      <IntervalsLarge
        chip={chip}
        paceNow={paceNow}
        paceTone={tone}
        nowSec={currentPaceSeconds}
        loSec={hasTarget ? targetMinPace : undefined}
        hiSec={hasTarget ? targetMaxPace : undefined}
        targetText={targetText}
        metersLeft={metersLeft}
        timeLeft={timeLeft}
        nextText={nextText}
      />
    );

    const avg = totals.distanceKm > 0.05 ? totals.durationSec / totals.distanceKm : 0;
    const live: TogetherLiveStatus = {
      kind: 'run',
      state: p.isPaused ? 'paused' : 'active',
      distanceKm: totals.distanceKm,
      paceSecPerKm: currentPaceSeconds > 0 ? currentPaceSeconds : undefined,
      avgPaceSecPerKm: avg > 0 ? avg : undefined,
      elapsedSec: totals.durationSec,
      elevGainM: elevationGain > 0 ? elevationGain : undefined,
    };
    return { caption, strip, compact, large, live };
  }, [t, block, idx, blocks, reps, totals.durationSec, totals.distanceKm, currentPaceSeconds, targetMinPace, targetMaxPace, blockTimeRemaining, blockDistanceRemaining, p.blockElapsedSeconds, p.isPaused, p.unified, elevationGain]);
}
