'use client';

import React, { useEffect, useState, useRef, useCallback } from 'react';
import { ArrowRight, Share2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';

const RunMapBlock = dynamic(
  () => import('@/features/workout-engine/summary/components/running/RunMapBlock'),
  { ssr: false }
);

const BOLT_FILTER_CYAN =
  'brightness(0) saturate(100%) invert(68%) sepia(65%) saturate(2000%) hue-rotate(160deg) brightness(102%) contrast(101%)';
const BOLT_FILTER_DARK =
  'brightness(0) saturate(100%) invert(22%) sepia(10%) saturate(750%) hue-rotate(176deg) brightness(95%) contrast(90%)';

const PILL_BORDER = '0.5px solid #E0E9FF';
const DIFFICULTY_LABELS: Record<number, string> = { 1: 'קל', 2: 'בינוני', 3: 'קשה' };

function BoltIcon({ filled }: { filled: boolean }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src="/icons/ui/Bolt.svg"
      alt=""
      width={14}
      height={14}
      style={{ filter: filled ? BOLT_FILTER_CYAN : BOLT_FILTER_DARK }}
    />
  );
}

interface WorkoutPreviewHeaderProps {
  title: string;
  description?: string;
  coverImage?: string;
  routePath?: number[][] | Array<{ lat: number; lng: number }>;
  heroMediaUrl?: string;
  heroVideoUrl?: string;
  categoryIcon?: string;
  difficulty?: number;
  estimatedDuration?: number;
}

/**
 * Lazy video layer — fades in over the thumbnail when ready.
 */
function LazyVideoLayer({ videoUrl }: { videoUrl: string }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [ready, setReady] = useState(false);
  const onCanPlay = useCallback(() => setReady(true), []);

  useEffect(() => setReady(false), [videoUrl]);

  return (
    <video
      ref={videoRef}
      src={videoUrl}
      autoPlay
      loop
      muted
      playsInline
      preload="auto"
      onCanPlayThrough={onCanPlay}
      className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-700 ${
        ready ? 'opacity-100' : 'opacity-0'
      }`}
    />
  );
}

/**
 * WorkoutPreviewHeader — Premium hero section for the workout detail page.
 * Matches Home Screen aesthetic: video/image background + white gradient fade.
 */
export default function WorkoutPreviewHeader({
  title,
  description,
  coverImage,
  routePath,
  heroMediaUrl,
  heroVideoUrl,
  categoryIcon,
  difficulty,
  estimatedDuration,
}: WorkoutPreviewHeaderProps) {
  const router = useRouter();
  const isHybrid = !!routePath && routePath.length > 0;
  const [scrollY, setScrollY] = useState(0);
  const headerRef = useRef<HTMLDivElement>(null);

  // Scroll-aware parallax
  useEffect(() => {
    let scrollContainer: HTMLElement | null = null;
    let el = headerRef.current?.parentElement;
    while (el) {
      if (el.classList.contains('overflow-y-auto')) { scrollContainer = el; break; }
      el = el.parentElement;
    }
    if (!scrollContainer) return;
    const onScroll = () => setScrollY(scrollContainer!.scrollTop);
    scrollContainer.addEventListener('scroll', onScroll, { passive: true });
    return () => scrollContainer?.removeEventListener('scroll', onScroll);
  }, []);

  const maxScroll = 150;
  const scrollProgress = Math.min(scrollY / maxScroll, 1);
  const imageOpacity = Math.max(1 - scrollProgress * 0.5, 0.5);
  const imageScale = Math.max(1 - scrollProgress * 0.1, 0.9);

  const routeCoords: number[][] = isHybrid
    ? (routePath ?? []).map((coord: any) => {
        if (Array.isArray(coord) && coord.length >= 2) return [Number(coord[0]), Number(coord[1])];
        if (coord && typeof coord === 'object' && 'lat' in coord && 'lng' in coord) return [Number(coord.lng), Number(coord.lat)];
        return [0, 0];
      }).filter((c: number[]) => c[0] !== 0 || c[1] !== 0)
    : [];

  // Resolve the actual image to show: heroMediaUrl (from Home) > coverImage > fallback
  const resolvedImage = heroMediaUrl || coverImage || '';

  const diffLabel = difficulty ? DIFFICULTY_LABELS[difficulty] || '' : '';
  const showPills = !!(difficulty || estimatedDuration);

  return (
    <div ref={headerRef} className="relative w-full shrink-0 z-0">
      {/* ── Full-bleed image — edge-to-edge, no padding ──────────────────── */}
      <div className="relative w-full h-[38vh] min-h-[280px] overflow-hidden">
        {isHybrid && routeCoords.length > 1 ? (
          <div
            className="absolute inset-0 transition-opacity duration-300"
            style={{ opacity: imageOpacity, transform: `scale(${imageScale})` }}
          >
            <RunMapBlock
              routeCoords={routeCoords}
              startCoord={routeCoords[0]}
              endCoord={routeCoords[routeCoords.length - 1]}
            />
          </div>
        ) : (
          <div
            className="absolute inset-0 transition-all duration-300"
            style={{ opacity: imageOpacity, transform: `scale(${imageScale})` }}
          >
            {resolvedImage ? (
              <img
                src={resolvedImage}
                alt={title}
                className="absolute inset-0 w-full h-full object-cover"
                onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
              />
            ) : (
              <div className="absolute inset-0 bg-gradient-to-br from-slate-800 via-slate-700 to-slate-900" />
            )}
            {heroVideoUrl && <LazyVideoLayer videoUrl={heroVideoUrl} />}
          </div>
        )}

        <div className="absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-black/30 to-transparent z-[2] pointer-events-none" />
        <div className="absolute bottom-0 inset-x-0 h-[60%] bg-gradient-to-t from-white via-white/90 to-transparent dark:from-gray-950 dark:via-gray-950/90 z-[5] pointer-events-none" />

        <div
          className="absolute top-0 left-0 right-0 px-4 pb-4 flex justify-between items-start z-10"
          // Replaces hardcoded `pt-14`. See WorkoutOverview page for rationale.
          style={{ paddingTop: 'calc(env(safe-area-inset-top, 0px) + 0.75rem)' }}
        >
          <button
            onClick={() => router.back()}
            className="w-10 h-10 bg-white/20 dark:bg-black/40 backdrop-blur-md rounded-full flex items-center justify-center shadow-lg text-white active:scale-90 transition-transform"
            aria-label="חזור"
          >
            <ArrowRight size={20} />
          </button>
          <button
            className="w-10 h-10 bg-white/20 dark:bg-black/40 backdrop-blur-md rounded-full flex items-center justify-center shadow-lg text-white active:scale-90 transition-transform"
            aria-label="שתף"
          >
            <Share2 size={20} />
          </button>
        </div>
      </div>

      {/* ── Title + Pills + Description — overlaps image by 16px ─────────── */}
      <div className="relative z-10 px-6 pb-6" style={{ marginTop: -16 }}>
        {/* Title row */}
        <div className="flex items-center gap-2 mb-3">
          {categoryIcon && (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={categoryIcon} alt="" width={22} height={22} className="flex-shrink-0" style={{ filter: BOLT_FILTER_CYAN }} />
          )}
          <h1 className="text-[20px] font-bold text-gray-900 dark:text-white leading-snug">
            {title}
          </h1>
        </div>

        {/* Metadata pills — RTL order: [Difficulty] [Duration] from right */}
        {showPills && (
          <div className="flex items-center gap-3 flex-wrap" dir="rtl">
            {difficulty != null && (
              <div
                className="flex-shrink-0 flex items-center gap-2 bg-white dark:bg-slate-800/90 shadow-sm rounded-lg px-4 py-2"
                style={{ border: PILL_BORDER }}
              >
                <div className="flex items-center gap-0.5">
                  {[1, 2, 3].map((n) => (
                    <BoltIcon key={n} filled={n <= (difficulty ?? 0)} />
                  ))}
                </div>
                <span className="text-sm font-normal text-gray-800 dark:text-gray-100">{diffLabel}</span>
              </div>
            )}
            {estimatedDuration != null && estimatedDuration > 0 && (
              <div
                className="flex-shrink-0 flex items-center gap-2 bg-white dark:bg-slate-800/90 shadow-sm rounded-lg px-4 py-2"
                style={{ border: PILL_BORDER }}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-slate-400 flex-shrink-0"><circle cx="12" cy="12" r="10" /><polyline points="12 6 12 12 16 14" /></svg>
                <span className="text-sm font-normal text-gray-800 dark:text-gray-100">{estimatedDuration} דק&apos;</span>
              </div>
            )}
          </div>
        )}

        {description && (
          <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed text-right">
            {description}
          </p>
        )}
      </div>
    </div>
  );
}
