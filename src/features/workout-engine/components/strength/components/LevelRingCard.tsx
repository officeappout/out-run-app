'use client';

import { useId } from 'react';
import { Dumbbell } from 'lucide-react';
import { Card, IconTile } from '@/components/ui/v2';
import { levelRingModel, ringDashOffset } from '../utils/level-ring.util';

export interface LevelRingCardProps {
  programName: string;
  currentLevel: number;
  maxLevel: number;
  /** 0–100 progress inside the current level (live overlay from useSummaryAnalytics). */
  progressPercent: number;
}

const SIZE = 92;
const STROKE = 9;
const R = SIZE / 2 - STROKE / 2 - 1;

/**
 * v2 level ring for the strength summary — the same program-level data
 * ProgramProgressCard showed here (level, max, % inside the level), restyled:
 * brand-gradient ring on the tint track, StatNumber-style tabular percent.
 */
export default function LevelRingCard({ programName, currentLevel, maxLevel, progressPercent }: LevelRingCardProps) {
  const gid = useId().replace(/:/g, '');
  const m = levelRingModel(currentLevel, maxLevel, progressPercent);
  const c = 2 * Math.PI * R;

  return (
    <Card padding="lg" className="flex items-center gap-4">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <IconTile icon={Dumbbell} tone="accent" size="sm" />
          <span className="truncate text-[15px] font-extrabold text-v2-ink">{programName}</span>
        </div>
        <div className="mt-3 text-[22px] font-black leading-none tabular-nums tracking-[-0.02em] text-v2-ink">
          {m.levelLabel}
        </div>
        {m.nextLabel && <div className="mt-1.5 text-[13px] font-semibold text-v2-muted">{m.nextLabel}</div>}
      </div>
      <div className="relative shrink-0" style={{ width: SIZE, height: SIZE }}>
        <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`} aria-hidden>
          <defs>
            <linearGradient id={`lvl-${gid}`} x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#00baf7" />
              <stop offset="100%" stopColor="#0cf2e3" />
            </linearGradient>
          </defs>
          <circle cx={SIZE / 2} cy={SIZE / 2} r={R} fill="none" stroke="#eef8fc" strokeWidth={STROKE} />
          <circle
            cx={SIZE / 2}
            cy={SIZE / 2}
            r={R}
            fill="none"
            stroke={`url(#lvl-${gid})`}
            strokeWidth={STROKE}
            strokeLinecap="round"
            strokeDasharray={c}
            strokeDashoffset={ringDashOffset(R, m.percent)}
            transform={`rotate(-90 ${SIZE / 2} ${SIZE / 2})`}
            style={{ transition: 'stroke-dashoffset 700ms cubic-bezier(0.23, 1, 0.32, 1)' }}
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-[22px] font-black tabular-nums tracking-[-0.03em] text-v2-ink">
            {m.percent}
            <span className="text-[13px] font-bold text-v2-muted">%</span>
          </span>
        </div>
      </div>
    </Card>
  );
}
