'use client';

/**
 * InfoSheetButton — the shared "i" and the explanation sheet it opens: title, one-line lead, a
 * demo built from the screen's own data, 3 steps, and "יש שאלה? קלי עונה" with 2 chips that
 * open Kelly with the question in the composer (never auto-sent). Without Kelly AI the chips
 * are hidden. Used by the method sheets (enable_method_info_sheet_v1) and the feature sheets
 * (enable_feature_info_sheets_v1); callers render it only when their flag is on.
 *
 * Motion (board IOrigin): the sheet grows out of the "i" (a clip-path circle, ~550ms) while the
 * scrim fades in, closes back into it, and the "i" glows for a moment so users learn they can
 * come back. Reduced motion: a plain fade, no glow.
 *
 * A demo may "peek" the sheet (route + stops): the sheet slides down until only its top shows
 * and the scrim fades out, so the screen behind it is visible, then it comes back up.
 */

import React, { Suspense, lazy, useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { animate, motion, useMotionValue, useReducedMotion } from 'framer-motion';
import { Sheet, SHEET_Z } from '@/components/ui/v2';
import { useT } from '@/hooks/useT';
import { common } from '@/messages/ns/common';
import { useAiCoachAccess } from '@/features/ai-coach/hooks/useAiCoachAccess';
import { INFO_GLOW_MS, INFO_SHEET_EASE, INFO_SHEET_REVEAL_MS, infoSheetReveal, type InfoOriginRect } from './info-sheet-motion';

// Lazy: the chat tree is heavy and only needed after a chip tap (keeps it out of the screens' bundles).
const KellyChatOverlay = lazy(() =>
  import('@/features/ai-coach/components/KellyChatLauncher').then((m) => ({ default: m.KellyChatOverlay })),
);

/** How much of the sheet stays on screen while it peeks (board StopsCard: the header). */
export const INFO_PEEK_VISIBLE_PX = 150;

export interface InfoSheetDemoControls {
  /**
   * true = slide the sheet down to its top and fade the scrim; false = back up. `note` replaces
   * the lead while peeking (it is what stays on screen under the title).
   */
  peek: (on: boolean, note?: ReactNode) => void;
}

export interface InfoSheetButtonProps {
  /** The sheet's title. */
  title: string;
  /** aria-label of the "i". */
  openLabel: string;
  lead: string;
  /** Small label over the demo ("מהאימון שלך היום"). */
  demoLabel: string;
  /** Optional line under the label (the block's own title in the method sheets). */
  demoHeadline?: ReactNode;
  demo: ReactNode | ((ctl: InfoSheetDemoControls) => ReactNode);
  /** Optional centred line under the demo. */
  tail?: string;
  steps: readonly string[];
  chips: readonly string[];
  /** The question as it lands in Kelly's composer. */
  kellyContext: (q: string) => string;
}

export default function InfoSheetButton({
  title, openLabel, lead, demoLabel, demoHeadline, demo, tail, steps, chips, kellyContext,
}: InfoSheetButtonProps) {
  const t = useT(common);
  const { canUseAi } = useAiCoachAccess();
  const reduced = useReducedMotion() === true;
  const [open, setOpen] = useState(false);
  const [origin, setOrigin] = useState<InfoOriginRect | null>(null);
  const [glow, setGlow] = useState(false);
  const [peeked, setPeeked] = useState(false);
  const [peekNote, setPeekNote] = useState<ReactNode>(null);
  const [kellyInput, setKellyInput] = useState<string | null>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const y = useMotionValue(0);

  useEffect(() => {
    if (!glow) return;
    const id = setTimeout(() => setGlow(false), INFO_GLOW_MS + INFO_SHEET_REVEAL_MS);
    return () => clearTimeout(id);
  }, [glow]);

  const close = useCallback(() => {
    setOpen(false);
    setPeeked(false);
    if (!reduced) setGlow(true);
  }, [reduced]);

  const peek = useCallback(
    (on: boolean, note?: ReactNode) => {
      setPeeked(on);
      setPeekNote(on ? note ?? null : null);
      const frame = bodyRef.current?.closest('[data-v2-sheet-modal]');
      const h = frame?.getBoundingClientRect().height ?? 0;
      const to = on ? Math.max(0, h - INFO_PEEK_VISIBLE_PX) : 0;
      animate(y, to, { duration: 0.7, ease: INFO_SHEET_EASE });
    },
    [y],
  );

  const ask = (q: string) => {
    close();
    setKellyInput(kellyContext(q));
  };

  const frameMotion =
    !reduced && origin && typeof window !== 'undefined'
      ? infoSheetReveal(origin, { width: window.innerWidth, height: window.innerHeight })
      : undefined;

  return (
    <>
      <button
        type="button"
        onClick={(e) => {
          // Headers can sit inside a tappable row (accordion); the "i" only opens the sheet.
          e.stopPropagation();
          const r = e.currentTarget.getBoundingClientRect();
          setOrigin({ left: r.left, top: r.top, width: r.width, height: r.height });
          y.set(0);
          setGlow(false);
          setOpen(true);
        }}
        aria-label={openLabel}
        className="-m-1.5 grid h-8 w-8 shrink-0 place-items-center rounded-full transition-transform duration-150 active:scale-[0.94]"
      >
        <motion.span
          aria-hidden
          className="grid h-5 w-5 place-items-center rounded-full border-[1.5px] border-slate-400 text-[11px] font-bold leading-none text-slate-500"
          animate={
            glow
              ? { boxShadow: ['0 0 0 0 rgba(0,186,247,0)', '0 0 0 6px rgba(0,186,247,0.35)', '0 0 0 0 rgba(0,186,247,0)'] }
              : { boxShadow: '0 0 0 0 rgba(0,186,247,0)' }
          }
          transition={glow ? { duration: INFO_GLOW_MS / 1000, delay: INFO_SHEET_REVEAL_MS / 1000, ease: 'easeOut' } : { duration: 0 }}
        >
          i
        </motion.span>
      </button>

      <Sheet
        open={open}
        onClose={close}
        title={title}
        ariaLabel={title}
        // Over the preview drawer / the player's own z-[100] layers / the map's overview drawer.
        zIndex={SHEET_Z.aboveOffline}
        frameMotion={frameMotion}
        respectReducedMotion
        y={y}
        backdropClassName={`transition-colors duration-500 ${peeked ? 'bg-black/0' : 'bg-black/40'}`}
        // The v2 Sheet's body has no side padding of its own (board: 20px).
        bodyClassName="px-5"
        footer={
          canUseAi && chips.length > 0 ? (
            <div className="mx-5 flex flex-col gap-2.5 border-t border-slate-100 pt-3.5">
              <div className="flex items-center gap-2">
                <span
                  aria-hidden
                  className="grid h-7 w-7 place-items-center rounded-full text-[13px] font-bold text-[#04222b]"
                  style={{ background: 'linear-gradient(135deg,#00baf7,#0cf2e3)' }}
                >
                  {t('infoSheet.kellyAvatar')}
                </span>
                <span className="text-[13px] font-bold text-slate-700">{t('infoSheet.askKelly')}</span>
              </div>
              <div className="flex flex-wrap gap-2">
                {chips.map((q) => (
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
        <div ref={bodyRef}>
          {peeked && peekNote != null ? peekNote : <p className="text-[15px] leading-[22px] text-slate-600">{lead}</p>}
          <div className="mt-3.5 flex flex-col gap-2 rounded-[20px] bg-slate-50 px-3 py-3.5">
            <span className="text-[11px] font-bold text-slate-500">{demoLabel}</span>
            {demoHeadline != null && (
              <span className="text-[16px] font-semibold text-slate-900" style={{ fontFamily: 'var(--font-simpler)' }}>
                {demoHeadline}
              </span>
            )}
            {typeof demo === 'function' ? demo({ peek }) : demo}
            {tail && <p className="text-center text-[12px] text-slate-500">{tail}</p>}
          </div>
          <ol className="mt-4 flex flex-col gap-2.5 pb-2">
            {steps.map((step, i) => (
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
        </div>
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
