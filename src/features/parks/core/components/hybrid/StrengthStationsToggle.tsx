'use client';

/**
 * StrengthStationsToggle — additive "תחנות כוח בדרך" toggle for FreeRunDrawer
 * (design §4.1). Turning it on makes the drawer's CTA compose a hybrid session.
 * Presentational only — no engine coupling.
 */

import { Dumbbell } from 'lucide-react';

interface StrengthStationsToggleProps {
  enabled: boolean;
  onToggle: (next: boolean) => void;
  accent?: string;
  /** Home v2 (enable_home_v2) styling. Default false = today's UI. */
  v2?: boolean;
}

export default function StrengthStationsToggle({
  enabled,
  onToggle,
  accent = '#00ADEF',
  v2 = false,
}: StrengthStationsToggleProps) {
  if (v2) {
    return (
      <div className="px-5 mb-3">
        <button
          type="button"
          dir="rtl"
          onClick={() => onToggle(!enabled)}
          aria-pressed={enabled}
          className={`w-full flex items-center justify-between gap-3 rounded-[20px] px-4 py-3 transition-[transform,background-color] duration-150 ease-v2 active:scale-[0.97] ${
            enabled ? 'bg-v2-tint ring-1 ring-inset ring-v2-accent/40' : 'bg-white shadow-v2-ring'
          }`}
        >
          <span className="flex min-w-0 items-center gap-3">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-[12px] bg-v2-tint text-v2-deep">
              <Dumbbell size={18} strokeWidth={2.4} />
            </span>
            <span className="truncate whitespace-nowrap text-[15px] font-extrabold text-v2-ink">תחנות כוח בדרך</span>
          </span>
          <span className="relative inline-flex shrink-0" style={{ width: 42, height: 24 }}>
            <span className={`absolute inset-0 rounded-full transition-colors ${enabled ? 'bg-v2-accent' : 'bg-v2-pill-border'}`} />
            <span
              className="absolute rounded-full bg-white shadow transition-all"
              style={{ width: 20, height: 20, top: 2, left: enabled ? 20 : 2 }}
            />
          </span>
        </button>
      </div>
    );
  }
  return (
    <div className="px-5 mb-3">
      <button
        type="button"
        dir="rtl"
        onClick={() => onToggle(!enabled)}
        aria-pressed={enabled}
        className="w-full flex items-center justify-between rounded-2xl px-4 py-3 active:scale-[0.98] transition-transform"
        style={{
          backgroundColor: enabled ? `${accent}14` : '#F3F4F6',
          border: `1.5px solid ${enabled ? accent : 'transparent'}`,
        }}
      >
        <span className="flex items-center gap-2 text-[13px] font-black text-gray-800">
          <span aria-hidden>💪</span> תחנות כוח בדרך
        </span>
        <span className="relative inline-flex shrink-0" style={{ width: 42, height: 24 }}>
          <span
            className="absolute inset-0 rounded-full transition-colors"
            style={{ backgroundColor: enabled ? accent : '#D1D5DB' }}
          />
          <span
            className="absolute rounded-full bg-white shadow transition-all"
            style={{ width: 20, height: 20, top: 2, left: enabled ? 20 : 2 }}
          />
        </span>
      </button>
    </div>
  );
}
