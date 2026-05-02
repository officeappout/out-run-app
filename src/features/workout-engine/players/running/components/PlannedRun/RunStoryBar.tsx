'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { motion } from 'framer-motion';
import type { RunBlock } from '../../types/run-block.type';

interface RunStoryBarProps {
  blocks: RunBlock[];
  currentBlockIndex: number;
  blockProgress: number;
  isPaused: boolean;
}

export default function RunStoryBar({
  blocks,
  currentBlockIndex,
  blockProgress,
  isPaused,
}: RunStoryBarProps) {
  const [fillProgress, setFillProgress] = useState(0);
  const rafRef = useRef<number | null>(null);
  const targetProgressRef = useRef(blockProgress);
  targetProgressRef.current = blockProgress;

  useEffect(() => {
    setFillProgress(0);
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
  }, [currentBlockIndex]);

  const tick = useCallback(() => {
    setFillProgress(targetProgressRef.current);
    rafRef.current = requestAnimationFrame(tick);
  }, []);

  useEffect(() => {
    if (isPaused) {
      if (rafRef.current) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      return;
    }

    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [isPaused, tick]);

  return (
    <div className="flex flex-row-reverse gap-1.5 px-4 py-1.5" dir="ltr">
      {blocks.map((block, index) => {
        const isCompleted = index < currentBlockIndex;
        const isCurrent = index === currentBlockIndex;
        const color = block.colorHex || '#9CA3AF';
        const hasDrill = !!block.drillRef;

        return (
          <motion.div
            key={block.id}
            layout
            className="relative h-1.5 rounded-full overflow-hidden"
            style={{ backgroundColor: '#E2E8F0' }}
            animate={{ flex: isCurrent ? 4 : 1 }}
            transition={{ duration: 0.3, ease: 'easeInOut' }}
          >
            {isCompleted && (
              <div
                className="absolute inset-0 rounded-full"
                style={{
                  backgroundColor: color,
                  boxShadow: `0 0 6px ${color}80`,
                }}
              />
            )}

            {isCurrent && (
              <div
                className="absolute inset-y-0 right-0 rounded-full"
                style={{
                  // 1 % floor on the current block's fill — without it the
                  // active segment paints at 0 px the moment a block starts,
                  // making the bar look stalled until the first telemetry
                  // tick lands. The sliver makes the HUD feel "live" the
                  // instant the block begins. Mirrors the same floor used
                  // on the FreeRun goal bar (see FreeRunActive.tsx) so both
                  // active-workout HUDs share one progress contract.
                  width: `${Math.max(1, fillProgress * 100)}%`,
                  backgroundColor: color,
                  boxShadow: `0 0 6px ${color}80`,
                  transition: isPaused ? 'none' : 'width 0.1s linear',
                }}
              />
            )}

            {hasDrill && (
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div className="w-1.5 h-1.5 rounded-full bg-white/60" />
              </div>
            )}
          </motion.div>
        );
      })}
    </div>
  );
}
