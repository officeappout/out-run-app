'use client';

/**
 * LocationInfoDemo — the location sheet's loop (board SwapCard): the section's own toggle
 * (SegmentedPicker, same options and icons) steps through the offered places, a short
 * "מחליף…" between them, and under it what the section shows for that place: the nearest
 * park, the home-equipment chip, or service. Visual only (inert); reduced motion = static.
 */

import React from 'react';
import { Home, Shield, Trees } from 'lucide-react';
import SegmentedPicker from '@/components/ui/v2/SegmentedPicker';
import Chip from '@/components/ui/v2/Chip';
import type { LibraryT } from '@/messages/ns/library';
import { useInfoLoop } from '../useInfoLoop';
import { inertRef } from '../inert-ref';
import type { InfoLocation, LocationInfoModel } from './location-info.model';
import { LOCATION_LABEL_KEY } from './location-info.copy';

const SHOW_MS = 2600;
const SWAP_MS = 700;

const ICON: Record<InfoLocation, React.ReactNode> = {
  park: <Trees size={14} />,
  home: <Home size={14} />,
  service: <Shield size={14} />,
};

export interface LocationInfoDemoProps {
  model: LocationInfoModel;
  t: LibraryT;
  /** The nearest park the section shows first ("גן הכרמל · 400 מ׳"), when there is one. */
  parkLine: string | null;
  /** The section's own home chip text ("בבית · מתח"). */
  homeLine: string;
}

export default function LocationInfoDemo({ model, t, parkLine, homeLine }: LocationInfoDemoProps) {
  // Each place: shown, then the swap to the next one.
  const durations = model.order.flatMap(() => [SHOW_MS, SWAP_MS]);
  const { phase } = useInfoLoop(durations);
  const idx = Math.floor(phase / 2);
  const swapping = phase % 2 === 1;
  const place = model.order[swapping ? (idx + 1) % model.order.length : idx];

  const options = model.offered.map((k) => ({ key: k, label: t(LOCATION_LABEL_KEY[k]), icon: ICON[k] }));
  const line =
    place === 'park' ? parkLine ?? t(LOCATION_LABEL_KEY.park) : place === 'home' ? homeLine : t(LOCATION_LABEL_KEY.service);

  return (
    <div aria-hidden className="pointer-events-none flex flex-col gap-2.5" ref={inertRef}>
      <div className="flex items-center gap-2.5">
        <span className="text-[15px] font-black text-v2-ink">{t('preview.location.title')}</span>
        {swapping && <span className="text-xs font-bold text-v2-deep animate-pulse">{t('preview.location.swapping')}</span>}
        <span className="flex-1" />
        <SegmentedPicker className="!w-auto min-w-[150px]" ariaLabel="" value={place} onChange={() => {}} options={options} />
      </div>
      <div className={`flex min-h-[32px] items-center transition-opacity duration-300 ${swapping ? 'opacity-40' : 'opacity-100'}`}>
        <Chip icon={ICON[place]}>{line}</Chip>
      </div>
    </div>
  );
}
