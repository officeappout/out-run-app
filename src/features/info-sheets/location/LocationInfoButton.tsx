'use client';

/**
 * LocationInfoButton — the "i" next to "איפה מתאמנים?" (enable_feature_info_sheets_v1). The
 * section renders it only with the flag on and 2+ places offered.
 */

import React, { useMemo } from 'react';
import { useT } from '@/hooks/useT';
import { library } from '@/messages/ns/library';
import InfoSheetButton from '../InfoSheetButton';
import { buildLocationInfo, type InfoLocation } from './location-info.model';
import { locationCopy } from './location-info.copy';
import LocationInfoDemo from './LocationInfoDemo';

export interface LocationInfoButtonProps {
  offered: readonly InfoLocation[];
  current: InfoLocation;
  parkLine: string | null;
  homeLine: string;
}

export default function LocationInfoButton({ offered, current, parkLine, homeLine }: LocationInfoButtonProps) {
  const t = useT(library);
  const model = useMemo(() => buildLocationInfo({ offered, current }), [offered, current]);
  if (!model) return null;
  const copy = locationCopy(model, t);
  return (
    <InfoSheetButton
      title={copy.title}
      openLabel={t('featureInfo.location.open')}
      lead={copy.lead}
      demoLabel={t('featureInfo.fromToday')}
      demo={<LocationInfoDemo model={model} t={t} parkLine={parkLine} homeLine={homeLine} />}
      steps={copy.steps}
      chips={copy.chips}
      kellyContext={(q) => t('featureInfo.kellyContext', { topic: t('featureInfo.location.topic'), q })}
    />
  );
}
