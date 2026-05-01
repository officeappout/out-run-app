'use client';

/**
 * RouteStoryBar — premium single-segment goal-progress bar.
 * ----------------------------------------------------------
 * ONLY rendered when a `sessionGoal` is active (the caller in
 * `AdaptiveMetricsWrapper` gates on `goalProgress !== null && !isPill`).
 * When no goal is set the bar is completely absent, keeping the UI
 * minimalist and map-focused.
 *
 * Design spec (Premium Story Mode):
 *   • Track        : h-2.5 (10 px), glassmorphism — rgba white/blur
 *                    background so the card surface shows through.
 *   • Fill         : solid `color`, strong neon glow (multi-layer
 *                    box-shadow), rounded-full both ends.
 *   • Shimmer      : CSS @keyframes gradient that sweeps right-to-left
 *                    over the filled portion. Pauses when `isPaused`.
 *   • Stats row    : RTL label (goal type in Hebrew) | LTR value pair
 *                    ("current / target unit") in bold tabular-nums.
 *   • Padding      : px-5 pt-3 pb-2 for breathing room inside the card.
 *
 * Animation architecture:
 *   Fill width is RAF-driven so it tracks `progress` at 60 fps even
 *   though the upstream store only ticks at 1 Hz. The shimmer is a pure
 *   CSS animation (no JS) so it costs zero layout/paint work.
 */

import { useEffect, useRef, useState, useCallback } from 'react';

interface RouteStoryBarProps {
  /** 0–1, clamped by useSessionGoalProgress before it reaches here. */
  progress: number;
  /**
   * Neon fill colour. Defaults to `out-cyan` (#00ADEF).
   * The glow, shimmer highlight, and label accent all derive from this
   * single value so the bar is always coherent.
   */
  color?: string;
  /** Freezes the RAF loop and pauses the shimmer animation. */
  isPaused?: boolean;
  /** Goal-type label shown on the right side (RTL) — e.g. "מרחק". */
  label?: string;
  /** Live "current / target unit" text shown on the left side — e.g. "2.4 / 5.0 ק״מ". */
  valueText?: string;
}

const DEFAULT_COLOR = '#00ADEF';

// Shimmer keyframes injected once into the document head.
// Using a module-level flag so repeated mounts don't insert duplicates.
let shimmerInjected = false;
function ensureShimmerKeyframes() {
  if (shimmerInjected || typeof document === 'undefined') return;
  shimmerInjected = true;
  const style = document.createElement('style');
  style.textContent = `
    @keyframes routeBarShimmer {
      0%   { background-position: 200% center; }
      100% { background-position: -200% center; }
    }
  `;
  document.head.appendChild(style);
}

export default function RouteStoryBar({
  progress,
  color = DEFAULT_COLOR,
  isPaused = false,
  label,
  valueText,
}: RouteStoryBarProps) {
  // Inject shimmer keyframes on first mount (client-only).
  useEffect(() => { ensureShimmerKeyframes(); }, []);

  // RAF-driven fill width — reads the latest `progress` synchronously
  // through the ref on every animation frame, writing into state only
  // when the value actually changes so React renders stay minimal.
  const [fillPct, setFillPct] = useState(() => Math.max(0, Math.min(1, progress)) * 100);
  const rafRef = useRef<number | null>(null);
  const targetRef = useRef(progress);
  targetRef.current = progress;

  const tick = useCallback(() => {
    const next = Math.max(0, Math.min(1, targetRef.current)) * 100;
    setFillPct((prev) => (prev === next ? prev : next));
    rafRef.current = requestAnimationFrame(tick);
  }, []);

  useEffect(() => {
    if (isPaused) {
      if (rafRef.current) { cancelAnimationFrame(rafRef.current); rafRef.current = null; }
      return;
    }
    rafRef.current = requestAnimationFrame(tick);
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
  }, [isPaused, tick]);

  // Neon glow: three layers — tight core, medium halo, wide ambient.
  // The innermost layer is fully opaque so the bar reads even in bright
  // sunlight; the outer two layers create the "lit tube" depth.
  const neonGlow = `
    0 0 4px ${color},
    0 0 12px ${color}CC,
    0 0 24px ${color}66
  `.replace(/\s+/g, ' ').trim();

  // Shimmer gradient: a translucent white highlight that sweeps across
  // the fill. `background-size: 200%` makes it travel the full width
  // in each cycle. The shimmer is LTR (left-to-right) intentionally —
  // it represents momentum / progress flowing forward.
  const shimmerGradient = `
    linear-gradient(
      105deg,
      transparent 40%,
      rgba(255,255,255,0.45) 50%,
      transparent 60%
    )
  `.replace(/\s+/g, ' ').trim();

  return (
    <div
      className="w-full px-5 pt-3 pb-2"
      style={{ fontFamily: 'var(--font-simpler)' }}
      dir="rtl"
    >
      {/* Stats row — Hebrew label on the right, numeric value on the left */}
      {(label || valueText) && (
        <div className="flex items-baseline justify-between mb-2">
          {/* Label — right side (RTL start) */}
          {label ? (
            <span
              className="text-[11px] font-black tracking-widest uppercase"
              style={{ color }}
            >
              {label}
            </span>
          ) : (
            <span />
          )}

          {/* Value — left side (RTL end), always LTR numerics */}
          {valueText ? (
            <span
              className="text-[13px] font-black tabular-nums"
              dir="ltr"
              style={{ color: 'rgba(0,0,0,0.75)', letterSpacing: '-0.01em' }}
            >
              {valueText}
            </span>
          ) : (
            <span />
          )}
        </div>
      )}

      {/* Track — glassmorphism: semi-transparent white blurred surface */}
      <div
        className="relative w-full rounded-full overflow-hidden"
        style={{
          height: 10, // h-2.5 equivalent (10 px)
          background: 'rgba(255, 255, 255, 0.25)',
          backdropFilter: 'blur(4px)',
          WebkitBackdropFilter: 'blur(4px)',
          border: '1px solid rgba(255, 255, 255, 0.35)',
          boxShadow: 'inset 0 1px 3px rgba(0,0,0,0.12)',
        }}
      >
        {/* Fill — neon glow + shimmer overlay. Grows from the RIGHT edge
            so Hebrew/RTL readers see progress accumulate toward the left,
            which maps naturally to "approaching the goal". */}
        {fillPct > 0 && (
          <div
            className="absolute inset-y-0 right-0 rounded-full"
            style={{
              width: `${fillPct}%`,
              backgroundColor: color,
              boxShadow: neonGlow,
              // Shimmer only while active; CSS animation-play-state
              // lets us toggle without removing/re-adding the element.
              backgroundImage: shimmerGradient,
              backgroundSize: '200% 100%',
              animationName: 'routeBarShimmer',
              animationDuration: '2.2s',
              animationTimingFunction: 'linear',
              animationIterationCount: 'infinite',
              animationPlayState: isPaused ? 'paused' : 'running',
              // Width transition: smooth at 0.1 s on active, instant on
              // pause so the freeze feels crisp rather than sluggish.
              transition: isPaused ? 'none' : 'width 0.1s linear',
            }}
          />
        )}
      </div>
    </div>
  );
}
