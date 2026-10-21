'use client';

/** "גינות" / "מסלולים" — the matches for the query, or the nearest ones when it is empty. */
import { useEffect, useState } from 'react';
import { MapPin } from 'lucide-react';
import HitGroupView, { type HitViewDeps } from '../results/HitGroupView';
import { RowSkeleton } from '../Skeletons';
import { loadParks, loadRoutes, nearestParks, nearestRoutes } from '../../providers/places';
import type { LatLng, ParkHit, RouteHit, SearchHit } from '../../core/types';
import { useT } from '@/hooks/useT';
import { library } from '@/messages/ns/library';

interface Props {
  kind: 'parks' | 'routes';
  query: string;
  hits: SearchHit[];
  loading: boolean;
  pos: LatLng | null;
  deps: HitViewDeps;
}

export default function PlacesTab({ kind, query, hits, loading, pos, deps }: Props) {
  const t = useT(library);
  const [nearest, setNearest] = useState<Array<ParkHit | RouteHit> | null>(null);
  const lat = pos?.lat;
  const lng = pos?.lng;
  useEffect(() => {
    if (query || lat == null || lng == null) return;
    let alive = true;
    const p = { lat, lng };
    (kind === 'parks' ? loadParks().then((l) => nearestParks(l, p, 15)) : loadRoutes().then((l) => nearestRoutes(l, p, 15)))
      .then((l) => alive && setNearest(l))
      .catch(() => alive && setNearest([]));
    return () => { alive = false; };
  }, [kind, query, lat, lng]);

  if (query) {
    if (loading && !hits.length) return <div className="flex flex-col gap-2"><RowSkeleton /><RowSkeleton /><RowSkeleton /></div>;
    return <HitGroupView category={kind} hits={hits} query={query} deps={deps} />;
  }
  if (lat == null) {
    return (
      <div className="flex flex-col items-center gap-2 py-10 text-center text-[#6b7280]">
        <MapPin size={22} className="text-[#007399]" aria-hidden />
        <p className="m-0 text-[14px]">{t(`search.places.typeHint.${kind}`)}</p>
        <p className="m-0 text-[12px]">{t('search.places.locationHint')}</p>
      </div>
    );
  }
  if (!nearest) return <div className="flex flex-col gap-2"><RowSkeleton /><RowSkeleton /><RowSkeleton /></div>;
  return (
    <section aria-label={t(`search.places.nearLabel.${kind}`)} className="flex flex-col gap-2">
      <h2 className="m-0 text-[13px] font-bold text-[#007399]">{t(`search.places.nearTitle.${kind}`)}</h2>
      <HitGroupView category={kind} hits={nearest} deps={deps} />
    </section>
  );
}
