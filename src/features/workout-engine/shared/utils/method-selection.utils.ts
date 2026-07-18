/**
 * method-selection.utils.ts — SINGLE SOURCE OF TRUTH for choosing an exercise's
 * ExecutionMethod given a (location, availableGear) context.
 *
 * Extracted verbatim from ContextualEngine.findMatchingMethod so that EVERY
 * workout-pipeline path — pool filtering, guarantee/david refill, warmup,
 * cooldown, domain-rescue, recovery — resolves a method the SAME way, instead of
 * grabbing `executionMethods[0]` (which is authored home-first → a home method
 * leaks into a park workout).
 *
 * Return contract:
 *   ExecutionMethod → the best method for this context.
 *   null            → "this exercise cannot be performed in this context" → EXCLUDE it.
 *                     null NEVER means "fall back to method 0".
 *
 * Fallback ladder:
 *   PARK: park-tagged (gear-gated) → bodyweight/surface → exclude. NEVER home.
 *   HOME/other: exact-location → home-fallback (non-home only) → available-gear
 *               → [opt: park rescue for home content-gap] → bodyweight → exclude.
 *
 * PURE / ISOMORPHIC: no React, no Firebase, no I/O. Only dependency is
 * gear-mapping.utils (the single source for gear family/unidirectional rules).
 */

import type {
  Exercise,
  ExecutionLocation,
  ExecutionMethod,
} from '@/features/content/exercises/core/exercise.types';
import {
  normalizeGearId,
  isGearOptional,
  satisfiesGearRequirement,
} from './gear-mapping.utils';

export interface SelectMethodOptions {
  /**
   * Home content-gap rescue. When true AND `location` is 'home' and this exercise
   * has NO home-tagged method, allow a park-tagged method before falling back to
   * bodyweight. STRICTLY ADDITIVE — only rescues exercises that would otherwise be
   * excluded (null).
   *
   * ⚠️ RESERVED / currently disabled by ALL callers. Rationale: surfacing a
   * park-only move (e.g. a bar muscle-up) to a home user who lacks a bar is worse
   * than excluding it and letting the domain guarantee fill the slot with a
   * bodyweight substitute (the graceful degrade). Re-enable only once a home
   * pull-up-bar / equipment check gates it. Default false = legacy
   * ContextualEngine.findMatchingMethod parity.
   */
  homeParkFallback?: boolean;
}

/**
 * Select the best ExecutionMethod for an exercise in a given location + available
 * gear. See file header for the return contract and fallback ladder.
 */
export function selectMethodForContext(
  exercise: Exercise,
  location: ExecutionLocation,
  availableGear: string[],
  options: SelectMethodOptions = {},
): ExecutionMethod | null {
  const methods = exercise.execution_methods || exercise.executionMethods || [];
  if (!methods.length) return null;

  // Prefer methods with media, with an EXACT-location preference.
  // "Has media" recognises the NEW Bunny previewVideo (not just legacy
  // mainVideoUrl/imageUrl) — otherwise a Bunny-only park method looks media-less
  // and loses to a legacy home method that only reached this list via locationMapping.
  // Priority: exact-location+media > exact-location > any+media > any.
  const hasMedia = (m: ExecutionMethod): boolean =>
    !!(m.media?.mainVideoUrl ||
       m.media?.imageUrl ||
       (m.media as any)?.previewVideo?.he?.videoId ||
       (m.media as any)?.previewVideo?.en?.videoId);
  const preferMedia = (
    list: ExecutionMethod[],
    exactLocation?: string,
  ): ExecutionMethod | null => {
    if (!list.length) return null;
    const exact = exactLocation ? list.filter(m => m.location === exactLocation) : [];
    return exact.find(hasMedia) ?? exact[0] ?? list.find(hasMedia) ?? list[0] ?? null;
  };

  // Unified gear collector — merges equipmentIds + gearIds, normalises all.
  const collectMethodGear = (m: ExecutionMethod): string[] => {
    const raw: string[] = [];
    if (m.equipmentIds?.length) raw.push(...m.equipmentIds);
    else if ((m as any).equipmentId) raw.push((m as any).equipmentId);
    if (m.gearIds?.length) raw.push(...m.gearIds);
    else if ((m as any).gearId) raw.push((m as any).gearId);
    return raw.filter(Boolean).map(normalizeGearId);
  };

  // `availableGear` is the resolved session gear (already contains the
  // ESSENTIAL_PARK_GEAR / ASSUMED_HOME_GEAR baselines injected upstream by
  // InputSanitizerMiddleware.normalizeEquipmentArray when applicable).
  const normalizedAvailable = availableGear.map(normalizeGearId);

  // Gear that every park/outdoor location effectively provides:
  // floor surface replaces a mat, walls exist everywhere.
  const SURFACE_GEAR_AT_PARK = new Set(['mat', 'yoga_mat', 'wall', 'chair']);

  // ── Park equipment gating ─────────────────────────────────────────────────
  // satisfiesGearRequirement is the single source of truth for unidirectional
  // rules (parallettes → satisfied by 'parallettes' OR 'dip_station';
  // dip_station → satisfied by 'dip_station' ONLY). Park gating applies only in
  // the 'park' location (the only location that previously carried
  // constraints.bypassLimits === true, so `location === 'park'` is exactly
  // equivalent to the former guard).
  const applyParkGating = (list: ExecutionMethod[]): ExecutionMethod[] => {
    if (location !== 'park') return list;
    return list.filter(m => {
      const allIds = collectMethodGear(m);
      if (allIds.length === 0) return true;
      const requiredIds = allIds.filter(
        id => id !== 'bodyweight' && id !== 'none' && !SURFACE_GEAR_AT_PARK.has(id) && !isGearOptional(id),
      );
      if (requiredIds.length === 0) return true;
      return requiredIds.every(reqId => satisfiesGearRequirement(reqId, normalizedAvailable));
    });
  };

  // A method qualifies if all its required gear is in the resolved available set.
  const requiresOnlyAvailableGear = (m: ExecutionMethod): boolean => {
    const allIds = collectMethodGear(m);
    if (allIds.length === 0) return false;
    const requiredIds = allIds.filter(
      id => id !== 'bodyweight' && id !== 'none' && !SURFACE_GEAR_AT_PARK.has(id) && !isGearOptional(id),
    );
    if (requiredIds.length === 0) return false;
    return requiredIds.every(reqId => satisfiesGearRequirement(reqId, normalizedAvailable));
  };

  // ── PARK: Strict location enforcement ────────────────────────────────
  // At a park, only methods explicitly tagged for park/outdoor are considered.
  // If park methods exist but ALL fail equipment gating, the exercise is
  // hard-rejected — there is NO fallback to home or generic gear paths.
  // This prevents location mixing: a TRX-dependent "home" method must never
  // be selected just because TRX happens to be available at this park.
  //
  // The only non-park-tagged methods that survive are purely bodyweight/surface
  // methods, which have no equipment requirement and are universally outdoor-
  // compatible (e.g. a push-up with no gearId).
  if (location === 'park') {
    const parkCandidates = methods.filter(m =>
      m.location === 'park' || m.locationMapping?.includes('park' as any),
    );

    if (parkCandidates.length > 0) {
      const gated = applyParkGating(parkCandidates);
      if (gated.length > 0) return preferMedia(gated, 'park');

      // Park methods exist but ALL failed equipment gating → strict rejection.
      // Do not fall through to home, available-gear, or bodyweight paths.
      const exName = typeof exercise.name === 'string'
        ? exercise.name
        : (exercise.name?.he || exercise.name?.en || exercise.id);
      console.warn(
        `[ParkGating] "${exName}" — ${parkCandidates.length} park method(s) all gated → exercise excluded`,
        'Required gear not in park inventory:',
        parkCandidates.map(m => ({ method: m.methodName, gear: collectMethodGear(m) })),
        'Available:', availableGear.slice(0, 20),
      );
      return null;
    }

    // No park-tagged methods at all → only pure bodyweight/surface methods survive.
    // Home-tagged methods are NOT used even if their gear happens to be available.
    const BODYWEIGHT_PASS = new Set(['bodyweight', 'none', ...Array.from(SURFACE_GEAR_AT_PARK)]);
    const bwCandidates = methods.filter(m => {
      const ids = collectMethodGear(m);
      return ids.length === 0 || ids.every(id => BODYWEIGHT_PASS.has(id));
    });
    return bwCandidates.length > 0 ? preferMedia(bwCandidates) : null;
  }

  // ── Priority 1: Exact primary location match (non-park locations) ─────
  const candidates = methods.filter(m =>
    m.location === location ||
    m.locationMapping?.includes(location),
  );
  if (candidates.length > 0) return preferMedia(candidates, location);

  // ── Priority 2: Home fallback (non-park, non-home locations) ──────────
  if (location !== 'home') {
    const homeCandidates = methods.filter(
      m => m.location === 'home' || m.locationMapping?.includes('home'),
    );
    if (homeCandidates.length > 0) return preferMedia(homeCandidates, 'home');
  }

  // ── Priority 2.5: Methods requiring only available gear (non-park) ────
  const availableGearCandidates = methods.filter(requiresOnlyAvailableGear);
  if (availableGearCandidates.length > 0) return preferMedia(availableGearCandidates);

  // ── Priority 2.75 (opt-in, additive): Home content-gap → park rescue ──
  // High-level home users can have exercises whose only authored method is a
  // park method (e.g. advanced מתח). Rather than exclude, allow the park method
  // before dropping to bodyweight. Additive: only reached when no home / no
  // available-gear method matched (this exercise would otherwise return null).
  if (options.homeParkFallback && location === 'home') {
    const parkRescue = methods.filter(
      m => m.location === 'park' || m.locationMapping?.includes('park' as any),
    );
    if (parkRescue.length > 0) return preferMedia(parkRescue, 'park');
  }

  // ── Priority 3: Bodyweight-only (non-park, any method, no equipment) ──
  const PASSTHROUGH_GEAR = new Set([
    'bodyweight', 'none',
    ...Array.from(SURFACE_GEAR_AT_PARK),
  ]);
  const bodyweightCandidates = methods.filter(m => {
    const ids = collectMethodGear(m);
    return ids.length === 0 || ids.every(id => PASSTHROUGH_GEAR.has(id));
  });
  if (bodyweightCandidates.length > 0) return preferMedia(bodyweightCandidates);

  // ── No viable method found ─────────────────────────────────────────────
  return null;
}
