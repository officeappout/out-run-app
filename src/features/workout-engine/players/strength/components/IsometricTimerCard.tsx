'use client';

/**
 * IsometricTimerCard — Bottom-sheet timer for isometric / time-based exercises.
 *
 * Phases:
 *   idle      → "התחלה" tap target
 *   preparing → 5-second countdown with short beeps + haptic on last 3s
 *   counting  → Count-up timer, rectangle border fills cyan → orange (last 5s)
 *   overtime  → Border green, digits keep counting, "+Xs" shown
 *
 * Audio/Haptic:
 *   - Prep: short beep + light haptic on 3, 2, 1
 *   - Counting: short beep + haptic at T-3, T-2, T-1 before target
 *   - Target reached: long beep + strong haptic
 *   - Finish tap: haptic confirmation
 *
 * onComplete receives the exact elapsed seconds (including overtime).
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { RotateCcw, Pause, Play, Timer, Check } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

interface IsometricTimerCardProps {
  duration: number;
  exerciseName: string;
  repsOrDurationText: string;
  onComplete: (elapsed: number) => void;
  side?: 'right' | 'left' | null;
}

type Phase = 'idle' | 'preparing' | 'counting' | 'overtime';

const PREP_SECONDS = 5;

// ── Rect progress constants ─────────────────────────────────────────────────

const RECT_W = 200;
const RECT_H = 80;
const RECT_RX = 14;
const RECT_STROKE = 3;
const RECT_INSET = RECT_STROKE / 2;
const RECT_PERIMETER = 2 * ((RECT_W - RECT_STROKE) + (RECT_H - RECT_STROKE));

// ── Audio helpers ───────────────────────────────────────────────────────────

let audioCtx: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  try {
    if (!audioCtx || audioCtx.state === 'closed') {
      audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
    return audioCtx;
  } catch {
    return null;
  }
}

function playTone(frequency: number, durationMs: number, volume = 0.5) {
  const ctx = getAudioContext();
  if (!ctx) return;
  try {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.frequency.value = frequency;
    osc.type = 'sine';
    gain.gain.setValueAtTime(volume, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + durationMs / 1000);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + durationMs / 1000);
  } catch { /* ignore */ }
}

function playShortBeep() { playTone(880, 120, 0.5); }
function playLongBeep() {
  playTone(660, 250, 0.6);
  setTimeout(() => playTone(880, 350, 0.6), 260);
}

function haptic(pattern: number | number[]) {
  try {
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      navigator.vibrate(pattern);
    }
  } catch { /* ignore */ }
}

// ── Component ───────────────────────────────────────────────────────────────

export default function IsometricTimerCard({
  duration,
  exerciseName,
  repsOrDurationText,
  onComplete,
  side,
}: IsometricTimerCardProps) {
  const sideLabel = side === 'right' ? 'צד ימין' : side === 'left' ? 'צד שמאל' : null;
  const [phase, setPhase] = useState<Phase>('idle');
  const [elapsed, setElapsed] = useState(0);
  const [prepCountdown, setPrepCountdown] = useState(PREP_SECONDS);
  const [isPaused, setIsPaused] = useState(false);

  const alertedRef = useRef(new Set<number>());
  const targetAlertedRef = useRef(false);
  const prepAlertedRef = useRef(new Set<number>());
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Reset ───────────────────────────────────────────────────────────────

  const resetTimer = useCallback(() => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    setPhase('idle');
    setElapsed(0);
    setPrepCountdown(PREP_SECONDS);
    setIsPaused(false);
    alertedRef.current.clear();
    targetAlertedRef.current = false;
    prepAlertedRef.current.clear();
  }, []);

  useEffect(() => { resetTimer(); }, [duration, resetTimer]);

  // ── Start → begin preparation ─────────────────────────────────────────

  const start = useCallback(() => {
    if (phase === 'idle') {
      setPrepCountdown(PREP_SECONDS);
      prepAlertedRef.current.clear();
      setPhase('preparing');
    }
  }, [phase]);

  // ── Preparation tick ──────────────────────────────────────────────────

  useEffect(() => {
    if (phase !== 'preparing') return;

    intervalRef.current = setInterval(() => {
      setPrepCountdown((prev) => {
        const next = prev - 1;

        if (next <= 3 && next > 0 && !prepAlertedRef.current.has(next)) {
          prepAlertedRef.current.add(next);
          playShortBeep();
          haptic([30]);
        }

        if (next <= 0) {
          setPhase('counting');
          return 0;
        }
        return next;
      });
    }, 1000);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [phase]);

  // ── Counting / overtime tick ──────────────────────────────────────────

  useEffect(() => {
    if (phase !== 'counting' && phase !== 'overtime') {
      if (phase !== 'preparing' && intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      return;
    }
    if (isPaused) {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      return;
    }

    intervalRef.current = setInterval(() => {
      setElapsed((prev) => {
        const next = prev + 1;

        const remaining = duration - next;
        if (remaining >= 0 && remaining <= 3 && !alertedRef.current.has(remaining)) {
          alertedRef.current.add(remaining);
          if (remaining > 0) {
            playShortBeep();
            haptic([40]);
          }
        }

        if (next >= duration && !targetAlertedRef.current) {
          targetAlertedRef.current = true;
          playLongBeep();
          haptic([80, 40, 120]);
          setPhase('overtime');
        }

        return next;
      });
    }, 1000);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [phase, isPaused, duration]);

  // ── Handlers ──────────────────────────────────────────────────────────

  const handleComplete = useCallback(() => {
    if (intervalRef.current) clearInterval(intervalRef.current);
    haptic([50]);
    onComplete(elapsed);
  }, [elapsed, onComplete]);

  const formatTime = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
  };

  // ── Progress & color ──────────────────────────────────────────────────

  const isActive = phase === 'counting' || phase === 'overtime';
  const progress = phase === 'preparing'
    ? (PREP_SECONDS - prepCountdown) / PREP_SECONDS
    : phase === 'idle' ? 0 : Math.min(elapsed / duration, 1);

  const remaining = duration - elapsed;
  const borderColor = phase === 'preparing'
    ? '#94A3B8' // slate-400 — neutral prep
    : phase === 'overtime'
      ? '#22C55E'
      : remaining <= 5 && phase === 'counting'
        ? '#F97316'
        : '#00B4FF';

  const strokeDashoffset = RECT_PERIMETER * (1 - progress);
  const overtimeSec = elapsed - duration;

  // ── Render (Rest-Drawer style) ────────────────────────────────────────

  return (
    <div
      className="absolute inset-x-0 bottom-0 z-20 bg-white dark:bg-[#0F172A] rounded-t-3xl shadow-2xl select-none"
      dir="rtl"
    >
      <div
        className="px-6 pt-4"
        style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom, 16px))' }}
      >
        {/* Section label + side badge */}
        <div className="flex items-center justify-center gap-2 mb-3">
          <p
            className="text-[10px] text-slate-400 dark:text-zinc-500 uppercase tracking-wider"
            style={{ fontFamily: 'var(--font-simpler)' }}
          >
            זמן החזקה
          </p>
          {sideLabel && (
            <span
              className="text-[10px] font-bold px-2 py-0.5 rounded-full"
              style={{
                fontFamily: 'var(--font-simpler)',
                background: side === 'right' ? '#00BAF7' : '#0CF2E3',
                color: 'white',
              }}
            >
              {sideLabel}
            </span>
          )}
        </div>

        {/* Rectangle progress timer box */}
        <div
          className="relative flex justify-center mb-2 cursor-pointer"
          onClick={phase === 'idle' ? start : undefined}
          role={phase === 'idle' ? 'button' : undefined}
          tabIndex={phase === 'idle' ? 0 : undefined}
          onKeyDown={phase === 'idle' ? (e) => { if (e.key === 'Enter') start(); } : undefined}
        >
          <div className="relative" style={{ width: RECT_W, height: RECT_H }}>
            {/* SVG rectangle border */}
            <svg
              className="absolute inset-0"
              width={RECT_W}
              height={RECT_H}
              viewBox={`0 0 ${RECT_W} ${RECT_H}`}
            >
              {/* Background track */}
              <rect
                x={RECT_INSET} y={RECT_INSET}
                width={RECT_W - RECT_STROKE} height={RECT_H - RECT_STROKE}
                rx={RECT_RX} ry={RECT_RX}
                fill="none"
                stroke="#E2E8F0"
                strokeWidth={RECT_STROKE}
              />
              {/* Animated fill */}
              <rect
                x={RECT_INSET} y={RECT_INSET}
                width={RECT_W - RECT_STROKE} height={RECT_H - RECT_STROKE}
                rx={RECT_RX} ry={RECT_RX}
                fill="none"
                stroke={borderColor}
                strokeWidth={RECT_STROKE}
                strokeLinecap="round"
                strokeDasharray={RECT_PERIMETER}
                strokeDashoffset={strokeDashoffset}
                style={{
                  transition: 'stroke-dashoffset 0.95s linear, stroke 0.4s ease',
                  filter: `drop-shadow(0 0 4px ${borderColor}80)`,
                }}
              />
            </svg>

            {/* Center digits */}
            <div className={`absolute inset-0 flex flex-col items-center justify-center transition-opacity duration-200 ${isPaused && isActive ? 'opacity-40' : 'opacity-100'}`}>
              <AnimatePresence mode="wait">
                {phase === 'idle' && (
                  <motion.div
                    key="idle"
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.9 }}
                    className="flex items-center gap-2"
                  >
                    <Timer size={24} className="text-[#00B4FF]" />
                    <span
                      className="text-lg font-bold text-[#00B4FF]"
                      style={{ fontFamily: 'var(--font-simpler)' }}
                    >
                      {sideLabel ? `התחל ${sideLabel}` : 'התחלה'}
                    </span>
                  </motion.div>
                )}

                {phase === 'preparing' && (
                  <motion.div
                    key="preparing"
                    initial={{ opacity: 0, scale: 1.2 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0 }}
                    className="flex flex-col items-center"
                  >
                    <span
                      className="text-5xl font-bold text-slate-900 dark:text-white tabular-nums tracking-tight"
                      style={{ fontFamily: 'var(--font-simpler)' }}
                    >
                      {prepCountdown}
                    </span>
                  </motion.div>
                )}

                {phase === 'counting' && (
                  <motion.div
                    key="counting"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                  >
                    <span
                      className="text-5xl font-bold text-slate-900 dark:text-white tracking-tight tabular-nums"
                      style={{ fontFamily: 'var(--font-simpler)' }}
                    >
                      {formatTime(elapsed)}
                    </span>
                  </motion.div>
                )}

                {phase === 'overtime' && (
                  <motion.div
                    key="overtime"
                    initial={{ scale: 0.9, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    className="flex flex-col items-center"
                  >
                    <span
                      className="text-5xl font-bold text-slate-900 dark:text-white tracking-tight tabular-nums"
                      style={{ fontFamily: 'var(--font-simpler)' }}
                    >
                      {formatTime(elapsed)}
                    </span>
                    <span
                      className="text-sm font-bold text-emerald-500"
                      style={{ fontFamily: 'var(--font-simpler)' }}
                    >
                      +{overtimeSec}s
                    </span>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            {/* Pause overlay */}
            {isPaused && isActive && (
              <div className="absolute inset-0 flex items-center justify-center rounded-[14px] bg-black/10 backdrop-blur-[1px]">
                <span
                  className="text-sm font-bold text-slate-600 dark:text-white/70"
                  style={{ fontFamily: 'var(--font-simpler)' }}
                >
                  מושהה
                </span>
              </div>
            )}
          </div>
        </div>

        {/* Target duration */}
        <p
          className="text-sm text-slate-400 dark:text-slate-500 text-center mb-1 tabular-nums"
          style={{ fontFamily: 'var(--font-simpler)' }}
        >
          / {formatTime(duration)}
        </p>

        {/* Exercise name */}
        <p
          className="text-base font-bold text-slate-900 dark:text-white text-center mb-4"
          style={{ fontFamily: 'var(--font-simpler)' }}
        >
          {exerciseName}
        </p>

        {/* Pause / Reset controls */}
        {isActive && (
          <div className="flex justify-center gap-4 mb-4">
            <button
              onClick={resetTimer}
              className="w-10 h-10 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center active:scale-95 transition-transform shadow-sm"
              aria-label="איפוס"
            >
              <RotateCcw size={18} className="text-slate-500" />
            </button>
            <button
              onClick={() => setIsPaused(p => !p)}
              className="w-10 h-10 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center active:scale-95 transition-transform shadow-sm"
              aria-label={isPaused ? 'המשך' : 'השהייה'}
            >
              {isPaused
                ? <Play size={18} className="text-slate-500" fill="currentColor" />
                : <Pause size={18} className="text-slate-500" />
              }
            </button>
          </div>
        )}

        {/* "סיימתי" CTA */}
        {isActive && (
          <button
            onClick={handleComplete}
            className="w-full h-12 rounded-2xl flex items-center justify-center gap-2 font-bold text-white active:scale-[0.98] transition-transform shadow-sm"
            style={{ fontFamily: 'var(--font-simpler)', background: 'linear-gradient(to left, #00C9F2, #00AEEF)' }}
          >
            <Check size={18} />
            <span>סיימתי</span>
          </button>
        )}
      </div>
    </div>
  );
}
