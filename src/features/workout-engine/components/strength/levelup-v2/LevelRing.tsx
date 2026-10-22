'use client';

/**
 * The level ring (LV-1…LV-4): a light arc for what was already there and a
 * bright arc for this session, tweening (ease-out, ≤ 600ms) to each step.
 * The center shows the label, the big number and the delta pill.
 */
import React, { useEffect, useRef } from 'react';
import { motion, useMotionValue, useTransform, animate } from 'framer-motion';
import { formatPercent } from './levelup-view-model';

const SIZE = 210;
const R = 84;
const STROKE = 16;
const C = 2 * Math.PI * R;
/** Strong ease-out (emil-design-eng): fast start, soft landing. */
export const EASE_OUT: [number, number, number, number] = [0.23, 1, 0.32, 1];
const RING_TWEEN_S = 0.5;

const clamp = (p: number) => Math.max(0, Math.min(100, p));
const dash = (len: number) => `${Math.max(0, len).toFixed(1)} ${C.toFixed(1)}`;

export interface LevelRingProps {
  /** Start of this session's arc, 0..100. */
  base: number;
  /** Current fill, 0..100. */
  percent: number;
  label: string;
  /** Static center text (the new level); omitted → the live percent. */
  bigText?: string;
  delta: { text: string; tone: 'gain' | 'calm' } | null;
  calm: boolean;
  reducedMotion: boolean;
}

export default function LevelRing({ base, percent, label, bigText, delta, calm, reducedMotion }: LevelRingProps) {
  const live = useMotionValue(clamp(percent));
  const baseMv = useMotionValue(clamp(base));
  const prevBase = useRef(base);

  useEffect(() => {
    // Level-up reset (base drops to 0): restart the fill from the new base
    // instead of draining backwards.
    if (base < prevBase.current) live.set(clamp(base));
    prevBase.current = base;
    baseMv.set(clamp(base));
    const ctrl = animate(live, clamp(percent), {
      duration: reducedMotion ? 0 : RING_TWEEN_S,
      ease: EASE_OUT,
    });
    return () => ctrl.stop();
  }, [percent, base, reducedMotion, live, baseMv]);

  const prevDash = useTransform([live, baseMv], ([v, b]: number[]) => dash((Math.min(b, v) / 100) * C));
  const gainDash = useTransform([live, baseMv], ([v, b]: number[]) => dash(((v - b) / 100) * C));
  const gainOffset = useTransform(baseMv, (b) => -(b / 100) * C);
  // A zero-length arc with a round cap would still draw a dot.
  const gainOpacity = useTransform([live, baseMv], ([v, b]: number[]) => (v - b > 0.3 ? 1 : 0));
  const percentText = useTransform(live, (v) => `${formatPercent(v)}%`);

  return (
    <div className="relative" style={{ width: SIZE, height: SIZE }}>
      <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`} aria-hidden="true">
        <circle cx={SIZE / 2} cy={SIZE / 2} r={R} fill="none" strokeWidth={STROKE} className="stroke-slate-100 dark:stroke-slate-700" />
        <motion.circle
          cx={SIZE / 2}
          cy={SIZE / 2}
          r={R}
          fill="none"
          strokeWidth={STROKE}
          className={calm ? 'stroke-sky-300 dark:stroke-sky-700' : 'stroke-sky-200 dark:stroke-sky-800'}
          style={{ strokeDasharray: prevDash }}
          transform={`rotate(-90 ${SIZE / 2} ${SIZE / 2})`}
        />
        <motion.circle
          cx={SIZE / 2}
          cy={SIZE / 2}
          r={R}
          fill="none"
          strokeWidth={STROKE}
          strokeLinecap="round"
          className="stroke-primary"
          style={{ strokeDasharray: gainDash, strokeDashoffset: gainOffset, opacity: gainOpacity }}
          transform={`rotate(-90 ${SIZE / 2} ${SIZE / 2})`}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-[13px] font-extrabold text-slate-500 dark:text-slate-400">{label}</span>
        <motion.span
          dir="ltr"
          className="text-[56px] leading-[60px] font-black tracking-tight text-slate-900 dark:text-white tabular-nums"
        >
          {bigText ?? percentText}
        </motion.span>
        {delta && (
          <span
            dir={delta.tone === 'gain' ? 'ltr' : undefined}
            className={`h-[26px] px-2.5 rounded-full text-sm font-black inline-flex items-center ${
              delta.tone === 'gain'
                ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300'
                : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'
            }`}
          >
            {delta.text}
          </span>
        )}
      </div>
    </div>
  );
}
