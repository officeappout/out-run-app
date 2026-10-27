/** A short optional session (core tabata / mobility / recovery): lights the day's flame, never advances a program. */
import { StretchHorizontal } from 'lucide-react';
import CardCheck from './CardCheck';
import type { OptionalCardData } from './types';

export default function OptionalSessionCard({ card }: { card: OptionalCardData }) {
  return (
    <div className="relative flex min-h-[48px] w-[140px] items-center gap-2 rounded-[14px] bg-[#f3fcf8] px-2.5 py-1.5 shadow-[0_0_0_1px_rgba(14,27,42,0.06),0_1px_2px_rgba(14,27,42,0.06)]">
      <CardCheck done={card.done} />
      {card.iconSrc ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={card.iconSrc} alt="" className="h-5 w-5 shrink-0" />
      ) : (
        <StretchHorizontal size={20} strokeWidth={2.2} className="shrink-0 text-[#00a37a]" aria-hidden />
      )}
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[13.5px] font-extrabold leading-[1.2]">{card.title}</span>
        <span className="block whitespace-nowrap text-[11.5px] font-bold text-v2-muted">{card.subtitle}</span>
      </span>
    </div>
  );
}
