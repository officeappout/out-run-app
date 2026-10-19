'use client';

import { useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { Check } from 'lucide-react';
import StoryBars, { type StoryBarSegment } from '@/components/ui/v2/StoryBars';

interface OnboardingStoryBarProps {
  totalPhases: number;
  /** 1-based index of the current active phase. */
  currentPhase: number;
  /** 0–100 fill within the active phase (for partial progress). Defaults to 100. */
  phaseFillPercent?: number;
  /** Hebrew label displayed above the bar (e.g., "שלב 2: הערכת יכולות"). */
  phaseLabel?: string;
  /** Fires once when the currentPhase increases (phase completed). */
  onPhaseComplete?: () => void;
  /**
   * When true, removes the built-in outer padding so the parent flex row
   * controls all spacing (used by profile/page.tsx unified header row).
   */
  noPadding?: boolean;
}

const COMPLETED_COLOR = '#10b981';
const ACTIVE_COLOR = '#5BC2F2';
/** Tailwind slate-200 — the empty track. */
const INACTIVE_BG = '#e2e8f0';

export default function OnboardingStoryBar({
  totalPhases,
  currentPhase,
  phaseFillPercent = 100,
  phaseLabel,
  onPhaseComplete,
  noPadding = false,
}: OnboardingStoryBarProps) {
  const prevPhaseRef = useRef(currentPhase);

  useEffect(() => {
    if (currentPhase > prevPhaseRef.current && onPhaseComplete) {
      onPhaseComplete();
    }
    prevPhaseRef.current = currentPhase;
  }, [currentPhase, onPhaseComplete]);

  const segments: StoryBarSegment[] = Array.from({ length: totalPhases }, (_, i) => ({
    key: String(i),
    color: ACTIVE_COLOR,
    doneColor: COMPLETED_COLOR,
  }));

  return (
    <div className={`w-full flex-shrink-0 ${noPadding ? '' : 'px-4 pt-3 pb-3'}`}>
      {/* Shared v2 StoryBars (one implementation app-wide), configured to
          this bar's look: follows the page dir, continuous 0.4 s ease-out
          fills, green when done, a ✓ badge above each finished phase. */}
      <StoryBars
        segments={segments}
        currentIndex={currentPhase - 1}
        progress={Math.min(100, Math.max(0, phaseFillPercent)) / 100}
        currentFlex={1}
        minFillPercent={0}
        trackColor={INACTIVE_BG}
        fillMode="continuous"
        direction="inherit"
        fillTransition="width 0.4s ease-out"
        segmentTransition="none"
        gapClassName="gap-1 items-center"
        renderOverlay={(_, state) => state === 'done' && (
          <motion.div
            className="absolute left-1/2 -top-[7px]"
            style={{ marginLeft: '-10px' }}
            initial={{ scale: 0, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={{ delay: 0.15, type: 'spring', stiffness: 200 }}
          >
            <div className="w-5 h-5 rounded-full bg-[#10b981] flex items-center justify-center shadow-sm">
              <Check className="w-3 h-3 text-white" strokeWidth={3} />
            </div>
          </motion.div>
        )}
      />
    </div>
  );
}
