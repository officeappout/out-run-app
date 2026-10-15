'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { EASE_V2 } from './tokens';
import { layoutBars, formatStat, type BarDatum } from './logic';

export type { BarDatum } from './logic';

export interface BarChartProps {
  data: BarDatum[];
  /** Dashed goal line; omit/null for none. */
  goal?: number | null;
  goalLabel?: string;
  /** Key of the bar to highlight as "today/current". */
  highlightKey?: string | null;
  /** Bar colour (semantic accent). Defaults to the v2 accent. */
  color?: string;
  height?: number;
  /** Text direction. RTL draws the first datum on the right. */
  dir?: 'rtl' | 'ltr';
  /** Show every Nth x label (dense ranges like a month). Default auto. */
  labelEvery?: number;
  /** Tooltip body for a tapped bar. Default: formatted value. */
  renderTooltip?: (d: BarDatum) => ReactNode;
  /** Change this to replay the stagger (e.g. the range id). Defaults to data length. */
  datasetKey?: string;
  ariaLabel?: string;
  className?: string;
}

/**
 * BarChart — bars grow/shrink between datasets with a stagger on the v2 curve
 * (scaleY from the baseline — transform only, no layout per frame), a dashed
 * goal line, a highlighted current bar, and tap-to-inspect with a glass
 * tooltip. Bars past the goal stay full-colour; the rest are a lighter tint,
 * so "days I hit it" read at a glance.
 */
export default function BarChart({
  data,
  goal,
  goalLabel,
  highlightKey,
  color = '#00baf7',
  height = 180,
  dir = 'rtl',
  labelEvery,
  renderTooltip,
  datasetKey,
  ariaLabel,
  className = '',
}: BarChartProps) {
  const reduce = useReducedMotion();
  const [selected, setSelected] = useState<string | null>(null);
  const { bars, goalRatio } = layoutBars(data, goal, data.length > 14 ? 0.015 : 0.035);
  const every = labelEvery ?? (data.length > 14 ? Math.ceil(data.length / 6) : 1);
  const n = data.length;
  const plotH = height - 22; // room for x labels

  // Clear the selection when the dataset changes.
  const dsKey = datasetKey ?? String(n);
  useEffect(() => setSelected(null), [dsKey]);

  const selIndex = selected ? data.findIndex((d) => d.key === selected) : -1;
  const selDatum = selIndex >= 0 ? data[selIndex] : null;
  const tipCenterPct = selIndex >= 0 ? ((selIndex + 0.5) / n) * 100 : 0;
  const tipPct = dir === 'rtl' ? 100 - tipCenterPct : tipCenterPct;

  return (
    <div
      data-v2-barchart
      role="group"
      aria-label={ariaLabel}
      className={`relative select-none ${className}`}
      style={{ height }}
      onClick={(e) => {
        if (e.target === e.currentTarget) setSelected(null);
      }}
    >
      {/* Plot */}
      <div className="absolute inset-x-0 top-0" style={{ height: plotH }}>
        {goalRatio != null && (
          <div
            data-v2-goal-line
            className="absolute inset-x-0 pointer-events-none"
            style={{ bottom: `${goalRatio * 100}%` }}
          >
            <div className="border-t-[1.5px] border-dashed border-v2-ink/25" />
            {goalLabel && (
              <span className="absolute -top-[18px] end-0 text-[10px] font-bold text-v2-muted bg-white/70 rounded-full px-1.5">
                {goalLabel}
              </span>
            )}
          </div>
        )}

        <div dir={dir} className="absolute inset-0 flex items-end gap-[3px]">
          <AnimatePresence initial={!reduce} mode="popLayout">
            {data.map((d, i) => {
              const b = bars[i];
              const isHi = d.key === highlightKey;
              const isSel = d.key === selected;
              const dim = selected != null && !isSel;
              const opacity = dim ? 0.35 : isHi || b.reachedGoal ? 1 : 0.45;
              return (
                <button
                  key={`${dsKey}:${d.key}`}
                  type="button"
                  data-v2-bar={d.key}
                  data-highlight={isHi || undefined}
                  aria-label={`${d.label}: ${formatStat(d.value)}`}
                  aria-pressed={isSel}
                  onClick={() => setSelected(isSel ? null : d.key)}
                  className="relative flex-1 h-full flex items-end justify-center min-w-0"
                >
                  <motion.span
                    className="block w-full max-w-[22px] rounded-t-[6px] rounded-b-[3px] origin-bottom"
                    style={{
                      height: `${Math.max(b.ratio * 100, d.value > 0 ? 2 : 0.8)}%`,
                      background: color,
                      boxShadow: isHi ? `0 0 0 2px #fff, 0 0 0 3.5px ${color}` : undefined,
                    }}
                    initial={reduce ? false : { scaleY: 0 }}
                    animate={{ scaleY: 1, opacity }}
                    exit={reduce ? undefined : { scaleY: 0, opacity: 0 }}
                    transition={{ duration: 0.5, ease: EASE_V2, delay: reduce ? 0 : b.delay }}
                  />
                </button>
              );
            })}
          </AnimatePresence>
        </div>
      </div>

      {/* X labels */}
      <div dir={dir} className="absolute inset-x-0 bottom-0 flex gap-[3px] h-[18px]">
        {data.map((d, i) => (
          <span
            key={d.key}
            className={`flex-1 min-w-0 text-center text-[10px] leading-[18px] tabular-nums truncate ${
              d.key === highlightKey ? 'font-black text-v2-ink' : 'font-semibold text-v2-muted'
            }`}
          >
            {i % every === 0 || d.key === highlightKey ? d.label : ''}
          </span>
        ))}
      </div>

      {/* Glass tooltip */}
      <AnimatePresence>
        {selDatum && (
          <motion.div
            key={selDatum.key}
            data-v2-tooltip
            role="status"
            initial={reduce ? false : { opacity: 0, y: 6, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={reduce ? undefined : { opacity: 0, y: 4 }}
            transition={{ duration: 0.22, ease: EASE_V2 }}
            className="v2-glass-card absolute top-0 z-[1] rounded-[14px] px-3 py-2 pointer-events-none"
            style={{
              left: `clamp(0px, calc(${tipPct}% - 56px), calc(100% - 112px))`,
              width: 112,
            }}
          >
            {renderTooltip ? (
              renderTooltip(selDatum)
            ) : (
              <div className="text-center">
                <div className="text-[18px] font-black tabular-nums tracking-[-0.02em] text-v2-ink">
                  {formatStat(selDatum.value)}
                </div>
                <div className="text-[11px] font-semibold text-v2-muted">{selDatum.label}</div>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
