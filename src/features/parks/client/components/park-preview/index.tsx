'use client';

import React, { useState, useCallback, useMemo, useEffect } from 'react';
import { Navigation, ArrowLeftRight } from 'lucide-react';
import { useMapStore } from '../../../core/store/useMapStore';
import { useShelterProximity } from '../../../core/hooks/useShelterProximity';
import { formatShelterTagLabel } from '../../../core/services/shelter-proximity.service';
import ParkDetailSheet from '../park-detail/ParkDetailSheet';
import { haversineKm, distanceLabel } from '@/features/arena/utils/distance';
import { bunnyImg } from '@/lib/bunny-image';

const FOCAL_POSITIONS = ['center', 'top', 'bottom', 'left center', 'right center'];

const CHIP_DEFS: { key: string; label: string; icon: string }[] = [
  { key: 'shaded',         label: 'הצללה',      icon: 'umbrella' },
  { key: 'water_fountain', label: 'ברזיית מים',  icon: 'water_drop' },
  { key: 'has_benches',    label: 'ספסלים',      icon: 'chair' },
  { key: 'night_lighting', label: 'תאורה',       icon: 'light_mode' },
  { key: 'has_toilets',    label: 'שירותים',     icon: 'wc' },
  { key: 'dog_friendly',   label: 'ידידותי לכלבים', icon: 'pets' },
];

interface ParkPreviewProps {
  userLocation: { lat: number; lng: number } | null;
}

export const ParkPreview = ({ userLocation }: ParkPreviewProps) => {
  const { selectedPark, setSelectedPark } = useMapStore();
  const setPendingCommute = useMapStore((s) => s.setPendingCommute);
  const shelterDecision = useShelterProximity({ park: selectedPark as any });
  const [detailOpen, setDetailOpen] = useState(false);
  const [focalIndex, setFocalIndex] = useState(0);

  // Reset focal point when a different park is selected
  useEffect(() => {
    const saved = selectedPark?.imagePosition;
    const idx = saved ? FOCAL_POSITIONS.indexOf(saved) : -1;
    setFocalIndex(idx >= 0 ? idx : 0);
  }, [selectedPark?.id]);

  const distText = useMemo(() => {
    if (!userLocation || !selectedPark?.location) return null;
    const km = haversineKm(userLocation.lat, userLocation.lng, selectedPark.location.lat, selectedPark.location.lng);
    return distanceLabel(km);
  }, [userLocation, selectedPark?.location]);

  // Stops propagation so the card-level onClick (open detail) doesn't fire
  const handleNavigate = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    if (!selectedPark?.location) return;
    setPendingCommute({
      coords: [selectedPark.location.lng, selectedPark.location.lat],
      label: selectedPark.name,
    });
  }, [selectedPark, setPendingCommute]);

  // Derive chips from featureTags (new) + legacy flat fields; show at most 2
  const amenityChips = useMemo(() => {
    if (!selectedPark) return [];
    const tags = new Set<string>(selectedPark.featureTags ?? []);
    if (selectedPark.isShaded || selectedPark.hasNaturalShade || selectedPark.amenities?.hasShadow) tags.add('shaded');
    if (selectedPark.hasWaterFountain || selectedPark.amenities?.hasWater) tags.add('water_fountain');
    if (selectedPark.hasLights || selectedPark.amenities?.hasLighting) tags.add('night_lighting');
    if (selectedPark.amenities?.hasToilets) tags.add('has_toilets');
    if (selectedPark.hasDogPark) tags.add('dog_friendly');
    return CHIP_DEFS.filter(d => tags.has(d.key)).slice(0, 2);
  }, [selectedPark]);

  if (!selectedPark) return null;

  // Prefer imageUrl (Bunny CDN, newest) over legacy image fields
  const rawImageUrl = selectedPark.imageUrl || selectedPark.image || selectedPark.images?.[0] || null;
  const heroSrc = bunnyImg(rawImageUrl, 400);
  const objectPosition = FOCAL_POSITIONS[focalIndex];

  const infoParts: string[] = [];
  if (selectedPark.city) infoParts.push(selectedPark.city);
  if (distText) infoParts.push(distText);

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
                alt={selectedPark.name}
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

            {/* Focal-point toggle */}
            {heroSrc && (
              <button
                onClick={(e) => { e.stopPropagation(); setFocalIndex(i => (i + 1) % FOCAL_POSITIONS.length); }}
                aria-label="שנה מיקוד תמונה"
                className="absolute bottom-8 left-2 z-10 w-7 h-7 rounded-full bg-white/80 dark:bg-zinc-700/80 backdrop-blur-sm border border-gray-200/60 dark:border-zinc-600/60 flex items-center justify-center text-gray-600 dark:text-gray-300 hover:bg-white dark:hover:bg-zinc-700 transition-colors"
              >
                <ArrowLeftRight size={13} />
              </button>
            )}

            {/* Fade into card body */}
            <div className="absolute bottom-0 left-0 right-0 h-[70px] bg-gradient-to-b from-transparent to-white dark:to-zinc-800 pointer-events-none" />
          </div>

          {/* ── Body ─────────────────────────────────────── */}
          <div className="px-3 -mt-4 pb-2 relative">
            <h3 className="text-[16px] font-semibold text-gray-900 dark:text-white leading-snug">
              {selectedPark.name}
            </h3>

            {/* Info line: city · distance · ⭐ rating */}
            <div className="flex items-center gap-1 mt-0.5 text-[12px] text-gray-500 dark:text-gray-400 flex-wrap">
              <span>{infoParts.join(' · ')}</span>
              {selectedPark.rating != null && (
                <>
                  {infoParts.length > 0 && <span>·</span>}
                  <span className="material-icons-round text-amber-400" style={{ fontSize: 12 }}>star</span>
                  <span>{selectedPark.rating}</span>
                </>
              )}
            </div>

            {/* Amenity chips — max 2 */}
            {amenityChips.length > 0 && (
              <div className="flex gap-1.5 mt-2">
                {amenityChips.map(chip => (
                  <span
                    key={chip.key}
                    className="inline-flex items-center gap-0.5 bg-gray-100 dark:bg-zinc-700 border border-gray-200/60 dark:border-zinc-600/40 rounded-full px-2 py-0.5 text-[11px] text-gray-600 dark:text-gray-300"
                  >
                    <span className="material-icons-round" style={{ fontSize: 11 }}>{chip.icon}</span>
                    {chip.label}
                  </span>
                ))}
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

          {/* Navigate CTA */}
          <div className="px-3 py-2.5">
            <button
              onClick={handleNavigate}
              className="w-full flex items-center justify-center gap-1.5 rounded-xl bg-cyan-500 text-white text-[14px] font-bold active:bg-cyan-600 transition-colors"
              style={{ height: 40 }}
            >
              <Navigation size={14} fill="currentColor" />
              נווט לפארק
            </button>
          </div>

        </div>
      </div>

      <ParkDetailSheet
        isOpen={detailOpen}
        onClose={() => setDetailOpen(false)}
        userLocation={userLocation}
      />
    </>
  );
};
