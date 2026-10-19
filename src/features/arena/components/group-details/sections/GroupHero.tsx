'use client';

import type { DragControls } from 'framer-motion';
import { X } from 'lucide-react';
import type { CategoryConfig } from '../utils/group-details-logic';

interface GroupHeroProps {
  v2: boolean;
  name: string;
  coverImage: string | null;
  catConfig: CategoryConfig;
  dragControls: DragControls;
  onClose: () => void;
}

/** Cover image (or category gradient) — also the sheet's drag target + bounding box. */
export default function GroupHero({ v2, name, coverImage, catConfig, dragControls, onClose }: GroupHeroProps) {
  return (
    <div
      className={`relative flex-shrink-0 ${v2 ? 'h-64' : 'h-56'} rounded-t-3xl overflow-hidden cursor-grab active:cursor-grabbing`}
      onPointerDown={(e) => dragControls.start(e)}
      style={{ touchAction: 'none' }}
    >
      {coverImage ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={coverImage} alt={name} className="w-full h-full object-cover" decoding="async" />
      ) : (
        <div className={`w-full h-full bg-gradient-to-br ${catConfig.gradient} flex items-center justify-center`}>
          <span className="text-7xl drop-shadow-md select-none">{catConfig.icon}</span>
        </div>
      )}

      {/* Gradient: image fades into content below */}
      {v2 ? (
        <div
          className="pointer-events-none absolute inset-0"
          style={{ background: 'linear-gradient(to top, #fff 6%, rgba(255,255,255,0.55) 38%, transparent 70%)' }}
        />
      ) : (
        <div className="absolute inset-0 bg-gradient-to-t from-white dark:from-slate-900 via-black/10 to-transparent" />
      )}

      {/* Drag handle — overlaid on image */}
      <div className="absolute top-3 left-1/2 -translate-x-1/2 w-10 h-1 bg-white/60 rounded-full" />

      {/* Close button — ≥44px tap target */}
      <button
        onClick={onClose}
        onPointerDown={(e) => e.stopPropagation()}
        aria-label="סגור מגירה"
        className="absolute top-3 right-3 w-11 h-11 rounded-full bg-black/40 backdrop-blur-md flex items-center justify-center"
      >
        <X size={18} className="text-white" />
      </button>

      {/* Category badge — overlaid bottom-right */}
      <div
        className={
          v2
            ? 'v2-glass-chip absolute bottom-14 right-4 flex h-9 items-center gap-1.5 whitespace-nowrap rounded-full px-3.5 text-[13.5px] font-extrabold text-white'
            : 'absolute bottom-4 right-4 flex items-center gap-1.5 bg-black/50 backdrop-blur-sm text-white text-xs font-bold px-3 py-1.5 rounded-full'
        }
        dir="rtl"
      >
        <span>{catConfig.icon}</span>
        <span>{catConfig.label}</span>
      </div>
    </div>
  );
}
