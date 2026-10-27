/** The lemur's tip box (boards SchedPersona / SchedDays): lemur on the start side, the tip next to it. */
import type { ReactNode } from 'react';

export const LEMUR_COACH_SRC = '/assets/lemur/lemur-avatar.png';
export const LEMUR_NOTE_SRC = '/assets/lemur/lemur_notepad.png';

export default function LemurNote({ children, size = 40 }: { children: ReactNode; size?: number }) {
  return (
    <div className="flex items-start gap-2.5 rounded-[18px] bg-v2-tint px-3 py-2.5">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={LEMUR_NOTE_SRC} alt="" className="shrink-0 object-contain" style={{ width: size, height: size }} />
      <span className="text-[14px] leading-[21px] text-v2-ink">{children}</span>
    </div>
  );
}
