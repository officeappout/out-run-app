'use client';

/**
 * DataEntryModal — Centered floating modal for logging reps or time.
 *
 * Reps mode: single VerticalWheelPicker.
 * Time mode: two wheels (minutes + seconds) with an integrated stopwatch.
 *
 * Save calls handleRepetitionSave to sync with the state machine
 * and the Top Layer's HorizontalPicker.
 */

import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, RotateCcw, Pause, Play } from 'lucide-react';
import VerticalWheelPicker from './VerticalWheelPicker';

export interface DataEntryModalProps {
  isOpen: boolean;
  onClose: () => void;
  exerciseName: string;
  exerciseType: 'reps' | 'time';
  targetReps: number | null;
  lastSavedReps: number | null;
  setIndex: number;
  handleRepetitionSave: (value: number, sideData?: { left: number; right: number }) => void;
  /** When true, shows two separate pickers for right/left sides */
  isUnilateral?: boolean;
}

const REPS_RANGE = Array.from({ length: 51 }, (_, i) => i);
const MINUTES_RANGE = Array.from({ length: 60 }, (_, i) => i);
const SECONDS_RANGE = Array.from({ length: 12 }, (_, i) => i * 5); // 0,5,10,...55

export default function DataEntryModal({
  isOpen,
  onClose,
  exerciseName,
  exerciseType,
  targetReps,
  lastSavedReps,
  setIndex,
  handleRepetitionSave,
  isUnilateral = false,
}: DataEntryModalProps) {
  // ── Reps state ──────────────────────────────────────────────────────────
  const initialReps = lastSavedReps ?? targetReps ?? 10;
  const [repsValue, setRepsValue] = useState(initialReps);

  // ── Unilateral state (separate values for right/left) ─────────────────
  const [repsRight, setRepsRight] = useState(initialReps);
  const [repsLeft, setRepsLeft] = useState(initialReps);

  // ── Time state ──────────────────────────────────────────────────────────
  const totalSeconds = lastSavedReps ?? targetReps ?? 30;
  const [minutes, setMinutes] = useState(Math.floor(totalSeconds / 60));
  const [seconds, setSeconds] = useState(totalSeconds % 60);

  // ── Stopwatch state ─────────────────────────────────────────────────────
  const [stopwatchActive, setStopwatchActive] = useState(false);
  const [stopwatchElapsed, setStopwatchElapsed] = useState(0);
  const stopwatchRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Reset local state when modal opens with new data
  useEffect(() => {
    if (isOpen) {
      const reps = lastSavedReps ?? targetReps ?? 10;
      const secs = lastSavedReps ?? targetReps ?? 30;
      setRepsValue(reps);
      setRepsRight(reps);
      setRepsLeft(reps);
      setMinutes(Math.floor(secs / 60));
      setSeconds(secs % 60);
      setStopwatchActive(false);
      setStopwatchElapsed(0);
    }
  }, [isOpen, lastSavedReps, targetReps]);

  // Stopwatch tick
  useEffect(() => {
    if (stopwatchActive) {
      stopwatchRef.current = setInterval(() => {
        setStopwatchElapsed(prev => prev + 1);
      }, 1000);
    } else if (stopwatchRef.current) {
      clearInterval(stopwatchRef.current);
      stopwatchRef.current = null;
    }
    return () => {
      if (stopwatchRef.current) clearInterval(stopwatchRef.current);
    };
  }, [stopwatchActive]);

  const handleStopwatchToggle = useCallback(() => {
    if (stopwatchActive) {
      setStopwatchActive(false);
      setMinutes(Math.floor(stopwatchElapsed / 60));
      setSeconds(stopwatchElapsed % 60);
    } else {
      setStopwatchElapsed(0);
      setStopwatchActive(true);
    }
  }, [stopwatchActive, stopwatchElapsed]);

  const handleSave = useCallback(() => {
    if (exerciseType === 'reps') {
      if (isUnilateral) {
        const effective = Math.min(repsRight, repsLeft);
        handleRepetitionSave(effective, { left: repsLeft, right: repsRight });
      } else {
        handleRepetitionSave(repsValue);
      }
    } else {
      handleRepetitionSave(minutes * 60 + seconds);
    }
    onClose();
  }, [exerciseType, repsValue, repsRight, repsLeft, isUnilateral, minutes, seconds, handleRepetitionSave, onClose]);

  const isTime = exerciseType === 'time';
  const title = isTime ? 'כמה זמן עשית?' : 'כמה חזרות עשית?';
  const subtitle = isTime
    ? 'הכניסו כאן או שעברו לסטופר ונספור עבורכם!'
    : 'הכניסו כאן את כמות החזרות שביצעת';

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          key="data-entry-backdrop"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="fixed inset-0 z-[200] flex items-center justify-center p-6"
          style={{ backdropFilter: 'blur(8px)', backgroundColor: 'rgba(0,0,0,0.25)' }}
          onClick={onClose}
        >
          <motion.div
            key="data-entry-card"
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.9, opacity: 0 }}
            transition={{ type: 'spring', damping: 22, stiffness: 300 }}
            className="bg-white dark:bg-slate-800 rounded-2xl w-full max-w-xs shadow-xl overflow-hidden"
            onClick={e => e.stopPropagation()}
            dir="rtl"
          >
            {/* ── Header ─────────────────────────────────────────────────── */}
            <div className="p-5 pb-2">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <h2
                    className="text-lg font-bold text-slate-900 dark:text-white"
                    style={{ fontFamily: 'var(--font-simpler)' }}
                  >
                    {title}
                  </h2>
                  <p
                    className="text-sm text-slate-500 dark:text-slate-400 mt-1 leading-relaxed"
                    style={{ fontFamily: 'var(--font-simpler)' }}
                  >
                    {subtitle}
                  </p>
                </div>
                <button
                  onClick={onClose}
                  className="w-8 h-8 flex items-center justify-center rounded-full hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors shrink-0 mr-[-4px]"
                >
                  <X size={18} className="text-slate-400" />
                </button>
              </div>
            </div>

            {/* ── Picker area ────────────────────────────────────────────── */}
            <div className="px-5 py-4 flex items-center justify-center gap-6 min-h-[180px]">
              {isTime && stopwatchActive ? (
                /* Stopwatch counting display */
                <div className="flex items-center justify-center">
                  <span
                    className="text-7xl font-black text-slate-900 dark:text-white tabular-nums"
                    style={{ fontFamily: 'var(--font-simpler)' }}
                  >
                    {stopwatchElapsed}
                  </span>
                </div>
              ) : isTime ? (
                /* Time wheels: minutes + seconds */
                <div className="flex items-start gap-4">
                  <VerticalWheelPicker
                    values={SECONDS_RANGE}
                    selectedValue={seconds}
                    onChange={setSeconds}
                    label="שנ'"
                  />
                  <VerticalWheelPicker
                    values={MINUTES_RANGE}
                    selectedValue={minutes}
                    onChange={setMinutes}
                    label="דק'"
                  />
                </div>
              ) : isUnilateral ? (
                /* Unilateral: two separate pickers for right/left */
                <div className="flex items-start gap-6">
                  <VerticalWheelPicker
                    values={REPS_RANGE}
                    selectedValue={repsLeft}
                    onChange={setRepsLeft}
                    label="שמאל"
                  />
                  <VerticalWheelPicker
                    values={REPS_RANGE}
                    selectedValue={repsRight}
                    onChange={setRepsRight}
                    label="ימין"
                  />
                </div>
              ) : (
                /* Reps wheel */
                <VerticalWheelPicker
                  values={REPS_RANGE}
                  selectedValue={repsValue}
                  onChange={setRepsValue}
                />
              )}
            </div>

            {/* ── Footer ─────────────────────────────────────────────────── */}
            <div className="px-5 pb-5 pt-2 flex items-center gap-3">
              {isTime && (
                <button
                  onClick={handleStopwatchToggle}
                  className="w-11 h-11 shrink-0 rounded-full border border-slate-200 dark:border-slate-600 flex items-center justify-center bg-white dark:bg-slate-700 active:scale-95 transition-transform"
                >
                  {stopwatchActive ? (
                    <Pause size={18} className="text-slate-600 dark:text-slate-300" />
                  ) : (
                    <RotateCcw size={18} className="text-slate-600 dark:text-slate-300" />
                  )}
                </button>
              )}

              <button
                onClick={handleSave}
                className="flex-1 h-12 rounded-full font-bold text-white text-base flex items-center justify-center active:scale-[0.97] transition-transform shadow-lg shadow-cyan-500/20"
                style={{
                  background: 'linear-gradient(to left, #00C9F2, #00AEEF)',
                  fontFamily: 'var(--font-simpler)',
                }}
              >
                שמירה
              </button>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
