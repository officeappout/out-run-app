'use client';

import { useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { Check } from 'lucide-react';

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
}

const COMPLETED_COLOR = '#10b981';
const ACTIVE_COLOR = '#5BC2F2';
const INACTIVE_BG = 'bg-slate-200';

export default function OnboardingStoryBar({
  totalPhases,
  currentPhase,
  phaseFillPercent = 100,
  phaseLabel,
  onPhaseComplete,
}: OnboardingStoryBarProps) {
  const prevPhaseRef = useRef(currentPhase);

  useEffect(() => {
    if (currentPhase > prevPhaseRef.current && onPhaseComplete) {
      onPhaseComplete();
    }
    prevPhaseRef.current = currentPhase;
  }, [currentPhase, onPhaseComplete]);

  return (
    <div className="w-full px-5 pt-3 pb-3 flex-shrink-0">
      {phaseLabel && (
        <p className="text-[13px] font-bold text-slate-500 text-center mb-2 tracking-wide">
          {phaseLabel}
        </p>
      )}
      <div className="flex gap-1 items-center">
        {Array.from({ length: totalPhases }, (_, i) => {
          const phaseIndex = i + 1;
          const isCompleted = phaseIndex < currentPhase;
          const isActive = phaseIndex === currentPhase;
          const fillPct = isActive
            ? Math.min(100, Math.max(0, phaseFillPercent))
            : 0;

          const barColor = isCompleted ? COMPLETED_COLOR : ACTIVE_COLOR;

          return (
            <div
              key={i}
              className="flex-1 relative"
            >
              <div className={`h-1.5 rounded-full ${INACTIVE_BG} overflow-hidden`}>
                <motion.div
                  className="h-full rounded-full"
                  style={{ backgroundColor: barColor }}
                  initial={false}
                  animate={{
                    width: isCompleted ? '100%' : isActive ? `${fillPct}%` : '0%',
                  }}
                  transition={{ duration: 0.4, ease: 'easeOut' }}
                />
              </div>
              {isCompleted && (
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
            </div>
          );
        })}
      </div>
    </div>
  );
}
