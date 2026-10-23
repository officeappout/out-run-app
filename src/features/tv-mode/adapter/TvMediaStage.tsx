'use client';

import React, { useEffect, useRef, useState } from 'react';
import type { TvMedia } from '../core/types';

/**
 * The exercise picture on the TV: a muted looping clip (public https mp4 from the mirror), its still as the poster /
 * fallback, or a calm backdrop when the host sent nothing. The TV never resolves media itself (no account, no
 * other collections) — whatever fails to load just falls back one step.
 */
export default function TvMediaStage({ media, paused }: { media?: TvMedia; paused: boolean }) {
  const videoUrl = media?.videoUrl;
  const imageUrl = media?.imageUrl;
  const [failedUrl, setFailedUrl] = useState<string | null>(null);
  const ref = useRef<HTMLVideoElement>(null);
  const playable = !!videoUrl && failedUrl !== videoUrl;

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (paused) el.pause();
    else void el.play().catch(() => undefined);
  }, [paused, videoUrl]);

  if (playable) {
    return (
      <video
        key={videoUrl}
        ref={ref}
        src={videoUrl}
        poster={imageUrl}
        className="absolute inset-0 h-full w-full object-contain"
        autoPlay
        muted
        loop
        playsInline
        preload="auto"
        aria-hidden="true"
        tabIndex={-1}
        onError={() => setFailedUrl(videoUrl ?? null)}
      />
    );
  }
  if (imageUrl) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={imageUrl} alt="" aria-hidden="true" className="absolute inset-0 h-full w-full object-contain" />;
  }
  return <div className="absolute inset-0 bg-gradient-to-b from-[#12202b] to-[#05080b]" aria-hidden="true" />;
}
