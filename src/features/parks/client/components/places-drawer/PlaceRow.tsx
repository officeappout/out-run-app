'use client';

/**
 * One nearby place in the drawer list (board RP-4 phone א, owner 26.10: the map's compact park card,
 * ParkCardCompact): photo card with the name and "kind · distance", then the place's workout tags
 * (place-fit, no generator). Tap → the place's workouts. Render-only.
 */

import { Chip } from '@/components/ui/v2';
import ParkCardCompact from '../park-preview/ParkCardCompact';
import { shortDistanceLabel } from '../park-preview/park-card-meta';
import { placePhotoOf } from '../place-workouts/place-card-media';
import { resolveParkImage } from '@/lib/park-image';
import { formatNumber } from '@/lib/i18n/core/fmt';
import { useT } from '@/hooks/useT';
import { map } from '@/messages/ns/map';
import { common } from '@/messages/ns/common';
import { useLocaleStore } from '@/store/useLocaleStore';
import type { NearbyPlace } from './nearby-places';
import type { PlaceTag } from './places-drawer.logic';

export interface PlaceRowProps {
  place: NearbyPlace;
  tags: readonly PlaceTag[];
  onOpen: (place: NearbyPlace) => void;
}

export default function PlaceRow({ place, tags, onOpen }: PlaceRowProps) {
  const t = useT(map);
  const tc = useT(common);
  const locale = useLocaleStore((s) => s.locale);
  const kindLabel = place.kind === 'park'
    ? t('placesDrawer.kind.park')
    : t('placesDrawer.kind.route', { km: formatNumber(place.km, locale, { maximumFractionDigits: 1 }) });
  const hero = place.kind === 'park' ? resolveParkImage(place.park, 600) || null : placePhotoOf(place.route);
  return (
    <li className="list-none" data-place-row={place.kind}>
      <ParkCardCompact
        layout="inline"
        fill
        name={place.name}
        heroSrc={hero}
        objectPosition={place.kind === 'park' ? place.park.imagePosition || undefined : undefined}
        rating={null}
        metaParts={[kindLabel, shortDistanceLabel(place.distanceM, locale, tc)]}
        amenityTags={[]}
        onOpen={() => onOpen(place)}
      />
      {tags.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {tags.map((tag) => (
            <Chip key={tag.style} tone={tag.fromPlan ? 'accent' : 'neutral'}>
              {tag.fromPlan
                ? t('placesDrawer.tagPlan', { style: tag.style })
                : tag.minutes != null
                  ? t('placesDrawer.tag', { style: tag.style, min: String(tag.minutes) })
                  : t('placesDrawer.tagNoMin', { style: tag.style })}
            </Chip>
          ))}
        </div>
      )}
    </li>
  );
}
