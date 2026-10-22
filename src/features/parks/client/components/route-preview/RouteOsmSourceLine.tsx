'use client';

/**
 * RouteOsmSourceLine — "מקור: OpenStreetMap" + link to /legal/credits, for routes whose
 * data comes from OSM. Behind `enable_osm_attribution` (default OFF) — renders null when off.
 *
 * Standalone on purpose: RouteDetailSheet.tsx is a busy file (i18n sessions), so this is
 * mounted by one line there later:
 *   <RouteOsmSourceLine route={route} />
 * placed next to the existing `dataCredits` paragraph.
 */
import React from 'react';
import { useFeatureFlags } from '@/hooks/useFeatureFlags';
import { useT } from '@/hooks/useT';
import { legal } from '@/messages/ns/legal';
import type { RouteCreditInput } from '../../../core/services/route-attribution';
import { CREDITS_PATH, shouldShowOsmSourceLine } from '../../../core/services/route-source-line';

export function RouteOsmSourceLine({ route }: { route: RouteCreditInput | null | undefined }) {
  const { flags } = useFeatureFlags();
  const t = useT(legal);
  if (!shouldShowOsmSourceLine(route, flags.enableOsmAttribution)) return null;
  return (
    <p className="mb-6 text-[11px] leading-relaxed text-gray-400 text-center">
      <a href={CREDITS_PATH} className="underline underline-offset-2" aria-label={t('credits.routeSource.linkLabel')}>
        {t('credits.routeSource.osm')}
      </a>
    </p>
  );
}
