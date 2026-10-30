'use client';

/**
 * PostRing: one of the post's three rings (boards PostTypes / PostCompact): the value and its unit
 * inside, the label under it. `dark` = on the post square (white text, faint track), else light.
 */

import React from 'react';

export interface PostRingProps {
  value: string;
  unit: string;
  label: string;
  pct: number;
  color: string;
  size?: number;
  dark?: boolean;
}

export default function PostRing({ value, unit, label, pct, color, size = 58, dark = false }: PostRingProps) {
  const stroke = size >= 58 ? 6 : 5;
  const r = size / 2 - stroke / 2 - 0.5;
  const c = 2 * Math.PI * r;
  const p = Math.max(0, Math.min(100, pct));
  return (
    <span className="flex min-w-0 flex-col items-center gap-1">
      <span className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="-rotate-90" aria-hidden>
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={dark ? 'rgba(255,255,255,.14)' : '#eef2f6'} strokeWidth={stroke} />
          {p > 0 && (
            <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={stroke} strokeLinecap="round" strokeDasharray={`${(c * p) / 100} ${c}`} />
          )}
        </svg>
        <span className="absolute inset-0 flex flex-col items-center justify-center leading-none">
          <span dir="ltr" className={`font-black tabular-nums ${dark ? 'text-white' : 'text-v2-ink'}`} style={{ fontSize: size >= 58 ? 14 : 11 }}>
            {value}
          </span>
          {unit && <span className={`text-[9px] font-extrabold ${dark ? 'text-white/70' : 'text-v2-muted'}`}>{unit}</span>}
        </span>
      </span>
      <span className={`whitespace-nowrap text-[11.5px] font-extrabold ${dark ? 'text-white/80' : 'text-v2-ink-2'}`}>{label}</span>
    </span>
  );
}
