'use client';

import React from 'react';
import { motion } from 'framer-motion';
import { MapPin, Loader2, Star, Flag, Trees, Bike, Footprints, Route as RouteIconBase } from 'lucide-react';
import type { ConfirmationCardProps, NearbyFacility } from '../location-types';
import { getIdentityHook, selectSmartBadges, formatDistance, buildPioneerFallback } from '../location-utils';
import { getFacilityIcon, resolveCategoryKey } from '@/utils/facility-icon';
import { resolveParkImage } from '@/lib/park-image';

// v2 renders no emoji — strip pictographs (surrogate-pair emoji, dingbats,
// VS16/ZWJ joiners) from copy that comes from the shared copy matrix.
const EMOJI_RE = /(?:[\uD83C-\uD83E][\uDC00-\uDFFF]|[\u2600-\u27BF]|\u2B50|\uFE0F|\u200D)/g;
function stripEmoji(text: string): string {
  return text.replace(EMOJI_RE, '').replace(/\s{2,}/g, ' ').trim();
}

export function ConfirmationCard({
  displayName,
  detectedNeighborhood,
  detectedCity,
  nearbyFacilities,
  isLoadingParks,
  isLoadingCurated,
  isUpdatingLocation,
  onConfirm,
  onSearchOther,
  brandingConfig,
  infraStats,
  cityAssetCounts,
  settlementNaming,
  curatedRouteCount,
  heroRoute,
  sportContext,
  bestMatchIndex,
  trainingContext,
  mode = 'onboarding',
  v2 = false,
}: ConfirmationCardProps) {
  const isExplorer = mode === 'explorer';
  const isBridge = mode === 'bridge';
  // Get user data from sessionStorage
  const userName = typeof window !== 'undefined' 
    ? sessionStorage.getItem('onboarding_personal_name') || ''
    : '';
  const gender = typeof window !== 'undefined'
    ? (sessionStorage.getItem('onboarding_personal_gender') || 'male') as 'male' | 'female'
    : 'male';
  const isFemale = gender === 'female';
  
  // Get primary persona ID from sessionStorage
  const primaryPersonaId: string | null = (() => {
    if (typeof window === 'undefined') return null;
    const stored = sessionStorage.getItem('onboarding_selected_persona_ids');
    if (!stored) return null;
    try {
      const arr = JSON.parse(stored) as string[];
      return Array.isArray(arr) && arr.length > 0 ? arr[0] : null;
    } catch {
      return null;
    }
  })();

  // Get selected sport ID from sessionStorage
  const selectedSportId: string | null = (() => {
    if (typeof window === 'undefined') return null;
    const stored = sessionStorage.getItem('onboarding_selected_sports');
    if (!stored) return null;
    try {
      const arr = JSON.parse(stored) as string[];
      return Array.isArray(arr) && arr.length > 0 ? arr[0] : null;
    } catch {
      return null;
    }
  })();
  
  const userNeighborhood = detectedNeighborhood || detectedCity || displayName;
  const locationText = detectedCity 
    ? `${detectedCity}${detectedNeighborhood ? ', ' + detectedNeighborhood : ''}`
    : displayName;

  // Human-Centric Copy Matrix: Pain→Solution with City anchor + activity verb
  const identityHook = getIdentityHook(primaryPersonaId || '', detectedCity || userNeighborhood, gender, selectedSportId);
  
  // Smart Badge Selection (city-wide stats, sport-aware)
  const smartBadges = selectSmartBadges(cityAssetCounts, infraStats, selectedSportId, detectedCity, sportContext);

  // "Power of One" — best match for the drawer
  const bestMatch: NearbyFacility | null = nearbyFacilities[bestMatchIndex] || nearbyFacilities[0] || null;

  // Pioneer + Plan B — detect missing sport-specific match
  const pioneer = buildPioneerFallback(
    nearbyFacilities,
    selectedSportId,
    gender,
    detectedCity,
    sportContext,
    heroRoute,
    trainingContext
  );

  // Explorer mode: parks only — show ParkCard when a park exists,
  // Pioneer (תהיה החלוץ) only when the area has zero parks.
  const showPioneer = isExplorer
    ? nearbyFacilities.length === 0
    : pioneer.showPioneer;

  if (v2) {
    // v2 — one bottom sheet over the full-bleed map. The step is `fixed
    // inset-0` (it covers <main>), so this sheet owns the bottom inset, once.
    const rated = nearbyFacilities.filter(f => f.rating != null && typeof f.rating === 'number' && f.rating > 0);
    const avgRating = rated.length > 0
      ? rated.reduce((sum, f) => sum + (f.rating ?? 0), 0) / rated.length
      : null;
    const isLoadingData = isLoadingParks || isLoadingCurated;

    const renderAvatar = (facility: NearbyFacility, size: 'lg' | 'sm') => {
      const box = size === 'lg' ? 'h-11 w-11' : 'h-9 w-9';
      if (facility.kind === 'park') {
        const icon = getFacilityIcon(resolveParkImage(facility, 80), resolveCategoryKey(facility), brandingConfig);
        if (icon.type === 'image') {
          return (
            <div className={`${box} flex-shrink-0 overflow-hidden rounded-full bg-white shadow-v2-ring ${icon.tier === 'site_photo' ? '' : 'p-1'}`}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={icon.value}
                alt=""
                className={`h-full w-full ${icon.tier === 'site_photo' ? 'object-cover' : 'object-contain'}`}
              />
            </div>
          );
        }
        return (
          <div className={`${box} grid flex-shrink-0 place-items-center rounded-full bg-v2-tint`}>
            <Trees size={size === 'lg' ? 20 : 17} className="text-v2-deep" />
          </div>
        );
      }
      const routeActivity = facility.activityType || facility.type;
      const RouteIcon = routeActivity === 'cycling' ? Bike : routeActivity === 'walking' ? Footprints : RouteIconBase;
      return (
        <div className={`${box} grid flex-shrink-0 place-items-center rounded-full bg-v2-tint`}>
          <RouteIcon size={size === 'lg' ? 20 : 17} className="text-v2-deep" />
        </div>
      );
    };

    const renderMeta = (facility: NearbyFacility) => (
      <div className="mt-0.5 flex items-center gap-2 whitespace-nowrap">
        {facility.kind !== 'park' && (facility.distance || 0) > 0 && (
          <span className="text-[12px] font-bold text-v2-muted">
            {formatDistance((facility.distance || 0) * 1000)}
          </span>
        )}
        {facility.rating != null && typeof facility.rating === 'number' && facility.rating > 0 && (
          <span className="inline-flex items-center gap-0.5 text-[12px] font-extrabold text-v2-amber">
            <Star size={12} className="fill-current" />
            {facility.rating.toFixed(1)}
          </span>
        )}
        <span className="text-[12px] font-bold text-v2-muted">{facility.formattedDistance}</span>
      </div>
    );

    return (
      <motion.div
        initial={{ opacity: 0, y: 50 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 50 }}
        transition={{ duration: 0.3, ease: [0.23, 1, 0.32, 1] }}
        className="absolute bottom-0 left-0 right-0 z-20"
        dir="rtl"
      >
        <div
          className="rounded-t-[28px] bg-white shadow-v2-sheet px-5 pt-3"
          style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 16px)' }}
        >
          <div className="mx-auto mb-4 h-1.5 w-10 rounded-full bg-v2-pill-border" />

          {/* Greeting — Pain → Solution */}
          {!isUpdatingLocation && userName && (
            <div className="mb-4 pb-4 border-b border-v2-hairline text-right">
              <p className="text-[17px] leading-snug mb-1.5">
                <span className="font-black text-v2-ink">היי {userName}</span>,{' '}
                <span className="font-extrabold text-v2-deep">{stripEmoji(identityHook.intro)}</span>
              </p>
              <p className="text-[14px] leading-relaxed text-v2-ink-2">
                {stripEmoji(identityHook.value)}
              </p>
            </div>
          )}

          {isUpdatingLocation && (
            <div className="mb-4 flex items-center gap-2">
              <Loader2 size={18} className="animate-spin text-v2-accent" />
              <span className="text-[14px] font-bold text-v2-ink-2 whitespace-nowrap">מעדכן מיקום...</span>
            </div>
          )}

          {isExplorer && !isUpdatingLocation && (
            <>
              <h2 className="text-[22px] font-black !tracking-[-0.02em] leading-tight text-v2-ink text-right mb-1.5">
                מצאנו את הסביבה הקרובה ביותר ל{detectedNeighborhood || detectedCity || locationText}
              </h2>
              <p className="text-[14px] leading-relaxed text-v2-ink-2 text-right mb-3">
                מצוין! כאן יוצגו מסלולי ההליכה, הגינות ומתקני הכושר הקרובים המומלצים ביותר אליכם. הכל בחינם וללא ציוד.
              </p>
            </>
          )}

          {!isExplorer && !isUpdatingLocation && !userName && (
            <>
              <h2 className="text-[22px] font-black !tracking-[-0.02em] leading-tight text-v2-ink text-right mb-1.5">
                הגינה הכי קרובה ל{locationText}
              </h2>
              <p className="text-[14px] leading-relaxed text-v2-ink-2 text-right mb-3">
                מצוין! כאן יוצגו מסלולי ההליכה, הגינות ומתקני הכושר הקרובים המומלצים ביותר אליכם. ניתן לגרור את המפה לדיוק המיקום.
              </p>
            </>
          )}

          {/* Drag hint + city rating */}
          <div className="mb-2.5 flex items-center justify-between gap-3">
            <p className="flex min-w-0 items-center gap-1.5 text-[13px] font-extrabold text-v2-deep">
              <MapPin size={14} className="flex-shrink-0" />
              <span className="truncate">גררו את המפה כדי לדייק את המיקום</span>
            </p>
            {avgRating != null && (
              <span className="inline-flex flex-shrink-0 items-center gap-1 whitespace-nowrap text-[12px] font-extrabold text-v2-amber">
                <Star size={12} className="fill-current" />
                {avgRating.toFixed(1)} דירוג עירוני
              </span>
            )}
          </div>

          {/* City badges — info chips (not selectable) */}
          {(isLoadingData || smartBadges.length > 0) && (
            <div className="mb-3 flex flex-wrap items-center gap-2">
              {isLoadingData && (
                <Loader2 size={14} className="animate-spin text-v2-accent" />
              )}
              {smartBadges.map((badge, idx) => (
                <span
                  key={idx}
                  className="inline-flex h-7 max-w-full items-center rounded-full bg-v2-tint px-3 text-[12px] font-extrabold text-v2-deep whitespace-nowrap"
                >
                  <span className="truncate">{badge.label}</span>
                </span>
              ))}
              {isLoadingData && smartBadges.length === 0 && (
                <span className="inline-flex h-7 items-center rounded-full bg-v2-tint px-3 text-[12px] font-extrabold text-v2-deep whitespace-nowrap">
                  טוען נתונים...
                </span>
              )}
            </div>
          )}

          {/* "Power of One" — single best match */}
          {!isLoadingData && bestMatch && !showPioneer && (
            <motion.div
              key={`best-${bestMatch.id}-${bestMatchIndex}`}
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.3 }}
              className="mb-4 flex items-center gap-3 rounded-[20px] bg-white p-3.5 shadow-v2-ring"
            >
              {renderAvatar(bestMatch, 'lg')}
              <div className="min-w-0 flex-1 text-right">
                <span className="block truncate text-[15px] font-extrabold text-v2-ink">
                  {bestMatch.name}
                </span>
                {renderMeta(bestMatch)}
              </div>
              <span className="inline-flex h-7 flex-shrink-0 items-center rounded-full bg-v2-tint px-2.5 text-[12px] font-extrabold text-v2-deep ring-1 ring-inset ring-v2-accent/40 whitespace-nowrap">
                #1
              </span>
            </motion.div>
          )}

          {/* Pioneer + Plan B */}
          {!isLoadingData && showPioneer && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.15 }}
              className="mb-4 rounded-[20px] bg-white p-3.5 shadow-v2-ring"
            >
              <div className="flex items-start gap-3">
                <div className="grid h-10 w-10 flex-shrink-0 place-items-center rounded-full bg-v2-tint">
                  <Flag size={18} className="text-v2-deep" />
                </div>
                <div className="min-w-0 flex-1 text-right">
                  <p className="text-[14px] font-extrabold leading-relaxed text-v2-ink">
                    {stripEmoji(pioneer.pioneerMessage)}
                  </p>
                  {pioneer.fallbackAsset ? (
                    <p className="mt-1 text-[12.5px] font-bold leading-relaxed text-v2-muted">
                      {stripEmoji(pioneer.planBBridge)}
                    </p>
                  ) : (
                    <p className="mt-1 text-[12.5px] font-bold leading-relaxed text-v2-muted">
                      {isFemale
                        ? 'את הולכת להיות החלוצה הראשונה שתמפה את השכונה!'
                        : 'אתה הולך להיות החלוץ הראשון שימפה את השכונה!'
                      }
                    </p>
                  )}
                </div>
              </div>

              {pioneer.fallbackAsset && (
                <div className="mt-3 rounded-2xl bg-v2-surface p-3">
                  <span className="mb-2 inline-flex h-6 items-center rounded-full bg-v2-tint px-2.5 text-[11px] font-extrabold text-v2-deep whitespace-nowrap">
                    האלטרנטיבה הכי טובה בסביבה
                  </span>
                  <div className="flex items-center gap-3">
                    {renderAvatar(pioneer.fallbackAsset, 'sm')}
                    <div className="min-w-0 flex-1 text-right">
                      <span className="block truncate text-[14px] font-extrabold text-v2-ink">
                        {pioneer.fallbackAsset.name}
                      </span>
                      {renderMeta(pioneer.fallbackAsset)}
                    </div>
                  </div>
                </div>
              )}
            </motion.div>
          )}

          {/* Primary action — the one gradient on this screen */}
          <button
            type="button"
            onClick={onConfirm}
            disabled={isLoadingParks}
            className={
              isLoadingParks
                ? 'w-full h-[52px] rounded-full bg-v2-hairline text-[16px] font-extrabold text-v2-muted cursor-not-allowed whitespace-nowrap px-5'
                : 'w-full h-[52px] rounded-full bg-v2-cta text-[16px] font-extrabold text-v2-on-cta shadow-v2-cta active:scale-[0.97] transition-transform duration-150 ease-v2 whitespace-nowrap px-5'
            }
          >
            כן, זה הבית שלי!
          </button>

          {/* Secondary action — text link */}
          <button
            type="button"
            onClick={onSearchOther}
            className="mt-1.5 block w-full h-11 truncate whitespace-nowrap text-[13.5px] font-extrabold text-v2-deep active:scale-[0.97] transition-transform duration-150 ease-v2"
          >
            זה לא אזור המגורים שלי, חפשו אזור אחר
          </button>
        </div>
      </motion.div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 50 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: 50 }}
      transition={{ duration: 0.3 }}
      className="absolute bottom-0 left-0 right-0 z-20"
      dir="rtl"
    >
      <div className="bg-gradient-to-t from-white via-white/98 to-transparent pt-6 pb-[max(1rem,env(safe-area-inset-bottom))]">
        <div className="bg-white rounded-t-3xl shadow-[0_-8px_30px_rgba(91,194,242,0.10)] p-5 border-t border-slate-100/40">
          
          {/* Human-Centric Copy Matrix — Pain → Solution */}
          {!isUpdatingLocation && userName && (
            <div 
              className="mb-5 pb-4 border-b border-slate-100"
              style={{ fontFamily: 'var(--font-simpler)', textAlign: 'right', direction: 'rtl' }}
            >
              {/* Part A: Greeting (Bold Black) + Pain Intro (Brand Blue #38BDF8) */}
              <p className="text-lg leading-relaxed mb-2">
                <span className="font-bold text-slate-900">היי {userName}</span>,{' '}
                <span className="font-semibold" style={{ color: '#38BDF8' }}>
                  {identityHook.intro}
                </span>
              </p>
              
              {/* Part B: Solution Value */}
              <p className="text-sm text-slate-500 leading-relaxed">
                {identityHook.value}
              </p>
            </div>
          )}
          
          {/* Updating location state */}
          {isUpdatingLocation && (
            <div 
              className="flex items-center gap-2 justify-end mb-4"
              style={{ fontFamily: 'var(--font-simpler)' }}
            >
              <Loader2 size={18} className="animate-spin text-[#5BC2F2]" />
              <span className="text-slate-600">מעדכן מיקום...</span>
            </div>
          )}
          
          {/* Explorer mode: Discovery-focused greeting with neighborhood anchor */}
          {isExplorer && !isUpdatingLocation && (
            <>
              <h2 
                className="text-xl font-bold leading-tight text-slate-900 mb-2"
                style={{ fontFamily: 'var(--font-simpler)', textAlign: 'right', direction: 'rtl' }}
              >
                מצאנו את הסביבה הקרובה ביותר ל{detectedNeighborhood || detectedCity || locationText}
              </h2>
              <p 
                className="text-slate-500 text-sm mb-3 leading-relaxed"
                style={{ fontFamily: 'var(--font-simpler)', textAlign: 'right', direction: 'rtl' }}
              >
                מצוין! כאן יוצגו מסלולי ההליכה, הגינות ומתקני הכושר הקרובים המומלצים ביותר אליכם. הכל בחינם וללא ציוד.
              </p>
            </>
          )}

          {/* Fallback for when no userName (onboarding mode only) */}
          {!isExplorer && !isUpdatingLocation && !userName && (
            <h2 
              className="text-xl font-bold leading-tight text-slate-900 mb-2"
              style={{ fontFamily: 'var(--font-simpler)', textAlign: 'right', direction: 'rtl' }}
            >
              הגינה הכי קרובה ל{locationText}
            </h2>
          )}
          
          {!isExplorer && !isUpdatingLocation && !userName && (
            <p 
              className="text-slate-500 text-sm mb-3 leading-relaxed"
              style={{ fontFamily: 'var(--font-simpler)', textAlign: 'right', direction: 'rtl' }}
            >
              מצוין! כאן יוצגו מסלולי ההליכה, הגינות ומתקני הכושר הקרובים המומלצים ביותר אליכם. ניתן לגרור את המפה לדיוק המיקום.
            </p>
          )}
          
          {/* Drag hint + Star Rating */}
          <div 
            className="flex items-center justify-between mb-2"
            style={{ fontFamily: 'var(--font-simpler)' }}
          >
            <p className="text-slate-700 text-sm font-bold flex items-center gap-1.5">
              <MapPin size={14} className="text-slate-600" />
              גררו את המפה כדי לדייק את המיקום
            </p>
            {nearbyFacilities.length > 0 && (() => {
              const rated = nearbyFacilities.filter(f => f.rating != null && typeof f.rating === 'number' && f.rating > 0);
              if (rated.length === 0) return null;
              const avgRating = rated.reduce((sum, f) => sum + (f.rating ?? 0), 0) / rated.length;
              return (
                <span className="text-[10px] text-amber-500 font-bold whitespace-nowrap">
                  ⭐ {avgRating.toFixed(1)} דירוג עירוני
                </span>
              );
            })()}
          </div>

          {/* Smart City Prestige Badges — Sport-Aware */}
          <div className="flex items-center gap-2 mb-3 flex-wrap" dir="rtl">
            {(isLoadingParks || isLoadingCurated) && (
              <Loader2 size={14} className="animate-spin text-[#5BC2F2]" />
            )}
            {smartBadges.map((badge, idx) => (
              <div
                key={idx}
                className="bg-[#5BC2F2]/10 text-[#5BC2F2] px-2.5 py-1 rounded-lg text-[11px] font-bold inline-flex items-center gap-1"
              >
                {badge.icon} {badge.label}
              </div>
            ))}
            {(isLoadingParks || isLoadingCurated) && smartBadges.length === 0 && (
              <div className="bg-[#5BC2F2]/10 text-[#5BC2F2] px-2.5 py-1 rounded-lg text-[11px] font-bold inline-block">
                טוען נתונים...
              </div>
            )}
          </div>

          {/* ── NORMAL: "Power of One" — Single Best Match Card (when sport match exists) ── */}
          {!isLoadingParks && !isLoadingCurated && bestMatch && !showPioneer && (
            <motion.div
              key={`best-${bestMatch.id}-${bestMatchIndex}`}
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.3 }}
              className="bg-gradient-to-br from-slate-50 to-sky-50/40 rounded-2xl p-4 mb-4 border border-sky-100/60"
              dir="rtl"
            >
              {bestMatch.kind === 'park' ? (() => {
                const catKey = resolveCategoryKey(bestMatch);
                // Prefer imageUrl (Bunny, real park photo) over legacy image/images[0].
                const icon = getFacilityIcon(resolveParkImage(bestMatch, 80), catKey, brandingConfig);
                return (
                  <div className="flex items-center gap-3">
                    {icon.type === 'image' ? (
                      <div className={`w-10 h-10 rounded-full overflow-hidden flex-shrink-0 border-2 border-[#5BC2F2]/30 bg-white shadow-md ${
                        icon.tier === 'site_photo' ? '' : 'p-1'
                      }`}>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={icon.value}
                          alt=""
                          className={`w-full h-full ${icon.tier === 'site_photo' ? 'object-cover' : 'object-contain'}`}
                        />
                      </div>
                    ) : (
                      <div className="w-10 h-10 rounded-full bg-white border-2 border-[#5BC2F2]/30 shadow-md flex items-center justify-center text-lg flex-shrink-0">
                        {icon.value}
                      </div>
                    )}
                    <div className="flex-1 min-w-0">
                      <span className="font-bold text-slate-900 truncate block" style={{ fontFamily: 'var(--font-simpler)' }}>
                        {bestMatch.name}
                      </span>
                      <div className="flex items-center gap-2 mt-0.5">
                        {bestMatch.rating != null && typeof bestMatch.rating === 'number' && bestMatch.rating > 0 && (
                          <span className="text-xs text-amber-500 font-bold">
                            ⭐ {bestMatch.rating.toFixed(1)}
                          </span>
                        )}
                        <span className="text-xs text-slate-400">{bestMatch.formattedDistance}</span>
                      </div>
                    </div>
                    <div className="flex-shrink-0">
                      <div className="bg-[#5BC2F2] text-on-brand text-xs font-bold px-3 py-1 rounded-full shadow-sm">
                        #1
                      </div>
                    </div>
                  </div>
                );
              })() : (() => {
                const routeActivity = bestMatch.activityType || bestMatch.type;
                const sportEmoji = routeActivity === 'cycling' ? '🚴' : routeActivity === 'walking' ? '🚶' : '🏃';
                return (
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-[#38BDF8] border-2 border-white shadow-md flex items-center justify-center text-lg flex-shrink-0">
                      {sportEmoji}
                    </div>
                    <div className="flex-1 min-w-0">
                      <span className="font-bold text-slate-900 truncate block" style={{ fontFamily: 'var(--font-simpler)' }}>
                        {bestMatch.name}
                      </span>
                      <div className="flex items-center gap-2 mt-0.5">
                        {(bestMatch.distance || 0) > 0 && (
                          <span className="text-xs text-slate-400">
                            {formatDistance((bestMatch.distance || 0) * 1000)}
                          </span>
                        )}
                        {bestMatch.rating != null && typeof bestMatch.rating === 'number' && bestMatch.rating > 0 && (
                          <span className="text-xs text-amber-500 font-bold">
                            ⭐ {bestMatch.rating.toFixed(1)}
                          </span>
                        )}
                        <span className="text-xs text-slate-400">{bestMatch.formattedDistance}</span>
                      </div>
                    </div>
                    <div className="flex-shrink-0">
                      <div className="bg-[#5BC2F2] text-on-brand text-xs font-bold px-3 py-1 rounded-full shadow-sm">
                        #1
                      </div>
                    </div>
                  </div>
                );
              })()}
            </motion.div>
          )}

          {/* ── PIONEER + PLAN B — Sport-specific match NOT found (or Explorer mode) ── */}
          {!isLoadingParks && !isLoadingCurated && showPioneer && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.15 }}
              className="bg-gradient-to-br from-amber-50 to-orange-50 border border-amber-200/60 rounded-2xl p-4 mb-4"
              dir="rtl"
            >
              {/* Part A: Pioneer Message — The "Goal" */}
              <div className="flex items-start gap-3 mb-3">
                <div className="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center flex-shrink-0 text-xl shadow-sm">
                  {pioneer.pioneerEmoji}
                </div>
                <div className="flex-1">
                  <p 
                    className="font-bold text-slate-800 text-sm leading-relaxed"
                    style={{ fontFamily: 'var(--font-simpler)' }}
                  >
                    {pioneer.pioneerMessage}
                  </p>
                </div>
              </div>

              {/* Part B: Plan B Bridge — The "Action" */}
              {pioneer.fallbackAsset && (
                <>
                  <p 
                    className="text-xs text-amber-700/80 leading-relaxed mb-3 pr-13"
                    style={{ fontFamily: 'var(--font-simpler)', paddingRight: '52px' }}
                  >
                    {pioneer.planBBridge}
                  </p>

                  {/* Fallback Asset Card — "Best Alternative" */}
                  <div className="bg-white/80 rounded-xl p-3 border border-amber-100/80">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-[10px] font-bold text-amber-600 bg-amber-100 px-2 py-0.5 rounded-full">
                        האלטרנטיבה הכי טובה בסביבה
                      </span>
                    </div>
                    {pioneer.fallbackAsset.kind === 'park' ? (() => {
                      const fb = pioneer.fallbackAsset!;
                      const catKey = resolveCategoryKey(fb);
                      // Prefer imageUrl (Bunny, real park photo) over legacy image/images[0].
                      const icon = getFacilityIcon(resolveParkImage(fb, 80), catKey, brandingConfig);
                      return (
                        <div className="flex items-center gap-3">
                          {icon.type === 'image' ? (
                            <div className={`w-9 h-9 rounded-full overflow-hidden flex-shrink-0 border-2 border-amber-300/40 bg-white shadow-sm ${
                              icon.tier === 'site_photo' ? '' : 'p-0.5'
                            }`}>
                              {/* eslint-disable-next-line @next/next/no-img-element */}
                              <img
                                src={icon.value}
                                alt=""
                                className={`w-full h-full ${icon.tier === 'site_photo' ? 'object-cover' : 'object-contain'}`}
                              />
                            </div>
                          ) : (
                            <div className="w-9 h-9 rounded-full bg-white border-2 border-amber-300/40 shadow-sm flex items-center justify-center text-base flex-shrink-0">
                              {icon.value}
                            </div>
                          )}
                          <div className="flex-1 min-w-0">
                            <span className="font-bold text-slate-900 text-sm truncate block" style={{ fontFamily: 'var(--font-simpler)' }}>
                              {fb.name}
                            </span>
                            <div className="flex items-center gap-2 mt-0.5">
                              {fb.rating != null && typeof fb.rating === 'number' && fb.rating > 0 && (
                                <span className="text-[11px] text-amber-500 font-bold">
                                  ⭐ {fb.rating.toFixed(1)}
                                </span>
                              )}
                              <span className="text-[11px] text-slate-400">{fb.formattedDistance}</span>
                            </div>
                          </div>
                        </div>
                      );
                    })() : (() => {
                      const fb = pioneer.fallbackAsset!;
                      const routeActivity = fb.activityType || fb.type;
                      const sportEmoji = routeActivity === 'cycling' ? '🚴' : routeActivity === 'walking' ? '🚶' : '🏃';
                      return (
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-full bg-amber-100 border-2 border-amber-300/40 shadow-sm flex items-center justify-center text-base flex-shrink-0">
                            {sportEmoji}
                          </div>
                          <div className="flex-1 min-w-0">
                            <span className="font-bold text-slate-900 text-sm truncate block" style={{ fontFamily: 'var(--font-simpler)' }}>
                              {fb.name}
                            </span>
                            <div className="flex items-center gap-2 mt-0.5">
                              {fb.rating != null && typeof fb.rating === 'number' && fb.rating > 0 && (
                                <span className="text-[11px] text-amber-500 font-bold">
                                  ⭐ {fb.rating.toFixed(1)}
                                </span>
                              )}
                              <span className="text-[11px] text-slate-400">{fb.formattedDistance}</span>
                            </div>
                          </div>
                        </div>
                      );
                    })()}
                  </div>
                </>
              )}

              {/* No fallback at all — pure Pioneer (unmapped area) */}
              {!pioneer.fallbackAsset && (
                <p 
                  className="text-xs text-amber-700/70 leading-relaxed pr-13 mt-1"
                  style={{ fontFamily: 'var(--font-simpler)', paddingRight: '52px' }}
                >
                  {isFemale 
                    ? 'את הולכת להיות החלוצה הראשונה שתמפה את השכונה!'
                    : 'אתה הולך להיות החלוץ הראשון שימפה את השכונה!'
                  }
                </p>
              )}
            </motion.div>
          )}

          {/* Primary Action */}
          <motion.button
            onClick={onConfirm}
            disabled={isLoadingParks}
            animate={{ scale: [1, 1.01, 1] }}
            transition={{ repeat: Infinity, duration: 1.5, ease: "easeInOut" }}
            className="w-full bg-brand-cta hover:brightness-105 text-on-brand font-bold py-4 rounded-2xl shadow-xl shadow-[#5BC2F2]/30 transition-all active:scale-[0.98] disabled:opacity-60"
            style={{ fontFamily: 'var(--font-simpler)' }}
          >
            כן, זה הבית שלי!
          </motion.button>

          {/* Secondary Action */}
          <button
            onClick={onSearchOther}
            className="w-full mt-3 text-[#5BC2F2] hover:text-[#4AADE3] text-sm py-2 transition-colors underline underline-offset-2 font-bold"
            style={{ fontFamily: 'var(--font-simpler)' }}
          >
            זה לא אזור המגורים שלי, חפשו אזור אחר
          </button>
        </div>
      </div>
    </motion.div>
  );
}
