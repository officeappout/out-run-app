'use client';

import { useId, type ComponentType } from 'react';
import { Dumbbell, TrendingUp, type LucideProps } from 'lucide-react';
import { formatGain, type ProgramRingModel } from './summary';

/**
 * "התקדמות בתוכניות שלי" — the program-level ring (brand gradient = % inside
 * the level) with today's gain drawn as a green segment after it. One
 * program = one row; two (hybrid) = two cells. Shown only with real
 * progression data — the caller hides it otherwise.
 */

export interface ProgramProgressItem {
  key: string;
  name: string;
  icon?: ComponentType<LucideProps>;
  /** "רמה 5/25". */
  levelLabel: string;
  /** "עוד 20% לרמה 6". */
  nextLabel?: string | null;
  ring: ProgramRingModel;
  /** Today's gain in % (for the "+3.2%" under the number). */
  gain: number;
}

const SIZE = 88;
const STROKE = 9;

function Ring({ ring, gain, size = SIZE }: { ring: ProgramRingModel; gain: number; size?: number }) {
  const gid = useId().replace(/:/g, '');
  const r = size / 2 - STROKE / 2;
  const c = 2 * Math.PI * r;
  const base = (c * ring.basePercent) / 100;
  const add = (c * ring.gainPercent) / 100;
  const gainText = formatGain(gain);
  const cx = size / 2;
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden>
        <defs>
          <linearGradient id={`pp-${gid}`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#00baf7" />
            <stop offset="100%" stopColor="#0cf2e3" />
          </linearGradient>
        </defs>
        <circle cx={cx} cy={cx} r={r} fill="none" stroke="#eef8fc" strokeWidth={STROKE} />
        {base > 0 && (
          <circle
            cx={cx}
            cy={cx}
            r={r}
            fill="none"
            stroke={`url(#pp-${gid})`}
            strokeWidth={STROKE}
            strokeLinecap="round"
            strokeDasharray={`${base} ${c}`}
            transform={`rotate(-90 ${cx} ${cx})`}
          />
        )}
        {add > 0 && (
          <circle
            cx={cx}
            cy={cx}
            r={r}
            fill="none"
            stroke="#10b981"
            strokeWidth={STROKE}
            strokeLinecap="round"
            strokeDasharray={`${add} ${c}`}
            strokeDashoffset={-base}
            transform={`rotate(-90 ${cx} ${cx})`}
          />
        )}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-[20px] font-black leading-none tabular-nums tracking-[-0.03em] text-v2-ink">
          {ring.percent}
          <span className="text-[12px] font-bold text-v2-muted">%</span>
        </span>
        {gainText && (
          <span dir="ltr" className="mt-0.5 text-[11px] font-black text-[#047857]">
            {gainText}
          </span>
        )}
      </div>
    </div>
  );
}

export default function ProgramProgressRing({ items }: { items: ProgramProgressItem[] }) {
  if (items.length === 0) return null;
  const anyGain = items.some((i) => i.ring.gainPercent > 0);
  return (
    <div className="rounded-v2-card bg-white px-3.5 pb-3.5 pt-3 shadow-v2-card">
      <div className="mb-2.5 flex items-center gap-2">
        <span className="grid h-[30px] w-[30px] shrink-0 place-items-center rounded-[10px] bg-v2-tint text-v2-deep">
          <TrendingUp size={16} strokeWidth={2.4} aria-hidden />
        </span>
        <span className="truncate text-[14.5px] font-black text-v2-ink">התקדמות בתוכניות שלי</span>
        <span className="flex-1" />
        {anyGain && (
          <span className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap text-[11.5px] font-extrabold text-v2-muted">
            <span aria-hidden className="h-1 w-2.5 rounded-full bg-v2-up" />
            האימון של היום
          </span>
        )}
      </div>
      {items.length === 1 ? (
        <ProgramRow item={items[0]} />
      ) : (
        <div className="grid grid-cols-2 gap-3">
          {items.map((it) => (
            <div key={it.key} className="flex flex-col items-center gap-2 text-center">
              <Ring ring={it.ring} gain={it.gain} size={76} />
              <div className="min-w-0 max-w-full">
                <div className="truncate text-[13px] font-extrabold text-v2-ink-2">{it.name}</div>
                <div className="whitespace-nowrap text-[15px] font-black text-v2-ink">{it.levelLabel}</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ProgramRow({ item }: { item: ProgramProgressItem }) {
  const Icon = item.icon ?? Dumbbell;
  return (
    <div className="flex items-center gap-3.5">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5 text-[13.5px] font-extrabold text-v2-ink-2">
          <Icon size={15} strokeWidth={2.3} className="shrink-0 text-v2-deep" aria-hidden />
          <span className="truncate">{item.name}</span>
        </div>
        <div className="mt-1.5 whitespace-nowrap text-[22px] font-black !tracking-[-0.02em] text-v2-ink">{item.levelLabel}</div>
        {item.nextLabel && (
          <div className="mt-0.5 whitespace-nowrap text-[12.5px] font-bold text-v2-muted">{item.nextLabel}</div>
        )}
      </div>
      <Ring ring={item.ring} gain={item.gain} />
    </div>
  );
}
