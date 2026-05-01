/**
 * /map — Server Component entry point.
 *
 * Reads searchParams on the server and hands them down as props
 * so the client tree has the workoutId from millisecond zero —
 * no hydration mismatch, no useEffect patch.
 */

import React, { Suspense } from 'react';
import dynamicImport from 'next/dynamic';

const FullMapView = dynamicImport(
  () => import('./FullMapView'),
  {
    // Map-toned skeleton — matches the placeholder colour the actual Mapbox
    // canvas paints while tiles load (`#f3f4f6`). Replaces the previous
    // centered "טוען מפה..." text so the very first paint already feels
    // like the map background instead of a distinct loading screen.
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
    // Same map-toned skeleton as the dynamic-import fallback above so the
    // outer Suspense boundary, the dynamic-import boundary, and the map's
    // own pre-tile background all look like a single continuous frame.
    // Three matching frames feel like "the map is loading", not three
    // different loading screens flashing in sequence.
    <Suspense fallback={<div className="h-[100dvh] w-full bg-[#f3f4f6]" aria-busy="true" />}>
      <FullMapView
        initialWorkoutId={initialWorkoutId}
        initialContext={initialContext}
        spotFocus={spotFocus}
      />
    </Suspense>
  );
}
