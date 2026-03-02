'use client';

import React from 'react';
import { motion } from 'framer-motion';
import { MapPin, Loader2 } from 'lucide-react';
import type { ConfirmationCardProps, NearbyFacility } from '../location-types';
import { getIdentityHook, selectSmartBadges, formatDistance, buildPioneerFallback } from '../location-utils';
import { getFacilityIcon, resolveCategoryKey } from '@/utils/facility-icon';

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
}: ConfirmationCardProps) {
  const isExplorer = mode === 'explorer';
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
                הגינה הכי קרובה ל{detectedNeighborhood || detectedCity || locationText}
              </h2>
              <p 
                className="text-slate-500 text-sm mb-3 leading-relaxed"
                style={{ fontFamily: 'var(--font-simpler)', textAlign: 'right', direction: 'rtl' }}
              >
                גינות כושר, מתקנים ומגרשים בסביבה שלך — הכל חינם ובלי ציוד.
              </p>
            </>
          )}

          {/* Fallback for when no userName (onboarding mode only) */}
          {!isExplorer && !isUpdatingLocation && !userName && (
            <h2 
              className="text-xl font-bold leading-tight text-slate-900 mb-2"
              style={{ fontFamily: 'var(--font-simpler)', textAlign: 'right', direction: 'rtl' }}
            >
              זיהינו שאתה ב-{locationText}.
            </h2>
          )}
          
          {!isExplorer && !isUpdatingLocation && !userName && (
            <p 
              className="text-slate-500 text-sm mb-3 leading-relaxed"
              style={{ fontFamily: 'var(--font-simpler)', textAlign: 'right', direction: 'rtl' }}
            >
              כאן אפשר להתאמן בחינם, בלי ציוד, להכיר שותפים חדשים ופשוט להתחיל לזרום עם האנרגיה של השכונה.
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
                const icon = getFacilityIcon(bestMatch.image, catKey, brandingConfig);
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
                      <div className="bg-[#5BC2F2] text-white text-xs font-bold px-3 py-1 rounded-full shadow-sm">
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
                      <div className="bg-[#5BC2F2] text-white text-xs font-bold px-3 py-1 rounded-full shadow-sm">
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
                      const icon = getFacilityIcon(fb.image, catKey, brandingConfig);
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
            className="w-full bg-[#5BC2F2] hover:bg-[#4AADE3] text-white font-bold py-4 rounded-2xl shadow-xl shadow-[#5BC2F2]/30 transition-all active:scale-[0.98] disabled:opacity-60"
            style={{ fontFamily: 'var(--font-simpler)' }}
          >
            {isExplorer ? 'יאללה, נגלה את הסביבה!' : 'כן, זה הבית שלי'}
          </motion.button>

          {/* Secondary Action */}
          <button
            onClick={onSearchOther}
            className="w-full mt-3 text-[#5BC2F2] hover:text-[#4AADE3] text-sm py-2 transition-colors underline underline-offset-2 font-medium"
            style={{ fontFamily: 'var(--font-simpler)' }}
          >
            {isExplorer ? 'חפש מיקום אחר' : 'לא, אני רוצה לחפש עיר אחרת'}
          </button>
        </div>
      </div>
    </motion.div>
  );
}
