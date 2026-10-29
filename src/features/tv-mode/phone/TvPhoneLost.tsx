'use client';

import React from 'react';
import { useT } from '@/hooks/useT';
import { wide } from '@/messages/ns/wide';
import { PAGE_BG, PRIMARY_BTN, SECONDARY_BTN } from '../ui/styles';

/** W-16 (phone): the link to the screen is gone; the workout goes on. Retry, or carry on without the screen. */
export default function TvPhoneLost({ onRetry, onPhoneOnly }: { onRetry: () => void; onPhoneOnly: () => void }) {
  const t = useT(wide);
  return (
    <div className={`fixed inset-x-0 bottom-0 z-[101] flex flex-col gap-2.5 rounded-t-[28px] px-4 pb-[max(1.5rem,env(safe-area-inset-bottom))] pt-4 shadow-[0_-12px_40px_-12px_rgba(9,30,50,0.4)] ${PAGE_BG}`} role="alertdialog" aria-label={t('lost.phone.title')}>
      <div className="flex items-center gap-3 rounded-[20px] bg-[#fff7e8] px-4 py-3.5 shadow-[inset_0_0_0_1px_#fde68a]">
        <span className="h-[22px] w-[22px] animate-spin rounded-full border-[3px] border-[#f59e0b] border-t-transparent motion-reduce:animate-none" aria-hidden="true" />
        <span className="min-w-0 flex-1">
          <span className="block text-[15px] font-extrabold leading-snug">{t('lost.phone.title')}</span>
          <span className="block text-[13px] font-semibold leading-snug text-[#475569]">{t('lost.phone.sub')}</span>
        </span>
      </div>
      <button type="button" className={PRIMARY_BTN} onClick={onRetry}>
        {t('lost.phone.retry')}
      </button>
      <button type="button" className={SECONDARY_BTN} onClick={onPhoneOnly}>
        {t('lost.phone.phoneOnly')}
      </button>
    </div>
  );
}
