'use client';

/**
 * The top half of the streak celebration, per variant (designs ST-1…ST-5). Flames are the
 * home strip's Lottie flame (StreakFlame). Reduced motion: everything lands in its final
 * state with no tick, pop or stagger.
 */
import { useEffect, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import StreakFlame from '@/components/ui/v2/StreakFlame';
import type { FlameTone } from '@/components/ui/v2/streak';
import { milestoneBadges, type Celebration } from '../core/celebration.core';
import ShieldMark from './ShieldMark';

const DEEP = '#c2410c';
const pop = { type: 'spring', stiffness: 260, damping: 16 } as const;

/** N-1 → N: the old number lifts away faded, the new one lands. */
function TickingNumber({ to, unit }: { to: number; unit?: string }) {
  const reduce = useReducedMotion();
  const [n, setN] = useState(reduce ? to : Math.max(0, to - 1));
  useEffect(() => {
    if (reduce) {
      setN(to);
      return;
    }
    const t = setTimeout(() => setN(to), 650);
    return () => clearTimeout(t);
  }, [to, reduce]);
  return (
    <div className="relative mt-1.5 flex h-[84px] flex-col items-center overflow-hidden">
      <AnimatePresence initial={false} mode="popLayout">
        <motion.span
          key={n}
          initial={{ y: 48, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: -40, opacity: 0, scale: 0.4 }}
          transition={pop}
          className="text-[72px] font-black leading-[72px] tracking-[-0.03em]"
          style={{ color: DEEP }}
        >
          {n}
        </motion.span>
      </AnimatePresence>
      {unit && <span className="text-[14px] font-extrabold text-slate-500">{unit}</span>}
    </div>
  );
}

function GrowingFlame({ tones, size }: { tones: FlameTone[]; size: number }) {
  const reduce = useReducedMotion();
  return (
    <motion.div
      initial={reduce ? false : { scale: 0.72, opacity: 0.6 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ ...pop, delay: 0.55 }}
    >
      <StreakFlame tones={tones} size={size} live />
    </motion.div>
  );
}

function WeekFlames({ tones, streak }: { tones: FlameTone[]; streak: number }) {
  const reduce = useReducedMotion();
  return (
    <>
      <div className="text-[72px] font-black leading-[76px]" style={{ color: DEEP }}>{streak}</div>
      <div className="mt-[18px] flex items-end gap-1.5" dir="rtl">
        {Array.from({ length: 7 }, (_, i) => (
          <motion.span
            key={i}
            initial={reduce ? false : { scale: 0, opacity: 0, y: 8 }}
            animate={{ scale: 1, opacity: 1, y: 0 }}
            transition={{ ...pop, delay: 0.2 + i * 0.12 }}
          >
            <StreakFlame tones={tones} size={i === 6 ? 46 : 36} live={i === 6} />
          </motion.span>
        ))}
      </div>
    </>
  );
}

function MilestoneBadge({ streak }: { streak: number }) {
  const reduce = useReducedMotion();
  return (
    <>
      <motion.div
        className="relative grid h-[220px] w-[220px] place-items-center"
        initial={reduce ? false : { scale: 0.5, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={pop}
      >
        {Array.from({ length: 12 }, (_, i) => (
          <span
            key={i}
            className="absolute left-1/2 top-1/2 -ml-[3px] -mt-[13px] h-[26px] w-1.5 rounded-full bg-[#fdba74]"
            style={{ transform: `rotate(${i * 30}deg) translateY(-98px)` }}
          />
        ))}
        <div
          className="flex h-[156px] w-[156px] flex-col items-center justify-center rounded-full text-white"
          style={{
            background: 'linear-gradient(160deg,#fdba74,#f97316 55%,#c2410c)',
            boxShadow: '0 18px 40px -16px rgba(194,65,12,0.7), inset 0 0 0 6px rgba(255,255,255,0.35)',
          }}
        >
          <span className="text-[64px] font-black leading-[64px]">{streak}</span>
          <span className="text-[16px] font-extrabold">ימים</span>
        </div>
      </motion.div>
      <div className="mt-[18px] flex gap-3.5" dir="rtl">
        {milestoneBadges(streak).map((b) => (
          <span
            key={b.n}
            className={`grid h-[50px] w-[50px] place-items-center rounded-full font-black ${
              b.state === 'current'
                ? 'bg-[#f97316] text-[17px] text-white shadow-[0_0_0_3px_#fed7aa]'
                : b.state === 'done'
                  ? 'bg-[#ffedd5] text-[17px] text-[#9a3412]'
                  : 'bg-slate-100 text-[15px] text-slate-500 shadow-[inset_0_0_0_1.5px_#cbd5e1]'
            }`}
          >
            {b.n}
          </span>
        ))}
      </div>
    </>
  );
}

export default function CelebrationHero({ c, tones, unit }: { c: Celebration; tones: FlameTone[]; unit: string }) {
  const reduce = useReducedMotion();
  switch (c.variant) {
    case 'day':
      return (
        <>
          <GrowingFlame tones={tones} size={160} />
          <TickingNumber to={c.streak} />
        </>
      );
    case 'week':
      return <WeekFlames tones={tones} streak={c.streak} />;
    case 'milestone':
      return <MilestoneBadge streak={c.streak} />;
    case 'shield':
      return (
        <>
          <div className="relative h-[180px] w-[170px]">
            <span className="absolute left-2.5 top-0">
              <StreakFlame tones={tones} size={150} live />
            </span>
            <motion.span
              className="absolute -left-1.5 bottom-0"
              initial={reduce ? false : { x: -24, opacity: 0, rotate: -12 }}
              animate={{ x: 0, opacity: 1, rotate: 0 }}
              transition={{ ...pop, delay: 0.3 }}
            >
              <ShieldMark size={84} />
            </motion.span>
          </div>
          <div className="mt-2 text-[64px] font-black leading-[70px]" style={{ color: DEEP }}>{c.streak}</div>
        </>
      );
    case 'back':
      return (
        <>
          <span className="opacity-70">
            <StreakFlame tones={tones} size={84} />
          </span>
          <div className="mt-2.5 text-[56px] font-black leading-[64px] text-[#9a3412]">{c.streak}</div>
          <div className="text-[14px] font-extrabold text-slate-500">{unit}</div>
        </>
      );
  }
}
