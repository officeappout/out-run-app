'use client';

/**
 * Kelly round 4 — the walk / run card under a Kelly reply. The same frame, glass tag, fade and
 * CTA pill as the workout card (AiCoachWorkoutCard); the hero is the brand gradient with a
 * run / walk glyph. A tap opens it on the map (round4-actions.ts openAerobicCard).
 */
import React from 'react';
import { Footprints, MapPin, Play } from 'lucide-react';
import type { AerobicCardView } from '@/lib/ai/coach/round4/types';
import { BRAND_CTA_FILL_CLASS } from '@/components/ui/BrandCtaButton';
import { BRAND_GRADIENT, CARD_FADE, CTA_SHADOW, GlassTag, frameStyle } from '../AiCoachWorkoutCard';
import { aerobicCardFace } from '../../services/aerobic-card-view.pure';
import { useT } from '@/hooks/useT';
import { coach } from '@/messages/ns/coach';

export default function KellyAerobicCard({ card, onOpen }: { card: AerobicCardView; onOpen: (card: AerobicCardView) => void }) {
  const t = useT(coach);
  const face = aerobicCardFace(card, t);
  return (
    <button
      type="button"
      data-ai-card="aerobic"
      onClick={() => onOpen(card)}
      aria-label={face.ariaLabel}
      className="relative block overflow-hidden bg-white text-right transition-transform duration-150 [transition-timing-function:cubic-bezier(0.23,1,0.32,1)] active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-v2-accent focus-visible:ring-offset-2"
      style={frameStyle}
      dir="rtl"
    >
      <span className="absolute inset-x-0 top-0 grid h-[62%] place-items-center" style={{ background: BRAND_GRADIENT }} aria-hidden>
        <Footprints className="mb-6 h-10 w-10 text-white/85" />
      </span>
      <span className="pointer-events-none absolute inset-0 z-[5]" style={{ background: CARD_FADE }} aria-hidden />
      <GlassTag />
      <span className="absolute inset-x-0 bottom-0 z-10 flex flex-col gap-1.5 px-3 pb-3">
        <span className="flex items-center gap-1.5">
          {face.chips.map((c) => (
            <span key={c.key} data-chip={c.key} className="inline-flex h-[22px] items-center gap-1 whitespace-nowrap rounded-full bg-v2-tint px-2 text-[11px] font-bold text-v2-deep">
              {c.key === 'route' && <MapPin className="h-3 w-3" aria-hidden />}
              {c.label}
            </span>
          ))}
        </span>
        <span className="truncate text-[15px] font-black leading-tight text-v2-ink" style={{ letterSpacing: '-0.02em' }}>
          {face.title}
        </span>
        <span className="truncate text-[11.5px] font-semibold text-v2-ink-2">{face.cue}</span>
        <span className={`${BRAND_CTA_FILL_CLASS} pointer-events-none flex h-9 w-full items-center justify-center gap-1.5 text-[13.5px] font-extrabold`} style={{ boxShadow: CTA_SHADOW }}>
          <Play size={13} strokeWidth={2.6} className="fill-current" aria-hidden />
          {face.cta}
        </span>
      </span>
    </button>
  );
}
