'use client';

import React, { useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Check, Loader2 } from 'lucide-react';

type ButtonState = 'idle' | 'loading' | 'success';

interface StickyActionButtonProps {
  label: string;
  successLabel?: string;
  disabled?: boolean;
  onPress: () => void | Promise<void>;
  /**
   * 'default' — legacy flat cyan gradient, white text, rounded-2xl (unchanged).
   * 'premium'  — home-button-matched style: #00BAF7→#0CF2E3 gradient, black text,
   *              rounded-full, font-semibold, shadow-md shadow-cyan-400/25.
   */
  variant?: 'default' | 'premium';
}

export default function StickyActionButton({
  label,
  successLabel,
  disabled = false,
  onPress,
  variant = 'default',
}: StickyActionButtonProps) {
  const [state, setState] = useState<ButtonState>('idle');

  const handleClick = useCallback(async () => {
    if (state !== 'idle' || disabled) return;
    setState('loading');
    try {
      await onPress();
      setState('success');
    } catch {
      setState('idle');
    }
  }, [state, disabled, onPress]);

  const isDisabled = disabled || state !== 'idle';

  return (
    <div
      className="sticky bottom-0 left-0 right-0 z-30 px-4 pb-6 pt-3"
      style={{
        background: 'linear-gradient(to top, white 70%, transparent)',
        paddingBottom: 'max(env(safe-area-inset-bottom, 0px), 24px)',
      }}
    >
      <motion.button
        onClick={handleClick}
        disabled={isDisabled}
        whileTap={state === 'idle' && !disabled ? { scale: 0.97 } : {}}
        className={`w-full h-14 transition-all duration-300 flex items-center justify-center gap-2.5 ${
          variant === 'premium'
            ? `rounded-full font-semibold text-base ${
                state === 'success'
                  ? 'bg-[#10B981] text-white shadow-lg shadow-emerald-500/30'
                  : disabled
                    ? 'bg-slate-300 text-slate-400 shadow-none cursor-not-allowed'
                    : 'text-black shadow-md shadow-cyan-400/25 hover:brightness-105 active:scale-95'
              }`
            : `rounded-2xl font-black text-lg text-white ${
                state === 'success'
                  ? 'bg-[#10B981] shadow-lg shadow-emerald-500/30'
                  : disabled
                    ? 'bg-slate-300 shadow-none cursor-not-allowed'
                    : 'bg-gradient-to-l from-[#00C9F2] to-[#5BC2F2] shadow-xl shadow-[#5BC2F2]/30 hover:shadow-2xl active:scale-[0.97]'
              }`
        }`}
        style={{
          fontFamily: 'var(--font-simpler)',
          ...(variant === 'premium' && state !== 'success' && !disabled
            ? { background: 'linear-gradient(135deg, #00BAF7 0%, #0CF2E3 100%)' }
            : {}),
        }}
      >
        <AnimatePresence mode="wait">
          {state === 'loading' && (
            <motion.div
              key="loading"
              initial={{ opacity: 0, scale: 0.7 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.7 }}
            >
              <Loader2 size={22} className="animate-spin" />
            </motion.div>
          )}
          {state === 'success' && (
            <motion.div
              key="success"
              initial={{ opacity: 0, scale: 0.5 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0 }}
              className="flex items-center gap-2"
            >
              <Check size={22} strokeWidth={3} />
              <span>{successLabel || label}</span>
            </motion.div>
          )}
          {state === 'idle' && (
            <motion.span
              key="idle"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              {label}
            </motion.span>
          )}
        </AnimatePresence>
      </motion.button>
    </div>
  );
}
