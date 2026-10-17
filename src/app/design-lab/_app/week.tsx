'use client';

import { useEffect, useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import { EASE_V2 } from '@/components/ui/v2';
import { BrandFlame, FLAME_TONE, type FlameTone } from './brand';
import { AppIcon, ICON } from './parts';
import { useMarkStyle, useMultiStyle, useStreakStyle, type StreakStyle } from './density';

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
const TONE_ICON: Record<FlameTone, string> = { strength: ICON.strength, cardio: ICON.run, steps: ICON.walk };
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
  const [peek, setPeek] = useState<number | null>(null);
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
              ) : d.status === 'done' ? (
                <button
                  type="button"
                  onClick={() => setPeek((p) => (p === i ? null : i))}
                  aria-expanded={peek === i}
                  aria-label={`מה עשית ביום ${d.short}`}
                  className="flex flex-col items-center"
                >
                  {body}
                </button>
              ) : (
                body
              )}
            </li>
          );
        })}
      </ol>
      <AnimatePresence>
        {peek !== null && days[peek] && (
          <DayPeek key={peek} day={days[peek]} index={peek} n={n} top={centerY + cell / 2 + 10} onClose={() => setPeek(null)} />
        )}
      </AnimatePresence>
    </div>
  );
}

/** Demo detail per activity for the day bubble. */
const PEEK_LINE: Record<FlameTone, string> = {
  strength: 'אימון כוח · 35 דק׳',
  cardio: 'ריצה קלה · 20 דק׳ · 3.4 ק״מ',
  steps: 'יעד הצעדים · 9,240 צעדים',
};

/** Tap a done day: a small glass bubble with what was done. */
function DayPeek({ day, index, n, top, onClose }: { day: StreakDay; index: number; n: number; top: number; onClose: () => void }) {
  const tones = tonesOf(day);
  const edge = index <= 1 ? { insetInlineStart: 0 } : index >= n - 2 ? { insetInlineEnd: 0 } : { insetInlineStart: `${((index + 0.5) / n) * 100}%`, translate: '50% 0' };
  return (
    <motion.div
      role="dialog"
      aria-label={`יום ${day.short}`}
      className="v2-glass-card absolute z-[3] w-[210px] rounded-[18px] p-2.5"
      style={{ top, ...edge }}
      initial={{ opacity: 0, y: -6, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -6, scale: 0.97 }}
      transition={{ duration: 0.2, ease: EASE_V2 }}
      onClick={onClose}
    >
      <div className="mb-1.5 text-[12px] font-extrabold text-v2-muted">יום {day.short} · {tones.length} פעילויות</div>
      <ul className="space-y-1.5">
        {tones.map((t) => (
          <li key={t} className="flex items-center gap-2">
            <span className="grid h-7 w-7 shrink-0 place-items-center rounded-[9px]" style={{ background: `rgba(${FLAME_TONE[t].rgb},.14)` }}>
              <img src={TONE_ICON[t]} alt="" className="h-4 w-4 object-contain" />
            </span>
            <span className="text-[13px] font-extrabold leading-tight">{PEEK_LINE[t]}</span>
          </li>
        ))}
      </ul>
    </motion.div>
  );
}

function DayCell({ day, isToday, size, animate, scale = 1 }: { day: StreakDay; isToday: boolean; size: number; animate: boolean; scale?: number }) {
  const icon = Math.round(size * 0.56);
  const box = 'relative grid place-items-center rounded-[14px]';
  const style = { width: size, height: size };
  // A done day is just the streak flame — no frame around it.
  if (day.status === 'done')
    return (
      <MultiFlame tones={tonesOf(day)} size={Math.round(size * 1.05 * scale)} box={size} still={!(isToday && animate)} today={isToday} />
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

/**
 * A done day's flame. One activity → one colour. Several → either one flame
 * blending their colours ("blend"), or a single-colour flame that cross-fades
 * from one activity to the next every 2s ("cycle", like the app's
 * multi-session days today). Dots under it name the activities; in "cycle"
 * the current one is the larger dot.
 */
function MultiFlame({ tones, size, box, still, today }: { tones: FlameTone[]; size: number; box: number; still: boolean; today: boolean }) {
  const mode = useMultiStyle();
  const marks = useMarkStyle();
  const reduce = useReducedMotion();
  const multi = tones.length > 1;
  // only today's flame moves; past multi-activity days show their main colour
  const cycling = multi && mode === 'cycle' && today && !reduce;
  const [i, setI] = useState(0);
  useEffect(() => {
    if (!cycling) return;
    const t = setInterval(() => setI((v) => (v + 1) % tones.length), 2000);
    return () => clearInterval(t);
  }, [cycling, tones.length]);
  const current = tones[i % tones.length];
  return (
    <span className="relative grid place-items-center" style={{ width: box, height: box }}>
      {cycling ? (
        <AnimatePresence initial={false}>
          <motion.span
            key={current}
            className="absolute inset-0 grid place-items-center"
            initial={{ opacity: 0, scale: 0.85, filter: 'blur(2px)' }}
            animate={{ opacity: 1, scale: 1, filter: 'blur(0px)' }}
            exit={{ opacity: 0, scale: 1.08, filter: 'blur(2px)' }}
            transition={{ duration: 0.45, ease: EASE_V2 }}
          >
            <BrandFlame size={size} still={still} tone={current} />
          </motion.span>
        </AnimatePresence>
      ) : (
        <BrandFlame size={size} still={still} tones={mode === 'blend' || reduce ? tones : [tones[0]]} />
      )}
      {multi && marks === 'dots' && (
        <span className="absolute -bottom-1.5 flex items-center gap-[3px]" aria-label={tones.map((t) => FLAME_TONE[t].label).join(' + ')}>
          {tones.map((t) => (
            <span
              key={t}
              className="rounded-full ring-1 ring-white transition-[width,height] duration-300 ease-v2"
              style={{
                background: FLAME_TONE[t].hex,
                width: cycling && t === current ? 7 : 5,
                height: cycling && t === current ? 7 : 5,
              }}
            />
          ))}
        </span>
      )}
      {multi && marks === 'icons' && (
        <span className="absolute -bottom-3 flex items-center gap-px rounded-full bg-white px-1 py-0.5 shadow-v2-ring" aria-label={tones.map((t) => FLAME_TONE[t].label).join(' + ')}>
          {tones.map((t) => (
            <img
              key={t}
              src={TONE_ICON[t]}
              alt=""
              className="h-3 w-3 object-contain transition-opacity duration-300"
              style={{ opacity: cycling && t !== current ? 0.35 : 1 }}
            />
          ))}
        </span>
      )}
    </span>
  );
}
