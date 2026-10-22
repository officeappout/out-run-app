'use client';

/**
 * useRouteShade — the shade a route card / route detail shows
 * (enable_route_shade_tag). Flag off → always null, and nothing is fetched.
 * Flag on → the route's own `shadeInfo` (GraphHopper loops), else the stored
 * route's answer from POST /api/routes/shade (batched, cached).
 */
import { useEffect, useState } from 'react';
import { useFeatureFlags } from '@/hooks/useFeatureFlags';
import { isStoredRouteId, type RouteShadeInfo } from '@/lib/route-shade-view';
import type { Route } from '../../types/route.types';
import { loadRouteShade, peekRouteShade } from './route-shade-client';

export function useRouteShadeTagEnabled(): boolean {
  const { flags, loading } = useFeatureFlags();
  return !loading && !!flags.enableRouteShadeTag;
}

export function useRouteShade(route: Pick<Route, 'id' | 'shadeInfo'> | null | undefined): RouteShadeInfo | null {
  const on = useRouteShadeTagEnabled();
  const own = route?.shadeInfo ?? null;
  const id = route?.id ?? null;
  const [fetched, setFetched] = useState<{ id: string; info: RouteShadeInfo | null } | null>(() => {
    if (!id) return null;
    const hit = peekRouteShade(id);
    return hit === undefined ? null : { id, info: hit };
  });

  useEffect(() => {
    if (!on || own || !id || !isStoredRouteId(id)) return;
    let alive = true;
    loadRouteShade(id).then((info) => { if (alive) setFetched({ id, info }); });
    return () => { alive = false; };
  }, [on, own, id]);

  if (!on) return null;
  if (own) return own;
  return fetched && fetched.id === id ? fetched.info : null;
}
