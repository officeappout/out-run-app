'use client';

import React from 'react';
import { Flag, Trees, Trophy } from 'lucide-react';
import { useMapTutorialV1 } from '@/hooks/useMapTutorialV1';
import { resolveParkImage } from '@/lib/park-image';
import type { NearbyFacility, SportContext, TrainingContext } from '../location-types';
import { buildPioneerFallback } from '../location-utils';
import { EntryDrawer, EntryCta, EntryLink } from './EntryDrawer';
import { useT } from '@/hooks/useT';
import { onboarding } from '@/messages/ns/onboarding';
import { map } from '@/messages/ns/map';
import { confirmPlaceName, nearestParkMetaParts, pickNearestPark } from './entry-confirm';
import { useContentLanguage } from '@/features/content/shared/useContentLanguage';
import { displayLocationName } from '@/lib/data/location-name-en';

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
  /** AD2: collapsed by the user (handle) or by a map drag; the CTA stays visible. */
  collapsed?: boolean;
  onCollapsedChange?: (collapsed: boolean) => void;
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
  collapsed = false,
  onCollapsedChange,
}: EntryConfirmDrawerProps) {
  const t = useT(onboarding);
  const tm = useT(map);
  // enable_map_tutorial_v1 (board M1, L3): step bar, why the neighborhood matters (the league), and the
  // drag line moves to the chip above the lemur. Off = today's drawer.
  const v1 = useMapTutorialV1();
  const place = confirmPlaceName(detectedNeighborhood, detectedCity, displayName);
  // English place name for display (the Hebrew stays the data; a neighbourhood is resolved under its city).
  const contentLang = useContentLanguage();
  const placeShown = displayLocationName(
    place,
    contentLang,
    detectedNeighborhood && place === detectedNeighborhood.trim() ? detectedCity : null,
  );
  const park = pickNearestPark(nearbyFacilities);
  // Explorer rule (same as ConfirmationCard): the pioneer box only when the area has zero parks.
  const showPioneer = !isLoadingParks && nearbyFacilities.length === 0;
  const pioneer = showPioneer
    ? buildPioneerFallback(nearbyFacilities, null, gender, detectedCity, sportContext, null, trainingContext)
    : null;
  const photo = park ? resolveParkImage(park, 160) : '';

  return (
    <EntryDrawer
      collapsed={collapsed}
      onCollapsedChange={onCollapsedChange}
      pinned={
        <EntryCta onClick={onConfirm} disabled={isLoadingParks}>
          {t('location.entry.confirm.cta')}
        </EntryCta>
      }
      footer={
        <EntryLink onClick={onSearchOther} tone="deep">
          {t('location.entry.confirm.notHome')}
        </EntryLink>
      }
    >
      {/* AD1: the step bar comes from EntryDrawer itself (it was rendered twice under v1). */}
      <span className="text-[13px] font-bold text-v2-deep">{t('location.entry.confirm.eyebrow')}</span>
      <h2 className="-mt-1 text-[22px] font-black leading-7 !tracking-[-0.02em] text-v2-ink">
        {place ? t('location.entry.confirm.title', { place: placeShown }) : ' '}
      </h2>
      {v1 ? (
        <div className="flex items-center gap-2.5 rounded-2xl bg-v2-tint px-3 py-2.5">
          <Trophy size={20} className="shrink-0 text-v2-deep" aria-hidden />
          <span className="text-[13.5px] leading-[19px] text-v2-ink">{tm('mapTutorial.locate.league')}</span>
        </div>
      ) : (
        <p className="text-[14px] leading-5 text-v2-ink-2">{t('location.entry.confirm.body')}</p>
      )}

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
          <span className="flex min-w-0 flex-1 flex-col gap-0.5 text-start">
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
          <div className="min-w-0 flex-1 text-start">
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

      {!v1 && <span className="text-center text-[12.5px] text-v2-muted">{t('location.entry.confirm.dragLine')}</span>}
    </EntryDrawer>
  );
}
