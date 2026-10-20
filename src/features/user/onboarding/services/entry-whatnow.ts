/**
 * entry-whatnow — the entry flow's step 2 on the map: "מה בא לך עכשיו?" (enable_entry_whatnow_v1).
 *
 * PURE (no React / Firebase): which cards the landing drawer shows, their copy, and the
 * once-per-user persistence key. The drawer opens once, right after the location step (C1)
 * lands on /map with `entry=v2` (or the sessionStorage hint, see ../entry-v2-landing.ts).
 *
 *   near a park / a good route → ROUTE card · PLAN hero · KELLY card   (design N2)
 *   otherwise                  → PLAN hero ("מומלץ לך") · KELLY card     (design N2b)
 *
 * The route card never invents a generator: its numbers come from the map's own suggestion
 * (the first hybrid slot of the "מה עושים היום?" carousel) and the nearest equipped park.
 */

/** A park within this distance (metres) counts as "near" on its own. */
export const WHATNOW_NEAR_PARK_M = 400;
/**
 * A route suggestion counts as "a good route" when its park is within this walk reach (metres)
 * — the map's walk+strength loop goes through that park.
 */
export const WHATNOW_ROUTE_REACH_M = 1200;

export type WhatNowCardKind = 'route' | 'plan' | 'kelly';
export type WhatNowAnswer = WhatNowCardKind | 'browse' | 'dismiss';

export interface WhatNowPark {
  name: string | null;
  distanceM: number;
}

/** The map's own suggestion (the first hybrid slot) reduced to what the card shows. */
export interface WhatNowRouteSuggestion {
  minutes: number;
  /** Strength stops on the way; null = not known before the compose (copy omits the number). */
  stops: number | null;
  aerobicKind: 'walking' | 'running';
}

export interface WhatNowContext {
  nearestPark: WhatNowPark | null;
  route: WhatNowRouteSuggestion | null;
}

export interface WhatNowLayout {
  /** True → design N2 (route first); false → design N2b (plan first, tagged "מומלץ לך"). */
  near: boolean;
  cards: WhatNowCardKind[];
  title: string;
  /** The plan hero carries the "מומלץ לך" tag only when it leads (no route card). */
  planTagged: boolean;
}

/** Near a park, or a route suggestion whose park is within walking reach. */
export function isNearParkOrRoute(ctx: WhatNowContext): boolean {
  const d = ctx.nearestPark?.distanceM;
  if (d == null || !Number.isFinite(d)) return false;
  if (d <= WHATNOW_NEAR_PARK_M) return true;
  return ctx.route != null && d <= WHATNOW_ROUTE_REACH_M;
}

/** Which cards, in which order. A route card needs a real suggestion to show. */
export function chooseWhatNowCards(ctx: WhatNowContext): WhatNowLayout {
  const near = isNearParkOrRoute(ctx) && ctx.route != null && ctx.route.minutes > 0;
  return near
    ? { near: true, cards: ['route', 'plan', 'kelly'], title: 'מה בא לך עכשיו?', planTagged: false }
    : { near: false, cards: ['plan', 'kelly'], title: 'מה בא לך?', planTagged: true };
}

/** "גינת סוטין" → "בגינת סוטין"; unnamed → "בגינה הקרובה". */
function inPark(name: string | null | undefined): string {
  const n = name?.trim();
  return n ? `ב${n}` : 'בגינה הקרובה';
}

export interface WhatNowRouteCopy {
  tag: string;
  title: string;
  sub: string;
}

/** The route card's copy (design N2, verbatim shape). */
export function whatNowRouteCopy(route: WhatNowRouteSuggestion, parkName: string | null | undefined): WhatNowRouteCopy {
  const min = Math.max(1, Math.round(route.minutes));
  const verb = route.aerobicKind === 'running' ? 'ריצה מכאן' : 'הליכה מכאן';
  const stops =
    route.stops == null ? 'עם עצירות כוח'
      : route.stops <= 1 ? 'עם עצירת כוח'
        : `עם ${route.stops} עצירות כוח`;
  return {
    tag: 'מומלץ לך עכשיו',
    title: `מסלול בשכונה שלך · ${min} דק׳`,
    sub: `${verb}, ${stops} על המתקנים ${inPark(parkName)}`,
  };
}

/** Kelly's ready chips (design N2k). No prompt changes in this flag — copy only. */
export const WHATNOW_KELLY_CHIPS = [
  'אימון ישבן בבית',
  'מתח ראשון בחיים',
  'להכיר שותפים לריצה',
  'סתם למצוא ברזייה',
  'משהו קל אחרי יום עבודה',
  'ללמוד עמידת ידיים',
] as const;

/** `/ai-coach?starter=entry` → the chat opens with WHATNOW_KELLY_CHIPS as its quick replies. */
export const WHATNOW_KELLY_STARTER = 'entry';
export const WHATNOW_KELLY_URL = `/ai-coach?starter=${WHATNOW_KELLY_STARTER}`;

/** The chips the chat should open with for a `starter` URL param (null = the chat's own). */
export function starterChipsFor(starter: string | null | undefined): readonly string[] | null {
  return starter === WHATNOW_KELLY_STARTER ? WHATNOW_KELLY_CHIPS : null;
}

/** onboardingPrefs key — "this user answered or dismissed step 2" (axioms §19: survives a hard close). */
export function whatNowSeenKey(uid: string | null | undefined): string {
  return `entry_whatnow_seen:${uid || 'anon'}`;
}

/** Open the drawer? Flag on (loaded), an entry-v2 landing, not seen, and the map is calm. */
export function shouldOpenWhatNow(input: {
  enabled: boolean;
  landing: boolean;
  seenValue: string | null | undefined;
  /** A workout is running / another flow owns the screen. */
  blocked: boolean;
}): boolean {
  return input.enabled && input.landing && !input.seenValue && !input.blocked;
}

/**
 * The route card's "first workout" line (RouteCardUnified footnote): only with the flag on
 * and while the user has NOT accepted the health declaration yet.
 */
export const FIRST_WORKOUT_NOTE = 'באימון הראשון: 3 פרטים והצהרת בריאות. דקה, ויוצאים.';

export function firstWorkoutNote(enabled: boolean, healthDeclarationAccepted: boolean): string | null {
  return enabled && !healthDeclarationAccepted ? FIRST_WORKOUT_NOTE : null;
}

/** The slice of a map slot (hybrid-slots.ts HybridSlot) this file reads — structural, no import. */
export interface WhatNowSlotLike {
  kind: string;
  timeBudgetMin?: number;
  preset?: { mode?: string | null } | null;
}

/**
 * The map's own suggestion for the route card: the first walk/run + strength slot of the
 * "מה עושים היום?" carousel (never the full-park workout — that is a park session, not a route).
 * One stop for the balanced / smart walk (it goes through one park); unknown for route_stops.
 */
export function routeSuggestionFromSlots(
  slots: readonly WhatNowSlotLike[] | null | undefined,
  aerobicKind: 'walking' | 'running',
): WhatNowRouteSuggestion | null {
  const slot = (slots ?? []).find(
    (s) => s.kind === 'hybrid' && s.preset?.mode !== 'full_park_workout' && (s.timeBudgetMin ?? 0) > 0,
  );
  if (!slot) return null;
  return {
    minutes: slot.timeBudgetMin ?? 0,
    stops: slot.preset?.mode === 'route_stops' ? null : 1,
    aerobicKind,
  };
}

/** A mini map for the route card: the Mapbox static image around the user and the park. */
export function whatNowMiniMapUrl(
  center: { lat: number; lng: number } | null,
  token: string | null | undefined,
): string | null {
  if (!center || !token || !Number.isFinite(center.lat) || !Number.isFinite(center.lng)) return null;
  const c = `${center.lng.toFixed(5)},${center.lat.toFixed(5)}`;
  return `https://api.mapbox.com/styles/v1/mapbox/streets-v12/static/${c},14.5,0/700x192@2x?access_token=${token}&language=he&attribution=false&logo=false`;
}
