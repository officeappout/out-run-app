'use client';

/**
 * ExerciseDetailsSheet
 * Draggable bottom sheet with exercise details
 * Strict dragConstraints: top: 80 (HEADER_HEIGHT) to not cover story bars
 */

import React, { useEffect } from 'react';
import { motion, useMotionValue, useAnimationControls } from 'framer-motion';
import { Volume2, Activity, Target } from 'lucide-react';
import CircularTimer from './CircularTimer';
import FillingButton from './FillingButton';

// Header height constant - must not be covered by drawer
const HEADER_HEIGHT = 80;

interface ExerciseDetailsSheetProps {
  exerciseName: string;
  exerciseType: 'reps' | 'time' | 'follow-along';
  exerciseDuration?: number;
  targetReps?: number | null;
  autoCompleteTime: number;
  repsOrDurationText: string;
  executionSteps: string[];
  muscleGroups: { primary: string[]; secondary: string[] };
  exerciseGoal: string | null;
  isPaused: boolean;
  onComplete: (reps?: number) => void;
}

export default function ExerciseDetailsSheet({
  exerciseName,
  exerciseType,
  exerciseDuration = 30,
  targetReps,
  autoCompleteTime,
  repsOrDurationText,
  executionSteps,
  muscleGroups,
  exerciseGoal,
  isPaused,
  onComplete,
}: ExerciseDetailsSheetProps) {
  // Card starts at 80% of screen height (showing only top 20% initially)
  const initialCardY = typeof window !== 'undefined' ? window.innerHeight * 0.8 : 640;
  const cardY = useMotionValue(initialCardY);
  const cardControls = useAnimationControls();

  // Initialize card position on mount
  useEffect(() => {
    cardControls.set({ y: initialCardY });
    cardY.set(initialCardY);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <motion.div
      className="absolute left-0 right-0 bottom-0 bg-white dark:bg-gray-900 rounded-t-[32px] z-10 overflow-y-auto shadow-2xl"
      animate={cardControls}
      style={{
        y: cardY,
        height: '100vh',
      }}
      drag="y"
      dragConstraints={{ top: HEADER_HEIGHT, bottom: 0 }}
      dragElastic={0.1}
      transition={{ type: 'spring', damping: 25, stiffness: 200 }}
      onDragEnd={(_, info) => {
        // Snap to max position (below header) if dragged up significantly, otherwise snap back to initial position
        if (info.offset.y < -100) {
          cardControls.start({ y: HEADER_HEIGHT }); // Fully expanded (card stops below progress bar)
          cardY.set(HEADER_HEIGHT);
        } else {
          cardControls.start({ y: initialCardY }); // Back to initial position (showing only top 20%)
          cardY.set(initialCardY);
        }
      }}
    >
      {/* Grabber Bar */}
      <div className="sticky top-0 z-10 bg-white dark:bg-gray-900 pt-3 pb-2 flex justify-center">
        <div className="w-12 h-1.5 bg-gray-300 dark:bg-gray-600 rounded-full" />
      </div>

      {/* Scrollable Content */}
      <div className="px-6 pb-10" dir="rtl">
        {/* Exercise Title - Always at top */}
        <div className="pt-6 mb-6">
          <h2
            className="text-3xl font-bold text-gray-900 dark:text-white mb-4 text-center"
            style={{ fontFamily: 'var(--font-simpler)' }}
          >
            {exerciseName}
          </h2>

          {/* Finished Button - Prominent, Full Width */}
          <button
            onClick={() => onComplete()}
            className="w-full bg-cyan-600 hover:bg-cyan-700 text-white font-bold py-4 px-6 rounded-2xl shadow-lg shadow-cyan-500/30 active:scale-[0.98] transition-all mb-6"
            style={{ fontFamily: 'var(--font-simpler)' }}
          >
            סיימתי
          </button>
        </div>

        {exerciseType === 'follow-along' ? (
          // Mode A: Warm-up / Follow-along (Flow Mode)
          <div className="space-y-6">
            <div className="text-center mb-6">
              {/* Follow Along Badge */}
              <span className="px-3 py-1 bg-cyan-500/20 text-cyan-700 dark:text-cyan-400 text-xs font-bold rounded-full border border-cyan-500/30">
                בוא נזרום
              </span>
              <p
                className="text-gray-600 dark:text-gray-400 text-sm mt-3"
                style={{ fontFamily: 'var(--font-simpler)' }}
              >
                עקוב אחרי הסרטון מהתחלה עד הסוף
              </p>
            </div>
          </div>
        ) : exerciseType === 'reps' ? (
          // Mode C: Reps Exercise View
          <div className="space-y-6">
            {/* Target Reps Display */}
            {targetReps && (
              <div className="text-center mb-4">
                <div
                  className="text-5xl font-black text-cyan-600 dark:text-cyan-400 mb-2"
                  style={{ fontFamily: 'var(--font-simpler)' }}
                >
                  {targetReps}
                </div>
                <p
                  className="text-lg text-gray-600 dark:text-gray-400 font-bold"
                  style={{ fontFamily: 'var(--font-simpler)' }}
                >
                  חזרות
                </p>
              </div>
            )}

            {/* FillingButton with auto-complete - Secondary action */}
            <FillingButton
              autoCompleteTime={autoCompleteTime}
              onClick={onComplete}
              label="סיימתי"
              isPaused={isPaused}
            />
          </div>
        ) : (
          // Mode B: Time Exercise View with Circular Timer
          <div className="space-y-6">
            <div className="text-center mb-6">
              <p
                className="text-gray-600 dark:text-gray-400"
                style={{ fontFamily: 'var(--font-simpler)' }}
              >
                {repsOrDurationText}
              </p>
            </div>

            {/* CircularTimer Component */}
            <div className="flex items-center justify-center my-8">
              <CircularTimer
                duration={exerciseDuration}
                onComplete={onComplete}
                isPaused={isPaused}
                size={256}
              />
            </div>
          </div>
        )}

        {/* Premium Exercise Details */}
        <div className="space-y-6 mt-8">
          {/* Execution Steps (דגשים) */}
          {executionSteps.length > 0 && (
            <div>
              <h3
                className="text-lg font-bold text-slate-900 dark:text-white mb-3"
                style={{ fontFamily: 'var(--font-simpler)' }}
              >
                דגשים
              </h3>
              <ol className="space-y-2" dir="rtl">
                {executionSteps.map((step, index) => (
                  <li key={index} className="flex gap-3 items-start">
                    <span className="flex-shrink-0 w-6 h-6 rounded-full text-white text-sm font-bold flex items-center justify-center bg-cyan-500">
                      {index + 1}
                    </span>
                    <span
                      className="text-slate-600 dark:text-slate-300 text-sm flex-1"
                      style={{ fontFamily: 'var(--font-simpler)' }}
                    >
                      {step}
                    </span>
                  </li>
                ))}
              </ol>
            </div>
          )}

          {/* Muscle Groups (שרירי התרגיל) */}
          {(muscleGroups.primary.length > 0 || muscleGroups.secondary.length > 0) && (
            <div>
              <h3
                className="text-lg font-bold text-slate-900 dark:text-white mb-3"
                style={{ fontFamily: 'var(--font-simpler)' }}
              >
                שרירי התרגיל
              </h3>
              <div className="space-y-3">
                {/* Primary Muscles */}
                {muscleGroups.primary.length > 0 && (
                  <div>
                    <p
                      className="text-xs font-bold text-slate-500 dark:text-slate-400 mb-2"
                      style={{ fontFamily: 'var(--font-simpler)' }}
                    >
                      ראשיים
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {muscleGroups.primary.map((muscle, index) => (
                        <span
                          key={index}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-lg border bg-cyan-100 dark:bg-cyan-900/30 text-cyan-700 dark:text-cyan-300 border-cyan-200 dark:border-cyan-800"
                        >
                          <Activity size={14} />
                          {muscle}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
                {/* Secondary Muscles */}
                {muscleGroups.secondary.length > 0 && (
                  <div>
                    <p
                      className="text-xs font-bold text-slate-500 dark:text-slate-400 mb-2"
                      style={{ fontFamily: 'var(--font-simpler)' }}
                    >
                      משניים
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {muscleGroups.secondary.map((muscle, index) => (
                        <span
                          key={index}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-xs font-bold rounded-lg border border-slate-200 dark:border-slate-700"
                        >
                          <Activity size={14} />
                          {muscle}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Exercise Goal (מטרה) */}
          {exerciseGoal && (
            <div className="bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-800 dark:to-slate-900 rounded-2xl p-5 border border-slate-200 dark:border-slate-700">
              <div className="flex items-start gap-3">
                <Target size={20} className="flex-shrink-0 mt-0.5 text-cyan-600 dark:text-cyan-400" />
                <div>
                  <h3
                    className="text-sm font-bold text-slate-900 dark:text-white mb-2"
                    style={{ fontFamily: 'var(--font-simpler)' }}
                  >
                    מטרה
                  </h3>
                  <p
                    className="text-sm text-slate-600 dark:text-slate-300 leading-relaxed"
                    style={{ fontFamily: 'var(--font-simpler)' }}
                  >
                    {exerciseGoal}
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Bottom Action Bar */}
        <div className="flex items-center gap-4 mt-8 pt-6 border-t border-slate-200 dark:border-slate-700">
          <button className="w-14 h-14 flex items-center justify-center rounded-2xl border border-gray-200 dark:border-gray-700 text-gray-600 dark:text-gray-300">
            <Volume2 size={24} />
          </button>
          {exerciseType === 'reps' && (
            <div
              className="flex-1 text-center text-sm text-gray-500 dark:text-gray-400"
              style={{ fontFamily: 'var(--font-simpler)' }}
            >
              לחץ על &quot;סיימתי&quot; כשסיימת את התרגיל
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
}
