'use client';

import { Flame, Trophy } from 'lucide-react';
import type { WeekDot } from './summary';

/**
 * Streak card for the v2 summaries: a flame badge with "N אימונים ברצף",
 * the best streak, and this week as 7 dots — a training day is a solid
 * orange flame, today is larger and ringed, a rest day is a small grey dot,
 * a future day a dashed circle. Consecutive training days are chained by an
 * orange line. Optional week bars (workouts / active minutes) sit below.
 */

export interface StreakWeekBar {
  label: string;
  value: number;
  /** Denominator; absent ⇒ the plain count, no bar. */
  max?: number | null;
}

export interface StreakDotsStripProps {
  streak: number;
  /** Longest streak ever; shown only when > 0. */
  best?: number;
  days: WeekDot[];
  bars?: StreakWeekBar[];
}

const ORANGE = '#f97316';
const CHAIN = '#fb923c';

function Connector({ side, on }: { side: 'start' | 'end'; on: boolean }) {
  // RTL row: Sunday sits on the right. "start" = towards the previous day (right),
  // "end" = towards the next day (left).
  return (
    <span
      aria-hidden
      className="absolute top-[15px] w-1/2"
      style={{
        ...(side === 'start' ? { right: 0 } : { left: 0 }),
        height: on ? 4 : 2,
        marginTop: on ? -1 : 0,
        background: on ? CHAIN : '#e6edf2',
      }}
    />
  );
}

function Dot({ day }: { day: WeekDot }) {
  if (day.state === 'done') {
    const size = day.isToday ? 34 : 30;
    return (
      <span
        className="relative grid place-items-center rounded-full"
        style={{
          width: size,
          height: size,
          marginTop: day.isToday ? -2 : 0,
          background: ORANGE,
          boxShadow: day.isToday
            ? '0 0 0 3px #fff, 0 0 0 5.5px #fdba74, 0 10px 18px -8px rgba(249,115,22,0.9)'
            : '0 6px 12px -6px rgba(249,115,22,0.7)',
        }}
      >
        <Flame size={day.isToday ? 18 : 15} strokeWidth={2.4} color="#fff" aria-hidden />
      </span>
    );
  }
  if (day.state === 'future') {
    return (
      <span className="relative grid h-[30px] w-[30px] place-items-center">
        <span className="h-[30px] w-[30px] rounded-full border-[1.5px] border-dashed border-v2-pill-border bg-white" />
      </span>
    );
  }
  return (
    <span className="relative grid h-[30px] w-[30px] place-items-center">
      <span
        className={`h-3 w-3 rounded-full bg-v2-pill-border ${day.isToday ? 'ring-2 ring-[#fdba74] ring-offset-2' : ''}`}
      />
    </span>
  );
}

function WeekBar({ bar }: { bar: StreakWeekBar }) {
  const pct = bar.max && bar.max > 0 ? Math.min(100, (bar.value / bar.max) * 100) : null;
  return (
    <div className="min-w-0 flex-1">
      <div className="flex items-baseline justify-between gap-2">
        <span className="truncate text-[12px] font-extrabold text-v2-ink-2">{bar.label}</span>
        <span className="whitespace-nowrap text-[12.5px] font-black tabular-nums text-v2-ink">
          {bar.max ? `${Math.round(bar.value)}/${bar.max}` : Math.round(bar.value)}
        </span>
      </div>
      {pct !== null && (
        <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-v2-tint">
          <div className="h-full rounded-full bg-v2-accent" style={{ width: `${pct}%` }} />
        </div>
      )}
    </div>
  );
}

export default function StreakDotsStrip({ streak, best, days, bars }: StreakDotsStripProps) {
  return (
    <div className="rounded-v2-card bg-white px-3.5 pb-3.5 pt-3.5 shadow-v2-card">
      <div className="flex items-center gap-2.5">
        <span
          className="grid h-10 w-10 shrink-0 place-items-center rounded-[13px]"
          style={{ background: ORANGE, boxShadow: '0 8px 16px -8px rgba(249,115,22,0.8)' }}
        >
          <Flame size={21} strokeWidth={2.3} color="#fff" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-1.5">
            <span className="text-[26px] font-black leading-none tabular-nums tracking-[-0.03em] text-v2-ink">{streak}</span>
            <span className="whitespace-nowrap text-[14px] font-black text-v2-ink">אימונים ברצף</span>
          </div>
          <div className="mt-0.5 truncate text-[12px] font-bold text-v2-muted">להבה בכל יום אימון</div>
        </div>
        {!!best && best > 0 && (
          <span className="inline-flex h-[26px] shrink-0 items-center gap-1 whitespace-nowrap rounded-full bg-[#fff7ed] px-2.5 text-[11.5px] font-extrabold text-[#c2410c]">
            <Trophy size={12} strokeWidth={2.6} color="#ea580c" aria-hidden />
            השיא: {best}
          </span>
        )}
      </div>

      {days.length === 7 && (
        <div className="mt-3 flex" role="list" aria-label="השבוע">
          {days.map((d, i) => (
            <div key={d.date} role="listitem" className="relative flex flex-1 flex-col items-center gap-1">
              {i > 0 && <Connector side="start" on={days[i - 1].chainToNext} />}
              {i < 6 && <Connector side="end" on={d.chainToNext} />}
              <Dot day={d} />
              <span
                className={`whitespace-nowrap text-[11px] font-bold ${d.isToday ? 'font-black text-[#ea580c]' : 'text-v2-muted'}`}
              >
                {d.isToday ? 'היום' : d.label}
              </span>
            </div>
          ))}
        </div>
      )}

      {bars && bars.length > 0 && (
        <div className="mt-3 flex gap-4 border-t border-v2-hairline pt-3">
          {bars.map((b) => (
            <WeekBar key={b.label} bar={b} />
          ))}
        </div>
      )}
    </div>
  );
}
