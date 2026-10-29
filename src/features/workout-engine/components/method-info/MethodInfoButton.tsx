'use client';

/**
 * MethodInfoButton — the "i" next to a strength block's title and the sheet
 * it opens (enable_method_info_sheet_v1, owner-approved boards Method*):
 * title, one-line lead, the looping demo from the block's own cards, 3 steps,
 * and "יש שאלה? קלי עונה" with 2 chips that open Kelly with the question in
 * the composer (never auto-sent). Without Kelly AI the chips are hidden.
 *
 * Callers render it only when the flag is on and they have a model.
 */

import React, { Suspense, lazy, useState } from 'react';
import { createPortal } from 'react-dom';
import { Sheet, SHEET_Z } from '@/components/ui/v2';
import { useT } from '@/hooks/useT';
import { player } from '@/messages/ns/player';
import { useAiCoachAccess } from '@/features/ai-coach/hooks/useAiCoachAccess';
import type { MethodInfoModel } from '../../core/methods/method-info/method-info.model';
import { methodCopy } from './method-info.copy';
import MethodDemo from './MethodDemo';

// Lazy: the chat tree is heavy and only needed after a chip tap (keeps it out of the preview / player bundles).
const KellyChatOverlay = lazy(() =>
  import('@/features/ai-coach/components/KellyChatLauncher').then((m) => ({ default: m.KellyChatOverlay })),
);

export default function MethodInfoButton({ model }: { model: MethodInfoModel }) {
  const t = useT(player);
  const { canUseAi } = useAiCoachAccess();
  const [open, setOpen] = useState(false);
  const [kellyInput, setKellyInput] = useState<string | null>(null);
  const copy = methodCopy(model, t);

  const ask = (q: string) => {
    setOpen(false);
    setKellyInput(t('methodInfo.kellyContext', { method: copy.title, q }));
  };

  return (
    <>
      <button
        type="button"
        onClick={(e) => {
          // Headers can sit inside a tappable row (accordion); the "i" only opens the sheet.
          e.stopPropagation();
          setOpen(true);
        }}
        aria-label={t('methodInfo.open', { name: copy.title })}
        className="-m-1.5 grid h-8 w-8 shrink-0 place-items-center rounded-full transition-transform duration-150 active:scale-[0.94]"
      >
        <span
          aria-hidden
          className="grid h-5 w-5 place-items-center rounded-full border-[1.5px] border-slate-400 text-[11px] font-bold leading-none text-slate-500"
        >
          i
        </span>
      </button>

      <Sheet
        open={open}
        onClose={() => setOpen(false)}
        title={copy.title}
        ariaLabel={copy.title}
        // Over the preview drawer / the player's own z-[100] layers.
        zIndex={SHEET_Z.aboveOffline}
        footer={
          canUseAi ? (
            <div className="flex flex-col gap-2.5 border-t border-slate-100 pt-3.5">
              <div className="flex items-center gap-2">
                <span
                  aria-hidden
                  className="grid h-7 w-7 place-items-center rounded-full text-[13px] font-bold text-[#04222b]"
                  style={{ background: 'linear-gradient(135deg,#00baf7,#0cf2e3)' }}
                >
                  {t('methodInfo.kellyAvatar')}
                </span>
                <span className="text-[13px] font-bold text-slate-700">{t('methodInfo.askKelly')}</span>
              </div>
              <div className="flex flex-wrap gap-2">
                {copy.chips.map((q) => (
                  <button
                    key={q}
                    type="button"
                    onClick={() => ask(q)}
                    className="h-8 whitespace-nowrap rounded-full border-[1.5px] border-[#cdeefb] bg-white px-3 text-[12px] font-bold text-[#007399] transition-transform duration-150 active:scale-[0.97]"
                  >
                    {q}
                  </button>
                ))}
              </div>
            </div>
          ) : undefined
        }
      >
        <p className="text-[15px] leading-[22px] text-slate-600">{copy.lead}</p>
        <div className="mt-3.5 flex flex-col gap-2 rounded-[20px] bg-slate-50 px-3 py-3.5">
          <span className="text-[11px] font-bold text-slate-500">{t('methodInfo.fromToday')}</span>
          <span className="text-[16px] font-semibold text-slate-900" style={{ fontFamily: 'var(--font-simpler)' }}>
            {model.label}
          </span>
          <MethodDemo model={model} t={t} />
          {copy.tail && <p className="text-center text-[12px] text-slate-500">{copy.tail}</p>}
        </div>
        <ol className="mt-4 flex flex-col gap-2.5 pb-2">
          {copy.steps.map((step, i) => (
            <li key={i} className="flex items-start gap-2.5 text-[14px] leading-5 text-slate-700">
              <span
                aria-hidden
                className="grid h-[22px] w-[22px] shrink-0 place-items-center rounded-full bg-slate-100 text-[12px] font-bold text-slate-900"
              >
                {i + 1}
              </span>
              <span>{step}</span>
            </li>
          ))}
        </ol>
      </Sheet>

      {kellyInput != null &&
        typeof document !== 'undefined' &&
        createPortal(
          // Kelly's own overlay is z-[56]; this zero-size layer lifts it over the drawer / player
          // (budget row z-[101]) without covering anything while the chat is still loading.
          <div className="fixed start-0 top-0" style={{ zIndex: SHEET_Z.aboveOffline }}>
            <Suspense fallback={null}>
              <KellyChatOverlay initialInput={kellyInput} onClose={() => setKellyInput(null)} />
            </Suspense>
          </div>,
          document.body,
        )}
    </>
  );
}
