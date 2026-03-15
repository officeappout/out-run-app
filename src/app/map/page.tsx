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
    loading: () => (
      <div className="h-[100dvh] w-full flex items-center justify-center bg-[#f3f4f6]">
        <p className="text-gray-500 text-sm font-bold animate-pulse">טוען מפה...</p>
      </div>
    ),
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

  return (
    <Suspense fallback={<div className="h-[100dvh] w-full flex items-center justify-center bg-[#f3f4f6]">טוען...</div>}>
      <FullMapView
        initialWorkoutId={initialWorkoutId}
        initialContext={initialContext}
      />
    </Suspense>
  );
}
