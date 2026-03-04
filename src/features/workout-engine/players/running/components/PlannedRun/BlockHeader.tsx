'use client';

import React from 'react';
import type { RunBlock } from '../../types/run-block.type';

interface BlockHeaderProps {
  currentBlock: RunBlock | null;
  currentBlockIndex: number;
  totalBlocks: number;
  blockTimeRemaining: number;
  blockDistanceRemaining: number;
  blockProgress: number;
  zoneLabel: string;
}

export default function BlockHeader({
  currentBlock,
  currentBlockIndex,
  totalBlocks,
  blockTimeRemaining,
  blockDistanceRemaining,
  blockProgress,
  zoneLabel,
}: BlockHeaderProps) {
  if (!currentBlock) return null;

  const blockColor = currentBlock.colorHex || '#00ADEF';
  const isDuration = (currentBlock.durationSeconds ?? 0) > 0;
  const isDistance = !isDuration && (currentBlock.distanceMeters ?? 0) > 0;

  return (
    <div
      className="w-full rounded-2xl overflow-hidden shadow-sm"
      style={{ fontFamily: 'var(--font-simpler)' }}
    >
      {/* Color bar top accent */}
      <div className="h-1.5" style={{ backgroundColor: blockColor }} />

      <div className="bg-white px-5 py-3">
        {/* Row 1: Block counter (right) + Zone label (left) */}
        <div className="flex items-center justify-between mb-1">
          <span
            className="text-xs font-bold tracking-wide"
            style={{ color: blockColor }}
          >
            {zoneLabel}
          </span>
          <span className="text-xs font-medium text-gray-400" dir="ltr">
            {currentBlockIndex + 1}/{totalBlocks}
          </span>
        </div>

        {/* Row 2: Block label + remaining */}
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-black text-gray-900 leading-tight">
            {currentBlock.label}
          </h2>
          <div className="text-left" dir="ltr">
            {isDuration && (
              <span className="text-lg font-black text-gray-900">
                {formatCountdown(blockTimeRemaining)}
              </span>
            )}
            {isDistance && (
              <span className="text-lg font-black text-gray-900">
                {formatDistanceRemaining(blockDistanceRemaining)}
              </span>
            )}
          </div>
        </div>

        {/* Progress bar */}
        <div className="mt-3 h-1.5 rounded-full bg-gray-100 overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-700 ease-linear"
            style={{
              width: `${Math.min(100, blockProgress * 100)}%`,
              backgroundColor: blockColor,
            }}
          />
        </div>
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

function formatDistanceRemaining(meters: number): string {
  if (meters <= 0) return '0 מ\'';
  if (meters >= 1000) return `${(meters / 1000).toFixed(2)} ק"מ`;
  return `${Math.round(meters)} מ'`;
}
