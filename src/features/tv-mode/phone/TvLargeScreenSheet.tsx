'use client';

import React, { useState } from 'react';
import { MonitorUp, Cast } from 'lucide-react';
import Sheet from '@/components/ui/v2/Sheet';
import { SHEET_Z } from '@/components/ui/v2/tokens';
import { useT } from '@/hooks/useT';
import { wide } from '@/messages/ns/wide';
import { TV_PATH } from '../core/constants';
import { SECONDARY_BTN } from '../ui/styles';

/** W-18: choose how to put the workout on a big screen (code / QR is the recommended one). */
export default function TvLargeScreenSheet({ open, onClose, onPickCode }: { open: boolean; onClose: () => void; onPickCode: () => void }) {
  const t = useT(wide);
  const [mirrorHint, setMirrorHint] = useState(false);
  const host = typeof window === 'undefined' ? '' : window.location.host;
  return (
    <Sheet open={open} onClose={onClose} title={t('pair.sheet.title')} closeLabel={t('pair.phone.close')} layout="nested" zIndex={SHEET_Z.aboveOffline}>
      <div dir="rtl" className="flex flex-col gap-3 pb-1">
        <p className="-mt-1 text-[13.5px] font-bold text-[#475569]">{t('pair.sheet.subtitle')}</p>
        <button
          type="button"
          onClick={onPickCode}
          className="flex min-h-[72px] items-center gap-3 rounded-[20px] bg-[#eef8fc] p-4 text-start ring-2 ring-[#00baf7] focus-visible:outline-none focus-visible:ring-4"
        >
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-white text-[#0284c7]"><MonitorUp size={22} aria-hidden="true" /></span>
          <span className="min-w-0 flex-1">
            <span className="flex items-center gap-2 text-[16px] font-black">
              {t('pair.sheet.code.title')}
              <span className="rounded-full bg-[#00baf7] px-2 py-0.5 text-[11px] font-extrabold text-[#04222b]">{t('pair.sheet.code.badge')}</span>
            </span>
            <span className="mt-0.5 block text-[13px] font-semibold leading-snug text-[#475569]">{t('pair.sheet.code.body')}</span>
            {host && <span dir="ltr" className="mt-1 block text-start text-[12.5px] font-bold text-[#0284c7]">{host}{TV_PATH}</span>}
          </span>
        </button>
        <button
          type="button"
          aria-expanded={mirrorHint}
          onClick={() => setMirrorHint((v) => !v)}
          className="flex min-h-[72px] items-center gap-3 rounded-[20px] bg-white p-4 text-start shadow-[0_0_0_1px_rgba(14,27,42,0.08)] focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#00baf7]/60"
        >
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-[#f1f5f9] text-[#475569]"><Cast size={22} aria-hidden="true" /></span>
          <span className="min-w-0 flex-1">
            <span className="block text-[16px] font-black">{t('pair.sheet.mirror.title')}</span>
            <span className="mt-0.5 block text-[13px] font-semibold leading-snug text-[#475569]">{mirrorHint ? t('pair.sheet.mirror.hint') : t('pair.sheet.mirror.body')}</span>
          </span>
        </button>
        <button type="button" className={SECONDARY_BTN} onClick={onClose}>
          {t('pair.sheet.cancel')}
        </button>
      </div>
    </Sheet>
  );
}
