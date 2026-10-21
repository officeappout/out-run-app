'use client';

/**
 * PaceRangeScale — the v2 live card's primary element (board F-1c): a 14 px
 * fast ↔ slow track, the target band outlined, a 30 px marker for the
 * current pace. Left = fast, right = slow (labels say so in words). The
 * marker is spring-smoothed and updated at most 5×/s so GPS bursts don't
 * re-layout on every sample.
 */

import React, { useEffect, useRef } from 'react';
import { motion, useMotionValue, useSpring, useTransform } from 'framer-motion';
import { paceScaleGeometry } from '../../../lib/planned-rep-results';
import { useT } from '@/hooks/useT';
import { player } from '@/messages/ns/player';

interface Props {
  minSec: number;
  maxSec: number;
  currentSec: number;
  /** Marker ring colour (the current band colour; neutral without a pace). */
  markerColor: string;
  /** "יעד 4:45–4:55" or "יעד · טמפו" when numbers are hidden. */
  targetLabel: string;
}

export default function PaceRangeScale({ minSec, maxSec, currentSec, markerColor, targetLabel }: Props) {
  const t = useT(player);
  const g = paceScaleGeometry(minSec, maxSec, currentSec);

  const lastRef = useRef(0);
  const mv = useMotionValue(g.marker ?? 50);
  const spring = useSpring(mv, { stiffness: 150, damping: 22, restDelta: 0.5 });
  const left = useTransform(spring, (v: number) => `calc(${v}% - 15px)`);
  useEffect(() => {
    if (g.marker === null) return;
    const now = Date.now();
    if (now - lastRef.current >= 200) {
      lastRef.current = now;
      mv.set(g.marker);
    }
  }, [g.marker, mv]);

  return (
    <div className="mx-1 mt-3.5">
      <div
        dir="ltr"
        className="relative h-3.5 rounded-full"
        style={{ background: 'linear-gradient(90deg,#f97316 0%,#fdba74 30%,#d1fae5 50%,#fecaca 70%,#e5484d 100%)' }}
      >
        {/* Target band — outlined so it reads without colour too. */}
        <span
          className="absolute -top-[5px] -bottom-[5px] rounded-full"
          style={{
            left: `${g.bandLeft}%`,
            width: `${g.bandWidth}%`,
            background: 'rgba(16,185,129,0.85)',
            boxShadow: '0 0 0 3px #ffffff, 0 0 0 5px rgba(14,20,25,0.25)',
          }}
        />
        {g.marker !== null && (
          <motion.span
            className="absolute -top-2 h-[30px] w-[30px] rounded-full bg-white"
            style={{ left, border: `5px solid ${markerColor}`, boxShadow: '0 4px 10px -4px rgba(9,30,50,0.5)' }}
            aria-hidden
          />
        )}
      </div>
      <div className="mt-3 flex justify-between whitespace-nowrap text-[12px] font-extrabold text-v2-muted">
        <span>{t('run.paceScale.slow')}</span>
        <span className="text-v2-ink-2">{targetLabel}</span>
        <span>{t('run.paceScale.fast')}</span>
      </div>
    </div>
  );
}
