'use client';

import React from 'react';
import { Flag, Trees } from 'lucide-react';
import { resolveParkImage } from '@/lib/park-image';
import type { NearbyFacility, SportContext, TrainingContext } from '../location-types';
import { buildPioneerFallback } from '../location-utils';
import { EntryDrawer, EntryCta, EntryLink } from './EntryDrawer';
import { useT } from '@/hooks/useT';
import { onboarding } from '@/messages/ns/onboarding';
import { confirmPlaceName, nearestParkMetaParts, pickNearestPark } from './entry-confirm';

// Same emoji strip as ConfirmationCard's v2 branch (pioneer copy comes from the shared matrix).
const EMOJI_RE = /(?:[\uD83C-\uD83E][\uDC00-\uDFFF]|[\u2600-\u27BF]|\u2B50|\uFE0F|\u200D)/g;
function stripEmoji(text: string): string {
  return text.replace(EMOJI_RE, '').replace(/\s{2,}/g, ' ').trim();
}

export interface EntryConfirmDrawerProps {
  displayName: string;
  detectedNeighborhood: string | null;
  detectedCity: string | null;
  nearbyFacilities: NearbyFacility[];
  isLoadingParks: boolean;
  gender: 'male' | 'female';
  sportContext: SportContext;
  trainingContext: TrainingContext | null;
  onConfirm: () => void;
  onSearchOther: () => void;
}

/** CONFIRMING — "גרים ב…?" with the nearest park (or the existing pioneer box). */
export function EntryConfirmDrawer({
  displayName,
  detectedNeighborhood,
  detectedCity,
  nearbyFacilities,
  isLoadingParks,
  gender,
  sportContext,
  trainingContext,
  onConfirm,
  onSearchOther,
}: EntryConfirmDrawerProps) {
  const t = useT(onboarding);
  const place = confirmPlaceName(detectedNeighborhood, detectedCity, displayName);
  const park = pickNearestPark(nearbyFacilities);
  // Explorer rule (same as ConfirmationCard): the pioneer box only when the area has zero parks.
  const showPioneer = !isLoadingParks && nearbyFacilities.length === 0;
  const pioneer = showPioneer
    ? buildPioneerFallback(nearbyFacilities, null, gender, detectedCity, sportContext, null, trainingContext)
    : null;
  const photo = park ? resolveParkImage(park, 160) : '';

  return (
    <EntryDrawer>
      <span className="text-[13px] font-bold text-v2-deep">{t('location.entry.confirm.eyebrow')}</span>
      <h2 className="-mt-1 text-[22px] font-black leading-7 !tracking-[-0.02em] text-v2-ink">
        {place ? t('location.entry.confirm.title', { place }) : ' '}
      </h2>
      <p className="text-[14px] leading-5 text-v2-ink-2">{t('location.entry.confirm.body')}</p>

      {isLoadingParks && (
        <div className="flex items-center gap-2.5 rounded-[18px] bg-[#f8fafc] p-2.5 shadow-v2-ring" aria-busy>
          <div className="h-[52px] w-[52px] flex-shrink-0 animate-pulse rounded-xl bg-v2-hairline" />
          <div className="flex flex-1 flex-col gap-1.5">
            <div className="h-2.5 w-24 animate-pulse rounded-full bg-v2-hairline" />
            <div className="h-3 w-32 animate-pulse rounded-full bg-v2-hairline" />
          </div>
        </div>
      )}

      {!isLoadingParks && park && (
        <div className="flex items-center gap-2.5 rounded-[18px] bg-[#f8fafc] p-2.5 shadow-v2-ring">
          {photo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={photo} alt="" className="h-[52px] w-[52px] flex-shrink-0 rounded-xl object-cover" />
          ) : (
            <span className="grid h-[52px] w-[52px] flex-shrink-0 place-items-center rounded-xl bg-v2-tint">
              <Trees size={22} className="text-v2-deep" aria-hidden />
            </span>
          )}
          <span className="flex min-w-0 flex-1 flex-col gap-0.5 text-right">
            <span className="text-[11px] font-bold text-v2-deep">{t('location.entry.confirm.nearestPark')}</span>
            <span className="truncate text-[14.5px] font-bold text-v2-ink">{park.name}</span>
            <span className="truncate text-[12px] text-v2-muted">{nearestParkMetaParts(park, t).join(' · ')}</span>
          </span>
        </div>
      )}

      {pioneer && (
        <div className="flex items-start gap-3 rounded-[18px] bg-white p-3.5 shadow-v2-ring">
          <div className="grid h-10 w-10 flex-shrink-0 place-items-center rounded-full bg-v2-tint">
            <Flag size={18} className="text-v2-deep" aria-hidden />
          </div>
          <div className="min-w-0 flex-1 text-right">
            {pioneer.pioneerMessage && (
              <p className="text-[14px] font-extrabold leading-relaxed text-v2-ink">
                {stripEmoji(pioneer.pioneerMessage)}
              </p>
            )}
            <p className="mt-1 text-[12.5px] font-bold leading-relaxed text-v2-muted">
              {t('location.entry.confirm.pioneerLine', { gender })}
            </p>
          </div>
        </div>
      )}

      <span className="text-center text-[12.5px] text-v2-muted">{t('location.entry.confirm.dragLine')}</span>
      <EntryCta onClick={onConfirm} disabled={isLoadingParks}>
        {t('location.entry.confirm.cta')}
      </EntryCta>
      <EntryLink onClick={onSearchOther} tone="deep">
        {t('location.entry.confirm.notHome')}
      </EntryLink>
    </EntryDrawer>
  );
}
