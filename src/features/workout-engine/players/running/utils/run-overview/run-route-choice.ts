/**
 * The chosen route as the run overview shows it (boards M-6f / 6g / 6i,
 * enable_home_v2) — pure. Everything comes from the route itself + the
 * route-fit score (#491): name, length, laps, lit, how far from you, the
 * walk there / back, and the short lines for the header and the axis.
 */

import type { Route } from '@/features/parks/core/types/route.types';
import { accessKm, lighting } from '../../lib/route-fit/route-traits';
import { lapsLabel, routeKm, routeRunShape } from '../../lib/route-fit/distance-fit';
import type { RouteWorkoutScore } from '../../lib/route-fit/types';
import { routeWalkMinutes } from './run-overview-legs';

export interface RouteChoiceView {
  name: string;
  km: number;
  /** "1.5 סיבובים" / "הלוך-חזור" …; null when unknown. */
  lapsText: string | null;
  lit: boolean;
  loop: boolean;
  /** "600 מ׳ ממך" / "מתחיל כאן"; null without a position. */
  accessText: string | null;
  walk: { thereMin: number; backMin: number } | null;
  /** Card meta: "4.2 ק״מ · 1.5 סיבובים · מואר". */
  meta: string[];
  /** Above the end divider: "על לולאת הירקון — 1.5 סיבובים". */
  onRouteNote: string;
  /** Header line on the map (board M-6b): "על לולאת הירקון · 1.5 סיבובים · 600 מ׳ ממך". */
  headerLine: string;
}

export function accessText(km: number | null): string | null {
  if (km == null || !Number.isFinite(km)) return null;
  if (km <= 0.15) return 'מתחיל כאן';
  if (km < 1) return `${Math.round((km * 1000) / 50) * 50} מ׳ ממך`;
  return `${km.toFixed(1)} ק״מ ממך`;
}

export function routeChoiceView(
  route: Route,
  score: Pick<RouteWorkoutScore, 'fit'> | null,
  origin: { lat: number; lng: number } | null,
): RouteChoiceView {
  const name = route.name?.trim() || 'מסלול';
  const km = routeKm(route);
  const fit = score?.fit ?? null;
  const shape = routeRunShape(route);
  const loop = shape === 'loop';
  const lapsText = fit?.laps != null && fit.laps > 0
    ? (loop ? lapsLabel(fit.laps) : fit.turnaroundKm != null ? 'הלוך-חזור' : lapsLabel(fit.laps))
    : null;
  const lit = lighting(route) === 'lit';
  const access = origin ? accessKm(route, origin) : null;
  const meta = [`${km.toFixed(1)} ק״מ`];
  if (lapsText) meta.push(lapsText);
  if (lit) meta.push('מואר');
  const aText = accessText(access);
  const headerParts = [`על ${name}`];
  if (lapsText) headerParts.push(lapsText);
  if (aText) headerParts.push(aText);
  return {
    name, km, lapsText, lit, loop,
    accessText: aText,
    walk: routeWalkMinutes(access, fit?.endsAtStart ?? loop),
    meta,
    onRouteNote: lapsText ? `על ${name} — ${lapsText}` : `על ${name}`,
    headerLine: headerParts.join(' · '),
  };
}
