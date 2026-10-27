'use client';

/**
 * RouteWhySheet — "למה קיבלתי את המסלול הזה?" (enable_map_tutorial_v1, board M5, L10). Opened by the route
 * card's "i"; holds the card's description line (moved off the card) and the reasons, then "צפה במסלול".
 */
import { Footprints, MapPin, Dumbbell, CalendarCheck, type LucideIcon } from 'lucide-react';
import { Sheet, IconTile } from '@/components/ui/v2';
import { SHEET_Z } from '@/components/ui/v2/tokens';
import { useT } from '@/hooks/useT';
import { map } from '@/messages/ns/map';
import type { RouteWhy, RouteWhyIcon } from './route-why';

const ICONS: Record<RouteWhyIcon, LucideIcon> = { steps: Footprints, near: MapPin, strength: Dumbbell, plan: CalendarCheck };

export interface RouteWhySheetProps {
  open: boolean;
  /** The card's description line (slot subtitle). */
  description: string | null;
  why: RouteWhy | null;
  onClose: () => void;
  onView: () => void;
}

export default function RouteWhySheet({ open, description, why, onClose, onView }: RouteWhySheetProps) {
  const t = useT(map);
  const title = t('mapTutorial.why.title');
  return (
    <Sheet
      open={open}
      onClose={onClose}
      zIndex={SHEET_Z.aboveOffline}
      backdropZIndex={SHEET_Z.overlay}
      backdropStyle={{ background: 'rgba(14,20,25,0.18)' }}
      surface="rounded-t-[28px] bg-[#f8fafc] shadow-v2-sheet"
      header={null}
      hideClose
      scroll="body"
      ariaLabel={title}
    >
      <div className="flex flex-col gap-3 px-[18px] pb-2 pt-1">
        <h2 className="text-[20px] font-black text-v2-ink">{title}</h2>
        {description && <p className="-mt-1 text-[13px] font-bold text-v2-muted">{description}</p>}
        {why?.rows.map((row) => (
          <div key={row.key} className="flex items-center gap-2.5 rounded-2xl bg-white p-2.5 shadow-v2-ring">
            <IconTile icon={ICONS[row.icon]} tone="accent" size="sm" />
            <span className="text-[14px] leading-5 text-v2-ink">{t(row.key, row.values)}</span>
          </div>
        ))}
        {why?.reason && (
          <div className="flex items-center gap-2.5 rounded-2xl bg-white p-2.5 shadow-v2-ring">
            <IconTile icon={ICONS.plan} tone="accent" size="sm" />
            <span className="text-[14px] leading-5 text-v2-ink">{why.reason}</span>
          </div>
        )}
        <button
          type="button"
          onClick={onView}
          className="mt-1 flex h-12 w-full items-center justify-center rounded-full bg-v2-cta text-[16px] font-extrabold text-v2-on-cta shadow-v2-cta transition-transform duration-150 ease-v2 active:scale-[0.97]"
        >
          {t('mapTutorial.why.cta')}
        </button>
      </div>
    </Sheet>
  );
}
