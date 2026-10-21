'use client';

/**
 * RouteCreditsLine — the route's data credits (OSM / Copernicus / dataset)
 * inside the v2 route overview (enable_map_polish_v1), which no longer opens
 * the legacy RouteDetailSheet where these lived. Same source
 * (routeDataCredits); renders nothing when the route has none.
 */

import { Fragment } from 'react';
import type { Route } from '@/features/parks/core/types/route.types';
import { routeDataCredits } from '@/features/parks/core/services/route-attribution';
import { useT } from '@/hooks/useT';
import { map } from '@/messages/ns/map';

export default function RouteCreditsLine({ route }: { route: Route }) {
  const t = useT(map);
  const credits = routeDataCredits(route);
  if (credits.length === 0) return null;
  return (
    <p dir="ltr" aria-label={t('overview.route.credits.label')}
      className="mt-2.5 text-[11px] leading-relaxed text-v2-muted">
      {credits.map((c, i) => (
        <Fragment key={c.key}>
          {i > 0 && <span aria-hidden> · </span>}
          {c.href
            ? <a href={c.href} target="_blank" rel="noopener noreferrer" className="underline underline-offset-2">{c.text}</a>
            : <span>{c.text}</span>}
        </Fragment>
      ))}
    </p>
  );
}
