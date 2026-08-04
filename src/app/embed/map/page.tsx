/**
 * /embed/map — Server Component entry point, iframe-embeddable.
 *
 * Mirrors src/app/map/page.tsx's boundary (dynamic import of MapShell,
 * ssr:false) but hardcodes embedPreset='route' and never reads/forwards
 * `workoutId` — an embed visitor has no session, so a workoutId would point
 * at a saved plan that isn't theirs. `lat`/`lng`/`context` stay supported so
 * the embedding site can optionally hint a starting point; if omitted, the
 * map falls back to the visitor's real GPS (once granted) or AppMap's own
 * default center — see MapShell's `initialMapCenter` / AppMap's default.
 */

import React, { Suspense } from 'react';
import dynamicImport from 'next/dynamic';

const MapShellEntry = dynamicImport(
  () => import('../../map/MapShell'),
  {
    loading: () => <div className="h-[100dvh] w-full bg-[#f3f4f6]" aria-busy="true" />,
    ssr: false,
  }
);

interface EmbedMapPageProps {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}

export default async function EmbedMapPage({ searchParams }: EmbedMapPageProps) {
  const params = await searchParams;
  const initialContext = (typeof params?.context === 'string' ? params.context : null);
  const initialLat = (typeof params?.lat === 'string' ? parseFloat(params.lat) : null);
  const initialLng = (typeof params?.lng === 'string' ? parseFloat(params.lng) : null);
  const spotFocus =
    initialLat !== null && initialLng !== null && !isNaN(initialLat) && !isNaN(initialLng)
      ? { lat: initialLat, lng: initialLng }
      : null;

  return (
    <Suspense fallback={<div className="h-[100dvh] w-full bg-[#f3f4f6]" aria-busy="true" />}>
      <MapShellEntry
        initialWorkoutId={null}
        initialContext={initialContext}
        spotFocus={spotFocus}
        embedPreset="route"
      />
    </Suspense>
  );
}
