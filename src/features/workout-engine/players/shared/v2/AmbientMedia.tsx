'use client';

/**
 * AmbientMedia — the media pane of the wide player. A portrait clip is a narrow
 * 9:16 column; the empty sides get an "ambient" fill: the clip's poster, blurred
 * (CSS only, the poster is already loaded — no extra request). Other/unknown
 * aspects fill the pane. The children keep one place in the tree, so the video
 * never remounts when the column appears.
 */

import React from 'react';

export interface AmbientMediaProps {
  posterUrl?: string | null;
  /** True for a portrait clip → narrow column + ambient fill. */
  column: boolean;
  children: React.ReactNode;
}

export default function AmbientMedia({ posterUrl = null, column, children }: AmbientMediaProps) {
  return (
    <div data-wide-ambient={column ? 'on' : 'off'} className="absolute inset-0 overflow-hidden bg-black">
      {column && posterUrl && (
        <div
          aria-hidden
          data-ambient-fill=""
          className="absolute inset-0"
          style={{ backgroundImage: `url("${posterUrl}")`, backgroundSize: 'cover', backgroundPosition: 'center', filter: 'blur(40px) saturate(1.3) brightness(0.7)', transform: 'scale(1.3)' }}
        />
      )}
      <div
        data-ambient-video=""
        className="relative h-full"
        style={column ? { aspectRatio: '9 / 16', marginInline: 'auto' } : { width: '100%' }}
      >
        {children}
      </div>
    </div>
  );
}
