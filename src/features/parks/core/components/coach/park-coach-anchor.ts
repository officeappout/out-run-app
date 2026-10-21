/**
 * The map tour's "פארקים" step needs a DOM element on a park, but park pins are WebGL symbols.
 * While a map tour may run (first-run or replay — both flag-gated), the map screen asks for an
 * anchor; AppMap then drops ONE invisible, non-interactive DOM marker (data-coach="map-park")
 * on the park pin nearest the screen centre. Nobody asks → nothing is rendered.
 *
 * A tiny counted signal (useSyncExternalStore) so the map layer and AppMap don't need a shared
 * store or new props. Pure helpers are unit-tested.
 */
import { useEffect, useSyncExternalStore } from 'react';

let wanted = 0;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export function setParkCoachAnchorWanted(on: boolean): () => void {
  if (!on) return () => {};
  wanted += 1;
  emit();
  return () => {
    wanted = Math.max(0, wanted - 1);
    emit();
  };
}

export function isParkCoachAnchorWanted(): boolean {
  return wanted > 0;
}

function subscribe(l: () => void): () => void {
  listeners.add(l);
  return () => listeners.delete(l);
}

/** The map screen: ask for the anchor while `on`. */
export function useRequestParkCoachAnchor(on: boolean): void {
  useEffect(() => setParkCoachAnchorWanted(on), [on]);
}

/** Render-only form of useRequestParkCoachAnchor (for screens that decide late in render). */
export function ParkCoachAnchorRequest({ on }: { on: boolean }): null {
  useRequestParkCoachAnchor(on);
  return null;
}

/** AppMap: is the anchor wanted right now? */
export function useParkCoachAnchorWanted(): boolean {
  return useSyncExternalStore(subscribe, isParkCoachAnchorWanted, () => false);
}

export interface ScreenPoint { x: number; y: number }

/** The candidate nearest the centre (null when none). Pure. */
export function nearestToCenter<T extends { point: ScreenPoint }>(items: T[], center: ScreenPoint): T | null {
  let best: T | null = null;
  let bestD = Infinity;
  for (const it of items) {
    const d = (it.point.x - center.x) ** 2 + (it.point.y - center.y) ** 2;
    if (d < bestD) { bestD = d; best = it; }
  }
  return best;
}
