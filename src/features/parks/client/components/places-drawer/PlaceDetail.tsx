'use client';

/**
 * A tapped place in the drawer (board RP-4 phone ב): back to the list, the place's name and
 * "kind · distance", its workouts (the park / route page's place-workouts rail — at most one
 * banner, up to 3 real workouts) and, for a park, the sticky "התחל" of its first card. A link
 * opens the full park / route page.
 */

import { useState } from 'react';
import { ChevronRight } from 'lucide-react';
import { Button, IconButton } from '@/components/ui/v2';
import type { Park } from '@/features/parks/core/types/park.types';
import type { Route } from '@/features/parks/core/types/route.types';
import RoutePlaceWorkouts from '../place-workouts/RoutePlaceWorkouts';
import type { PlaceLeadCta } from '../place-workouts/ParkPlaceWorkouts';
import { shortDistanceLabel } from '../park-preview/park-card-meta';
import { formatNumber } from '@/lib/i18n/core/fmt';
import { useT } from '@/hooks/useT';
import { map } from '@/messages/ns/map';
import { common } from '@/messages/ns/common';
import { useLocaleStore } from '@/store/useLocaleStore';
import DrawerParkWorkouts from './DrawerParkWorkouts';
import { useFullPark } from './hooks/useFullPark';
import type { NearbyPlace } from './nearby-places';

export interface PlaceDetailProps {
  place: NearbyPlace;
  userLocation: { lat: number; lng: number } | null;
  onBack: () => void;
  /** A card started a workout (the start path navigates / composes; the drawer just resets). */
  onStarted: () => void;
  onOpenPark: (park: Park) => void;
  onOpenRoute: (route: Route) => void;
}

export default function PlaceDetail({ place, userLocation, onBack, onStarted, onOpenPark, onOpenRoute }: PlaceDetailProps) {
  const t = useT(map);
  const tc = useT(common);
  const locale = useLocaleStore((s) => s.locale);
  const [lead, setLead] = useState<PlaceLeadCta | null>(null);
  const { park, loading } = useFullPark(place.kind === 'park' ? place.id : null);

  const kindLabel = place.kind === 'park'
    ? t('placesDrawer.kind.park')
    : t('placesDrawer.kind.route', { km: formatNumber(place.km, locale, { maximumFractionDigits: 1 }) });
  const openPage = () => {
    if (place.kind === 'route') onOpenRoute(place.route);
    else if (park) onOpenPark(park);
  };

  return (
    <div data-place-detail={place.kind}>
      <div className="flex items-center gap-3 px-5 pb-3">
        <IconButton aria-label={t('placesDrawer.back')} tone="surface" size={36} onClick={onBack} className="shrink-0">
          <ChevronRight className="h-4 w-4 ltr:-scale-x-100" />
        </IconButton>
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-[18px] font-black text-v2-ink">{place.name}</h3>
          <p className="truncate text-[12.5px] font-bold text-v2-muted">
            {kindLabel} · {shortDistanceLabel(place.distanceM, locale, tc)}
          </p>
        </div>
        <Button variant="ghost" size="sm" className="shrink-0" onClick={openPage} disabled={place.kind === 'park' && !park}>
          {t('placesDrawer.openPage', { kind: place.kind })}
        </Button>
      </div>

      {place.kind === 'park' ? (
        <DrawerParkWorkouts park={park} loading={loading} userLocation={userLocation} onClose={onStarted} onLeadChange={setLead} />
      ) : (
        <div className="px-5">
          <RoutePlaceWorkouts route={place.route} userLocation={userLocation} onClose={onStarted} />
        </div>
      )}

      {lead && (
        <div className="px-5 pb-2">
          <Button variant="cta" block onClick={lead.start} data-places-lead>{lead.label}</Button>
        </div>
      )}
    </div>
  );
}
