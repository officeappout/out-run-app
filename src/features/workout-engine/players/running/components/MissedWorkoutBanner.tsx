'use client';

import React from 'react';
import { motion } from 'framer-motion';
import { Zap } from 'lucide-react';

interface MissedWorkoutBannerProps {
  onDoIt: () => void;
  onContinue: () => void;
}

export default function MissedWorkoutBanner({
  onDoIt,
  onContinue,
}: MissedWorkoutBannerProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 12 }}
      className="mx-4 rounded-2xl overflow-hidden"
      style={{
        background: 'linear-gradient(135deg, #00BAF7 0%, #0097D4 100%)',
        boxShadow: '0 8px 24px rgba(0,186,247,0.25)',
      }}
      dir="rtl"
    >
      <div className="px-5 py-4">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center flex-shrink-0 mt-0.5">
            <Zap size={20} className="text-white" />
          </div>
          <p className="text-[14px] leading-relaxed text-white/95 font-medium">
            פספסת כמה אימונים? הכל בסדר. אימון האיכות שלך עדיין מחכה – רוצה לבצע אותו היום?
          </p>
        </div>

        <div className="flex gap-3 mt-4">
          <button
            onClick={onDoIt}
            className="flex-1 py-2.5 rounded-xl text-sm font-bold bg-white text-[#00BAF7] active:scale-[0.97] transition-transform"
          >
            בוא נעשה את זה
          </button>
          <button
            onClick={onContinue}
            className="flex-1 py-2.5 rounded-xl text-sm font-bold bg-white/15 text-white border border-white/25 active:scale-[0.97] transition-transform"
          >
            המשך כרגיל
          </button>
        </div>
      </div>
    </motion.div>
  );
}
