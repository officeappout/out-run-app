'use client';

import { buildStepBarSegments, ENTRY_STEP_LABELS } from './step-bar';

export interface StepBarProps {
  /** 1-based current step. */
  current: number;
  labels?: readonly string[];
  /** Appended to the last label (e.g. " · רשות"). */
  lastLabelSuffix?: string;
  className?: string;
}

/**
 * v2 StepBar — the entry flow's segmented progress (3 segments by default).
 * Current = gradient bar + dark label · done = gradient bar + "✓" · future = grey.
 */
export default function StepBar({
  current,
  labels = ENTRY_STEP_LABELS,
  lastLabelSuffix,
  className = '',
}: StepBarProps) {
  const segments = buildStepBarSegments({ current, labels, lastLabelSuffix });
  return (
    <ol className={`flex gap-1.5 ${className}`} aria-label="התקדמות" dir="rtl">
      {segments.map((seg) => {
        const lit = seg.state !== 'future';
        return (
          <li
            key={seg.step}
            data-step-state={seg.state}
            aria-current={seg.state === 'current' ? 'step' : undefined}
            className="flex min-w-0 flex-1 flex-col gap-[5px]"
          >
            <span className={`h-[5px] rounded-full ${lit ? 'bg-v2-cta' : 'bg-[#e2e8f0]'}`} />
            <span
              className={`truncate text-right text-[11px] font-bold ${
                lit ? 'text-v2-ink' : 'text-[#94a3b8]'
              }`}
            >
              {seg.state === 'done' && <span aria-hidden>✓ </span>}
              {seg.label}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
