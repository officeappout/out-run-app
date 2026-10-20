'use client';

import { useId } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { EASE_V2 } from './tokens';
import { formatStat, type BarDatum } from './logic';

export interface LineChartProps {
  data: BarDatum[];
  /** Dashed goal line; omit/null for none. */
  goal?: number | null;
  goalLabel?: string;
  /** Key of the point to call out (today / current). Defaults to the last. */
  highlightKey?: string | null;
  color?: string;
  height?: number;
  /** RTL draws the first datum on the right. */
  dir?: 'rtl' | 'ltr';
  /** Show every Nth x label (dense ranges). Default auto. */
  labelEvery?: number;
  ariaLabel?: string;
  className?: string;
  /** Prints the called-out value (e.g. a pace "5:42" from a plotted speed). Default: formatStat. */
  formatValue?: (value: number) => string;
}

/**
 * LineChart — a smooth line with a soft area wash, a dashed goal and the
 * current point called out with its value (design lab "steps", approved
 * 17.10.2026; the line replaces the bars in the home v2 look). Same data
 * shape as BarChart so callers can switch one for the other.
 */
export default function LineChart({
  data,
  goal,
  goalLabel,
  highlightKey,
  color = '#00baf7',
  height = 170,
  dir = 'rtl',
  labelEvery,
  ariaLabel,
  className = '',
  formatValue = formatStat,
}: LineChartProps) {
  const id = useId();
  const reduce = useReducedMotion();
  const n = data.length;
  if (n === 0) return null;
  const W = 320;
  const H = height;
  const padX = 14;
  const padTop = 26;
  const padBottom = 24;
  const max = Math.max(goal ?? 0, ...data.map((d) => d.value)) * 1.12 || 1;
  const every = labelEvery ?? (n > 14 ? Math.ceil(n / 6) : 1);
  const x = (i: number) => {
    const t = n === 1 ? 0.5 : i / (n - 1);
    const ltr = padX + t * (W - padX * 2);
    return dir === 'rtl' ? W - ltr : ltr;
  };
  const y = (v: number) => padTop + (1 - v / max) * (H - padTop - padBottom);
  const pts = data.map((d, i) => [x(i), y(d.value)] as const);
  let path = `M ${pts[0][0]} ${pts[0][1]}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const [x0, y0] = pts[i - 1] ?? pts[i];
    const [x1, y1] = pts[i];
    const [x2, y2] = pts[i + 1];
    const [x3, y3] = pts[i + 2] ?? pts[i + 1];
    path += ` C ${x1 + (x2 - x0) / 6} ${y1 + (y2 - y0) / 6}, ${x2 - (x3 - x1) / 6} ${y2 - (y3 - y1) / 6}, ${x2} ${y2}`;
  }
  const base = H - padBottom;
  const area = `${path} L ${pts[n - 1][0]} ${base} L ${pts[0][0]} ${base} Z`;
  const hiIdx = Math.max(0, highlightKey ? data.findIndex((d) => d.key === highlightKey) : n - 1);

  return (
    <svg
      data-v2-linechart
      viewBox={`0 0 ${W} ${H}`}
      className={`block h-auto w-full overflow-visible ${className}`}
      role="img"
      aria-label={ariaLabel ?? 'גרף'}
    >
      <defs>
        <linearGradient id={`${id}-a`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={color} stopOpacity="0.28" />
          <stop offset="1" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      {goal != null && goal > 0 && (
        <g>
          <line x1={padX} x2={W - padX} y1={y(goal)} y2={y(goal)} stroke="#94a3b8" strokeWidth="1.2" strokeDasharray="4 5" />
          <text x={dir === 'rtl' ? W - padX : padX} y={y(goal) - 6} textAnchor={dir === 'rtl' ? 'end' : 'start'} fontSize="10.5" fontWeight="700" fill="#64748b">
            {goalLabel ?? `יעד ${formatStat(goal)}`}
          </text>
        </g>
      )}
      <motion.path
        d={area}
        fill={`url(#${id}-a)`}
        initial={reduce ? false : { opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.8, delay: 0.3 }}
      />
      <motion.path
        d={path}
        fill="none"
        stroke={color}
        strokeWidth="3"
        strokeLinecap="round"
        initial={reduce ? false : { pathLength: 0 }}
        animate={{ pathLength: 1 }}
        transition={{ duration: 1, ease: EASE_V2 }}
      />
      {pts.map(([px, py], i) => (
        <g key={data[i].key}>
          {i === hiIdx ? (
            <>
              <circle cx={px} cy={py} r="7" fill={color} opacity="0.18" />
              <circle cx={px} cy={py} r="4.5" fill="#fff" stroke={color} strokeWidth="2.5" />
              <text x={px} y={py - 12} textAnchor="middle" fontSize="11" fontWeight="800" fill="#0e1419">
                {formatValue(data[i].value)}
              </text>
            </>
          ) : (
            <circle cx={px} cy={py} r="2.5" fill={color} opacity="0.55" />
          )}
          {(i % every === 0 || i === hiIdx) && (
            <text
              x={px}
              y={H - 6}
              textAnchor="middle"
              fontSize="10.5"
              fontWeight={i === hiIdx ? 800 : 700}
              fill={i === hiIdx ? '#0e1419' : '#64748b'}
            >
              {data[i].label}
            </text>
          )}
        </g>
      ))}
    </svg>
  );
}
