'use client';

/**
 * "צלמו מתקן" under the park's equipment (ScanEquip board, park page), behind
 * enable_equipment_scan_v1. Opens the scan; a recognized item goes to the host, which opens the
 * existing equipment drawer.
 */
import { useState } from 'react';
import { Camera } from 'lucide-react';
import { useT } from '@/hooks/useT';
import { map } from '@/messages/ns/map';
import { useEquipmentScanV1 } from '@/hooks/useEquipmentScanV1';
import EquipmentScanSheet from './EquipmentScanSheet';

export interface ParkScanEntryProps {
  parkId: string;
  onRecognized: (equipmentId: string, brandName?: string) => void;
}

export default function ParkScanEntry({ parkId, onRecognized }: ParkScanEntryProps) {
  const t = useT(map);
  const on = useEquipmentScanV1();
  const [open, setOpen] = useState(false);
  if (!on) return null;
  return (
    <div className="-mt-2 mb-6 flex flex-col items-center gap-1.5">
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex h-12 w-full items-center justify-center gap-2 rounded-full bg-white text-[14px] font-extrabold text-v2-ink shadow-v2-ring active:scale-[0.98]"
      >
        <Camera size={18} strokeWidth={2.4} aria-hidden />
        {t('scan.button')}
      </button>
      <p className="text-center text-[12px] font-bold text-v2-muted">{t('scan.button.hint')}</p>
      <EquipmentScanSheet
        open={open}
        onClose={() => setOpen(false)}
        parkId={parkId}
        onRecognized={(id, brandName) => {
          setOpen(false);
          onRecognized(id, brandName);
        }}
      />
    </div>
  );
}
