'use client';

/**
 * The three cards of the entry flow's step 2 drawer (designs N2 / N2b): the route suggestion,
 * the personal-plan hero and Kelly. Presentational only — the drawer owns the actions.
 */
import { ChevronLeft } from 'lucide-react';
import { hapticLight } from '@/lib/haptics';
import { useT } from '@/hooks/useT';
import { onboarding } from '@/messages/ns/onboarding';
import type { WhatNowRouteCopy } from '../../services/entry-whatnow';

const BRAND_GRADIENT = 'linear-gradient(135deg, #00baf7 0%, #0cf2e3 100%)';
/** Plan hero tile gradient (design N2 / N2b). */
const PLAN_TILE_GRADIENT = 'linear-gradient(160deg, #2CE0C0, #20C6D6 55%, #2AA3E8)';
/** Watercolor personas (the website's characters, resized for a 62px tile). */
const PLAN_PERSONAS = [
  '/images/entry/persona-michal.png',
  '/images/entry/persona-omer.png',
  '/images/entry/persona-ruti.png',
] as const;

export function WhatNowRouteCard({
  copy, mapUrl, onClick,
}: { copy: WhatNowRouteCopy; mapUrl: string | null; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={() => { hapticLight(); onClick(); }}
      className="flex w-full flex-col overflow-hidden rounded-[22px] text-right text-v2-ink shadow-[0_12px_28px_rgba(0,186,247,0.18)] active:scale-[0.99] transition-transform duration-150 ease-v2"
      style={{
        border: '2px solid transparent',
        background: `linear-gradient(#fff,#fff) padding-box, ${BRAND_GRADIENT} border-box`,
      }}
    >
      <div
        className="relative h-24 w-full bg-[#eef6fa]"
        style={mapUrl ? { backgroundImage: `url('${mapUrl}')`, backgroundSize: 'cover', backgroundPosition: 'center 45%' } : undefined}
      >
        {/* Illustrative route line over the mini map (the real route is drawn on the map after the tap). */}
        <svg width="100%" height="96" viewBox="0 0 350 96" preserveAspectRatio="none" className="absolute inset-0" aria-hidden>
          <path d="M30 80 C 80 20, 150 90, 200 40 S 300 20, 320 60" fill="none" stroke="#00a6e6" strokeWidth="5" strokeLinecap="round" />
        </svg>
        <span className="absolute top-2 start-2 flex h-[22px] items-center rounded-full bg-[#04222b] px-2.5 text-[11px] font-bold text-white">
          {copy.tag}
        </span>
      </div>
      <div className="flex flex-col gap-[3px] px-3.5 py-[11px]">
        <span className="text-[16px] font-bold">{copy.title}</span>
        <span className="text-[12.5px] text-v2-muted">{copy.sub}</span>
      </div>
    </button>
  );
}

export function WhatNowPlanCard({ tagged, onClick }: { tagged: boolean; onClick: () => void }) {
  const t = useT(onboarding);
  return (
    <button
      type="button"
      onClick={() => { hapticLight(); onClick(); }}
      className="relative flex w-full flex-col gap-1.5 overflow-hidden rounded-[22px] p-4 text-right text-white shadow-[0_14px_30px_rgba(32,198,214,0.35)] active:scale-[0.99] transition-transform duration-150 ease-v2"
      style={{ background: PLAN_TILE_GRADIENT }}
    >
      <div className="pointer-events-none absolute -bottom-1.5 -left-1.5 flex ps-3.5" aria-hidden>
        {PLAN_PERSONAS.map((src) => (
          // eslint-disable-next-line @next/next/no-img-element -- small static decorative tiles
          <img
            key={src}
            src={src}
            alt=""
            className="-ms-3.5 h-[62px] w-[62px] object-contain"
            style={{ filter: 'drop-shadow(0 4px 8px rgba(0,0,0,.15))' }}
          />
        ))}
      </div>
      {tagged && (
        <span className="self-start flex h-[22px] items-center rounded-full bg-white/25 px-2.5 text-[11px] font-bold">{t('whatNow.plan.tag')}</span>
      )}
      <span className="max-w-[200px] text-[19px] font-bold">{t('whatNow.plan.title')}</span>
      <span className="max-w-[190px] text-[13px] leading-[18px] opacity-95">{t('whatNow.plan.sub')}</span>
      <span className="mt-1 flex h-[30px] items-center gap-1 self-start rounded-full bg-white px-3 text-[12.5px] font-bold text-[#04222b]">
        {t('whatNow.plan.cta')}<ChevronLeft size={14} aria-hidden />
      </span>
    </button>
  );
}

export function WhatNowKellyCard({ onClick }: { onClick: () => void }) {
  const t = useT(onboarding);
  return (
    <button
      type="button"
      onClick={() => { hapticLight(); onClick(); }}
      className="flex w-full items-center gap-3 rounded-[20px] bg-white px-3.5 py-[13px] text-right text-v2-ink shadow-[0_0_0_1px_#eef2f6] active:scale-[0.99] transition-transform duration-150 ease-v2"
    >
      <span
        className="flex h-11 w-11 flex-none items-center justify-center rounded-full text-[18px] font-bold text-[#04222b]"
        style={{ background: BRAND_GRADIENT }}
        aria-hidden
      >
        {t('whatNow.kelly.initial')}
      </span>
      <span className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="text-[15px] font-bold">{t('whatNow.kelly.title')}</span>
        <span className="text-[12.5px] text-v2-muted">{t('whatNow.kelly.sub')}</span>
      </span>
      <ChevronLeft size={16} className="shrink-0 text-[#94a3b8]" aria-hidden />
    </button>
  );
}
