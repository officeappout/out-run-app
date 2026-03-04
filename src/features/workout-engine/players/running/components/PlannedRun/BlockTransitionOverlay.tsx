'use client';

import React, { useEffect, useState, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import type { RunBlock } from '../../types/run-block.type';

interface BlockTransitionOverlayProps {
  currentBlock: RunBlock | null;
  currentBlockIndex: number;
  /** Live countdown fed from usePlannedRunEngine — used for rest-block countdown display. */
  blockTimeRemaining?: number;
}

export default function BlockTransitionOverlay({
  currentBlock,
  currentBlockIndex,
  blockTimeRemaining = 0,
}: BlockTransitionOverlayProps) {
  const [visible, setVisible] = useState(false);
  const [displayBlock, setDisplayBlock] = useState<RunBlock | null>(null);
  const [mode, setMode] = useState<'flash' | 'countdown'>('flash');
  const prevIndexRef = useRef(currentBlockIndex);

  useEffect(() => {
    if (currentBlockIndex !== prevIndexRef.current && currentBlock) {
      prevIndexRef.current = currentBlockIndex;
      setDisplayBlock(currentBlock);
      setVisible(true);

      if (currentBlock._isSynthesizedRest) {
        setMode('countdown');
      } else {
        setMode('flash');
        const timer = setTimeout(() => setVisible(false), 1400);
        return () => clearTimeout(timer);
      }
    }
  }, [currentBlockIndex, currentBlock]);

  // Auto-dismiss the countdown overlay when time runs out (block will advance)
  useEffect(() => {
    if (mode === 'countdown' && visible && blockTimeRemaining <= 0) {
      setVisible(false);
    }
  }, [mode, visible, blockTimeRemaining]);

  const bgColor = displayBlock?.colorHex || '#9CA3AF';

  // Progress circle for countdown mode (0→1 as rest progresses)
  const totalDuration = displayBlock?.durationSeconds ?? 1;
  const countdownProgress = totalDuration > 0
    ? Math.min(1, 1 - blockTimeRemaining / totalDuration)
    : 1;

  return (
    <AnimatePresence>
      {visible && displayBlock && (
        <motion.div
          className="fixed inset-0 z-[100] flex flex-col items-center justify-center"
          style={{ backgroundColor: mode === 'countdown' ? 'rgba(0,0,0,0.85)' : bgColor }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.25 }}
          // Allow tap-through to skip button only in flash mode
          {...(mode === 'flash' ? { className: 'fixed inset-0 z-[100] flex flex-col items-center justify-center pointer-events-none' } : {})}
        >
          {mode === 'countdown' ? (
            /* ── Rest Countdown Mode ── */
            <motion.div
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              transition={{ type: 'spring', stiffness: 180, damping: 20 }}
              className="flex flex-col items-center gap-5"
            >
              <span className="text-white/60 text-sm font-bold tracking-widest">
                {displayBlock.label}
              </span>

              {/* Circular progress ring */}
              <div className="relative w-40 h-40 flex items-center justify-center">
                <svg className="absolute inset-0 w-full h-full -rotate-90" viewBox="0 0 120 120">
                  <circle cx="60" cy="60" r="52" fill="none" stroke="rgba(255,255,255,0.15)" strokeWidth="6" />
                  <circle
                    cx="60" cy="60" r="52"
                    fill="none"
                    stroke={blockTimeRemaining <= 3 ? '#F59E0B' : '#fff'}
                    strokeWidth="6"
                    strokeLinecap="round"
                    strokeDasharray={2 * Math.PI * 52}
                    strokeDashoffset={2 * Math.PI * 52 * (1 - countdownProgress)}
                    style={{ transition: 'stroke-dashoffset 0.9s linear, stroke 0.3s ease' }}
                  />
                </svg>
                <span
                  className="text-white text-5xl font-black tabular-nums"
                  dir="ltr"
                  style={{ fontFamily: 'var(--font-simpler)' }}
                >
                  {formatCountdown(blockTimeRemaining)}
                </span>
              </div>

              {/* "Get ready" flash when T <= 3 */}
              <AnimatePresence>
                {blockTimeRemaining > 0 && blockTimeRemaining <= 3 && (
                  <motion.span
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    className="text-amber-400 text-lg font-bold"
                  >
                    תתכוננו!
                  </motion.span>
                )}
              </AnimatePresence>
            </motion.div>
          ) : (
            /* ── Normal Flash Mode (unchanged) ── */
            <motion.div
              initial={{ scale: 0.7, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 1.1, opacity: 0 }}
              transition={{ type: 'spring', stiffness: 200, damping: 18 }}
              className="flex flex-col items-center gap-3"
            >
              <span className="text-white/70 text-sm font-bold tracking-widest uppercase">
                בלוק הבא
              </span>
              <span
                className="text-white text-4xl font-black text-center px-8 leading-tight"
                style={{ fontFamily: 'var(--font-simpler)' }}
              >
                {displayBlock.label}
              </span>
              {displayBlock.durationSeconds ? (
                <span className="text-white/80 text-lg font-bold mt-1" dir="ltr">
                  {formatBlockTime(displayBlock.durationSeconds)}
                </span>
              ) : displayBlock.distanceMeters ? (
                <span className="text-white/80 text-lg font-bold mt-1" dir="ltr">
                  {displayBlock.distanceMeters >= 1000
                    ? `${(displayBlock.distanceMeters / 1000).toFixed(1)} ק"מ`
                    : `${displayBlock.distanceMeters} מ'`}
                </span>
              ) : null}
            </motion.div>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function formatBlockTime(s: number): string {
  if (s < 60) return `${s} שנ'`;
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return sec > 0
    ? `${m}:${sec.toString().padStart(2, '0')}`
    : `${m}:00`;
}

function formatCountdown(s: number): string {
  if (s <= 0) return '0';
  if (s < 60) return String(s);
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}:${sec.toString().padStart(2, '0')}`;
}
