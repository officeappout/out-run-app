'use client';

import { useCallback } from 'react';
import Map from 'react-map-gl';
import type { MapRef, MapEvent } from 'react-map-gl';
import { applyFitnessMapStyle } from '@/features/parks/core/components/mapStyleConfig';
import { setMapLanguageToHebrew } from './location-utils';

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
 *
 * Style sync: applyFitnessMapStyle + setMapLanguageToHebrew are called on
 * every map load so the explorer/bridge map matches the production AppMap
 * (no POIs, custom greens, Hebrew labels).
 */

interface MapboxMapWrapperProps extends Omit<React.ComponentProps<typeof Map>, 'ref'> {
  mapRef?: React.MutableRefObject<MapRef | null>;
}

export default function MapboxMapWrapper({
  mapRef,
  onLoad,
  ...props
}: MapboxMapWrapperProps) {
  const handleRef = useCallback(
    (node: MapRef | null) => {
      if (mapRef) mapRef.current = node;
    },
    [mapRef],
  );

  const handleLoad = useCallback(
    (event: MapEvent) => {
      const map = event.target as unknown as mapboxgl.Map;
      try {
        setMapLanguageToHebrew(map);
        applyFitnessMapStyle(map, 'onboarding-map-load');
      } catch (err) {
        console.warn('[MapboxMapWrapper] Map style sync failed:', err);
      }
      onLoad?.(event);
    },
    [onLoad],
  );

  return <Map ref={handleRef} onLoad={handleLoad} {...props} />;
}
