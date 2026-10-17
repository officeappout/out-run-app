'use client';

import { motion, useReducedMotion } from 'framer-motion';
import { EASE_V2 } from '@/components/ui/v2';
import { BrandFlame } from './brand';
import { AppIcon, ICON } from './parts';

export type DayKind = 'strength' | 'walk' | 'run' | 'steps';
export type DayStatus = 'done' | 'today' | 'planned' | 'rest' | 'missed';
export interface StreakDay {
  short: string;
  date?: number;
  status: DayStatus;
  kind?: DayKind;
  /** Outside the shown month (month grid only). */
  muted?: boolean;
}

const PROGRAM: Record<DayKind, string> = {
  strength: ICON.strength,
  walk: ICON.walk,
  steps: ICON.walk,
  run: ICON.run,
};

/**
 * Streak runs: consecutive done days, where a single rest day between two
 * done days keeps the streak alive (it sits inside the capsule).
 */
function runs(days: StreakDay[]): { from: number; to: number }[] {
  const out: { from: number; to: number }[] = [];
  let start = -1;
  let last = -1;
  for (let i = 0; i < days.length; i++) {
    const st = days[i].status;
    if (st === 'done') {
      if (start < 0) start = i;
      last = i;
    } else if (st === 'rest' && start >= 0 && days[i + 1]?.status === 'done') {
      continue;
    } else if (start >= 0) {
      if (last > start) out.push({ from: start, to: last });
      start = -1;
    }
  }
  if (start >= 0 && last > start) out.push({ from: start, to: last });
  return out;
}

export function StreakRow({
  days,
  todayIndex,
  showDates = false,
  cell = 44,
  animateToday = true,
  selectedIndex,
  onSelect,
}: {
  days: StreakDay[];
  todayIndex?: number;
  showDates?: boolean;
  cell?: number;
  animateToday?: boolean;
  /** Planner: the day the agenda is showing. */
  selectedIndex?: number;
  onSelect?: (i: number) => void;
}) {
  const reduce = useReducedMotion();
  const n = days.length;
  const centerY = (showDates ? 24 : 0) + cell / 2;
  return (
    <div className="relative">
      {runs(days).map((l) => (
        <motion.span
          key={`${l.from}-${l.to}`}
          aria-hidden
          className="absolute rounded-[18px]"
          style={{
            insetInlineStart: `calc(${(l.from / n) * 100}% + 2px)`,
            width: `calc(${((l.to - l.from + 1) / n) * 100}% - 4px)`,
            top: centerY - cell / 2 - 4,
            height: cell + 8,
            background: 'linear-gradient(270deg, rgba(0,186,247,.16), rgba(12,242,227,.22))',
            boxShadow: 'inset 0 0 0 1.5px rgba(0,186,247,.28)',
            transformOrigin: 'right',
          }}
          initial={reduce ? false : { scaleX: 0.2, opacity: 0 }}
          animate={{ scaleX: 1, opacity: 1 }}
          transition={{ duration: 0.55, ease: EASE_V2, delay: reduce ? 0 : 0.1 }}
        />
      ))}
      <ol className="relative grid" style={{ gridTemplateColumns: `repeat(${n}, minmax(0, 1fr))` }}>
        {days.map((d, i) => {
          const isToday = i === todayIndex;
          const isSel = i === selectedIndex;
          const body = (
            <>
              {showDates && (
                <span
                  className={`mb-1 grid h-[20px] min-w-[20px] place-items-center rounded-full px-1 text-[12px] font-extrabold tabular-nums transition-colors duration-200 ${
                    isToday ? 'bg-v2-cta text-v2-on-cta' : isSel ? 'bg-v2-ink text-white' : 'text-v2-ink-2'
                  }`}
                >
                  {d.date}
                </span>
              )}
              <DayCell day={d} isToday={isToday} size={cell} animate={animateToday && isToday} />
            </>
          );
          return (
            <li key={i} className={`flex flex-col items-center ${d.muted ? 'opacity-35' : ''}`}>
              {onSelect ? (
                <button type="button" onClick={() => onSelect(i)} aria-pressed={isSel} className="flex flex-col items-center">
                  {body}
                </button>
              ) : (
                body
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function DayCell({ day, isToday, size, animate }: { day: StreakDay; isToday: boolean; size: number; animate: boolean }) {
  const icon = Math.round(size * 0.56);
  const box = 'relative grid place-items-center rounded-[14px]';
  const style = { width: size, height: size };
  // A done day is just the streak flame — no frame around it.
  if (day.status === 'done')
    return (
      <span className="relative grid place-items-center" style={style}>
        <BrandFlame size={Math.round(size * 1.05)} still={!(isToday && animate)} />
      </span>
    );
  if (day.status === 'today')
    return (
      <span className={`${box} bg-v2-cta shadow-v2-cta`} style={style}>
        <AppIcon src={PROGRAM[day.kind ?? 'strength']} size={icon} className="brightness-0 invert" />
      </span>
    );
  if (day.status === 'planned')
    return (
      <span className={`${box} bg-v2-tint`} style={style}>
        <AppIcon src={PROGRAM[day.kind ?? 'strength']} size={icon - 2} className="opacity-60" />
      </span>
    );
  // rest / missed
  return (
    <span className={`${box} ${isToday ? 'bg-v2-surface ring-2 ring-v2-hairline' : ''}`} style={style}>
      <span className="text-[14px] font-black italic text-[#c3ccd4]">
        Z<sup className="text-[9px]">z</sup>
      </span>
    </span>
  );
}

export function DayLetters({ days, todayIndex }: { days: { short: string }[]; todayIndex?: number }) {
  return (
    <ol className="mb-1.5 grid" style={{ gridTemplateColumns: `repeat(${days.length}, minmax(0, 1fr))` }}>
      {days.map((d, i) => (
        <li key={i} className={`text-center text-[13px] font-extrabold ${i === todayIndex ? 'text-v2-deep' : 'text-v2-muted'}`}>
          {d.short}
        </li>
      ))}
    </ol>
  );
}
