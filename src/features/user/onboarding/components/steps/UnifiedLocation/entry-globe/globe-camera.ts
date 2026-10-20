/**
 * Entry globe — pure camera math for the live Earth and the dive
 * (enable_entry_globe_v1). No Mapbox / React imports: every function returns
 * plain camera options the GlobeStage hands to mapbox-gl, so the sequence is
 * unit-testable.
 *
 * Half-circle trick (same as the website hero, HeroDive.tsx): Mapbox clamps the
 * padded centre inside the canvas, so a top padding of the full canvas height
 * pins the globe's centre to the canvas bottom — only its top half shows.
 * Easing the padding back to 0 "lifts" the Earth into the middle.
 */

export type LngLat = [number, number];

export interface CameraPadding {
  top: number;
  bottom: number;
  left: number;
  right: number;
}

export interface CameraOptions {
  center: LngLat;
  zoom: number;
  pitch: number;
  bearing: number;
  padding: CameraPadding;
  /** ms; 0 = jump. */
  duration: number;
  /** flyTo only — the zoom-out arc (Mapbox default 1.42). */
  curve?: number;
  /** Lets the dive run even when the OS asks for reduced motion — we handle that ourselves. */
  essential?: boolean;
}

export type CameraMethod = 'jumpTo' | 'easeTo' | 'flyTo';

export interface CameraStep {
  method: CameraMethod;
  options: CameraOptions;
  /** 'street' = the step that lands on the user; arrival is reported after it. */
  role: 'globe' | 'region' | 'street';
}

export interface Viewport {
  width: number;
  height: number;
}

/** Israel — where the Earth faces at rest and the region beat of the dive. */
export const ISRAEL_CENTER: LngLat = [34.95, 31.6];
/** Region beat: the whole country in view. */
export const REGION_ZOOM = 6.6;
/** Must match the street map's zoom in UnifiedLocationStep (setViewState zoom 14) so the cross-fade lines up. */
export const STREET_ZOOM = 14;

export const DIVE_DURATIONS = {
  /** rest → centred Earth */
  lift: 1100,
  /** centred Earth → country */
  region: 1700,
  /** anywhere → the user's street */
  street: 2600,
  /** back to the half Earth after a failed / denied fix */
  rest: 900,
} as const;

const NO_PADDING: CameraPadding = { top: 0, bottom: 0, left: 0, right: 0 };

/** Globe zoom that renders the Earth at radius r px (512px tiles). */
export function zoomForRadius(radiusPx: number): number {
  const r = Math.max(1, radiusPx);
  return Math.log2((r * 2 * Math.PI) / 512);
}

function safeViewport({ width, height }: Viewport): Viewport {
  return {
    width: Number.isFinite(width) && width > 0 ? width : 390,
    height: Number.isFinite(height) && height > 0 ? height : 844,
  };
}

/** Radius of the resting half-Earth: its top edge sits around mid-screen. */
export function restRadius(viewport: Viewport): number {
  const { width, height } = safeViewport(viewport);
  return Math.min(0.5 * height, 1.15 * width);
}

/** The resting camera: the Earth as a half circle rising from the bottom edge. */
export function globeRestCamera(viewport: Viewport, lngOffset = 0): CameraOptions {
  const { height } = safeViewport(viewport);
  return {
    center: [ISRAEL_CENTER[0] + lngOffset, ISRAEL_CENTER[1]],
    zoom: zoomForRadius(restRadius(viewport)),
    pitch: 0,
    bearing: 0,
    padding: { ...NO_PADDING, top: height },
    duration: 0,
  };
}

/** The whole Earth, centred (first beat of the dive). */
export function globeCentredCamera(viewport: Viewport): CameraOptions {
  const { width, height } = safeViewport(viewport);
  return {
    center: ISRAEL_CENTER,
    zoom: zoomForRadius(0.42 * Math.min(width, height)),
    pitch: 0,
    bearing: 0,
    padding: NO_PADDING,
    duration: DIVE_DURATIONS.lift,
    essential: true,
  };
}

export function streetCamera(target: { lat: number; lng: number }, duration: number = DIVE_DURATIONS.street): CameraOptions {
  return {
    center: [target.lng, target.lat],
    zoom: STREET_ZOOM,
    pitch: 0,
    bearing: 0,
    padding: NO_PADDING,
    duration,
    curve: 1.3,
    essential: true,
  };
}

function isValidTarget(t: { lat: number; lng: number } | null | undefined): t is { lat: number; lng: number } {
  return !!t && Number.isFinite(t.lat) && Number.isFinite(t.lng) && Math.abs(t.lat) <= 90 && Math.abs(t.lng) <= 180;
}

export interface DiveSequenceInput {
  viewport: Viewport;
  /** The user's fix, once known. null = still locating. */
  target: { lat: number; lng: number } | null;
  reduceMotion?: boolean;
}

/**
 * The dive, as camera steps to run in order.
 *  - still locating → lift the Earth to centre, then fly to the country (and
 *    wait there for the fix);
 *  - fix known → one flyTo from wherever the camera is to the street — Mapbox
 *    starts a flyTo from the current camera, so a fix that lands mid-dive
 *    simply bends the flight towards the user ("continue smoothly");
 *  - reduced motion → a single jump to the street.
 */
export function buildDiveSequence({ viewport, target, reduceMotion = false }: DiveSequenceInput): CameraStep[] {
  if (isValidTarget(target)) {
    return reduceMotion
      ? [{ method: 'jumpTo', options: streetCamera(target, 0), role: 'street' }]
      : [{ method: 'flyTo', options: streetCamera(target), role: 'street' }];
  }
  if (reduceMotion) {
    return [{ method: 'jumpTo', options: { ...globeCentredCamera(viewport), duration: 0 }, role: 'globe' }];
  }
  return [
    { method: 'easeTo', options: globeCentredCamera(viewport), role: 'globe' },
    {
      method: 'flyTo',
      options: {
        center: ISRAEL_CENTER,
        zoom: REGION_ZOOM,
        pitch: 0,
        bearing: 0,
        padding: NO_PADDING,
        duration: DIVE_DURATIONS.region,
        essential: true,
      },
      role: 'region',
    },
  ];
}

/** Back to the resting half-Earth (failed / denied fix). */
export function buildRestStep(viewport: Viewport, reduceMotion = false): CameraStep {
  return {
    method: reduceMotion ? 'jumpTo' : 'easeTo',
    options: { ...globeRestCamera(viewport), duration: reduceMotion ? 0 : DIVE_DURATIONS.rest },
    role: 'globe',
  };
}

/** Idle spin: degrees of longitude per animation frame at rest. */
export const IDLE_SPIN_DEG_PER_FRAME = 0.04;

/** Next idle-spin offset, wrapped to [-180, 180). */
export function nextSpinOffset(offset: number, step = IDLE_SPIN_DEG_PER_FRAME): number {
  const v = offset - step;
  return ((((v + 180) % 360) + 360) % 360) - 180;
}

/** Safety net: if the street flight never reports arrival, give up after this. */
export function arrivalTimeoutMs(step: CameraStep): number {
  return step.options.duration + 1500;
}
