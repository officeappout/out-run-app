'use client';

import React, { useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { useT } from '@/hooks/useT';
import { wide } from '@/messages/ns/wide';
import { isValidCode, parseJoinInput } from '../core/code';
import { useQrScanner } from '../hooks/useQrScanner';
import { useTvJoin } from '../hooks/useTvJoin';
import { PAGE_BG, PRIMARY_BTN } from '../ui/styles';
import TvCodeInput from './TvCodeInput';
import { useTvPhoneStore } from './phone-store';

/** W-14: scan the code on the screen, or type it. First phone in = host. */
export default function TvConnectScreen() {
  const t = useT(wide);
  const pending = useTvPhoneStore((s) => s.pending);
  const initial = useTvPhoneStore((s) => s.code);
  const closePair = useTvPhoneStore((s) => s.closePair);
  const [code, setCode] = useState(initial ?? '');
  const { state, join } = useTvJoin();
  const joining = state.phase === 'joining';
  const submit = (c: string) => {
    if (isValidCode(c) && !joining) void join(c, pending);
  };
  const submitRef = useRef(submit);
  submitRef.current = submit;

  const scanner = useQrScanner((text) => {
    const c = parseJoinInput(text);
    if (c) {
      scanner.stop();
      setCode(c);
      submitRef.current(c);
    }
  });

  // A code that arrived with the link (/tv?code=…) joins straight away.
  const auto = useRef(false);
  useEffect(() => {
    if (initial && isValidCode(initial) && !auto.current) {
      auto.current = true;
      submitRef.current(initial);
    }
  }, [initial]);

  const errorKey =
    state.phase === 'error'
      ? ({
          'not-found': 'pair.phone.error.notFound',
          expired: 'pair.phone.error.expired',
          ended: 'pair.phone.error.ended',
          offline: 'pair.phone.error.offline',
          unknown: 'pair.phone.error.unknown',
          'need-login': 'pair.phone.error.needLogin',
        } as const)[state.error]
      : null;

  return (
    <div dir="rtl" className={`fixed inset-0 z-[101] flex flex-col overflow-y-auto ${PAGE_BG}`} role="dialog" aria-modal="true" aria-label={t('pair.phone.title')}>
      <div className="flex items-center gap-3 px-4 pt-[max(1rem,env(safe-area-inset-top))]">
        <div className="min-w-0 flex-1">
          <div className="text-[13px] font-extrabold text-[#0284c7]">{t('pair.phone.eyebrow')}</div>
          <div className="text-[26px] font-black leading-tight">{t('pair.phone.title')}</div>
        </div>
        <button type="button" aria-label={t('pair.phone.close')} onClick={closePair} className="grid h-11 w-11 place-items-center rounded-full bg-white shadow-[0_0_0_1px_rgba(14,27,42,0.08)]">
          <X size={18} aria-hidden="true" />
        </button>
      </div>

      <div className="mx-4 mt-[18px]">
        <div className="relative h-[300px] overflow-hidden rounded-[28px] bg-gradient-to-br from-[#1e293b] to-[#0b1118]">
          <video ref={scanner.videoRef} playsInline muted className={`absolute inset-0 h-full w-full object-cover ${scanner.state === 'scanning' ? '' : 'hidden'}`} />
          <span aria-hidden="true" className="absolute inset-10 rounded-[18px] ring-1 ring-white/25" />
          <div className="absolute inset-x-0 bottom-4 px-6 text-center text-[13.5px] font-extrabold text-white">
            {scanner.state === 'denied'
              ? t('pair.phone.cameraDenied')
              : scanner.state === 'unsupported'
                ? t('pair.phone.cameraUnsupported')
                : t('pair.phone.scan')}
          </div>
          {scanner.state !== 'scanning' && scanner.state !== 'starting' && (
            <button type="button" onClick={() => void scanner.start()} className="absolute inset-x-0 top-1/2 mx-auto -translate-y-1/2 rounded-full bg-white/95 px-5 py-3 text-[14px] font-extrabold text-[#0e1419] w-fit">
              {t('pair.phone.scanStart')}
            </button>
          )}
        </div>
      </div>

      <div className="mx-6 mt-[18px] flex items-center gap-3">
        <span className="h-px flex-1 bg-[#dbe7ee]" />
        <span className="text-[13px] font-extrabold text-[#64748b]">{t('pair.phone.or')}</span>
        <span className="h-px flex-1 bg-[#dbe7ee]" />
      </div>

      <div className="mx-4 mt-[14px]">
        <TvCodeInput value={code} onChange={setCode} label={t('pair.phone.codeLabel')} invalid={state.phase === 'error'} />
        {errorKey && (
          <p role="alert" className="mt-3 text-center text-[13.5px] font-bold text-[#b91c1c]">
            {t(errorKey)}
          </p>
        )}
      </div>

      <div className="mt-auto px-4 pb-[max(2rem,env(safe-area-inset-bottom))] pt-3">
        <button type="button" className={PRIMARY_BTN} disabled={!isValidCode(code) || joining} onClick={() => submit(code)}>
          {joining ? t('pair.phone.connecting') : t('pair.phone.cta')}
        </button>
        <p className="mt-2.5 text-center text-[13px] font-bold text-[#64748b]">{t('pair.phone.note')}</p>
      </div>
    </div>
  );
}
