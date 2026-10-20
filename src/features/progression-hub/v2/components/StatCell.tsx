'use client';

/** One number in a 2×2 / 4-up stat grid: value + unit, caption, optional ▲/▼ delta. */
import { DeltaBadge } from '@/components/ui/v2';

export interface StatCellProps {
  value: string;
  unit?: string;
  label: string;
  current?: number;
  previous?: number | null;
  size?: 'lg' | 'md';
  className?: string;
}

export default function StatCell({ value, unit, label, current, previous, size = 'lg', className = '' }: StatCellProps) {
  return (
    <div className={`min-w-0 ${className}`}>
      <span className="inline-flex items-baseline gap-1">
        <span
          className={`font-black leading-none !tracking-[-0.03em] text-v2-ink tabular-nums ${size === 'lg' ? 'text-[28px]' : 'text-[20px]'}`}
        >
          {value}
        </span>
        {unit && <span className="whitespace-nowrap text-[13px] font-bold text-v2-muted">{unit}</span>}
      </span>
      <p className="mt-1 truncate whitespace-nowrap text-[12.5px] font-bold text-v2-muted">{label}</p>
      {current != null && previous != null && previous > 0 && (
        <div className="mt-2">
          <DeltaBadge current={current} previous={previous} />
        </div>
      )}
    </div>
  );
}
