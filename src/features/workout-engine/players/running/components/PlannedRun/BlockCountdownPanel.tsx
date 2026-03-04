'use client';

import React from 'react';
import PaceGauge from './PaceGauge';
import { usePlannedRunEngine } from '../../hooks/usePlannedRunEngine';

export default function BlockCountdownPanel() {
  const {
    currentBlock,
    currentBlockIndex,
    totalBlocks,
    blockTimeRemaining,
    blockDistanceRemaining,
    paceStatus,
    paceStatusColor,
    currentPaceSeconds,
    currentPaceFormatted,
    targetPaceFormatted,
    targetMinPace,
    targetMaxPace,
    showNumbers,
    targetZoneLabel,
    blockMode,
    effortLabel,
  } = usePlannedRunEngine();

  if (!currentBlock) return null;

  const isDuration = (currentBlock.durationSeconds ?? 0) > 0;
  const isDistance = !isDuration && (currentBlock.distanceMeters ?? 0) > 0;
  const blockColor = currentBlock.colorHex || '#00ADEF';

  return (
    <div
      className="w-full min-h-[180px] flex flex-col justify-center"
      style={{ fontFamily: 'var(--font-simpler)' }}
    >
      {/* Section divider */}
      <div className="flex items-center justify-center gap-4 mb-3">
        <div className="h-[1px] bg-gray-300 flex-grow max-w-[5rem]" />
        <span className="text-gray-400 text-sm font-medium">אינטרוול</span>
        <div className="h-[1px] bg-gray-300 flex-grow max-w-[5rem]" />
      </div>

      {/* Large countdown */}
      <div className="text-center mb-3">
        {isDuration && (
          <>
            <div className="text-[4rem] font-black text-gray-900 leading-none" dir="ltr">
              {formatCountdown(blockTimeRemaining)}
            </div>
            <div className="text-gray-500 text-xs mt-1">זמן נותר</div>
          </>
        )}
        {isDistance && (
          <>
            <div className="text-[4rem] font-black text-gray-900 leading-none" dir="ltr">
              {formatDistanceShort(blockDistanceRemaining)}
            </div>
            <div className="text-gray-500 text-xs mt-1">מרחק נותר</div>
          </>
        )}
      </div>

      {/* Pace gauge */}
      <div className="mx-[-1.25rem]">
        <PaceGauge
          currentPaceSeconds={currentPaceSeconds}
          targetMinPace={targetMinPace}
          targetMaxPace={targetMaxPace}
          paceStatus={paceStatus}
          paceStatusColor={paceStatusColor}
          currentPaceFormatted={currentPaceFormatted}
          targetPaceFormatted={targetPaceFormatted}
          showNumbers={showNumbers}
          blockMode={blockMode}
          effortLabel={effortLabel}
        />
      </div>
    </div>
  );
}

function formatCountdown(seconds: number): string {
  if (seconds <= 0) return '00:00';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

function formatDistanceShort(meters: number): string {
  if (meters <= 0) return '0';
  if (meters >= 1000) return `${(meters / 1000).toFixed(2)}`;
  return `${Math.round(meters)}`;
}
