'use client';

import { motion } from 'framer-motion';
import { Loader2 } from 'lucide-react';

/** Drop-in recruitment prompt — shown after a non-member joins a live session. */
export default function DropInJoinPrompt({ joining, onJoin, onDismiss }: { joining: boolean; onJoin: () => void; onDismiss: () => void }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-gradient-to-br from-emerald-50 to-teal-50 dark:from-emerald-900/20 dark:to-teal-900/20 border border-emerald-100 dark:border-emerald-800/40 rounded-2xl p-4 space-y-3"
      dir="rtl"
    >
      <div className="flex items-center gap-3">
        <span className="text-2xl">🏃</span>
        <div>
          <p className="text-sm font-black text-gray-900 dark:text-gray-100">כל הכבוד, הצטרפת לאימון!</p>
          <p className="text-xs text-gray-500 dark:text-gray-400">רוצה לקבל תזכורות למפגשים הבאים?</p>
        </div>
      </div>
      <div className="flex gap-2">
        <button
          onClick={onJoin}
          disabled={joining}
          className="flex-1 py-2.5 rounded-xl bg-emerald-500 text-white text-sm font-black transition-all active:scale-[0.97] disabled:opacity-60 flex items-center justify-center gap-2"
        >
          {joining
            ? <Loader2 className="w-4 h-4 animate-spin" />
            : 'כן, הצטרפי לקבוצה'}
        </button>
        <button
          onClick={onDismiss}
          className="px-4 py-2.5 rounded-xl bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-300 text-sm font-bold transition-all active:scale-[0.97]"
        >
          אולי אחר כך
        </button>
      </div>
    </motion.div>
  );
}
