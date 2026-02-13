'use client';

import { forwardRef } from 'react';
import Map from 'react-map-gl';
import type { MapRef } from 'react-map-gl';

/**
 * Thin wrapper around react-map-gl's Map component that forwards refs.
 * next/dynamic does NOT forward refs, so loading Map directly via dynamic()
 * and passing ref={mapRef} triggers the React warning:
 *   "Function components cannot be given refs"
 *
 * This wrapper solves the issue by accepting the ref via forwardRef
 * and passing it through to the underlying Map component.
 */
const MapboxMapWrapper = forwardRef<MapRef, React.ComponentProps<typeof Map>>(
  function MapboxMapWrapper(props, ref) {
    return <Map ref={ref} {...props} />;
  }
);

export default MapboxMapWrapper;
