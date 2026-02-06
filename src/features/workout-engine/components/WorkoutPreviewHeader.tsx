'use client';

import React, { useEffect, useState, useRef } from 'react';
import { ArrowRight, Share2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';

// Dynamic import for map to avoid SSR issues
const RunMapBlock = dynamic(
  () => import('@/features/workout-engine/summary/components/running/RunMapBlock'),
  { ssr: false }
);

interface WorkoutPreviewHeaderProps {
  title: string;
  description?: string;
  coverImage?: string;
  routePath?: number[][] | Array<{ lat: number; lng: number }>; // For hybrid workouts
  difficulty?: string;
  duration?: number;
}

/**
 * WorkoutPreviewHeader - Hero section for workout preview
 * Shows cover image with gradient overlay, or map for hybrid workouts
 */
export default function WorkoutPreviewHeader({
  title,
  description,
  coverImage,
  routePath,
  difficulty,
  duration,
}: WorkoutPreviewHeaderProps) {
  const router = useRouter();
  const isHybrid = !!routePath && routePath.length > 0;
  const [scrollY, setScrollY] = useState(0);
  const headerRef = useRef<HTMLDivElement>(null);

  // Listen to scroll events from parent drawer
  useEffect(() => {
    const handleScroll = () => {
      // Find the scrollable container (drawer content) - look for the parent with overflow-y-auto
      let element = headerRef.current?.parentElement;
      while (element) {
        if (element.classList.contains('overflow-y-auto')) {
          setScrollY(element.scrollTop);
          return;
        }
        element = element.parentElement;
      }
    };

    // Find the scrollable container
    let element = headerRef.current?.parentElement;
    let scrollContainer: HTMLElement | null = null;
    while (element) {
      if (element.classList.contains('overflow-y-auto')) {
        scrollContainer = element;
        break;
      }
      element = element.parentElement;
    }

    if (scrollContainer) {
      scrollContainer.addEventListener('scroll', handleScroll, { passive: true });
      return () => scrollContainer?.removeEventListener('scroll', handleScroll);
    }
  }, []);

  // Calculate opacity and scale based on scroll
  const maxScroll = 150; // Start fading after 150px scroll
  const scrollProgress = Math.min(scrollY / maxScroll, 1);
  const imageOpacity = Math.max(1 - scrollProgress * 0.5, 0.5); // Fade to 50% opacity
  const imageScale = Math.max(1 - scrollProgress * 0.1, 0.9); // Shrink to 90% scale

  // Convert routePath to number[][] format if needed
  const routeCoords: number[][] = isHybrid
    ? routePath.map((coord: any) => {
        if (Array.isArray(coord) && coord.length >= 2) {
          return [Number(coord[0]), Number(coord[1])];
        }
        if (coord && typeof coord === 'object' && 'lat' in coord && 'lng' in coord) {
          return [Number(coord.lng), Number(coord.lat)]; // Mapbox format
        }
        return [0, 0];
      }).filter((coord: number[]) => coord[0] !== 0 || coord[1] !== 0)
    : [];

  const getDifficultyLabel = (diff?: string) => {
    const labels: Record<string, string> = {
      easy: 'קל',
      medium: 'בינוני',
      hard: 'קשה',
    };
    return labels[diff || 'medium'] || 'בינוני';
  };

  return (
    <div ref={headerRef} className="relative w-full h-[40vh] min-h-[300px] shrink-0 z-0 overflow-hidden">
      {/* Background: Image or Map */}
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
          <div className="absolute inset-0 bg-gradient-to-b from-black/40 via-black/20 to-black/60" />
        </div>
      ) : coverImage ? (
        <>
          <img
            src={coverImage}
            alt={title}
            className="absolute inset-0 w-full h-full object-cover transition-all duration-300"
            style={{ opacity: imageOpacity, transform: `scale(${imageScale})` }}
            onError={(e) => {
              (e.target as HTMLImageElement).style.display = 'none';
            }}
          />
          {/* Hero Gradient Overlay */}
          <div className="absolute inset-0 bg-gradient-to-b from-black/60 via-black/30 to-black/80" />
        </>
      ) : (
        <div 
          className="absolute inset-0 bg-gradient-to-br from-slate-800 via-slate-700 to-slate-900 transition-opacity duration-300"
          style={{ opacity: imageOpacity, transform: `scale(${imageScale})` }}
        />
      )}

      {/* Top Controls */}
      <div className="absolute top-0 left-0 right-0 p-4 pt-14 flex justify-between items-start z-10">
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

      {/* Bottom Content */}
      <div className="absolute bottom-0 left-0 right-0 p-6 flex flex-col justify-end z-10">
        <h1 className="text-3xl font-bold text-white mb-2 drop-shadow-lg">{title}</h1>
        {description && (
          <p className="text-sm text-white/90 mb-4 line-clamp-2 drop-shadow-md">
            {description}
          </p>
        )}

        {/* Stats Row */}
        <div className="flex items-center gap-3">
          {difficulty && (
            <div className="bg-white/20 dark:bg-black/40 backdrop-blur-md px-3 py-1.5 rounded-lg flex items-center gap-1.5">
              <span className="text-xs font-bold text-white">
                {getDifficultyLabel(difficulty)}
              </span>
            </div>
          )}
          {duration && (
            <div className="bg-white/20 dark:bg-black/40 backdrop-blur-md px-3 py-1.5 rounded-lg flex items-center gap-1.5">
              <span className="text-xs font-bold text-white">
                {duration} דקות
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
