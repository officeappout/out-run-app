'use client';

/**
 * DoneRow — the v2 "completed workout" row: the same done look the big
 * schedule (RollingAgenda / AgendaDayCard) gives a finished workout — soft
 * surface on a hairline ring, 14px radius, a round check in the completion
 * colour — plus an icon tile, a one-line meta ("35 דק׳ · 5.2 ק״מ") and an
 * optional chevron when it opens something.
 *
 * DONE_SURFACE_STYLE and DoneCheck are the pieces AgendaDayCard's done pills
 * use too, so the two stay one look by construction.
 */

import React from 'react';
import { Check, ChevronLeft } from 'lucide-react';

/** The finished-workout surface (AgendaDayCard v2 + DoneRow). */
export const DONE_SURFACE_STYLE: React.CSSProperties = {
  background: '#f4f8fa',
  boxShadow: 'inset 0 0 0 1px #e6edf2',
  borderRadius: 14,
};

/** The completion green AgendaDayCard uses when it has no category fill. */
export const DONE_GREEN = '#1D9E75';

/** Round check in the completion colour (flat colour or a CSS gradient). */
export function DoneCheck({ color = DONE_GREEN }: { color?: string }) {
  return (
    <span className="grid h-5 w-5 flex-shrink-0 place-items-center rounded-full text-white" style={{ background: color }}>
      <Check className="h-3 w-3" strokeWidth={3.2} aria-label="בוצע" />
    </span>
  );
}

export interface DoneRowProps {
  /** The workout's icon (e.g. getProgramIcon(...)), drawn inside the tile. */
  icon: React.ReactNode;
  /** Tile colours: icon colour + soft tint behind it. */
  tone: { fg: string; bg: string };
  title: string;
  /** One line, e.g. "42 דק׳ · 18 סטים"; null → title only. */
  meta?: string | null;
  /** Check colour; defaults to the completion green. */
  checkColor?: string;
  /** Present → the row is a button with a chevron. */
  onClick?: () => void;
}

export default function DoneRow({ icon, tone, title, meta, checkColor, onClick }: DoneRowProps) {
  const body = (
    <>
      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-[12px]" style={{ background: tone.bg, color: tone.fg }} aria-hidden>
        {icon}
      </span>
      <span className="min-w-0 flex-1 text-start">
        <span className="block truncate text-[14px] font-extrabold leading-tight text-v2-ink">{title}</span>
        {meta && <span className="mt-0.5 block truncate whitespace-nowrap text-[12.5px] font-bold tabular-nums text-v2-muted">{meta}</span>}
      </span>
      <DoneCheck color={checkColor} />
      {onClick && <ChevronLeft size={16} className="shrink-0 text-v2-muted" aria-hidden />}
    </>
  );
  const cls = 'flex min-h-[52px] w-full items-center gap-2.5 px-2.5 py-1.5';
  return onClick ? (
    <button
      type="button"
      dir="rtl"
      onClick={onClick}
      data-v2-done-row
      className={`${cls} transition-transform duration-150 ease-v2 active:scale-[0.97]`}
      style={DONE_SURFACE_STYLE}
    >
      {body}
    </button>
  ) : (
    <div dir="rtl" data-v2-done-row className={cls} style={DONE_SURFACE_STYLE}>
      {body}
    </div>
  );
}
