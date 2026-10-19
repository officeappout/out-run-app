'use client';

import { motion, type MotionValue } from 'framer-motion';
import { X, MapPin } from 'lucide-react';
import { bunnyImg } from '@/lib/bunny-image';
import type { Park } from '@/features/parks/core/types/park.types';
import { FACILITY_LABELS } from '../utils/park-detail-format';

interface ParkHeroProps {
  park: Park;
  v2: boolean;
  onClose: () => void;
  heroHeight: MotionValue<string>;
  imageOpacity: MotionValue<number>;
  imageScale: MotionValue<number>;
  heroControlsPointerEvents: MotionValue<'none' | 'auto'>;
}

/** Scroll-collapsing hero image + close control, then the title block. */
export default function ParkHero({ park, v2, onClose, heroHeight, imageOpacity, imageScale, heroControlsPointerEvents }: ParkHeroProps) {
  return (
    <>
      {/* Hero image — overflow-hidden prevents bleed on overscroll */}
      <motion.div
        className="relative w-full overflow-hidden"
        style={{ height: heroHeight, opacity: imageOpacity, scale: imageScale }}
      >
        {(park.imageUrl || park.image || park.images?.[0]) ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={bunnyImg(park.imageUrl || park.images?.[0] || park.image, 800)}
            alt={park.name}
            className="absolute inset-0 w-full h-full object-cover"
          />
        ) : (
          <div className="absolute inset-0 bg-gradient-to-br from-cyan-100 to-slate-200 dark:from-slate-700 dark:to-slate-800 flex items-center justify-center">
            <MapPin size={48} className="text-slate-300 dark:text-slate-600" />
          </div>
        )}
        <div className="absolute inset-x-0 top-0 h-20 bg-gradient-to-b from-black/25 to-transparent pointer-events-none" />
        <div
          className="absolute bottom-0 inset-x-0 h-[85%] pointer-events-none"
          style={{ background: 'linear-gradient(to top, white 15%, rgba(255,255,255,0.6) 50%, transparent 100%)' }}
        />

        {/* Top controls — fade with hero, pointer-events gated */}
        <motion.div
          className="absolute top-0 left-0 right-0 px-4 pb-4 flex justify-between items-start z-10"
          style={{
            paddingTop: 'calc(env(safe-area-inset-top, 0px) + 0.75rem)',
            opacity: imageOpacity,
            pointerEvents: heroControlsPointerEvents,
          }}
        >
          <button onClick={onClose} className="w-10 h-10 bg-white/20 backdrop-blur-md rounded-full flex items-center justify-center shadow-lg text-white active:scale-90 transition-transform">
            <X size={20} />
          </button>
        </motion.div>
      </motion.div>

      {/* Title + category badge — OUTSIDE the hero so they escape its
          `overflow-hidden` (and its scroll-driven height collapse + scale):
          long Hebrew names wrapping to 2–3 lines were getting their top edge
          clipped. Mirrors WorkoutPreviewDrawer, where the title is the first
          sibling AFTER the hero, with `-mt-14` to overlap the hero gradient. */}
      <div className="relative z-20 -mt-14 px-5 pb-2">
        {park.facilityType && (
          <span
            className={
              v2
                ? 'mb-2 inline-flex rounded-full bg-v2-cta px-3 py-1 text-[12.5px] font-extrabold text-v2-on-cta shadow-v2-cta'
                : 'inline-block mb-2 px-3 py-1 bg-cyan-500/90 backdrop-blur-sm text-white text-[10px] font-black rounded-full shadow-sm'
            }
          >
            {FACILITY_LABELS[park.facilityType] || park.facilityType}
          </span>
        )}
        <h1 className={v2 ? 'whitespace-normal text-[26px] font-black leading-[1.08] !tracking-[-0.02em] text-v2-ink' : 'text-[22px] font-black text-gray-900 dark:text-white leading-tight whitespace-normal'}>
          {park.name}
        </h1>
      </div>
    </>
  );
}
