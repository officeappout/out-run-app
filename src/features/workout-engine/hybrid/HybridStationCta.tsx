'use client';

/**
 * HybridStationCta — the floating aerobic-leg button HybridStationLayer shows:
 * "הגעתי לתחנה" inside the approach window, or "סיים אימון משולב" on the final leg.
 *
 * Visual only (design-v2, same pattern as the guided layer #312): the 📍 / 🏁 emoji
 * prefixes are now lucide icons in a v2 IconTile. Behaviour (which label, which
 * action, the gating) stays in HybridStationLayer — this component only paints.
 */

import { Flag, MapPin } from 'lucide-react';
import { IconTile } from '@/components/ui/v2';

const ACCENT = '#00ADEF';

export interface HybridStationCtaProps {
  isFinalLeg: boolean;
  onClick: () => void;
}

export default function HybridStationCta({ isFinalLeg, onClick }: HybridStationCtaProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      // Approach window → large, thumb-height target (David: "כפתור גדול
      // בגובה אגודל"). Final-leg finish CTA keeps its previous size —
      // out of scope for this change, not a station-approach moment.
      className={
        isFinalLeg
          ? 'pointer-events-auto inline-flex items-center gap-2 rounded-full ps-2 pe-6 py-2 text-white text-[14px] font-black shadow-xl active:scale-95 transition-transform'
          : 'pointer-events-auto inline-flex items-center gap-3 rounded-full ps-4 pe-8 py-4 min-h-[64px] text-white text-[17px] font-black shadow-xl active:scale-95 transition-transform'
      }
      style={{ backgroundColor: isFinalLeg ? '#16A34A' : ACCENT }}
    >
      <IconTile icon={isFinalLeg ? Flag : MapPin} tone="dark" size="sm" />
      {isFinalLeg ? 'סיים אימון משולב' : 'הגעתי לתחנה'}
    </button>
  );
}
