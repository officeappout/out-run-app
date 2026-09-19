'use client';

import React, { useState, useCallback, useMemo, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Navigation } from 'lucide-react';
import { useMapStore } from '../../../core/store/useMapStore';
import { useShelterProximity } from '../../../core/hooks/useShelterProximity';
import { formatShelterTagLabel } from '../../../core/services/shelter-proximity.service';
import ParkDetailSheet from '../park-detail/ParkDetailSheet';
import { haversineKm, distanceLabel } from '@/features/arena/utils/distance';
import { bunnyImg } from '@/lib/bunny-image';
import IconChip from '../park-detail/IconChip';
import { AMENITY_ICON_MAP, AMENITY_DISPLAY_ORDER } from '../park-detail/amenity-icons';
import type { Park, ParkFeatureTag } from '@/features/parks/core/types/park.types';
import { getPark } from '@/features/parks/core/services/parks.service';

interface ParkPreviewProps {
  userLocation: { lat: number; lng: number } | null;
}

export const ParkPreview = ({ userLocation }: ParkPreviewProps) => {
  const { selectedPark, setSelectedPark } = useMapStore();
  const setPendingCommute = useMapStore((s) => s.setPendingCommute);
  const setPendingParkWorkoutStart = useMapStore((s) => s.setPendingParkWorkoutStart);
  const [detailOpen, setDetailOpen] = useState(false);
  const router = useRouter();

  // SPEC-07 redesign (17.09.2026): this preview card owns its own data
  // completeness — same principle as ParkDetailSheet, same reason (a map
  // pin click can hand this a catalog-lean object with no featureTags/
  // hasWaterFountain/city/authorityId, which this card reads directly).
  const [fetchedPark, setFetchedPark] = useState<Park | null>(null);
  useEffect(() => {
    if (!selectedPark?.id) { setFetchedPark(null); return; }
    let cancelled = false;
    setFetchedPark(null);
    getPark(selectedPark.id)
      .then((full) => { if (!cancelled) setFetchedPark(full); })
      .catch((err) => {
        console.warn('[ParkPreview] Self point-fetch failed, falling back to caller-supplied park:', err);
      });
    return () => { cancelled = true; };
  }, [selectedPark?.id]);

  const park = fetchedPark ?? selectedPark;

  const shelterDecision = useShelterProximity({ park: park as any });

  const distText = useMemo(() => {
    if (!userLocation || !park?.location) return null;
    const km = haversineKm(userLocation.lat, userLocation.lng, park.location.lat, park.location.lng);
    return distanceLabel(km);
  }, [userLocation, park?.location]);

  // Stops propagation so the card-level onClick (open detail) doesn't fire
  const handleNavigate = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    if (!park?.location) return;
    setPendingCommute({
      coords: [park.location.lng, park.location.lat],
      label: park.name,
    });
  }, [park, setPendingCommute]);

  // Derive chips from featureTags (new) + legacy flat fields; show at most 2.
  // Uses the same AMENITY_ICON_MAP + AMENITY_DISPLAY_ORDER as ParkDetailSheet's
  // "פירוט על הפארק" section so the map popup and the park page agree visually.
  const amenityTags = useMemo(() => {
    if (!park) return [];
    const tags = new Set<ParkFeatureTag>(park.featureTags ?? []);
    if (park.isShaded || park.hasNaturalShade || park.amenities?.hasShadow) tags.add('shaded');
    if (park.hasWaterFountain || park.amenities?.hasWater) tags.add('water_fountain');
    if (park.hasLights || park.amenities?.hasLighting) tags.add('night_lighting');
    if (park.amenities?.hasToilets) tags.add('has_toilets');
    if (park.hasDogPark) tags.add('dog_friendly');
    return AMENITY_DISPLAY_ORDER.filter(t => tags.has(t)).slice(0, 2);
  }, [park]);

  if (!selectedPark || !park) return null;

  // Prefer imageUrl (Bunny CDN, newest) over legacy image fields
  const rawImageUrl = park.imageUrl || park.image || park.images?.[0] || null;
  const heroSrc = bunnyImg(rawImageUrl, 400);
  // Respects a curated crop if one was ever set on the park doc; otherwise
  // the browser default (centered) applies.
  const objectPosition = park.imagePosition || undefined;

  // Organic rating only (ratingAvg/reviewCount) — no fallback to the legacy
  // `rating` field, see park.types.ts's doc comment on both fields. Leads
  // the info line (Google-style: rating first, "4.0 ★ (2)"), modest/inline
  // rather than a standalone badge. Rendered separately from `infoParts`
  // (not folded into the joined string) so the ★ glyph can carry its own
  // amber-400 color — same token as the sheet's <Star className="text-amber-400">
  // — instead of inheriting the info line's gray text color.
  const infoParts: string[] = [];
  const hasRating = park.ratingAvg != null && (park.reviewCount ?? 0) > 0;
  if (park.city) infoParts.push(park.city);
  if (distText) infoParts.push(distText);
  // Machine count — no fetch, park.gymEquipment is already on the loaded doc.
  const machineCount = park.gymEquipment?.length ?? 0;
  if (machineCount > 0) infoParts.push(`${machineCount} מתקנים`);

  return (
    <>
      <div
        className="absolute bottom-[100px] left-4 right-4 z-30 animate-in slide-in-from-bottom-10 fade-in duration-500 cursor-pointer"
        onClick={() => setDetailOpen(true)}
      >
        <div className="bg-white dark:bg-zinc-800 rounded-2xl shadow-2xl overflow-hidden flex flex-col border border-gray-100 dark:border-zinc-700">

          {/* ── Hero ─────────────────────────────────────── */}
          <div
            className="relative flex-shrink-0 bg-gradient-to-br from-cyan-100 to-slate-200 dark:from-slate-700 dark:to-slate-800"
            style={{ height: 130 }}
          >
            {heroSrc ? (
              <img
                src={heroSrc}
                alt={park.name}
                className="absolute inset-0 w-full h-full object-cover"
                style={{ objectPosition }}
                loading="lazy"
              />
            ) : (
              <div className="absolute inset-0 flex items-center justify-center">
                <span className="material-icons-round text-slate-300 dark:text-slate-600 text-3xl">park</span>
              </div>
            )}

            {/* Close */}
            <button
              onClick={(e) => { e.stopPropagation(); setSelectedPark(null); }}
              className="absolute top-2 left-2 z-10 bg-black/40 hover:bg-black/60 text-white rounded-full p-1 backdrop-blur-sm transition-colors"
            >
              <span className="material-icons-round text-[13px] leading-none">close</span>
            </button>

            {/* Navigate — moved onto the hero (paired with Close) instead of
                its own dedicated row below, which was mostly empty padding
                around one small icon button. Removes that whole row. */}
            <button
              onClick={handleNavigate}
              aria-label="נווט לפארק"
              className="absolute top-2 right-2 z-10 w-8 h-8 flex items-center justify-center rounded-full bg-cyan-500 hover:bg-cyan-600 text-white transition-colors"
            >
              <Navigation size={14} fill="currentColor" />
            </button>

            {/* Fade into card body */}
            <div className="absolute bottom-0 left-0 right-0 h-[70px] bg-gradient-to-b from-transparent to-white dark:to-zinc-800 pointer-events-none" />
          </div>

          {/* ── Body ─────────────────────────────────────── */}
          <div className="px-3 -mt-4 pb-2 relative">
            <h3 className="text-[16px] font-semibold text-gray-900 dark:text-white leading-snug">
              {park.name}
            </h3>

            {/* Info line: rating · city · distance · machine count — modest,
                inline (Google-style "4.0 ★ (2)"), not a standalone badge. */}
            <div className="flex items-center gap-1 mt-0.5 text-[12px] text-gray-500 dark:text-gray-400 flex-wrap">
              {hasRating && (
                <>
                  <span>{park.ratingAvg}</span>
                  <span className="text-amber-400">★</span>
                  <span>({park.reviewCount})</span>
                  {infoParts.length > 0 && <span>·</span>}
                </>
              )}
              <span>{infoParts.join(' · ')}</span>
            </div>

            {/* Amenity chips — max 2 */}
            {amenityTags.length > 0 && (
              <div className="flex gap-1.5 mt-2">
                {amenityTags.map(tag => {
                  const config = AMENITY_ICON_MAP[tag];
                  return (
                    <IconChip
                      key={tag}
                      label={config.label}
                      iconSrc={config.iconSrc}
                      IconComponent={config.IconComponent}
                    />
                  );
                })}
              </div>
            )}
          </div>

          {/* Shelter proximity tag */}
          {shelterDecision.show && shelterDecision.proximity && (
            <div className="px-3 py-1.5 bg-emerald-50 dark:bg-emerald-900/20 border-t border-emerald-100 dark:border-emerald-800">
              <span className="text-[11px] font-medium text-emerald-700 dark:text-emerald-300">
                {formatShelterTagLabel(shelterDecision.proximity.walkingTimeMinutes)}
              </span>
            </div>
          )}

        </div>
      </div>

      <ParkDetailSheet
        isOpen={detailOpen}
        onClose={() => setDetailOpen(false)}
        userLocation={userLocation}
        onStartWorkout={() => {
          if (!park) return;
          // compose-park-strength-workout.service.ts does its own
          // point-fetch before reading gymEquipment (SPEC-07 redesign,
          // 17.09.2026, Finding B) — passing the already-fetched `park`
          // here is a head start, not the completeness guarantee itself.
          setPendingParkWorkoutStart(park);
          setDetailOpen(false);
          // Same pendingParkWorkoutStart hand-off as GlobalDetailOverlay — the
          // workout drawer has no global mount, only /home hosts one (see
          // docs/research/park-start-workout-wiring-plan.md). This mount is
          // reached from the map-pin popup on /map, so the redirect fires here.
          if (typeof window !== 'undefined' && window.location.pathname !== '/home') {
            router.push('/home');
          }
        }}
      />
    </>
  );
};
