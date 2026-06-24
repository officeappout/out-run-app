'use client';

import { useState } from 'react';

interface ParkCardImageProps {
  src?: string;
  fallback: string;
  alt: string;
  eager: boolean;
}

/**
 * Skeleton-loader image used by the "Where to Train" park carousel.
 * Renders a pulsing placeholder while the network image is loading and
 * gracefully falls back to the provided `fallback` URL on error.
 */
export default function ParkCardImage({ src, fallback, alt, eager }: ParkCardImageProps) {
  const [loaded, setLoaded] = useState(false);
  const [errored, setErrored] = useState(false);
  const resolvedSrc = errored ? fallback : (src || fallback);

  return (
    <div className="relative w-full h-[120px] overflow-hidden bg-slate-200 dark:bg-slate-700">
      {!loaded && (
        <div className="absolute inset-0 animate-pulse bg-slate-200 dark:bg-slate-700" />
      )}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={resolvedSrc}
        alt={alt}
        className={`w-full h-full object-cover transition-opacity duration-300 ${loaded ? 'opacity-100' : 'opacity-0'}`}
        loading={eager ? 'eager' : 'lazy'}
        onLoad={() => setLoaded(true)}
        onError={() => { setErrored(true); setLoaded(true); }}
      />
      <div className="absolute bottom-0 left-0 right-0 h-8 bg-gradient-to-t from-white to-transparent pointer-events-none" />
    </div>
  );
}
