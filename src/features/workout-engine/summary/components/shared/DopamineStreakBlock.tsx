'use client';

import { motion } from 'framer-motion';
import { Flame } from 'lucide-react';
import { useT } from '@/hooks/useT';
import { summary } from '@/messages/ns/summary';

interface DopamineStreakBlockProps {
  streakDays: number;
}

export default function DopamineStreakBlock({ streakDays }: DopamineStreakBlockProps) {
  const t = useT(summary);
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay: 0.3 }}
      className="bg-gradient-to-br from-orange-500 to-orange-600 rounded-xl shadow-sm p-6 mb-6 text-white"
      style={{ fontFamily: 'var(--font-simpler)' }}
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div className="p-3 bg-white/20 rounded-xl backdrop-blur-sm">
            <Flame size={32} className="text-white" fill="currentColor" />
          </div>
          <div>
            <div className="text-sm font-bold uppercase tracking-wider text-orange-100 mb-1">
              {t('streak.label')}
            </div>
            <div className="text-4xl md:text-5xl font-black">
              {streakDays}
            </div>
            <div className="text-sm font-medium text-orange-100 mt-1">
              {t('streak.days')}
            </div>
          </div>
        </div>
        <div className="text-right">
          <div className="text-xs font-bold text-orange-100 uppercase tracking-wider">
            {t('streak.praise')}
          </div>
        </div>
      </div>
    </motion.div>
  );
}
