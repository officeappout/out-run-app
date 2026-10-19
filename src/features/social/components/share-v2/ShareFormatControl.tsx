'use client';

/** סטורי 9:16 / ריבוע 1:1 — segmented control, selected = tint (SH-4). */
import type { ShareFormat } from '../../share-v2/types';

const OPTIONS: { id: ShareFormat; label: string; ratio: string; icon: string }[] = [
  { id: 'story', label: 'סטורי', ratio: '9:16', icon: 'h-4 w-2.5' },
  { id: 'square', label: 'ריבוע', ratio: '1:1', icon: 'h-3.5 w-3.5' },
];

export default function ShareFormatControl({ value, onChange }: { value: ShareFormat; onChange: (f: ShareFormat) => void }) {
  return (
    <div role="radiogroup" aria-label="גודל" className="flex gap-1 rounded-full bg-white p-1 shadow-v2-ring">
      {OPTIONS.map((o) => {
        const on = o.id === value;
        return (
          <button
            key={o.id}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => onChange(o.id)}
            className={`flex h-10 flex-1 items-center justify-center gap-2 whitespace-nowrap rounded-full text-[14.5px] font-extrabold transition-transform duration-150 ease-v2 active:scale-[0.97] ${
              on ? 'bg-v2-tint text-v2-deep ring-1 ring-inset ring-v2-accent/40' : 'text-v2-ink-2'
            }`}
          >
            <span className={`${o.icon} rounded-[3px] shadow-[inset_0_0_0_2px_currentColor]`} aria-hidden />
            {o.label}
            <span className="text-[12px] font-bold opacity-70" dir="ltr">
              {o.ratio}
            </span>
          </button>
        );
      })}
    </div>
  );
}
