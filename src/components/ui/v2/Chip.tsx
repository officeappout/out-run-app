'use client';

import { motion, useReducedMotion, type HTMLMotionProps } from 'framer-motion';
import { SPRING_POP } from './tokens';

export type ChipTone = 'neutral' | 'accent' | 'steps' | 'dark' | 'glass-dark';

const TONE_CLASS: Record<ChipTone, string> = {
  neutral: 'bg-v2-surface text-v2-ink-2 ring-1 ring-inset ring-v2-hairline',
  accent: 'bg-v2-tint text-v2-deep',
  steps: 'bg-activity-steps/10 text-[#00865a]',
  dark: 'bg-white/10 text-white',
  'glass-dark': 'v2-glass-chip text-white',
};

export interface ChipProps extends Omit<HTMLMotionProps<'span'>, 'children'> {
  tone?: ChipTone;
  /** Spring pop-in on mount (stiffness 400, damping 15). Off under reduced motion. */
  pop?: boolean;
  icon?: React.ReactNode;
  children?: React.ReactNode;
}

/** v2 Chip — small pill label. */
export default function Chip({ tone = 'neutral', pop = false, icon, className = '', children, ...rest }: ChipProps) {
  const reduce = useReducedMotion();
  const animate = pop && !reduce;
  return (
    <motion.span
      data-v2-chip={tone}
      initial={animate ? { scale: 0.6, opacity: 0 } : false}
      animate={animate ? { scale: 1, opacity: 1 } : undefined}
      transition={SPRING_POP}
      className={`inline-flex items-center gap-1 h-7 px-3 rounded-full text-[12px] font-bold whitespace-nowrap ${TONE_CLASS[tone]} ${className}`}
      {...rest}
    >
      {icon}
      {children}
    </motion.span>
  );
}
