"use client";

/**
 * PostWorkoutSuggestionCard — Block B (BLOCK_B_SMART_CLOSE_V1) wave-1 surface.
 *
 * Renders a post_workout `Suggestion` (message + optional stretches). This is the SURFACE
 * the full "smart close" assembler will keep — the assembler swaps only the builder logic
 * behind the `PostWorkoutSuggestion` shape (docs/architecture/workout-recommendation-engine.md
 * §4.2). Tone drives the palette; `forgiving` (quit) is warm and non-blaming by design
 * (shame lowers adherence — the forgiving-streak principle).
 */

import React from 'react';
import CircularProgress from '@/components/CircularProgress';
import type { PostWorkoutSuggestion, NextStepKind } from '../utils/postWorkoutSuggestion';

const TONE: Record<PostWorkoutSuggestion['tone'], { bg: string; border: string }> = {
  reinforce: { bg: 'linear-gradient(135deg,#ECFDF5,#F0FBFF)', border: '#B8E8D0' },
  gentle: { bg: 'linear-gradient(135deg,#F0FBFF,#EEF0FF)', border: '#B8E8F5' },
  // Warm, encouraging — never red/alarming.
  forgiving: { bg: 'linear-gradient(135deg,#FFF7ED,#FEF3F2)', border: '#FDE0C8' },
};

export interface PostWorkoutSuggestionCardProps {
  suggestion: PostWorkoutSuggestion;
  /** wave-1b: recovery stretches rendered under the message when `showStretches`. */
  children?: React.ReactNode;
  /** wave-1c: tap handler for the next-step CTA. Receives the kind for future per-kind
   *  routing; wave-1 wires every kind to the generic "suggest more" flow. */
  onNextStep?: (kind: NextStepKind) => void;
  /** Stage 1 (#1): the STRENGTH daily-goal % (0-1). When set, the existing summary-strip
   *  ring (CircularProgress, indigo) replaces the text subtitle — framing the message around
   *  the daily goal, not the workout. This reads the workout-moved % (dailyProgress
   *  .dailyStrengthPct), fixing the stripRingPct 0-bug. */
  ringPct?: number;
}

export function PostWorkoutSuggestionCard({ suggestion, children, onNextStep, ringPct }: PostWorkoutSuggestionCardProps) {
  const tone = TONE[suggestion.tone];
  const { nextStep } = suggestion;
  const showRing = ringPct != null;
  const ringInt = showRing ? Math.round(Math.max(0, Math.min(1, ringPct)) * 100) : 0;
  const ringFull = ringInt >= 100;
  return (
    <div
      dir="rtl"
      className="rounded-[18px] px-4 py-3.5 border shadow-sm"
      style={{ background: tone.bg, borderColor: tone.border }}
    >
      <div className="text-[15px] font-extrabold text-gray-900">{suggestion.title}</div>
      {/* Stage 1 (#1): the daily-goal ring (reused strip styling) replaces the subtitle. */}
      {showRing ? (
        <div className="mt-2 flex items-center gap-2.5">
          <CircularProgress
            percentage={ringInt}
            size={46}
            strokeWidth={5}
            colorClass="text-[#6366F1]"
            trackClass="text-[#E3E1F7]"
            className="flex-none"
          >
            <span className="text-[12px] font-extrabold text-[#4338CA] leading-none">
              {ringInt}
              <span className="text-[8px] font-bold">%</span>
            </span>
          </CircularProgress>
          <div className="text-[12.5px] font-bold text-gray-700">
            {ringFull ? 'היעד היומי סגור 🎯 — כל תוספת בונוס' : 'עוד קצת ליעד היומי — היום עוד לא נגמר'}
          </div>
        </div>
      ) : suggestion.subtitle ? (
        <div className="mt-1 text-[12.5px] text-gray-600 leading-snug">{suggestion.subtitle}</div>
      ) : null}
      {/* wave-1c: the next-step CTA (principle 5 — never a dead end). */}
      {nextStep && onNextStep && (
        <button
          onClick={() => onNextStep(nextStep.kind)}
          className="mt-3 w-full rounded-full py-2.5 px-4 text-[13.5px] font-extrabold text-gray-900 bg-white/70 border shadow-sm active:scale-[0.98] transition-all"
          style={{ borderColor: tone.border }}
        >
          {nextStep.label}
        </button>
      )}
      {suggestion.showStretches && children && <div className="mt-3">{children}</div>}
    </div>
  );
}

export default PostWorkoutSuggestionCard;
