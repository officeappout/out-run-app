'use client';

import { motion } from 'framer-motion';
import { Flame } from 'lucide-react';

interface DopamineStreakBlockProps {
  streakDays: number;
}

export default function DopamineStreakBlock({ streakDays }: DopamineStreakBlockProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: 0.3 }}
      className="bg-gradient-to-br from-orange-500 to-orange-600 rounded-xl shadow-sm p-6 mb-6 text-white"
      style={{ fontFamily: 'Assistant, sans-serif' }}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="p-3 bg-white/20 rounded-xl backdrop-blur-sm">
            <Flame size={32} className="text-white" fill="currentColor" />
          </div>
          <div>
            <div className="text-sm font-bold uppercase tracking-wider text-orange-100 mb-1">
              רצף ימים
            </div>
            <div className="text-4xl md:text-5xl font-black">
              {streakDays}
            </div>
            <div className="text-sm font-medium text-orange-100 mt-1">
              ימים ברצף
            </div>
          </div>
        </div>
        <div className="text-right">
          <div className="text-xs font-bold text-orange-100 uppercase tracking-wider">
            כל הכבוד!
          </div>
        </div>
      </div>
    </motion.div>
  );
}
