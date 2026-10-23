/**
 * Destination planner (enable_destination_planner_v1) — shared types.
 * The step between an address pick ("נווט לכאן") and the commute player:
 * mode tabs, preference chips, up to 2 route options, one start button.
 */
import type { Route } from '../types/route.types';

export type PlannerMode = 'walking' | 'running' | 'cycling';

/** The preference chips. `null` = none picked (the default view). */
export type PlannerPreference = 'park' | 'lit' | 'shortest' | 'shade';

export interface LatLng { lat: number; lng: number }

/** A fitness park the "via park" option stops at. */
export interface ViaParkStop {
  parkId: string;
  name: string;
  location: LatLng;
  /** Distance along the route to the stop (km), null when it couldn't be placed. */
  afterKm: number | null;
}

export interface ViaParkCandidate { route: Route; stop: ViaParkStop }

/** What the generator gave us for one destination + mode. */
export interface PlannerCandidates {
  /** A→B commute variants (fastest / alternative / quiet) — the existing generator. */
  commute: Route[];
  /** Routes through a nearby fitness park (0–2). */
  viaParks: ViaParkCandidate[];
}

export type PlannerOptionKind = 'shortest' | 'via_park' | 'alternative';
export type PlannerBadge = 'recommended' | 'stop' | 'shortest' | null;

export interface PlannerOption {
  /** = route.id */
  id: string;
  kind: PlannerOptionKind;
  route: Route;
  badge: PlannerBadge;
  stop?: ViaParkStop;
}
