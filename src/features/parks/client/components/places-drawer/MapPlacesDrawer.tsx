'use client';

/**
 * MapPlacesDrawer — the idle map's ONE bottom drawer (enable_map_places_drawer_v1, canvas page 11,
 * board RP-4 refined by RP-12 / RP-13). Always from the user's location:
 *   א  what's within walking range (training parks + on-foot official routes), filter chips, and
 *      per place the workouts that fit there — place-fit's pure ranking, NO generator for the list;
 *   ב  a tapped place → its workouts (the park / route page's place-workouts rail, no fork);
 *   ג  nothing in range (or nothing for the chip) → "צור לי מסלול באזור שלי", the EXISTING
 *      route generator via `onGenerateRoute`.
 *
 * Reads: the map's own caches (park catalog, official routes) + today's plan (usePlaceUserContext).
 * Sits above the v2 nav stack at a fixed height (places-drawer.layout, so the map HUD stacks above
 * it); the grabber collapses it to the header + chips.
 */

import { useMemo, useState } from 'react';
import { suggestWorkoutsForPlace } from '@/features/workout-engine/place-fit';
import type { Park } from '@/features/parks/core/types/park.types';
import type { Route } from '@/features/parks/core/types/route.types';
import { formatNumber } from '@/lib/i18n/core/fmt';
import { useT } from '@/hooks/useT';
import { map } from '@/messages/ns/map';
import { useLocaleStore } from '@/store/useLocaleStore';
import { usePlaceUserContext } from '../place-workouts/hooks/usePlaceUserContext';
import { useNearbyPlaces } from './hooks/useNearbyPlaces';
import PlacesDrawerChips from './PlacesDrawerChips';
import PlaceRow from './PlaceRow';
import PlaceDetail from './PlaceDetail';
import PlacesDrawerEmpty from './PlacesDrawerEmpty';
import {
  drawerBody, filterPlacesByChip, generatorActivityFor, placeTags, WALK_RANGE_M,
  type GeneratorActivity, type PlacesChip,
} from './places-drawer.logic';
import { PLACES_DRAWER_BOTTOM_CSS, placesDrawerHeightCss } from './places-drawer.layout';


export interface MapPlacesDrawerProps {
  userLocation: { lat: number; lng: number } | null;
  /** The existing generator flow (free-run drawer → "עם מסלול"), from the user's location. */
  onGenerateRoute: (activity: GeneratorActivity) => void;
  onOpenPark: (park: Park) => void;
  onOpenRoute: (route: Route) => void;
  /** Open / collapsed is the host's (the map HUD stacks above the drawer's height). */
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function MapPlacesDrawer({
  userLocation, onGenerateRoute, onOpenPark, onOpenRoute, open, onOpenChange,
}: MapPlacesDrawerProps) {
  const t = useT(map);
  const locale = useLocaleStore((s) => s.locale);
  const [chip, setChip] = useState<PlacesChip>('all');
  const [selectedKey, setSelectedKey] = useState<string | null>(null);

  const { places, loading } = useNearbyPlaces(true, userLocation);
  const { ctx } = usePlaceUserContext(true, userLocation);

  const rows = useMemo(() => places.map((place) => {
    const suggestions = ctx ? suggestWorkoutsForPlace(place.engine, ctx) : [];
    return { place, suggestions, styles: suggestions.map((s) => s.style) };
  }), [places, ctx]);
  const shown = useMemo(() => filterPlacesByChip(rows, chip), [rows, chip]);
  const body = drawerBody({ loading, hasLocation: !!userLocation, nearbyCount: rows.length, shownCount: shown.length });
  const selected = selectedKey ? places.find((p) => p.key === selectedKey) ?? null : null;

  return (
    <section
      aria-label={t('placesDrawer.title')}
      data-map-places-drawer
      className="pointer-events-auto absolute inset-x-3 z-[60] flex flex-col overflow-hidden rounded-[28px] bg-white shadow-v2-sheet transition-[height] duration-300 ease-v2"
      style={{ bottom: PLACES_DRAWER_BOTTOM_CSS, height: placesDrawerHeightCss(open) }}
    >
      <button type="button" onClick={() => onOpenChange(!open)} aria-expanded={open}
        aria-label={t('placesDrawer.toggle', { open: open ? 'yes' : 'no' })} className="block w-full shrink-0 pb-1 pt-2.5">
        <span className="mx-auto block h-[5px] w-10 rounded-full bg-v2-pill-border" />
      </button>

      {selected && open ? (
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain pt-1">
          <PlaceDetail
            key={selected.key}
            place={selected}
            userLocation={userLocation}
            onBack={() => setSelectedKey(null)}
            onStarted={() => setSelectedKey(null)}
            onOpenPark={onOpenPark}
            onOpenRoute={onOpenRoute}
          />
        </div>
      ) : (
        <>
          <div className="shrink-0 px-5 pb-2">
            <h3 className="text-[18px] font-black text-v2-ink">{t('placesDrawer.title')}</h3>
            <p className="text-[12.5px] font-bold text-v2-muted">
              {t('placesDrawer.subtitle', { km: formatNumber(WALK_RANGE_M / 1000, locale, { maximumFractionDigits: 1 }) })}
            </p>
          </div>
          <div className="shrink-0"><PlacesDrawerChips value={chip} onChange={setChip} /></div>
          {open && (
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain pt-2">
              {body.kind === 'loading' && (
                <p role="status" className="px-5 pb-4 text-[13px] font-bold text-v2-muted">{t('placesDrawer.loading')}</p>
              )}
              {body.kind === 'list' && (
                <ul className="flex flex-col gap-4 px-5 pb-4">
                  {shown.map((r) => (
                    <PlaceRow key={r.place.key} place={r.place} tags={placeTags(r.suggestions, chip)} onOpen={(p) => { setSelectedKey(p.key); onOpenChange(true); }} />
                  ))}
                </ul>
              )}
              {body.kind === 'generate' && (
                <PlacesDrawerEmpty
                  key={chip}
                  reason={body.reason}
                  initialActivity={generatorActivityFor(chip, ctx?.persona ?? null)}
                  onGenerate={onGenerateRoute}
                />
              )}
            </div>
          )}
        </>
      )}
    </section>
  );
}
