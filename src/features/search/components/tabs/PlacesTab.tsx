'use client';

/** "גינות" / "מסלולים" — the matches for the query, or the nearest ones when it is empty. */
import { useEffect, useState } from 'react';
import { MapPin } from 'lucide-react';
import HitGroupView, { type HitViewDeps } from '../results/HitGroupView';
import { RowSkeleton } from '../Skeletons';
import { loadParks, loadRoutes, nearestParks, nearestRoutes } from '../../providers/places';
import type { LatLng, ParkHit, RouteHit, SearchHit } from '../../core/types';

interface Props {
  kind: 'parks' | 'routes';
  query: string;
  hits: SearchHit[];
  loading: boolean;
  pos: LatLng | null;
  deps: HitViewDeps;
}

export default function PlacesTab({ kind, query, hits, loading, pos, deps }: Props) {
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
        <p className="m-0 text-[14px]">{kind === 'parks' ? 'הקלידו שם של גינה או עיר' : 'הקלידו שם של מסלול או עיר'}</p>
        <p className="m-0 text-[12px]">עם הרשאת מיקום נראה כאן את הקרובים אליך</p>
      </div>
    );
  }
  if (!nearest) return <div className="flex flex-col gap-2"><RowSkeleton /><RowSkeleton /><RowSkeleton /></div>;
  return (
    <section aria-label={kind === 'parks' ? 'גינות קרובות' : 'מסלולים קרובים'} className="flex flex-col gap-2">
      <h2 className="m-0 text-[13px] font-bold text-[#007399]">{kind === 'parks' ? 'גינות קרובות אליך' : 'מסלולים קרובים אליך'}</h2>
      <HitGroupView category={kind} hits={nearest} deps={deps} />
    </section>
  );
}
