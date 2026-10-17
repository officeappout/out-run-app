'use client';

/**
 * DoneTodayCard — home v2 (design lab, 17.10.2026). Shown on /home once
 * today's workout is done, in place of the "הפעילות שלי היום" strip: what the
 * user did today (one row per real workout doc, tap → its summary), total
 * minutes, XP when the docs recorded it, the streak, and the next planned
 * training day from the user's schedule. Real data only — anything missing
 * is simply left out. Renders nothing without enable_home_v2.
 */

import React from 'react';
import { Activity, Bike, CalendarDays, Check, ChevronLeft, Dumbbell, Flame, Footprints, HeartPulse, Zap } from 'lucide-react';
import { useHomeV2 } from '@/features/home/context/HomeV2Context';
import type { TodayActivityCardData } from './TodayActivityCard';

export interface DoneTodayCardProps {
  /** Same list the classic strip renders (real workout docs + a met step goal). */
  cards: TodayActivityCardData[];
  totalMinutes: number;
  /** 0 → the XP tile is hidden. */
  xp: number;
  /** 0 → the streak tile is hidden. */
  streak: number;
  /** e.g. "מחר" / "יום חמישי"; null → no "next" line. */
  nextPlannedLabel: string | null;
  onCardTap?: (card: TodayActivityCardData) => void;
}

const TONE = {
  strength: { fg: '#00baf7', bg: 'rgba(0,186,247,0.12)' },
  cardio: { fg: '#65a30d', bg: 'rgba(132,204,22,0.16)' },
  steps: { fg: '#d97706', bg: 'rgba(245,158,11,0.14)' },
  maintenance: { fg: '#8b5cf6', bg: 'rgba(139,92,246,0.12)' },
} as const;

function rowIcon(card: TodayActivityCardData) {
  if (card.category === 'steps' || card.workoutType === 'walking') return Footprints;
  if (card.workoutType === 'cycling') return Bike;
  if (card.workoutType === 'hybrid') return Zap;
  if (card.category === 'cardio') return Activity;
  if (card.category === 'maintenance') return HeartPulse;
  return Dumbbell;
}

function rowMeta(card: TodayActivityCardData): string | null {
  if (card.category === 'steps') {
    return typeof card.stepsAchieved === 'number' ? `${card.stepsAchieved.toLocaleString('he-IL')} צעדים` : null;
  }
  return card.minutes > 0 ? `${card.minutes} דק׳` : null;
}

function StatTile({ value, label, icon }: { value: string; label: string; icon?: React.ReactNode }) {
  return (
    <div className="flex min-w-0 flex-1 flex-col items-center justify-center rounded-v2-tile bg-v2-surface px-2 py-2.5">
      <span className="flex items-center gap-1 whitespace-nowrap text-[18px] font-black tabular-nums leading-none text-v2-ink">
        {icon}
        {value}
      </span>
      <span className="mt-1 whitespace-nowrap text-[12px] font-bold text-v2-muted">{label}</span>
    </div>
  );
}

export default function DoneTodayCard({
  cards,
  totalMinutes,
  xp,
  streak,
  nextPlannedLabel,
  onCardTap,
}: DoneTodayCardProps) {
  const v2 = useHomeV2();
  if (!v2 || cards.length === 0) return null;

  return (
    <section dir="rtl" className="rounded-v2-card bg-white p-4 shadow-v2-card" aria-label="סיכום היום">
      {/* Header */}
      <div className="flex items-center gap-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-v2-tint text-v2-deep" aria-hidden>
          <Check size={20} strokeWidth={3} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="whitespace-nowrap text-[13px] font-extrabold text-v2-deep">היום</p>
          <h3 className="truncate text-[17px] font-black !tracking-[-0.02em] text-v2-ink">סיימת את האימון של היום</h3>
        </div>
      </div>

      {/* What you did */}
      <ul className="mt-3 space-y-1.5">
        {cards.map((card) => {
          const Icon = rowIcon(card);
          const tone = TONE[card.category] ?? TONE.strength;
          const meta = rowMeta(card);
          const tappable = !!onCardTap && card.category !== 'steps';
          const inner = (
            <>
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full" style={{ background: tone.bg, color: tone.fg }} aria-hidden>
                <Icon size={18} strokeWidth={2.4} />
              </span>
              <span className="min-w-0 flex-1 truncate text-start text-[14px] font-bold text-v2-ink">{card.title}</span>
              {meta && <span className="shrink-0 whitespace-nowrap text-[13px] font-bold tabular-nums text-v2-ink-2">{meta}</span>}
              {tappable && <ChevronLeft size={16} className="shrink-0 text-v2-muted" aria-hidden />}
            </>
          );
          return (
            <li key={card.key}>
              {tappable ? (
                <button
                  type="button"
                  onClick={() => onCardTap!(card)}
                  className="flex w-full items-center gap-3 rounded-[14px] px-1 py-1 transition-transform duration-150 ease-v2 active:scale-[0.97]"
                >
                  {inner}
                </button>
              ) : (
                <div className="flex w-full items-center gap-3 px-1 py-1">{inner}</div>
              )}
            </li>
          );
        })}
      </ul>

      {/* Numbers */}
      {(totalMinutes > 0 || xp > 0 || streak > 0) && (
        <div className="mt-3 flex gap-2">
          {totalMinutes > 0 && <StatTile value={String(totalMinutes)} label="דקות היום" />}
          {xp > 0 && <StatTile value={`+${xp}`} label="XP" />}
          {streak > 0 && (
            <StatTile
              value={String(streak)}
              label={streak === 1 ? 'יום ברצף' : 'ימים ברצף'}
              icon={<Flame size={16} className="text-v2-amber" aria-hidden />}
            />
          )}
        </div>
      )}

      {/* Next planned */}
      {nextPlannedLabel && (
        <div className="mt-3 flex items-center gap-2 border-t border-v2-hairline pt-3 text-[13px] font-bold text-v2-ink-2">
          <CalendarDays size={16} className="shrink-0 text-v2-deep" aria-hidden />
          <span className="whitespace-nowrap">האימון הבא בתוכנית:</span>
          <span className="truncate font-extrabold text-v2-ink">{nextPlannedLabel}</span>
        </div>
      )}
    </section>
  );
}
