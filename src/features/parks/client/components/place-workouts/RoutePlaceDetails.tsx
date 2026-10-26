'use client';

/**
 * The route page's "פירוט" (enable_place_workouts_v1, board RP-13 phones 2–3):
 * collapsed by default; open = the elevation chart, "מה יש בדרך" as a
 * vertical axis (type icon · name · km from the start, the gap written on the
 * line), then chips: calories, uses, dedicated path %, surface. Every block
 * hides itself when the route has no such data.
 */

import { useMemo, useState, type ComponentType } from 'react';
import { type LucideProps, Armchair, ChevronDown, Droplet, Dog, Flag, Flame, MapPin, Mountain, Route as RouteIcon, Trophy, Users, Waypoints } from 'lucide-react';
import type { Route } from '@/features/parks/core/types/route.types';
import ElevationProfileChart from '@/features/parks/core/components/overview/route/ElevationProfileChart';
import { routeElevation } from '@/features/parks/core/components/overview/route/route-overview';
import { ActivityGlyph } from '@/features/parks/core/components/hybrid/activity-icons';
import { formatNumber } from '@/lib/i18n/core/fmt';
import { useT } from '@/hooks/useT';
import { map } from '@/messages/ns/map';
import { routeAxisNodes, type AxisNodeKind } from './route-axis';

type NodeIcon = ComponentType<LucideProps>;
// OUT is calisthenics: a park / fitness station gets the app's strength glyph, never a dumbbell.
const StrengthIcon: NodeIcon = () => <ActivityGlyph kind="strength" className="h-[14px] w-[14px]" />;
const NODE_ICON: Partial<Record<AxisNodeKind, NodeIcon>> = {
  start: MapPin, finish: Flag, climb: Mountain, stop: StrengthIcon, fitness_station: StrengthIcon,
  drinking_water: Droplet, bench: Armchair, court: Trophy, dog_park: Dog,
};

const CHIP = 'inline-flex items-center gap-1.5 whitespace-nowrap rounded-full bg-white px-3 py-1.5 text-[13px] font-bold text-v2-ink-2 shadow-v2-ring';

export default function RoutePlaceDetails({ route }: { route: Route }) {
  const t = useT(map);
  const [open, setOpen] = useState(false);
  const samples = useMemo(() => (open ? routeElevation(route) : null), [open, route]);
  const nodes = useMemo(() => (open ? routeAxisNodes(route, samples, t) : []), [open, route, samples, t]);
  const km = (n: number) => formatNumber(n, t.locale, { minimumFractionDigits: 1, maximumFractionDigits: 1 });

  const uses = route.analytics?.usageCount ?? 0;
  const genuine = route.qualitySignals?.composition?.genuinePct;
  const surface = route.features?.surface?.trim();

  return (
    <section className="mb-6">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-center gap-2 rounded-[18px] bg-v2-surface px-3.5 py-3 text-start ring-1 ring-inset ring-v2-hairline transition-transform duration-150 ease-v2 active:scale-[0.99]"
      >
        <span className="min-w-0 flex-1">
          <span className="block text-[15px] font-black text-v2-ink">{t('placeWorkouts.details.toggle')}</span>
          <span className="block truncate text-[12px] font-bold text-v2-muted">{t('placeWorkouts.details.hint')}</span>
        </span>
        <ChevronDown size={18} className="shrink-0 text-v2-deep" style={{ transform: open ? 'rotate(180deg)' : 'none', transition: 'transform .2s' }} aria-hidden />
      </button>

      {open && (
        <div className="mt-3">
          {samples && <ElevationProfileChart samples={samples} />}

          {nodes.length > 0 && (
            <div className="mt-4">
              <div className="text-[15px] font-black text-v2-ink">{t('placeWorkouts.details.alongTitle')}</div>
              <p className="mb-2 text-[12px] font-bold text-v2-muted">{t('placeWorkouts.details.alongHint')}</p>
              <ol className="relative">
                {nodes.map((n, i) => {
                  const Icon = NODE_ICON[n.kind] ?? Waypoints;
                  const last = i === nodes.length - 1;
                  return (
                    <li key={n.key} className="relative flex gap-3 pb-1">
                      <span dir="ltr" className="w-9 shrink-0 pt-1.5 text-end text-[13px] font-black tabular-nums text-v2-ink">{km(n.km)}</span>
                      <span className="relative flex w-7 shrink-0 flex-col items-center">
                        <span className="grid h-7 w-7 place-items-center rounded-full bg-v2-tint text-v2-deep"><Icon size={14} /></span>
                        {!last && <span className="w-[2px] flex-1 bg-v2-hairline" aria-hidden />}
                      </span>
                      <span className="min-w-0 flex-1 pb-2 pt-1">
                        <span className="block truncate text-[14px] font-extrabold text-v2-ink">{n.label}</span>
                        {n.note && <span className="block truncate text-[12px] font-bold text-v2-muted">{n.note}</span>}
                        {!last && nodes[i + 1].gapKm != null && nodes[i + 1].gapKm! > 0 && (
                          <span dir="ltr" className="mt-1 inline-block text-[11.5px] font-extrabold text-v2-muted">
                            {t('placeWorkouts.details.gap', { km: km(nodes[i + 1].gapKm!) })}
                          </span>
                        )}
                      </span>
                    </li>
                  );
                })}
              </ol>
            </div>
          )}

          <div className="mt-3 flex flex-wrap gap-2">
            {route.calories > 0 && (
              <span className={CHIP}><Flame size={14} className="text-orange-500" aria-hidden />{t('placeWorkouts.chips.calories', { n: String(route.calories) })}</span>
            )}
            {uses > 0 && (
              <span className={CHIP}><Users size={14} className="text-v2-deep" aria-hidden />{t('placeWorkouts.chips.uses', { count: uses })}</span>
            )}
            {genuine != null && Number.isFinite(genuine) && genuine > 0 && (
              <span className={CHIP}><RouteIcon size={14} className="text-v2-deep" aria-hidden />{t('placeWorkouts.chips.dedicated', { pct: String(Math.round(genuine)) })}</span>
            )}
            {surface && <span className={CHIP}>{t('routePreview.surface', { surface })}</span>}
          </div>
        </div>
      )}
    </section>
  );
}
