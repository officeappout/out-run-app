'use client';

import React from 'react';
import { motion } from 'framer-motion';
import { Calendar, Sparkles, Play } from 'lucide-react';

interface BlurryBridgeOverlayProps {
  onStartWizard: () => void;
  onSkip: () => void;
}

export default function BlurryBridgeOverlay({
  onStartWizard,
  onSkip,
}: BlurryBridgeOverlayProps) {
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
              <Calendar size={32} className="text-white" />
            </div>
          </div>

          {/* Title */}
          <h2 className="text-2xl font-black text-slate-900 mb-3 leading-tight">
            בוא נכניס הכל ללו״ז
          </h2>

          {/* Subtitle */}
          <p className="text-slate-600 font-medium mb-6 leading-relaxed">
            נבנה לך תוכנית אישית שמתאימה בדיוק לשגרה שלך
          </p>

          {/* Feature badges */}
          <div className="flex flex-wrap gap-2 justify-center mb-6">
            <span className="px-3 py-1.5 bg-cyan-100 text-cyan-700 rounded-full text-xs font-bold flex items-center gap-1">
              <Sparkles size={12} />
              מותאם אישית
            </span>
            <span className="px-3 py-1.5 bg-purple-100 text-purple-700 rounded-full text-xs font-bold">
              3 דקות
            </span>
          </div>

          {/* Primary CTA */}
          <motion.button
            onClick={onStartWizard}
            whileTap={{ scale: 0.97 }}
            className="w-full py-4 bg-gradient-to-r from-[#5BC2F2] to-[#3BA4D8] text-white font-bold text-lg rounded-2xl shadow-lg shadow-cyan-500/30 active:shadow-xl transition-all mb-3"
          >
            בואו נתחיל
          </motion.button>

          {/* Secondary CTA */}
          <button
            onClick={onSkip}
            className="w-full py-3 text-slate-600 font-semibold text-sm hover:text-slate-900 transition-colors flex items-center justify-center gap-2"
          >
            <Play size={16} />
            אתחיל אימון עכשיו
          </button>

          {/* Micro-copy */}
          <p className="text-xs text-slate-400 mt-4">
            תמיד אפשר לדלג ולמלא אחר כך
          </p>
        </div>
      </motion.div>
    </div>
  );
}
