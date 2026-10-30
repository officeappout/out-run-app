/**
 * Location sheet model (enable_feature_info_sheets_v1, board SwapCard as corrected 29.10): the
 * "i" next to "איפה מתאמנים?" explains that one tap switches the whole workout to park, home or
 * service. PURE. Built from what the section really offers (whereLocationOptions); the demo
 * walks the offered places starting from the current one. One place only → no "i".
 */

export type InfoLocation = 'park' | 'home' | 'service';

export interface LocationInfoInput {
  /** What the toggle offers, in its own order. */
  offered: readonly InfoLocation[];
  current: InfoLocation;
}

export interface LocationInfoModel {
  /** The offered places, in the toggle's order (step 1 lists them). */
  offered: InfoLocation[];
  /** The demo's order: the current place first, then the rest in toggle order. */
  order: InfoLocation[];
  hasHome: boolean;
  hasService: boolean;
}

export function buildLocationInfo({ offered, current }: LocationInfoInput): LocationInfoModel | null {
  const places = offered.filter((p, i) => offered.indexOf(p) === i);
  if (places.length < 2) return null;
  const start = Math.max(0, places.indexOf(current));
  const order = [...places.slice(start), ...places.slice(0, start)];
  return { offered: places, order, hasHome: places.includes('home'), hasService: places.includes('service') };
}

/** Which Kelly chips fit: home vs service, park vs home, and "no gear at home". */
export type LocationChip = 'service' | 'parkHome' | 'noGear';

export function locationChips(m: LocationInfoModel): LocationChip[] {
  if (!m.hasHome) return [];
  return [m.hasService ? 'service' : 'parkHome', 'noGear'];
}
