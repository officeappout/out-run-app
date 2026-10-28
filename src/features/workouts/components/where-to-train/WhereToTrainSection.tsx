'use client';

/**
 * WhereToTrainSection — "איפה מתאמנים?" under the intensity selector (enable_where_to_train_v1,
 * board RP-13 phone 4). A פארק / בית toggle (drives the existing location swap); פארק shows a
 * carousel of nearby parks with the map's compact park card, best match first; בית shows only the
 * home-equipment chip. Military users get a third segment, שירות (the "service" location the old
 * switcher offered them) — no option that exists today is dropped. Render-only: data and handlers come from the drawer.
 */

import { Home, Shield, Trees } from 'lucide-react';
import SegmentedPicker from '@/components/ui/v2/SegmentedPicker';
import HScroller from '@/components/ui/v2/HScroller';
import Chip from '@/components/ui/v2/Chip';
import ParkCardCompact, { COMPACT_INLINE_CARD_PX, COMPACT_INLINE_WIDTH_PX } from '@/features/parks/client/components/park-preview/ParkCardCompact';
import { shortDistanceLabel } from '@/features/parks/client/components/park-preview/park-card-meta';
import { useT } from '@/hooks/useT';
import { library } from '@/messages/ns/library';
import { map } from '@/messages/ns/map';
import { common } from '@/messages/ns/common';
import { useLocaleStore } from '@/store/useLocaleStore';
import type { WhereToTrainPark } from './useWhereToTrainParks';
import { whereLocationOptions } from './where-location-options';

export type WhereToTrainLocation = 'park' | 'home' | 'service';

export interface WhereToTrainSectionProps {
  location: WhereToTrainLocation;
  onSelectLocation: (loc: WhereToTrainLocation) => void;
  /** Military persona: offer the "service" location as a third segment. */
  showService?: boolean;
  isSwapping: boolean;
  /** Already-translated notice when a location switch was refused (location gate). */
  blockedNotice?: string | null;
  parks: readonly WhereToTrainPark[];
  loading: boolean;
  selectedParkId: string | null;
  onOpenPark: (park: WhereToTrainPark) => void;
  /** Equipment labels of the workout, for the home chip ("בבית · מתח"). */
  homeGearLabels: readonly string[];
  /** The workout has no home version: no בית option; with one location left the toggle hides (AA4). */
  homeBlocked?: boolean;
}

export default function WhereToTrainSection({
  location, onSelectLocation, showService = false, isSwapping, blockedNotice, parks, loading, selectedParkId, onOpenPark, homeGearLabels,
  homeBlocked = false,
}: WhereToTrainSectionProps) {
  const t = useT(library);
  const tm = useT(map);
  const tc = useT(common);
  const locale = useLocaleStore((s) => s.locale);

  const metaParts = (p: WhereToTrainPark) => [
    ...(p.city ? [p.city] : []),
    shortDistanceLabel(p.distanceM, locale, tc),
    ...(p.machineCount > 0 ? [tm('parkCard.machines', { count: String(p.machineCount) })] : []),
  ];

  const offered = whereLocationOptions({ current: location, showService, homeBlocked });
  const options = [
    { key: 'park' as const, label: t('preview.where.park'), icon: <Trees size={14} /> },
    { key: 'home' as const, label: t('preview.where.home'), icon: <Home size={14} /> },
    { key: 'service' as const, label: t('preview.where.service'), icon: <Shield size={14} /> },
  ].filter((o) => offered.includes(o.key));

  return (
    <section className="relative z-20 px-6 pb-3" aria-label={t('preview.location.title')}>
      <div className="mb-3 flex items-center gap-2.5">
        <h3 className="text-[15px] font-black text-v2-ink">{t('preview.location.title')}</h3>
        {isSwapping && <span className="text-xs font-bold text-v2-deep animate-pulse">{t('preview.location.swapping')}</span>}
        <span className="flex-1" />
        {options.length > 1 && (
          <SegmentedPicker
            className="!w-auto min-w-[150px]"
            ariaLabel={t('preview.location.title')}
            value={location}
            onChange={(k) => { if (!isSwapping && k !== location) onSelectLocation(k); }}
            options={options}
          />
        )}
      </div>

      {blockedNotice && !isSwapping && options.length > 1 && (
        <p role="status" className="mb-2 text-xs font-bold text-amber-600">{blockedNotice}</p>
      )}

      {location === 'park' ? (
        (loading && parks.length === 0) ? (
          <HScroller gap={2.5} edge={0} className="-mx-6 px-6 pb-1 pt-0.5" aria-hidden>
            {[0, 1].map((i) => (
              <div key={i} className="animate-pulse rounded-v2-card bg-v2-surface"
                style={{ width: COMPACT_INLINE_WIDTH_PX, height: COMPACT_INLINE_CARD_PX }} />
            ))}
          </HScroller>
        ) : parks.length > 0 ? (
          <HScroller gap={2.5} edge={0} className="-mx-6 px-6 pb-1 pt-0.5" aria-label={t('preview.where.parksLabel')}>
            {parks.map((p) => (
              <ParkCardCompact
                key={p.id}
                layout="inline"
                selected={p.id === selectedParkId}
                name={p.name}
                heroSrc={p.heroSrc}
                objectPosition={p.objectPosition}
                rating={p.rating}
                metaParts={metaParts(p)}
                amenityTags={p.amenityTags}
                onOpen={() => onOpenPark(p)}
              />
            ))}
          </HScroller>
        ) : null
      ) : location === 'service' ? null : (
        <Chip icon={<Home size={14} />}>
          {homeGearLabels.length > 0
            ? t('preview.where.homeGear', { gear: homeGearLabels.join(' · ') })
            : t('preview.where.homeBodyweight')}
        </Chip>
      )}
    </section>
  );
}
