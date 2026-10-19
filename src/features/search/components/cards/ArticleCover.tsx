'use client';

import { Egg, Leaf, Utensils, Play } from 'lucide-react';
import { BRAND_TILE_BG } from '@/components/ui/v2';
import { buildBunnyThumbnailUrl } from '@/lib/bunny/bunny.config';
import type { ArticleCover as Cover } from '@/lib/content-items/types';

/** The article cover, as on the website: a library clip's still, the running map, or nutrition. */
export default function ArticleCover({ cover, big = false }: { cover: Cover; big?: boolean }) {
  if ('video' in cover) {
    return (
      <span className="absolute inset-0" style={{ background: BRAND_TILE_BG }}>
        <img src={buildBunnyThumbnailUrl(cover.video)} alt="" loading={big ? 'eager' : 'lazy'} className="absolute inset-0 h-full w-full object-cover" />
        <span className="absolute inset-0 grid place-items-center" aria-hidden>
          <Play size={big ? 30 : 20} fill="#ffffff" fillOpacity={0.8} strokeWidth={0} />
        </span>
      </span>
    );
  }
  if (cover.illustration === 'map') {
    return (
      <span className="absolute inset-0" style={{ background: BRAND_TILE_BG }} aria-hidden>
        <svg viewBox="0 0 160 100" className="absolute inset-0 h-full w-full" preserveAspectRatio="none">
          <path d="M10 80 C 40 20, 70 90, 100 40 S 150 30, 150 20" fill="none" stroke="#ffffff" strokeOpacity="0.85" strokeWidth="4" strokeLinecap="round" strokeDasharray="1 9" />
          <circle cx="10" cy="80" r="5" fill="#ffffff" />
          <circle cx="150" cy="20" r="5" fill="#04222b" />
        </svg>
      </span>
    );
  }
  const s = big ? 40 : 24;
  return (
    <span
      className="absolute inset-0 flex items-center justify-center gap-3 text-[#0f766e]"
      style={{ background: 'radial-gradient(60% 70% at 25% 30%, rgba(12,242,227,0.35), transparent 70%), radial-gradient(60% 70% at 80% 70%, rgba(250,204,21,0.35), transparent 70%), #f0fdf9' }}
      aria-hidden
    >
      <Egg size={s} /><Leaf size={s} /><Utensils size={s} />
    </span>
  );
}
