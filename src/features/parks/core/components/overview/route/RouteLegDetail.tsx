'use client';

/**
 * RouteLegDetail — the expanded route leg (board M-5b): lighting, dedicated
 * path share, ascent and calories as chips; the elevation profile; the points
 * along the route with km from the start. Only what the route already stores;
 * every block hides itself when its data is missing.
 */

import { useMemo, useState } from 'react';
import { Lightbulb, Route as RouteIcon, Mountain, Flag, Droplet, Armchair, MapPin, Trophy, Dog } from 'lucide-react';
import type { Route } from '@/features/parks/core/types/route.types';
import CaloriesChip from '@/components/ui/CaloriesChip';
import WeightInlineRow from '@/components/ui/WeightInlineRow';
import { ActivityGlyph } from '../../hybrid/activity-icons';
import ElevationProfileChart from './ElevationProfileChart';
import { useT } from '@/hooks/useT';
import { map } from '@/messages/ns/map';
import { alongRoutePoints, routeDetailChips, routeElevation, type AlongPointKind, type RouteDetailChip } from './route-overview';

const CHIP_ICON: Record<RouteDetailChip['key'], typeof Lightbulb> = { lighting: Lightbulb, dedicated: RouteIcon, ascent: Mountain };
type PointIcon = (p: { size?: number }) => JSX.Element;
// OUT is calisthenics: a fitness station gets the app's strength glyph, never a dumbbell.
const StrengthPin: PointIcon = () => <ActivityGlyph kind="strength" className="w-[13px] h-[13px]" />;
const POINT_ICON: Partial<Record<AlongPointKind, PointIcon | typeof Flag>> = {
  start: Flag, stop: MapPin, drinking_water: Droplet, bench: Armchair, fitness_station: StrengthPin, court: Trophy, dog_park: Dog,
};

export default function RouteLegDetail({ route, calories }: { route: Route; calories: number }) {
  const t = useT(map);
  const [weightNudge, setWeightNudge] = useState(false);
  const samples = useMemo(() => routeElevation(route), [route]);
  const chips = useMemo(() => routeDetailChips(route, samples, t), [route, samples, t]);
  const points = useMemo(() => alongRoutePoints(route, t), [route, t]);
  return (
    <div>
      <div className="flex flex-wrap gap-1.5">
        {chips.map((c) => {
          const Icon = CHIP_ICON[c.key];
          return (
            <span key={c.key} className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full bg-white px-3 py-1.5 text-[13px] font-bold text-v2-ink-2 shadow-v2-ring">
              <Icon size={14} className="text-v2-deep" />{c.label}
            </span>
          );
        })}
        <CaloriesChip calories={calories} weightDependent onEditWeight={() => setWeightNudge(true)} />
      </div>
      {weightNudge && <WeightInlineRow onSaved={() => setWeightNudge(false)} />}

      {samples && <div className="mt-2.5"><ElevationProfileChart samples={samples} /></div>}

      {points.length > 0 && (
        <div className="mt-2.5">
          <div className="mb-0.5 whitespace-nowrap text-[12px] font-black text-v2-ink">{t('overview.route.along.title')}</div>
          {points.map((p) => {
            const Icon = POINT_ICON[p.kind] ?? MapPin;
            return (
              <div key={p.key} className="flex h-[26px] items-center gap-2">
                <span className="grid h-[22px] w-[22px] shrink-0 place-items-center rounded-lg bg-v2-tint text-v2-deep"><Icon size={13} /></span>
                <span className="min-w-0 flex-1 truncate whitespace-nowrap text-[13px] font-extrabold text-v2-ink">{p.label}</span>
                <span dir="ltr" className="whitespace-nowrap text-[12px] font-extrabold text-v2-muted">{p.km.toFixed(1)}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
