'use client';

import React from 'react';
import dynamic from 'next/dynamic';
import { useMapStore } from '../store/useMapStore';

const ParkDetailSheet = dynamic(
  () => import('@/features/parks/client/components/park-detail/ParkDetailSheet'),
  { ssr: false },
);

const RouteDetailSheet = dynamic(
  () => import('@/features/parks/client/components/route-preview/RouteDetailSheet'),
  { ssr: false },
);

/**
 * Renders ParkDetailSheet or RouteDetailSheet as a global overlay
 * on top of any screen. Controlled by useMapStore.globalSheet.
 *
 * Injected once in ClientLayout so it works on Home, Map, or any page.
 */
export default function GlobalDetailOverlay() {
  const globalSheet = useMapStore((s) => s.globalSheet);
  const closeGlobalSheet = useMapStore((s) => s.closeGlobalSheet);

  if (!globalSheet) return null;

  if (globalSheet.type === 'park') {
    return (
      <ParkDetailSheet
        isOpen
        onClose={closeGlobalSheet}
      />
    );
  }

  if (globalSheet.type === 'route') {
    return (
      <RouteDetailSheet
        isOpen
        route={globalSheet.route}
        onClose={closeGlobalSheet}
      />
    );
  }

  return null;
}
