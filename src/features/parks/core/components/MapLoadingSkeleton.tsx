'use client';

import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useT } from '@/hooks/useT';
import { map as mapNs } from '@/messages/ns/map';
import BrandLoader from '@/components/brand/BrandLoader';

interface MapLoadingSkeletonProps {
  /**
   * When false, the skeleton fades to opacity 0 with a slight scale-up.
   * AnimatePresence handles the unmount.
   */
  visible: boolean;
}

/**
 * The loader over the Mapbox canvas during the map's init pipeline.
 *
 * Pilot note AJ4 (01.11): this used to be a heavy dark "AI glass" layer with a
 * big white OUT logo, radar rings and route sweeps, the first thing a new user
 * saw entering the map. It is now the shared light BrandLoader (the same loader
 * as the landing splash and the explorer gap, AJ1/AJ3), dissolving in 150 ms.
 * Only opacity animates (pilot note AC2: nothing that re-composites the WebGL
 * canvas on every frame).
 *
 * Triggering is gated upstream in `AppMap.tsx` to ONLY render on cold
 * start (first AppMap mount in the JS session) — see the
 * `mapHasInitializedInSession` flag there. Tab switches that re-mount
 * AppMap reuse the cached Mapbox style and skip the skeleton entirely.
 */
export default function MapLoadingSkeleton({ visible }: MapLoadingSkeletonProps) {
  const t = useT(mapNs);
  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          key="map-skeleton"
          initial={{ opacity: 1 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.15, ease: [0.25, 0.1, 0.25, 1] }}
          className="absolute inset-0 z-[50]"
        >
          <BrandLoader variant="overlay" caption={t('mapLoading.caption')} label={t('mapLoading.ariaLabel')} />
        </motion.div>
      )}
    </AnimatePresence>
  );
}
