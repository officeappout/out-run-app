'use client';

/**
 * SessionListLayer — the frame of the v2 session list (the layer BEHIND the
 * player, boards U-C2 / F-1e): "מהלך האימון" + subtitle + a back-to-player
 * button, the caller's rows, and an optional "עד עכשיו" totals card.
 * Not a sheet — it fills the screen; the mini-player sits over its bottom.
 */

import React from 'react';
import { ChevronUp } from 'lucide-react';

export interface SessionListLayerProps {
  /** Default "מהלך האימון". */
  title?: string;
  subtitle?: string;
  onClose: () => void;
  /** "18:04 · 3.4 ק״מ · 5:21 ממוצע" — rendered LTR in the totals card. */
  totals?: string | null;
  children: React.ReactNode;
  /** Pad for the status bar (off when the host already does, e.g. TwoLayerShell). Default true. */
  safeTop?: boolean;
}

export default function SessionListLayer({ title = 'מהלך האימון', subtitle, onClose, totals, children, safeTop = true }: SessionListLayerProps) {
  return (
    <div
      className="h-full overflow-y-auto bg-v2-surface px-4 pb-32"
      dir="rtl"
      style={{ paddingTop: safeTop ? 'calc(env(safe-area-inset-top, 0px) + 16px)' : 16, fontFamily: 'var(--font-simpler)' }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="truncate whitespace-nowrap text-[22px] font-black !tracking-[-0.02em] text-v2-ink">{title}</h2>
          {subtitle && <p className="truncate whitespace-nowrap text-[13px] font-bold text-v2-muted">{subtitle}</p>}
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="חזרה לנגן"
          className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-white shadow-v2-ring active:scale-[0.97] transition-transform duration-150 ease-v2"
        >
          <ChevronUp size={20} strokeWidth={2.4} className="text-v2-ink" aria-hidden />
        </button>
      </div>

      {children}

      {totals && (
        <div className="mt-4 flex items-center justify-between gap-3 rounded-[20px] bg-white px-4 py-3 shadow-v2-ring">
          <span className="whitespace-nowrap text-[14px] font-black text-v2-ink">עד עכשיו</span>
          <span dir="ltr" className="truncate whitespace-nowrap text-[13.5px] font-extrabold tabular-nums text-v2-ink-2">
            {totals}
          </span>
        </div>
      )}
    </div>
  );
}
