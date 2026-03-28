'use client';

import { useCallback } from 'react';
import Map from 'react-map-gl';
import type { MapRef } from 'react-map-gl';

/**
 * Thin wrapper around react-map-gl's Map that accepts a ref via a regular
 * prop instead of React.forwardRef.
 *
 * next/dynamic does NOT forward refs — it wraps the loaded component in
 * its own function component, so passing ref={…} to a dynamic() result
 * triggers "Function components cannot be given refs".
 *
 * By accepting `mapRef` as a normal prop and using a callback ref internally,
 * we bypass the limitation while keeping the parent's ref object in sync.
 */

interface MapboxMapWrapperProps extends Omit<React.ComponentProps<typeof Map>, 'ref'> {
  mapRef?: React.MutableRefObject<MapRef | null>;
}

export default function MapboxMapWrapper({ mapRef, ...props }: MapboxMapWrapperProps) {
  const handleRef = useCallback(
    (node: MapRef | null) => {
      if (mapRef) mapRef.current = node;
    },
    [mapRef],
  );

  return <Map ref={handleRef} {...props} />;
}
