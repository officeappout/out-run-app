'use client';

import React from 'react';
import { useT } from '@/hooks/useT';
import { community } from '@/messages/ns/community';
import { Check, Copy, PartyPopper, Share2 } from 'lucide-react';
import { V2C } from './wizard-v2';
import type { WizardSuccessInfo } from './wizard-types';

/** Post-creation screen: invite code (private groups) + enter-community CTA. */
export function WizardSuccess({
  v2,
  successInfo,
  codeCopied,
  copySuccessCode,
  shareSuccessCode,
  enterCreatedCommunity,
}: {
  v2: boolean;
  successInfo: WizardSuccessInfo;
  codeCopied: boolean;
  copySuccessCode: () => void;
  shareSuccessCode: () => void;
  enterCreatedCommunity: () => void;
}) {
  const t = useT(community);
  // ── v2 look ──────────────────────────────────────────────────────────────
  if (v2) {
    return (
      <div className="flex flex-1 flex-col gap-4 overflow-y-auto px-5 pb-6 pt-2" dir="rtl">
        <div className="flex flex-col items-center gap-3 rounded-v2-card bg-v2-tint px-5 py-6 text-center">
          <span className="grid h-14 w-14 place-items-center rounded-full bg-white text-v2-deep shadow-v2-ring" aria-hidden>
            <PartyPopper size={26} strokeWidth={2.4} />
          </span>
          <p className="max-w-[290px] text-[15px] font-bold leading-relaxed text-v2-ink-2">
            {successInfo.isPrivate
              ? t('createGroup.success.privateMessage')
              : t('createGroup.success.publicMessage')}
          </p>
        </div>

        {successInfo.isPrivate && (
          <div className="space-y-4 rounded-v2-card bg-white p-5 shadow-v2-card">
            <div className="text-center">
              <p className="text-[13px] font-extrabold text-v2-deep">{t('createGroup.success.codeLabel')}</p>
              <div className="select-all py-2 font-mono text-[34px] font-black tracking-[0.3em] text-v2-ink" dir="ltr">
                {successInfo.inviteCode}
              </div>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={copySuccessCode}
                className={`flex h-11 flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-full text-[14px] font-extrabold ${V2C.press} ${codeCopied ? V2C.chipOn : 'bg-white text-v2-ink shadow-v2-ring'}`}
              >
                {codeCopied
                  ? <><Check className="h-4 w-4" strokeWidth={2.8} />{t('createGroup.success.copied')}</>
                  : <><Copy className="h-4 w-4" />{t('createGroup.success.copy')}</>}
              </button>
              <button
                type="button"
                onClick={shareSuccessCode}
                className={`flex h-11 flex-1 items-center justify-center gap-1.5 whitespace-nowrap rounded-full bg-white text-[14px] font-extrabold text-v2-deep shadow-v2-ring ${V2C.press}`}
              >
                <Share2 className="h-4 w-4" />
                {t('createGroup.success.whatsapp')}
              </button>
            </div>
          </div>
        )}

        <button
          type="button"
          onClick={enterCreatedCommunity}
          className="flex h-12 w-full items-center justify-center gap-2 whitespace-nowrap rounded-full bg-v2-cta text-[16px] font-extrabold text-v2-on-cta shadow-v2-cta transition-transform duration-150 ease-v2 active:scale-[0.97]"
        >
          <Check className="h-[18px] w-[18px]" strokeWidth={2.8} />
          {t('createGroup.success.enter')}
        </button>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto px-5 pb-6 flex flex-col gap-5 pt-2" dir="rtl">
      <div className="text-center space-y-1">
        <p className="text-4xl select-none">🎉</p>
        <p className="text-sm text-gray-500 font-semibold">
          {successInfo.isPrivate
            ? t('createGroup.success.privateMessage')
            : t('createGroup.success.publicMessage')}
        </p>
      </div>

      {/* Invite code card — shown for private groups */}
      {successInfo.isPrivate && (
        <div className="bg-gray-50 rounded-2xl border border-gray-100 p-5 space-y-4">
          <div className="text-center">
            <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-2">
              {t('createGroup.success.codeLabel')}
            </p>
            <div className="font-mono text-4xl font-black tracking-[0.3em] text-gray-900 select-all py-2">
              {successInfo.inviteCode}
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex gap-2">
            <button
              onClick={copySuccessCode}
              className="flex-1 flex items-center justify-center gap-1.5 py-3 rounded-xl bg-white border border-gray-200 text-gray-700 text-sm font-black transition-all active:scale-95 shadow-sm"
            >
              {codeCopied
                ? <><Check className="w-4 h-4 text-emerald-500" />{t('createGroup.success.copied')}</>
                : <><Copy className="w-4 h-4" />{t('createGroup.success.copy')}</>}
            </button>
            <button
              onClick={shareSuccessCode}
              className="flex-1 flex items-center justify-center gap-1.5 py-3 rounded-xl bg-emerald-500 text-white text-sm font-black transition-all active:scale-95 shadow-lg shadow-emerald-500/25"
            >
              <Share2 className="w-4 h-4" />
              {t('createGroup.success.whatsapp')}
            </button>
          </div>
        </div>
      )}

      {/* Enter community CTA */}
      <button
        onClick={enterCreatedCommunity}
        className="w-full py-3.5 rounded-2xl bg-gradient-to-r from-cyan-500 to-blue-500 text-white text-sm font-black flex items-center justify-center gap-2 shadow-lg shadow-cyan-500/30 transition-all active:scale-[0.97]"
      >
        <Check className="w-4 h-4" />
        {t('createGroup.success.enter')}
      </button>
    </div>
  );
}
