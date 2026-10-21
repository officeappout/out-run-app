'use client';

import React from 'react';
import { motion } from 'framer-motion';
import { Calendar, Sparkles, Play } from 'lucide-react';
import { useT } from '@/hooks/useT';
import { onboarding } from '@/messages/ns/onboarding';

interface BlurryBridgeOverlayProps {
  onStartWizard: () => void;
  onSkip: () => void;
}

export default function BlurryBridgeOverlay({
  onStartWizard,
  onSkip,
}: BlurryBridgeOverlayProps) {
  const t = useT(onboarding);
  return (
    <div className="absolute inset-0 z-10 flex items-center justify-center p-4" dir="rtl">
      {/* Semi-transparent backdrop with blur */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="absolute inset-0 backdrop-blur-md bg-white/30"
      />

      {/* Bridge Card */}
      <motion.div
        initial={{ scale: 0.9, opacity: 0, y: 20 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.9, opacity: 0, y: 20 }}
        transition={{ type: 'spring', stiffness: 300, damping: 25 }}
        className="relative z-20 w-full max-w-sm mx-auto"
      >
        {/* Glassmorphic card */}
        <div className="bg-gradient-to-br from-white/90 to-white/70 backdrop-blur-xl rounded-3xl shadow-2xl border border-white/50 p-8 text-center">
          {/* Icon */}
          <div className="flex justify-center mb-4">
            <div className="w-16 h-16 rounded-full bg-gradient-to-br from-[#5BC2F2] to-[#3BA4D8] flex items-center justify-center shadow-lg">
              <Calendar size={32} className="text-on-brand" />
            </div>
          </div>

          {/* Title */}
          <h2 className="text-2xl font-black text-slate-900 mb-3 leading-tight">
            {t('bridge.title')}
          </h2>

          {/* Subtitle */}
          <p className="text-slate-600 font-medium mb-6 leading-relaxed">
            {t('bridge.subtitle')}
          </p>

          {/* Feature badges */}
          <div className="flex flex-wrap gap-2 justify-center mb-6">
            <span className="px-3 py-1.5 bg-cyan-100 text-cyan-700 rounded-full text-xs font-bold flex items-center gap-1">
              <Sparkles size={12} />
              {t('bridge.badge.personal')}
            </span>
            <span className="px-3 py-1.5 bg-purple-100 text-purple-700 rounded-full text-xs font-bold">
              {t('bridge.badge.minutes')}
            </span>
          </div>

          {/* Primary CTA */}
          <motion.button
            onClick={onStartWizard}
            whileTap={{ scale: 0.97 }}
            className="w-full py-4 bg-gradient-to-r from-[#5BC2F2] to-[#3BA4D8] text-on-brand font-bold text-lg rounded-2xl shadow-lg shadow-cyan-500/30 active:shadow-xl transition-all mb-3"
          >
            {t('bridge.cta.start')}
          </motion.button>

          {/* Secondary CTA */}
          <button
            onClick={onSkip}
            className="w-full py-3 text-slate-600 font-semibold text-sm hover:text-slate-900 transition-colors flex items-center justify-center gap-2"
          >
            <Play size={16} />
            {t('bridge.cta.workoutNow')}
          </button>

          {/* Micro-copy */}
          <p className="text-xs text-slate-400 mt-4">
            {t('bridge.note')}
          </p>
        </div>
      </motion.div>
    </div>
  );
}
