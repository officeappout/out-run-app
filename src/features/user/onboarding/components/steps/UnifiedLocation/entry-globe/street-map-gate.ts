/**
 * Entry globe: WHEN the step's street map may be created (pilot note AC2, 29.10).
 * Pure, unit-tested.
 *
 * With the globe on, /explorer used to build two mapbox-gl maps in the same
 * frames (the Earth + the street map under it): two WebGL contexts, two style
 * parses and two tile bursts at once, so the Earth stuttered as it rose. The
 * street map is only seen after the dive lands, so it now waits until the Earth
 * has loaded (or failed), then one idle beat. It still mounts right away when
 * the globe is off, and as soon as the step leaves the resting screen, so a
 * landing never waits on it.
 */

/** Pause after the Earth's first frame before the street map is built. */
export const STREET_MAP_IDLE_DELAY_MS = 400;
/** Never hold the street map back longer than this, whatever the globe does. */
export const STREET_MAP_MAX_DEFER_MS = 3_000;

export function shouldMountStreetMap(input: {
  entryGlobe: boolean;
  /** Already built once: never tear it down (a flag resolving late must not unmount it). */
  alreadyMounted?: boolean;
  /** The Earth has loaded or failed, and the idle beat has passed. */
  globeSettled: boolean;
  /** The user acted (dive, search, a fix): the street map is needed soon. */
  leftRest: boolean;
}): boolean {
  if (input.alreadyMounted || !input.entryGlobe) return true;
  return input.globeSettled || input.leftRest;
}
