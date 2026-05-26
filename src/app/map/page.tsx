/**
 * /map — Server Component entry point.
 *
 * Reads searchParams on the server and hands them down as props so the
 * client tree has the workoutId from millisecond zero — no hydration
 * mismatch, no useEffect patch.
 *
 * Single dynamic boundary: page.tsx → MapShell (client chunk that includes
 * Mapbox via its own next/dynamic split for AppMap). The old intermediate
 * FullMapView chunk has been folded into MapShell, eliminating one
 * sequential JS download before the Mapbox canvas can initialise.
 */

import React, { Suspense } from 'react';
import dynamicImport from 'next/dynamic';

const MapShellEntry = dynamicImport(
  () => import('./MapShell'),
  {
    // Map-toned skeleton — matches the `#f3f4f6` background that Mapbox
    // paints during tile load, so the chunk-download placeholder and the
    // canvas feel like one continuous frame rather than a distinct flash.
    loading: () => <div className="h-[100dvh] w-full bg-[#f3f4f6]" aria-busy="true" />,
    ssr: false,
  }
);

interface MapPageProps {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}

export default async function MapPage({ searchParams }: MapPageProps) {
  const params = await searchParams;
  const initialWorkoutId = (typeof params?.workoutId === 'string' ? params.workoutId : null);
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
        initialWorkoutId={initialWorkoutId}
        initialContext={initialContext}
        spotFocus={spotFocus}
      />
    </Suspense>
  );
}
