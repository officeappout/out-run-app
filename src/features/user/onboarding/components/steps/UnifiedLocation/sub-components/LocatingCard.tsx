'use client';

import React from 'react';
import { motion } from 'framer-motion';
import { Loader2 } from 'lucide-react';

export function LocatingCard({ v2 = false }: { v2?: boolean } = {}) {
  if (v2) {
    // v2 — bottom sheet over the full-bleed map; owns the bottom inset once.
    return (
      <motion.div
        initial={{ opacity: 0, y: 50 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 50 }}
        transition={{ duration: 0.3, ease: [0.23, 1, 0.32, 1] }}
        className="absolute bottom-0 left-0 right-0 z-20"
        dir="rtl"
      >
        <div
          className="rounded-t-[28px] bg-white shadow-v2-sheet px-5 pt-3"
          style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 16px)' }}
        >
          <div className="mx-auto h-1.5 w-10 rounded-full bg-v2-pill-border" />
          <div className="flex flex-col items-center justify-center py-10">
            <div className="grid h-14 w-14 place-items-center rounded-full bg-v2-tint mb-4">
              <Loader2 size={28} className="text-v2-accent animate-spin" />
            </div>
            <p className="text-[16px] font-extrabold text-v2-ink whitespace-nowrap">
              מאתרים את המיקום שלך...
            </p>
          </div>
        </div>
      </motion.div>
    );
  }

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
