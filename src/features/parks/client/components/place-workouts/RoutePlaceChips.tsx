'use client';

/**
 * Route page top chips (enable_place_workouts_v1, board RP-13 phone 2): in place
 * of calories / uses (moved into "פירוט"), the route's shade % and "מואר" — only
 * when known (measured shade; verified lighting).
 */

import { Lightbulb, Trees } from 'lucide-react';
import type { Route } from '@/features/parks/core/types/route.types';
import { useRouteShade } from '@/features/parks/core/services/route-shade/useRouteShade';
import { shadeTagPct } from '@/lib/route-shade-view';
import { isRouteLitVerified } from '@/features/parks/core/services/route-quality-badges.service';
import { useT } from '@/hooks/useT';
import { map } from '@/messages/ns/map';

const CHIP = 'inline-flex items-center gap-1.5 whitespace-nowrap rounded-full bg-white px-3 py-1.5 text-[13px] font-bold text-v2-ink-2 shadow-v2-ring';

export default function RoutePlaceChips({ route }: { route: Route }) {
  const t = useT(map);
  const pct = shadeTagPct(useRouteShade(route));
  const lit = isRouteLitVerified(route);
  if (pct == null && !lit) return null;
  return (
    <div className="mb-4 flex flex-wrap gap-2">
      {pct != null && <span className={CHIP}><Trees size={14} className="text-emerald-600" aria-hidden />{t('placeWorkouts.chips.shade', { pct: String(pct) })}</span>}
      {lit && <span className={CHIP}><Lightbulb size={14} className="text-amber-500" aria-hidden />{t('placeWorkouts.chips.lit')}</span>}
    </div>
  );
}
