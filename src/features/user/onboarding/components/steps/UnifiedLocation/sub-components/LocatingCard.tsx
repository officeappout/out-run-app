'use client';

import React from 'react';
import { motion } from 'framer-motion';
import { Loader2 } from 'lucide-react';

export function LocatingCard() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 50 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 50 }}
      transition={{ duration: 0.3 }}
      className="absolute bottom-0 left-0 right-0 z-20"
    >
      <div className="bg-gradient-to-t from-white via-white/98 to-transparent pt-12 pb-4">
        <div className="bg-white rounded-t-3xl shadow-[0_-8px_30px_rgba(91,194,242,0.10)] p-8 border-t border-slate-100/40">
          <div className="flex flex-col items-center justify-center py-8">
            <Loader2 size={40} className="text-[#5BC2F2] animate-spin mb-4" />
            <p 
              className="text-slate-700 font-medium text-lg"
              style={{ fontFamily: 'var(--font-simpler)' }}
            >
              מאתרים את המיקום שלך...
            </p>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
