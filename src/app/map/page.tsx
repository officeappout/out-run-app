"use client";

// Force dynamic rendering to prevent SSR issues with window/localStorage
export const dynamic = 'force-dynamic';

/**
 * /map — Full-featured Map for registered users.
 *
 * This is the heavy map with route generation, GPS tracking, workout player,
 * and all related services. Guest/MAP_ONLY users go to /explorer instead.
 *
 * FullMapView is loaded via next/dynamic to avoid SSR issues with
 * browser-only APIs (Mapbox, geolocation, etc.).
 */

import React, { Suspense } from 'react';
import dynamicImport from 'next/dynamic';

const FullMapView = dynamicImport(
  () => import('./FullMapView'),
  {
    loading: () => (
      <div className="h-[100dvh] w-full flex items-center justify-center bg-[#f3f4f6]">
        <p className="text-gray-500 text-sm font-bold animate-pulse">טוען מפה...</p>
      </div>
    ),
    ssr: false,
  }
);

export default function MapPage() {
  return (
    <Suspense fallback={<div className="h-[100dvh] w-full flex items-center justify-center bg-[#f3f4f6]">טוען...</div>}>
      <FullMapView />
    </Suspense>
  );
}
