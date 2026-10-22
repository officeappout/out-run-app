'use client';

import { motion, useReducedMotion } from 'framer-motion';
import StreakFlame from '@/components/ui/v2/StreakFlame';
import type { FlameTone } from '@/components/ui/v2/streak';
import type { StripDay } from '../core/celebration.core';
import ShieldMark from './ShieldMark';

const DOW = ['א׳', 'ב׳', 'ג׳', 'ד׳', 'ה׳', 'ו׳', 'ש׳'];

/** This week's days under the headline (ST-1 day / shield / back): flame, shield or empty. */
export default function WeekStrip({ days, tones }: { days: StripDay[]; tones: FlameTone[] }) {
  const reduce = useReducedMotion();
  return (
    <div className="mt-[22px] flex gap-2.5 rounded-[20px] bg-white px-4 py-3 shadow-[0_0_0_1px_rgba(14,27,42,0.06)]" dir="rtl">
      {days.map((d, i) => (
        <div key={d.key} className="flex w-[30px] flex-col items-center gap-1">
          <span className="grid h-7 w-7 place-items-center">
            {d.state === 'lit' && (
              <motion.span
                initial={reduce || !d.isToday ? false : { scale: 0, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ type: 'spring', stiffness: 420, damping: 18, delay: 0.45 + i * 0.02 }}
              >
                <StreakFlame tones={tones} size={24} live={d.isToday} />
              </motion.span>
            )}
            {d.state === 'shield' && <ShieldMark size={20} check={false} />}
            {d.state === 'empty' && <span className="h-5 w-5 rounded-full bg-[#eef2f6]" />}
          </span>
          <span className={`text-[12px] font-extrabold ${d.isToday ? 'text-[#0e1419]' : 'text-slate-500'}`}>{DOW[d.dow]}</span>
        </div>
      ))}
    </div>
  );
}
