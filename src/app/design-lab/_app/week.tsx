'use client';

import { motion, useReducedMotion } from 'framer-motion';
import { EASE_V2 } from '@/components/ui/v2';
import { BrandFlame, FLAME_TONE, type FlameTone } from './brand';
import { AppIcon, ICON } from './parts';
import { useStreakStyle, type StreakStyle } from './density';

export type DayKind = 'strength' | 'walk' | 'run' | 'steps';
export type DayStatus = 'done' | 'today' | 'planned' | 'rest' | 'missed';
export interface StreakDay {
  short: string;
  date?: number;
  status: DayStatus;
  kind?: DayKind;
  /** Several activities on the same day (e.g. strength + steps). */
  kinds?: DayKind[];
  /** Outside the shown month (month grid only). */
  muted?: boolean;
}

/** Which flame a day earns: strength, cardio (run / walk workout) or steps. */
export function toneOf(kind?: DayKind): FlameTone {
  return kind === 'run' || kind === 'walk' ? 'cardio' : kind === 'steps' ? 'steps' : 'strength';
}

const TONE_ORDER: FlameTone[] = ['strength', 'cardio', 'steps'];
/** All the flame tones a day earned, in a stable order. */
export function tonesOf(d: Pick<StreakDay, 'kind' | 'kinds'>): FlameTone[] {
  const ts = (d.kinds?.length ? d.kinds : [d.kind]).map(toneOf);
  return TONE_ORDER.filter((t) => ts.includes(t));
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
  const style = useStreakStyle();
  const n = days.length;
  const centerY = (showDates ? 24 : 0) + cell / 2;
  // heat: flames grow along a run, the newest is the biggest
  const heat = new Map<number, number>();
  if (style === 'heat')
    for (const r of runs(days))
      for (let i = r.from; i <= r.to; i++) heat.set(i, 0.82 + (0.3 * (i - r.from)) / Math.max(1, r.to - r.from));
  return (
    <div className="relative">
      {runs(days).map((l) => (
        <RunConnector
          key={`${l.from}-${l.to}-${style}`}
          from={l.from}
          to={l.to}
          n={n}
          centerY={centerY}
          cell={cell}
          style={style}
          reduce={!!reduce}
          tones={days.slice(l.from, l.to + 1).map((d, k, arr) => tonesOf(d.status === 'rest' ? arr[k - 1] ?? arr[k + 1] : d)[0])}
        />
      ))}
      {style === 'flow' && (
        <style>{'@keyframes labFlow{from{background-position:0 0}to{background-position:-24px 0}}'}</style>
      )}
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
              <DayCell day={d} isToday={isToday} size={cell} animate={animateToday && isToday} scale={heat.get(i) ?? 1} />
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

function DayCell({ day, isToday, size, animate, scale = 1 }: { day: StreakDay; isToday: boolean; size: number; animate: boolean; scale?: number }) {
  const icon = Math.round(size * 0.56);
  const box = 'relative grid place-items-center rounded-[14px]';
  const style = { width: size, height: size };
  // A done day is just the streak flame — no frame around it.
  if (day.status === 'done')
    return (
      <span className="relative grid place-items-center" style={style}>
        <BrandFlame size={Math.round(size * 1.05 * scale)} still={!(isToday && animate)} tones={tonesOf(day)} />
        {tonesOf(day).length > 1 && (
          <span className="absolute -bottom-1.5 flex gap-[3px]" aria-label={tonesOf(day).map((t) => FLAME_TONE[t].label).join(' + ')}>
            {tonesOf(day).map((t) => (
              <span key={t} className="h-[5px] w-[5px] rounded-full ring-1 ring-white" style={{ background: FLAME_TONE[t].hex }} />
            ))}
          </span>
        )}
      </span>
    );
  if (day.status === 'today')
    return (
      <span className={`${box} bg-white ring-2 ring-v2-accent`} style={style}>
        <AppIcon src={PROGRAM[day.kind ?? 'strength']} size={icon} />
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

/** What joins the flames of one streak run — four styles to compare. */
function RunConnector({
  from,
  to,
  n,
  centerY,
  cell,
  style,
  reduce,
  tones,
}: {
  from: number;
  to: number;
  n: number;
  centerY: number;
  cell: number;
  style: StreakStyle;
  reduce: boolean;
  /** Each day's flame tone, older → newer (rest days take a neighbour's). */
  tones: FlameTone[];
}) {
  // centre of the first flame → centre of the last (inline-start = the older day)
  const line = {
    insetInlineStart: `${((from + 0.5) / n) * 100}%`,
    width: `${((to - from) / n) * 100}%`,
  };
  const grow = {
    initial: reduce ? false : ({ scaleX: 0, opacity: 0 } as const),
    animate: { scaleX: 1, opacity: 1 },
    transition: { duration: 0.6, ease: EASE_V2, delay: reduce ? 0 : 0.15 },
  };
  if (style === 'thread')
    return (
      <motion.span
        aria-hidden
        className="absolute rounded-full"
        style={{
          ...line,
          top: centerY + cell * 0.38,
          height: 4,
          transformOrigin: 'right',
          background: 'linear-gradient(270deg, rgba(0,186,247,.25), #00baf7 55%, #0cf2e3)',
          boxShadow: '0 0 10px rgba(12,242,227,.55)',
        }}
        {...grow}
      />
    );
  if (style === 'heat')
    return (
      <motion.span
        aria-hidden
        className="absolute rounded-full"
        style={{
          insetInlineStart: `${(from / n) * 100}%`,
          width: `${((to - from + 1) / n) * 100}%`,
          top: centerY - cell * 0.32,
          height: cell * 0.64,
          transformOrigin: 'right',
          background: 'linear-gradient(270deg, rgba(0,186,247,.10), rgba(0,186,247,.30) 60%, rgba(12,242,227,.55))',
          filter: 'blur(7px)',
        }}
        {...grow}
      />
    );
  if (style === 'flow')
    return (
      <motion.span
        aria-hidden
        className="absolute"
        style={{
          ...line,
          top: centerY + cell * 0.38,
          height: 4,
          transformOrigin: 'right',
          backgroundImage: 'radial-gradient(circle, #00baf7 1.6px, transparent 2px)',
          backgroundSize: '8px 4px',
          animation: reduce ? undefined : 'labFlow 0.9s linear infinite',
        }}
        {...grow}
      />
    );
  // capsule: a soft wash that blends from one day's flame colour to the
  // next, a touch stronger toward today, with a hairline in the same blend
  const k = tones.length;
  const stop = (alpha: (i: number) => number) =>
    tones.map((t, i) => `rgba(${FLAME_TONE[t].rgb},${alpha(i).toFixed(2)}) ${k === 1 ? 0 : Math.round((i / (k - 1)) * 100)}%`).join(', ');
  const fill = `linear-gradient(270deg, ${stop((i) => 0.11 + (0.12 * i) / Math.max(1, k - 1))})`;
  const edge = `linear-gradient(270deg, ${stop((i) => 0.28 + (0.3 * i) / Math.max(1, k - 1))})`;
  return (
    <motion.span
      aria-hidden
      className="absolute rounded-[18px]"
      style={{
        insetInlineStart: `calc(${(from / n) * 100}% + 2px)`,
        width: `calc(${((to - from + 1) / n) * 100}% - 4px)`,
        top: centerY - cell / 2 - 4,
        height: cell + 8,
        transformOrigin: 'right',
        border: '1.5px solid transparent',
        background: `${fill} padding-box, linear-gradient(#fff,#fff) padding-box, ${edge} border-box`,
      }}
      {...grow}
    />
  );
}
