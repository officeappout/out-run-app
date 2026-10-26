'use client';

import { DotLottieReact, setWasmUrl } from '@lottiefiles/dotlottie-react';
import { useReducedMotion } from 'framer-motion';
import { flameSrc, type FlameTone } from './streak';
import { FLAME_TIER, type FlameTier } from './tokens';

// Same self-hosted engine as components/ui/AnimatedFlame.tsx.
setWasmUrl('/assets/animations/dotlottie-player.wasm');

export interface StreakFlameProps {
  /** One tone, or several for a multi-activity day (one blended flame). */
  tones: FlameTone[];
  size?: number;
  /** Animate (today's flame). Past days render the still first frame. */
  live?: boolean;
  /** enable_flame_tiers_v1: level 3 adds the warm glow (sizing is the caller's, flameTierSize). */
  tier?: FlameTier;
}

/**
 * The streak flame — the app's LottieFiles flame recoloured per activity
 * (strength = brand cyan, cardio = lime, steps = amber, maintenance = purple).
 * No frame around it: the flame itself is the mark.
 */
export default function StreakFlame({ tones, size = 32, live = false, tier }: StreakFlameProps) {
  const reduce = useReducedMotion();
  const src = flameSrc(tones);
  const play = live && !reduce;
  return (
    <span
      className="inline-block shrink-0"
      style={{ width: size, height: size, ...(tier === 3 ? { filter: FLAME_TIER.glow } : {}) }}
      aria-hidden
    >
      {/* key: dotlottie-react doesn't reload when src changes */}
      <DotLottieReact key={`${src}-${play}`} src={src} loop={play} autoplay={play} style={{ width: size, height: size }} />
    </span>
  );
}
