'use client';

/**
 * Today's planned run in the map's "מה עושים היום?" carousel (enable_home_v2 only —
 * the slot is built by planned-run-slot.ts and only exists with the flag). v2 card:
 * program line, the run's name, the "why" line, and one CTA "הצע לי מסלול" that opens
 * the run overview with route suggestions. Keeps the carousel's anti-ghost-click arming.
 */

import { Footprints, MapPin } from 'lucide-react';
import type { PlannedRunSlot } from '@/features/workout-engine/hybrid/hybrid-slots';

export interface PlannedRunSlotCardProps {
  slot: PlannedRunSlot;
  onArm: () => void;
  /** The carousel's armed check (true → this card's CTA got the pointerdown). */
  onCta: () => void;
}

export default function PlannedRunSlotCard({ slot, onArm, onCta }: PlannedRunSlotCardProps) {
  return (
    <div className="flex h-full w-full flex-col justify-between gap-3 rounded-v2-card bg-white p-4 shadow-v2-card" dir="rtl">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full" style={{ background: `${slot.accent}1f`, color: '#65a30d' }}>
            <Footprints size={18} aria-hidden />
          </span>
          <div className="min-w-0">
            <p className="truncate whitespace-nowrap text-[13px] font-extrabold text-v2-deep">{slot.title}</p>
            <p className="truncate whitespace-nowrap text-[17px] font-black !tracking-[-0.02em] text-v2-ink">{slot.subtitle}</p>
          </div>
        </div>
        {slot.reason && (
          <p className="mt-2 line-clamp-2 text-[12.5px] font-bold text-v2-muted">{slot.reason}</p>
        )}
      </div>
      <button
        type="button"
        onPointerDown={onArm}
        onClick={(e) => { e.stopPropagation(); onCta(); }}
        className="flex h-12 w-full items-center justify-center gap-2 whitespace-nowrap rounded-full bg-v2-cta text-[16px] font-extrabold text-v2-on-cta shadow-v2-cta transition-transform duration-150 ease-v2 active:scale-[0.97]"
      >
        <MapPin size={16} aria-hidden />
        הצע לי מסלול
      </button>
    </div>
  );
}
