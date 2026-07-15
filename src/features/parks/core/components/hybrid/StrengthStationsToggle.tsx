'use client';

/**
 * StrengthStationsToggle — additive "תחנות כוח בדרך" toggle for FreeRunDrawer
 * (design §4.1). Turning it on makes the drawer's CTA compose a hybrid session.
 * Presentational only — no engine coupling.
 */

interface StrengthStationsToggleProps {
  enabled: boolean;
  onToggle: (next: boolean) => void;
  accent?: string;
}

export default function StrengthStationsToggle({
  enabled,
  onToggle,
  accent = '#00ADEF',
}: StrengthStationsToggleProps) {
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
