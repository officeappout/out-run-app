'use client';

import React from 'react';
import { useT } from '@/hooks/useT';
import { wide } from '@/messages/ns/wide';
import { buildJoinUrl, formatCodeGroups } from '../core/code';
import { remainingHours } from '../core/expiry';
import QrBlock from '../ui/QrBlock';
import { PAGE_BG } from '../ui/styles';

import { useUiDir } from '@/lib/i18n/useUiDir';
/** W-13: one QR + one code, steps on the start side, "waiting" below. */
export default function TvPairingScreen({ code, origin, expiresAtMs, nowMs }: { code: string; origin: string; expiresAtMs: number; nowMs: number }) {
  const { direction } = useUiDir();
  const t = useT(wide);
  const url = buildJoinUrl(origin, code);
  const host = origin.replace(/^https?:\/\//, '');
  const steps = [t('pair.tv.step1'), t('pair.tv.step2'), t('pair.tv.step3')];
  return (
    <main dir={direction} className={`fixed inset-0 flex items-center justify-between gap-[4vw] px-[6vw] ${PAGE_BG}`}>
      <section className="flex-1">
        <p className="text-[1.6vw] font-extrabold text-[#0284c7]">{t('pair.tv.eyebrow')}</p>
        <h1 className="mt-[1vh] text-[5vw] font-black leading-tight">{t('pair.tv.title')}</h1>
        <ol className="mt-[4vh] flex flex-col gap-[2.4vh]">
          {steps.map((s, i) => (
            <li key={i} className="flex items-center gap-[1.4vw] text-[2.2vw] font-bold">
              <span className="grid h-[4vw] w-[4vw] shrink-0 place-items-center rounded-full bg-[#00baf7] text-[2vw] font-black text-[#04222b]">{i + 1}</span>
              <span>{s}</span>
            </li>
          ))}
        </ol>
        <p className="mt-[4vh] text-[1.7vw] font-bold text-[#475569]">{t('pair.tv.openUrl', { url: `${host}/tv` })}</p>
      </section>
      <section className="flex flex-col items-center gap-[2.4vh] rounded-[2vw] bg-white p-[2.4vw] shadow-[0_0_0_1px_rgba(14,27,42,0.08)]">
        <QrBlock value={url} size="min(26vw, 50vh)" label={t('pair.tv.qrLabel')} />
        <div className="text-center">
          <div className="text-[1.6vw] font-extrabold text-[#475569]">{t('pair.tv.codeLabel')}</div>
          <div dir="ltr" className="text-[5.4vw] font-black leading-none tracking-[0.04em]">{formatCodeGroups(code)}</div>
        </div>
        <div role="status" className="flex items-center gap-[0.8vw] text-[1.8vw] font-extrabold text-[#0284c7]">
          <span className="h-[1.6vw] w-[1.6vw] animate-spin rounded-full border-[0.3vw] border-[#0284c7] border-t-transparent motion-reduce:animate-none" aria-hidden="true" />
          {t('pair.tv.waiting')}
        </div>
        <p className="text-[1.5vw] font-bold text-[#64748b]">{t('pair.tv.valid', { hours: remainingHours(expiresAtMs, nowMs) })}</p>
      </section>
    </main>
  );
}
