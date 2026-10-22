'use client';

/**
 * Route shade on the map's route surfaces (panel flag enable_route_shade_tag,
 * default OFF). Every component here renders NOTHING while the flag is off or
 * the route has no measured data, so a host's DOM is byte-identical then.
 *
 *   RouteQualityBadgesWithShade — the card badge row (RouteCarousel /
 *     BottomJourneyContainer): "🌳 מוצל X%" as the first pill.
 *   RouteShadeTagPill           — the same tag as a v2 pill (RouteOverviewCompactCard).
 *   RouteShadeRow               — route details (RouteOverviewDrawer v2 / RouteDetailSheet):
 *     "מוצל X%", "עכשיו · בצהריים · אחה״צ" (hourly layer), "מואר בלילה X%".
 *
 * Numbers + visibility rules: src/lib/route-shade-view (pure).
 */
import { Clock, Moon, Trees } from 'lucide-react';
import type { Route } from '../../types/route.types';
import { useRouteShade, useRouteShadeTagEnabled } from '../../services/route-shade/useRouteShade';
import { routeShadeRowView, shadeTagPct } from '@/lib/route-shade-view';
import RouteQualityBadges from '../RouteQualityBadges';
import { useT } from '@/hooks/useT';
import { map } from '@/messages/ns/map';

type ShadeRoute = Pick<Route, 'id' | 'shadeInfo' | 'qualitySignals'>;

export function RouteQualityBadgesWithShade({ route, scrollable, className }: { route: ShadeRoute; scrollable?: boolean; className?: string }) {
  const t = useT(map);
  const pct = shadeTagPct(useRouteShade(route));
  return (
    <RouteQualityBadges
      qualitySignals={route.qualitySignals}
      className={className}
      scrollable={scrollable}
      leadingLabel={pct != null ? t('shade.tag', { pct: String(pct) }) : null}
    />
  );
}

export function RouteShadeTagPill({ route }: { route: ShadeRoute }) {
  const t = useT(map);
  const pct = shadeTagPct(useRouteShade(route));
  if (pct == null) return null;
  return (
    <span className="inline-flex shrink-0 items-center whitespace-nowrap rounded-full bg-v2-surface text-[12px] font-bold text-v2-ink-2 ring-1 ring-inset ring-v2-hairline" style={{ padding: '3px 9px' }}>
      {t('shade.tag', { pct: String(pct) })}
    </span>
  );
}

const ROW_CLASS = {
  v2: {
    wrap: 'mt-2.5 flex flex-wrap gap-2',
    chip: 'inline-flex items-center gap-1.5 rounded-full bg-white px-3 py-1.5 text-[13px] font-bold text-v2-ink-2 shadow-v2-ring',
    icon: 'shrink-0 text-v2-deep',
  },
  legacy: {
    wrap: 'mb-6 flex flex-wrap gap-2',
    chip: 'inline-flex items-center gap-1.5 px-3 py-1.5 bg-gray-100 rounded-full text-xs font-bold text-gray-600',
    icon: 'shrink-0 text-gray-500',
  },
} as const;

export function RouteShadeRow({ route, variant, now }: { route: ShadeRoute; variant: 'v2' | 'legacy'; now?: Date }) {
  const t = useT(map);
  const info = useRouteShade(route);
  // The lighting line rides on the same switch: flag off → no row at all.
  const on = useRouteShadeTagEnabled();
  const view = on ? routeShadeRowView(info, route.qualitySignals, now ?? new Date()) : null;
  if (!view) return null;
  const c = ROW_CLASS[variant];
  const hourly = view.hourly
    ? [
        view.hourly.now != null ? t('shade.row.now', { pct: String(view.hourly.now) }) : null,
        view.hourly.noon != null ? t('shade.row.noon', { pct: String(view.hourly.noon) }) : null,
        view.hourly.afternoon != null ? t('shade.row.afternoon', { pct: String(view.hourly.afternoon) }) : null,
      ].filter((s): s is string => !!s)
    : [];
  return (
    <div dir="rtl" role="group" aria-label={t('shade.row.label')} className={c.wrap} data-testid="route-shade-row">
      {view.shadedPct != null && (
        <span className={`${c.chip} whitespace-nowrap`}><Trees size={15} className={c.icon} aria-hidden />{t('shade.row.shaded', { pct: String(view.shadedPct) })}</span>
      )}
      {hourly.length > 0 && (
        <span className={c.chip}><Clock size={15} className={c.icon} aria-hidden />{hourly.join(' · ')}</span>
      )}
      {view.litPct != null && (
        <span className={`${c.chip} whitespace-nowrap`}><Moon size={15} className={c.icon} aria-hidden />{t('shade.row.lit', { pct: String(view.litPct) })}</span>
      )}
    </div>
  );
}
