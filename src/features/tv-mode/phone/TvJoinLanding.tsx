'use client';

import React, { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useFeatureFlags } from '@/hooks/useFeatureFlags';
import { useT } from '@/hooks/useT';
import { APP_STORE_URLS } from '@/lib/config/app-urls';
import { wide } from '@/messages/ns/wide';
import { formatCodeGroups } from '../core/code';
import { useTvPhoneStore } from './phone-store';
import { PAGE_BG } from '../ui/styles';

function isNativeApp(): boolean {
  const w = window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } };
  return Boolean(w.Capacitor?.isNativePlatform?.());
}

/**
 * /tv?code=… — what the QR on the TV encodes, opened on a PHONE.
 * In the app: open the connect screen with the code filled in (it joins at once) and go home.
 * In a browser: the person has no app yet → download page (W-20, third panel), store links as the shared workout link.
 */
export default function TvJoinLanding({ code }: { code: string | null }) {
  const t = useT(wide);
  const router = useRouter();
  const { flags, loading } = useFeatureFlags();
  const openPair = useTvPhoneStore((s) => s.openPair);

  useEffect(() => {
    if (loading || !flags.enableTvModeV1 || !code) return;
    if (isNativeApp()) {
      openPair(null, code);
      router.replace('/home');
    }
  }, [loading, flags.enableTvModeV1, code, openPair, router]);

  return (
    <main dir="rtl" className={`fixed inset-0 flex flex-col items-center overflow-y-auto px-6 pb-[max(2rem,env(safe-area-inset-bottom))] pt-[max(3.5rem,env(safe-area-inset-top))] text-center ${PAGE_BG}`}>
      <span className="grid h-[84px] w-[84px] place-items-center rounded-[24px] bg-[#0e1419] text-[24px] font-black italic text-white" aria-hidden="true">
        OUT
      </span>
      <p className="mt-[18px] text-[14px] font-extrabold text-[#0284c7]">{t('download.eyebrow')}</p>
      <h1 className="mt-1 text-[26px] font-black leading-tight">{t('download.title')}</h1>
      <p className="mt-2.5 max-w-sm text-[15px] font-semibold leading-snug text-[#475569]">{t('download.body')}</p>
      {code && <p dir="ltr" className="mt-4 rounded-full bg-white px-4 py-2 text-[18px] font-black shadow-[0_0_0_1px_rgba(14,27,42,0.08)]">{formatCodeGroups(code)}</p>}
      <div className="mt-auto flex w-full max-w-sm flex-col gap-2.5 pt-8">
        <a href={APP_STORE_URLS.ios} className="inline-flex min-h-[54px] items-center justify-center rounded-2xl bg-[#0e1419] px-5 text-[15px] font-extrabold text-white focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#00baf7]">
          {t('download.ios')}
        </a>
        <a href={APP_STORE_URLS.android} className="inline-flex min-h-[54px] items-center justify-center rounded-2xl bg-[#0e1419] px-5 text-[15px] font-extrabold text-white focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#00baf7]">
          {t('download.android')}
        </a>
        <p className="text-[13px] font-bold text-[#64748b]">{t('download.installed')}</p>
      </div>
    </main>
  );
}
