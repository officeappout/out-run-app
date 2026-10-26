'use client';

import clsx from 'clsx';

export type LevelChipKind = 'easier' | 'harder' | 'mine';

/**
 * Board Slider: bolt chips. easier = green bolt + down arrow, harder = amber bolt + up arrow,
 * the selected card = blue bolt + "הרמה שלי". (The swap modal's level_up / level_down icons carry
 * the opposite colours baked into the SVG, so the board's inline glyphs are used here.)
 */
const TONE: Record<LevelChipKind, { chip: string; bolt: string; arrow: string }> = {
  easier: { chip: 'bg-[#e3f7ec] text-[#0b6b45]', bolt: '#0b6b45', arrow: '#0b6b45' },
  harder: { chip: 'bg-[#fff1db] text-[#8a4b00]', bolt: '#b45f06', arrow: '#8a4b00' },
  mine: { chip: 'bg-white text-v2-deep shadow-v2-ring', bolt: '#0284c7', arrow: '#0284c7' },
};

function Bolt({ color }: { color: string }) {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill={color} aria-hidden>
      <path d="M13 2L4 14h7l-1 8 9-12h-7z" />
    </svg>
  );
}

function Arrow({ up, color }: { up: boolean; color: string }) {
  return (
    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d={up ? 'M12 19V5M6 11l6-6 6 6' : 'M12 5v14M6 13l6 6 6-6'} />
    </svg>
  );
}

export default function LevelChip({ kind, label, className }: { kind: LevelChipKind; label?: string; className?: string }) {
  const tone = TONE[kind];
  return (
    <span
      data-level-chip={kind}
      className={clsx(
        'inline-flex items-center gap-[3px] whitespace-nowrap rounded-full text-[12px]',
        kind === 'mine' ? 'gap-1 px-[9px] py-1 font-black' : 'px-2 py-1 font-extrabold',
        tone.chip,
        className,
      )}
    >
      <Bolt color={tone.bolt} />
      {kind === 'mine' ? label : <Arrow up={kind === 'harder'} color={tone.arrow} />}
    </span>
  );
}
