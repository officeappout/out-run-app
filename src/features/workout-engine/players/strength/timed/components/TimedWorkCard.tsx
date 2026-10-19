'use client';

/**
 * TimedWorkCard — the card of an AMRAP item / EMOM minute / run inside a
 * round (boards A-2b, A-4b, A-4d, A-5c, U-E3): eyebrow, the minute ring
 * (EMOM), the big target, the name, a hint, the ONE gradient CTA "סיימתי"
 * and the next item.
 */
import React from 'react';
import { Check } from 'lucide-react';
import { Button } from '@/components/ui/v2';
import type { TimedItem } from '@/features/workout-engine/engines/timed/timed.types';
import { itemTarget } from '../logic/timed-labels';
import TimedCardShell from './TimedCardShell';
import TimedNextRow from './TimedNextRow';

export interface TimedWorkCardProps {
  eyebrow: string;
  warn: boolean;
  item: TimedItem;
  next: TimedItem | null;
  nextCaption: string;
  hint: string | null;
  /** EMOM: time left in the minute + elapsed fraction. */
  minute?: { clock: string; fraction: number } | null;
  /** Run item: metres covered so far. */
  runDistanceM?: number;
  onDone: () => void;
}

function MinuteRing({ clock, fraction, warn }: { clock: string; fraction: number; warn: boolean }) {
  const r = 26;
  const c = 2 * Math.PI * r;
  const color = warn ? '#ea580c' : '#00baf7';
  return (
    <div className="mb-1 flex items-center justify-center gap-3">
      <svg width="64" height="64" viewBox="0 0 64 64" aria-hidden>
        <circle cx="32" cy="32" r={r} fill="none" stroke="rgba(14,27,42,0.10)" strokeWidth="6" />
        <circle
          cx="32"
          cy="32"
          r={r}
          fill="none"
          stroke={color}
          strokeWidth="6"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * Math.max(0, Math.min(1, fraction))}
          transform="rotate(-90 32 32)"
          style={{ transition: 'stroke-dashoffset 0.25s linear' }}
        />
      </svg>
      <div className="flex flex-col leading-none">
        <span className={`text-[28px] font-black tabular-nums ${warn ? 'text-[#ea580c]' : 'text-v2-ink'}`}>{clock}</span>
        <span className="mt-1 whitespace-nowrap text-[12px] font-bold text-v2-muted">נותרו בדקה</span>
      </div>
    </div>
  );
}

export default function TimedWorkCard({ eyebrow, warn, item, next, nextCaption, hint, minute, runDistanceM = 0, onDone }: TimedWorkCardProps) {
  const isRun = item.kind === 'aerobic_leg';
  const target = itemTarget(item);
  const left = isRun && item.distanceM ? Math.max(0, Math.round(item.distanceM - runDistanceM)) : null;
  return (
    <TimedCardShell eyebrow={eyebrow} warn={warn}>
      {minute && <MinuteRing clock={minute.clock} fraction={minute.fraction} warn={warn} />}
      {left != null ? (
        <div className="mb-0.5 flex items-baseline justify-center gap-2">
          <span className="text-[36px] font-black leading-10 tabular-nums !tracking-[-0.02em] text-v2-ink">{left}</span>
          <span className="whitespace-nowrap text-[13px] font-extrabold text-[#65a30d]">מ׳ נותרו</span>
        </div>
      ) : (
        target && (
          <div className="mb-0.5 flex items-baseline justify-center gap-2">
            <span className="text-[36px] font-black leading-10 tabular-nums !tracking-[-0.02em] text-v2-ink">{target.value}</span>
            <span className={`whitespace-nowrap text-[13px] font-extrabold ${isRun ? 'text-[#65a30d]' : 'text-v2-deep'}`}>{target.unit}</span>
          </div>
        )
      )}
      <p className="mb-1 truncate whitespace-nowrap text-center text-[17px] font-black !tracking-[-0.01em] text-v2-ink">{item.name}</p>
      {hint && (
        <p className={`mb-2 truncate whitespace-nowrap text-center text-[12.5px] font-bold ${warn ? 'text-[#ea580c]' : 'text-v2-muted'}`}>{hint}</p>
      )}
      {isRun && item.distanceM ? (
        <p className="mb-2 truncate whitespace-nowrap text-center text-[12.5px] font-bold text-v2-muted">
          ב-{item.distanceM} מ׳ ה-GPS מעביר אוטומטית לבא
        </p>
      ) : null}
      <Button variant="cta" size="lg" block onClick={onDone} className="mb-2">
        סיימתי
        <Check size={22} strokeWidth={2.75} aria-hidden />
      </Button>
      <TimedNextRow caption={nextCaption} item={next} />
    </TimedCardShell>
  );
}
