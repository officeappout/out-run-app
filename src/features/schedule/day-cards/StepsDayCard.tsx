/**
 * The daily steps card: a small orange ring instead of a shoe (owner decision C3, board StepsOptions B).
 * A full ring shows a check inside, so the card needs no separate check circle.
 */
import { Check } from 'lucide-react';
import MiniRing from '@/components/ui/v2/MiniRing';
import { STEPS_WALK_COLORS } from '@/components/ui/v2/track-colors';
import type { DayCardSize, StepsCardData } from './types';

export default function StepsDayCard({ card, size = 'row' }: { card: StepsCardData; size?: DayCardSize }) {
  const full = card.pct >= 100;
  const home = size === 'home';
  return (
    <div className={`relative flex items-center gap-2 bg-[#fff8f2] ${home ? 'min-h-[72px] w-[190px] rounded-[18px]' : 'min-h-[48px] w-[132px] rounded-[14px]'} px-2.5 py-1.5 shadow-[0_0_0_1px_rgba(14,27,42,0.06),0_1px_2px_rgba(14,27,42,0.06)]`}>
      <MiniRing pct={card.pct} color={STEPS_WALK_COLORS.fill} size={home ? 34 : 26} stroke={4}>
        {full && <Check size={home ? 15 : 13} strokeWidth={3.2} style={{ color: STEPS_WALK_COLORS.fill }} aria-hidden />}
      </MiniRing>
      <span className="min-w-0 flex-1">
        <span className="block whitespace-nowrap text-[13.5px] font-extrabold leading-[1.2]">{card.goalLabel}</span>
        {card.subtitle && <span className="block whitespace-nowrap text-[11.5px] font-bold text-v2-muted">{card.subtitle}</span>}
      </span>
    </div>
  );
}
