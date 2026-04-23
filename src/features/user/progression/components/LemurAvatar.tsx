'use client';

import React, { useState } from 'react';
import { Award } from 'lucide-react';

/**
 * Set to true once PNG files are uploaded to /public/assets/lemur/level{1-10}.png.
 * While false the component renders the Award icon fallback immediately,
 * making ZERO network requests and eliminating the 404 console noise.
 */
const LEMUR_ASSETS_AVAILABLE = false;

interface LemurAvatarProps {
  level: number; // 1-10 (clamped automatically)
  state?: 'idle' | 'active' | 'walking' | 'working'; // reserved for future animation
  size?: 'small' | 'medium' | 'large';
  className?: string;
}

const SIZE_PX: Record<NonNullable<LemurAvatarProps['size']>, number> = {
  small: 32,
  medium: 48,
  large: 64,
};

const SIZE_CLASSES: Record<NonNullable<LemurAvatarProps['size']>, string> = {
  small: 'w-8 h-8',
  medium: 'w-12 h-12',
  large: 'w-16 h-16',
};

const TEXT_CLASSES: Record<NonNullable<LemurAvatarProps['size']>, string> = {
  small: 'text-[10px]',
  medium: 'text-sm',
  large: 'text-xl',
};

/**
 * LemurAvatar
 *
 * Renders the lemur character for a given level (1-10).
 * Images live at /public/assets/lemur/level{n}.png.
 *
 * If the image is missing or fails to load, falls back to a styled gradient
 * circle with the level number — no broken-image icon, no console 404.
 *
 * Uses a plain <img> (not next/image) so onError fires reliably for missing
 * local assets without Next.js image optimization interfering.
 */
export default function LemurAvatar({
  level,
  size = 'medium',
  className = '',
}: LemurAvatarProps) {
  const clampedLevel = Math.max(1, Math.min(Math.round(level), 10));
  // When assets are not available, skip the network request immediately.
  const [imgFailed, setImgFailed] = useState(!LEMUR_ASSETS_AVAILABLE);

  const sizeClass = SIZE_CLASSES[size];
  const textClass = TEXT_CLASSES[size];
  const px = SIZE_PX[size];

  return (
    <div className={`relative flex-shrink-0 ${sizeClass} ${className}`}>
      {imgFailed ? (
        /* Fallback: Award icon — no 404 noise, no number clutter */
        <div className={`${sizeClass} rounded-full bg-gradient-to-br from-[#00ADEF] to-cyan-600 flex items-center justify-center border-2 border-white shadow-lg`}>
          <Award className={`text-white ${size === 'small' ? 'w-4 h-4' : size === 'medium' ? 'w-6 h-6' : 'w-9 h-9'}`} />
        </div>
      ) : (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={`/assets/lemur/level${clampedLevel}.png`}
          alt={`Lemur Level ${clampedLevel}`}
          width={px}
          height={px}
          className="rounded-full object-cover border-2 border-white shadow-lg w-full h-full"
          onError={() => setImgFailed(true)}
        />
      )}

      {/* Level badge (hidden at small size) */}
      {size !== 'small' && (
        <div className="absolute -bottom-1 -right-1 bg-yellow-400 rounded-full w-5 h-5 border-2 border-white flex items-center justify-center shadow-md z-20">
          <span className="text-[8px] font-black text-yellow-900">{clampedLevel}</span>
        </div>
      )}
    </div>
  );
}

/**
 * EmptyStateLemur — shown when no parks/results are found.
 */
export function EmptyStateLemur({ message }: { message?: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      <div className="relative w-24 h-24 mb-4">
        <LemurAvatar level={1} size="large" className="opacity-50" />
      </div>
      {message && (
        <p className="text-slate-600 font-medium font-simpler text-sm mt-2" dir="rtl">
          {message}
        </p>
      )}
    </div>
  );
}
