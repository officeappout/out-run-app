'use client';

import React from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { Hand } from 'lucide-react';
import { useT } from '@/hooks/useT';
import { onboarding } from '@/messages/ns/onboarding';

/** Dark chip under the lemur pin: "גוררים את המפה כדי לדייק" (hidden after the first drag). */
export function DragHintChip() {
  const t = useT(onboarding);
  const reduce = !!useReducedMotion();
  return (
    <motion.span
      initial={{ opacity: 0, y: -4 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.3, ease: [0.23, 1, 0.32, 1] }}
      className="flex h-[34px] items-center gap-2 rounded-full bg-[rgba(14,20,25,0.82)] px-3.5 text-[13px] font-bold text-white shadow-v2-float whitespace-nowrap"
      dir="rtl"
    >
      <motion.span
        className="inline-flex"
        animate={reduce ? undefined : { x: [0, -6, 6, 0] }}
        transition={reduce ? undefined : { duration: 1.6, repeat: Infinity, ease: 'easeInOut' }}
        aria-hidden
      >
        <Hand size={17} strokeWidth={2} />
      </motion.span>
      {t('location.entry.dragHint')}
    </motion.span>
  );
}
