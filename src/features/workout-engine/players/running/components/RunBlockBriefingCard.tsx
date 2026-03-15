'use client';

import React from 'react';
import { Play, Dumbbell } from 'lucide-react';
import type { RunBlock } from '../types/run-block.type';

interface RunBlockBriefingCardProps {
  block: RunBlock;
  index: number;
  paceLabel: string;
  metaLabel: string;
  onDrillTap?: () => void;
}

const EFFORT_LABELS: Record<string, string> = {
  moderate: 'מאמץ בינוני',
  hard: 'מאמץ גבוה',
  max: 'מאמץ מקסימלי',
};

export default function RunBlockBriefingCard({
  block, index, paceLabel, metaLabel, onDrillTap,
}: RunBlockBriefingCardProps) {
  const isDrillBlock = !!block.drillRef;
  const isEffortBlock = !isDrillBlock && block.blockMode === 'effort';
  const isRest = block._isSynthesizedRest || block.type === 'recovery' || block.type === 'walk';

  return (
    <div
      className={`flex items-center gap-3 px-4 py-3 bg-white transition-colors ${isDrillBlock ? 'active:bg-slate-50 cursor-pointer' : ''}`}
      style={{ fontFamily: 'var(--font-simpler)' }}
      onClick={isDrillBlock ? onDrillTap : undefined}
      role={isDrillBlock ? 'button' : undefined}
      tabIndex={isDrillBlock ? 0 : undefined}
    >
      {/* Color bar */}
      <div
        className="w-1 self-stretch rounded-full shrink-0"
        style={{ backgroundColor: isRest ? '#E5E7EB' : (block.colorHex || '#9CA3AF') }}
      />

      {/* Text content */}
      <div className="flex-grow min-w-0">
        <span className={`text-sm font-bold ${isRest ? 'text-slate-400' : 'text-slate-900'} truncate block`}>
          {block.label}
        </span>
        <div className="flex items-center gap-2 mt-0.5 flex-wrap">
          {metaLabel && (
            <span className="text-xs text-slate-500">{metaLabel}</span>
          )}
          {isDrillBlock && block.drillRef?.repsCount && (
            <span className="text-xs text-slate-500">{block.drillRef.repsCount} חזרות</span>
          )}
          {isEffortBlock && block.effortConfig && (
            <span className="text-[11px] font-medium text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded-full">
              {EFFORT_LABELS[block.effortConfig.effortLevel] ?? block.effortConfig.effortLevel}
            </span>
          )}
          {!isDrillBlock && !isEffortBlock && paceLabel && (
            <span className="text-xs text-slate-500 font-medium" dir="ltr">
              {paceLabel} /ק&quot;מ
            </span>
          )}
        </div>

        {isDrillBlock && (
          <div className="flex items-center gap-1 mt-1.5">
            <Play size={10} className="text-[#00BAF7]" fill="#00BAF7" />
            <span className="text-[11px] font-bold text-[#00BAF7]">צפה בסרטון</span>
          </div>
        )}
      </div>

      {/* Right side */}
      {isDrillBlock ? (
        <div className="w-14 h-14 rounded-xl bg-slate-100 overflow-hidden shrink-0">
          {block.drillRef?.thumbnailUrl ? (
            <img src={block.drillRef.thumbnailUrl} alt="" className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <Dumbbell size={18} className="text-slate-400" />
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}
