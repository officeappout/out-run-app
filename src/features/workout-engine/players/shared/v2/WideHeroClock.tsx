'use client';

/**
 * WideHeroClock — the big timer of the wide player: huge tabular digits (96
 * logical px, scaled by the side panel to ~200px at 1080p) with a slim
 * progress bar. Replaces the small rectangle timer in the wide variant.
 */

import React from 'react';

export type WideClockTone = 'accent' | 'warn' | 'ok' | 'idle';

const TONE_COLOR: Record<WideClockTone, string> = {
  accent: '#0e1b2a',
  warn: '#ea580c',
  ok: '#16a34a',
  idle: '#00a9e8',
};
const TONE_BAR: Record<WideClockTone, string> = {
  accent: '#00b4ff',
  warn: '#f97316',
  ok: '#22c55e',
  idle: '#94a3b8',
};

export interface WideHeroClockProps {
  text: string;
  /** "/ 00:30" or a small caption under the digits. */
  sub?: string | null;
  /** 0..1 */
  progress?: number;
  tone?: WideClockTone;
  dim?: boolean;
  /** Digit size in logical px. */
  size?: number;
}

export function clampProgress(p: number | undefined): number {
  if (p == null || Number.isNaN(p)) return 0;
  return Math.min(1, Math.max(0, p));
}

export default function WideHeroClock({ text, sub = null, progress = 0, tone = 'accent', dim = false, size = 96 }: WideHeroClockProps) {
  const pct = Math.round(clampProgress(progress) * 100);
  return (
    <div data-wide-hero="" className={`w-full select-none text-center transition-opacity duration-200 ${dim ? 'opacity-40' : 'opacity-100'}`}>
      <div
        dir="ltr"
        className="whitespace-nowrap font-black leading-none tabular-nums !tracking-[-0.03em]"
        style={{ fontSize: size, color: TONE_COLOR[tone] }}
      >
        {text}
      </div>
      {sub && <div className="mt-1 text-[20px] font-extrabold tabular-nums text-v2-muted">{sub}</div>}
      <div
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={pct}
        className="mx-auto mt-3 h-3 w-full overflow-hidden rounded-full bg-slate-200"
      >
        <div className="h-full rounded-full" style={{ width: `${pct}%`, background: TONE_BAR[tone], transition: 'width 0.95s linear' }} />
      </div>
    </div>
  );
}
