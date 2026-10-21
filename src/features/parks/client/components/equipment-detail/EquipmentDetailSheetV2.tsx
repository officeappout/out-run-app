'use client';

/**
 * EquipmentDetailSheetV2 — the enable_home_v2 shell of EquipmentDetailDrawer,
 * on the shared `<Sheet>` (kept out of the drawer, which is already > 600 lines).
 *
 * Mechanics preserved 1:1: portalled to document.body, backdrop z-[200] /
 * panel z-[201] (.cursorrules — it opens from inside ParkDetailSheet z-[100]),
 * whole-panel drag that closes past 140px (distance only, elastic 0.25),
 * max-height 90vh with the body as the single scroll region. Only the chrome
 * is v2: surface, grabber, IconButton close.
 */

import type { ReactNode } from 'react';
import { X } from 'lucide-react';
import Sheet from '@/components/ui/v2/Sheet';
import IconButton from '@/components/ui/v2/IconButton';
import { SHEET_Z } from '@/components/ui/v2/tokens';
import { useT } from '@/hooks/useT';
import { map } from '@/messages/ns/map';

export interface EquipmentDetailSheetV2Props {
  isOpen: boolean;
  onClose: () => void;
  /** Accessible name (the equipment's name once loaded). */
  ariaLabel: string;
  children: ReactNode;
}

export default function EquipmentDetailSheetV2({ isOpen, onClose, ariaLabel, children }: EquipmentDetailSheetV2Props) {
  const t = useT(map);
  return (
    <Sheet
      open={isOpen}
      onClose={onClose}
      zIndex={SHEET_Z.nestedModalPanel}
      backdropZIndex={SHEET_Z.nestedModal}
      backdropClassName="bg-black/50"
      keyboardAware={false}
      className="relative flex max-h-[90vh] flex-col"
      safeArea={false}
      scroll="none"
      transition={{ type: 'spring', stiffness: 320, damping: 32 }}
      dragToDismiss={{ handleOnly: false, distance: 140, velocity: 0, elastic: 0.25 }}
      grabberClassName="flex justify-center pt-2 pb-1 flex-shrink-0"
      ariaLabel={ariaLabel}
    >
      <IconButton aria-label={t('equipment.sheet.close')} tone="white-ring" size={36} className="absolute left-3 top-3 z-30" onClick={onClose}>
        <X className="h-4 w-4" />
      </IconButton>
      <div className="min-h-0 flex-auto overflow-y-auto overscroll-contain">{children}</div>
    </Sheet>
  );
}
