'use client';

/**
 * "זה נכון?" (ScanEquip board): the user's photo next to the real catalog photo, the name, yes /
 * no. "לא" (or a fairly-sure result) opens 2-3 alternatives as the add-park wizard's pills and
 * "חיפוש בכל המתקנים".
 */
import { Check, Search } from 'lucide-react';
import type { GymEquipment } from '@/features/content/equipment/gym/core/gym-equipment.types';
import { bunnyImg } from '@/lib/bunny-image';
import { useT } from '@/hooks/useT';
import { map } from '@/messages/ns/map';
import ScanEquipmentPill from './ScanEquipmentPill';

export interface ScanConfirmPanelProps {
  photoUrl: string | null;
  equipment: GymEquipment | null;
  alternatives: readonly GymEquipment[];
  open: boolean;
  onYes: () => void;
  onNo: () => void;
  onPick: (equipmentId: string) => void;
  onSearch: () => void;
}

const PRIMARY = 'flex h-12 items-center justify-center gap-2 rounded-full bg-gradient-to-br from-v2-accent to-[#0cf2e3] font-extrabold text-[#04222b] shadow-v2-cta active:scale-[0.98]';
const SECONDARY = 'flex h-12 items-center justify-center rounded-full bg-white px-[18px] font-extrabold text-v2-ink shadow-v2-ring active:scale-[0.98]';

export default function ScanConfirmPanel({ photoUrl, equipment, alternatives, open, onYes, onNo, onPick, onSearch }: ScanConfirmPanelProps) {
  const t = useT(map);
  const catalogPhoto = equipment?.brands?.find((b) => !!b.imageUrl)?.imageUrl;
  return (
    <div className="flex flex-col gap-3">
      <div className="flex gap-2">
        <div className="relative h-[150px] flex-1 overflow-hidden rounded-[20px] bg-v2-ink">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {photoUrl && <img src={photoUrl} alt="" className="h-full w-full object-cover" />}
          <span className="absolute bottom-2 start-2 rounded-full bg-black/55 px-2 py-0.5 text-[11px] font-extrabold text-white">{t('scan.confirm.yourPhoto')}</span>
        </div>
        <div className="relative h-[150px] flex-1 overflow-hidden rounded-[20px] bg-v2-surface">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {catalogPhoto && <img src={bunnyImg(catalogPhoto, 400)} alt="" className="h-full w-full object-cover" />}
          <span className="absolute bottom-2 start-2 rounded-full bg-white/90 px-2 py-0.5 text-[11px] font-extrabold text-v2-ink">{t('scan.confirm.catalog')}</span>
        </div>
      </div>
      <div>
        <p className="text-[13px] font-extrabold text-v2-deep">{t('scan.confirm.recognized')}</p>
        <h2 className="text-[24px] font-black tracking-tight text-v2-ink">{equipment?.name ?? ''}</h2>
      </div>
      <p className="text-[15px] font-black text-v2-ink">{t('scan.confirm.question')}</p>
      <div className="flex gap-2">
        <button type="button" onClick={onYes} className={`${PRIMARY} flex-1 text-[16px]`}>
          <Check size={18} strokeWidth={3} aria-hidden />
          {t('scan.confirm.yes')}
        </button>
        <button type="button" onClick={onNo} aria-expanded={open} className={`${SECONDARY} text-[14.5px]`}>
          {t('scan.confirm.no')}
        </button>
      </div>
      {open && (
        <>
          {alternatives.length > 0 && <p className="text-[13px] font-extrabold text-v2-deep">{t('scan.confirm.maybe')}</p>}
          <div className="flex flex-col gap-2">
            {alternatives.map((eq) => (
              <ScanEquipmentPill key={eq.id} equipment={eq} name={eq.name} onClick={() => onPick(eq.id)} />
            ))}
            <button
              type="button"
              onClick={onSearch}
              className="flex h-12 items-center gap-2 rounded-full px-3.5 text-[13.5px] font-extrabold text-v2-deep ring-1 ring-inset ring-v2-hairline"
            >
              <Search size={16} strokeWidth={2.4} aria-hidden />
              {t('scan.confirm.searchAll')}
            </button>
          </div>
        </>
      )}
    </div>
  );
}

export { PRIMARY as SCAN_PRIMARY_BUTTON, SECONDARY as SCAN_SECONDARY_BUTTON };
