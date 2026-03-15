'use client';

import { useMemo } from 'react';
import { useRunningPlayer } from '../store/useRunningPlayer';
import { useRunningConfigStore } from '../../../core/store/useRunningConfigStore';
import { useUserStore } from '@/features/user/identity/store/useUserStore';
import { computeZones, formatPaceSeconds } from '../../../core/services/running-engine.service';
import type { RunBlock } from '../types/run-block.type';
import type { ComputedPaceZone, RunZoneType, RunnerProfileType } from '../../../core/types/running.types';

export type PaceStatus = 'slow' | 'on_target' | 'fast' | 'idle';

export interface PlannedRunEngine {
  currentBlock: RunBlock | null;
  currentBlockIndex: number;
  totalBlocks: number;

  targetMinPace: number;
  targetMaxPace: number;
  targetZoneLabel: string;

  paceStatus: PaceStatus;
  paceStatusColor: string;

  blockProgress: number;
  blockTimeRemaining: number;
  blockDistanceRemaining: number;

  showNumbers: boolean;
  isWorkoutComplete: boolean;

  zones: Record<RunZoneType, ComputedPaceZone> | null;
  basePace: number;
  profileType: RunnerProfileType;

  currentPaceSeconds: number;
  currentPaceFormatted: string;
  targetPaceFormatted: string;

  blockMode: 'pace' | 'effort';
  effortLabel: string;
}

const STATUS_COLORS: Record<PaceStatus, string> = {
  on_target: '#10B981',
  slow:      '#EF4444',
  fast:      '#F59E0B',
  idle:      '#9CA3AF',
};

export function usePlannedRunEngine(): PlannedRunEngine {
  const profile = useUserStore((s) => s.profile);
  const config = useRunningConfigStore((s) => s.config);

  const currentWorkout = useRunningPlayer((s) => s.currentWorkout);
  const currentBlockIndex = useRunningPlayer((s) => s.currentBlockIndex);
  const blockElapsedSeconds = useRunningPlayer((s) => s.blockElapsedSeconds);
  const blockElapsedMeters = useRunningPlayer((s) => s.blockElapsedMeters);
  const currentPace = useRunningPlayer((s) => s.currentPace);

  const paceProfile = profile?.running?.paceProfile;
  const basePace = paceProfile?.basePace ?? 0;
  const profileType: RunnerProfileType = paceProfile?.profileType ?? 3;
  const showNumbers = profileType !== 3;

  const zones = useMemo(() => {
    if (basePace <= 0) return null;
    return computeZones(basePace, profileType, config);
  }, [basePace, profileType, config]);

  const totalBlocks = currentWorkout?.blocks.length ?? 0;
  const currentBlock: RunBlock | null =
    currentWorkout && currentBlockIndex < totalBlocks
      ? currentWorkout.blocks[currentBlockIndex]
      : null;

  const isWorkoutComplete =
    currentWorkout != null && currentBlockIndex >= totalBlocks;

  // Resolve target pace range for the current block (seconds/km)
  const { targetMinPace, targetMaxPace } = useMemo(() => {
    if (!currentBlock || basePace <= 0)
      return { targetMinPace: 0, targetMaxPace: 0 };

    // Prefer zone-based lookup if the block carries a zoneType
    if (currentBlock.zoneType && zones) {
      const z = zones[currentBlock.zoneType];
      return { targetMinPace: z.minPace, targetMaxPace: z.maxPace };
    }

    // Fall back to percentage-based computation
    if (currentBlock.targetPacePercentage) {
      return {
        targetMinPace: Math.round(basePace * currentBlock.targetPacePercentage.min / 100),
        targetMaxPace: Math.round(basePace * currentBlock.targetPacePercentage.max / 100),
      };
    }

    return { targetMinPace: 0, targetMaxPace: 0 };
  }, [currentBlock, basePace, zones]);

  // Convert store pace (min/km) → seconds/km for comparison
  const currentPaceSeconds =
    currentPace > 0 && isFinite(currentPace) ? currentPace * 60 : 0;

  // Derive pace status
  let paceStatus: PaceStatus = 'idle';
  if (currentPaceSeconds > 0 && targetMinPace > 0 && targetMaxPace > 0) {
    if (currentPaceSeconds < targetMinPace) paceStatus = 'fast';
    else if (currentPaceSeconds > targetMaxPace) paceStatus = 'slow';
    else paceStatus = 'on_target';
  }

  // Block progress (0-1)
  let blockProgress = 0;
  let blockTimeRemaining = 0;
  let blockDistanceRemaining = 0;

  if (currentBlock) {
    if (currentBlock.durationSeconds && currentBlock.durationSeconds > 0) {
      blockProgress = Math.min(1, blockElapsedSeconds / currentBlock.durationSeconds);
      blockTimeRemaining = Math.max(0, currentBlock.durationSeconds - blockElapsedSeconds);
    } else if (currentBlock.distanceMeters && currentBlock.distanceMeters > 0) {
      blockProgress = Math.min(1, blockElapsedMeters / currentBlock.distanceMeters);
      blockDistanceRemaining = Math.max(0, currentBlock.distanceMeters - blockElapsedMeters);
    }
  }

  const blockMode = currentBlock?.blockMode ?? 'pace';
  const effortLabel = blockMode === 'effort' && currentBlock?.effortConfig
    ? effortLevelLabel(currentBlock.effortConfig.effortLevel)
    : '';

  const targetZoneLabel = blockMode === 'effort'
    ? effortLabel || currentBlock?.label || ''
    : currentBlock?.zoneType
      ? zoneTypeLabel(currentBlock.zoneType)
      : currentBlock?.label ?? '';

  // For effort blocks or synthesized rests, pace status is always idle (no pace target)
  if (blockMode === 'effort' || currentBlock?._isSynthesizedRest) {
    paceStatus = 'idle';
  }

  return {
    currentBlock,
    currentBlockIndex,
    totalBlocks,
    targetMinPace,
    targetMaxPace,
    targetZoneLabel,
    paceStatus,
    paceStatusColor: STATUS_COLORS[paceStatus],
    blockProgress,
    blockTimeRemaining,
    blockDistanceRemaining,
    showNumbers: blockMode === 'effort' ? false : showNumbers,
    isWorkoutComplete,
    zones,
    basePace,
    profileType,
    currentPaceSeconds,
    currentPaceFormatted: currentPaceSeconds <= 0 ? '--:--' : formatPaceSeconds(currentPaceSeconds),
    targetPaceFormatted:
      targetMinPace > 0 && targetMaxPace > 0
        ? `${formatPaceSeconds(targetMinPace)}–${formatPaceSeconds(targetMaxPace)}`
        : '—',
    blockMode,
    effortLabel,
  };
}

function zoneTypeLabel(zone: RunZoneType): string {
  const labels: Record<RunZoneType, string> = {
    walk:           'הליכה',
    jogging:        'ג׳וגינג',
    recovery:       'התאוששות',
    easy:           'ריצה קלה',
    long_run:       'ריצה ארוכה',
    fartlek_medium: 'פארטלק בינוני',
    tempo:          'טמפו',
    fartlek_fast:   'פארטלק מהיר',
    interval_long:  'אינטרוול ארוך',
    interval_short: 'אינטרוול קצר',
    sprint:         'ספרינט',
  };
  return labels[zone] ?? zone;
}

function effortLevelLabel(level: 'moderate' | 'hard' | 'max'): string {
  switch (level) {
    case 'moderate': return 'מאמץ בינוני';
    case 'hard':     return 'מאמץ גבוה';
    case 'max':      return 'מאמץ מקסימלי';
  }
}
