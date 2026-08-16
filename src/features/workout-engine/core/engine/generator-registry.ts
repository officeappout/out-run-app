/**
 * generator-registry — the list of all real Generators built so far (§11.3 retrofits).
 * Adding a new generator later means one new entry here, nothing else — the engine
 * (`suggestion-engine.ts`) and ranker (`rank-suggestions.ts`) don't need to change.
 */

import type { Generator } from '../types/generator.types';
import { routeGenerator } from '../generators/route.generator';
import { routeStopsGenerator } from '../generators/route-stops.generator';
import { fullParkWorkoutGenerator } from '../generators/full-park-workout.generator';
import { fullStrengthGenerator } from '../generators/full-strength.generator';
import { anchorLoopGenerator } from '../generators/anchor-loop.generator';
import { safetyNetGenerator } from '../generators/safety-net.generator';

export const GENERATOR_REGISTRY: Generator[] = [
  routeGenerator,
  routeStopsGenerator,
  fullParkWorkoutGenerator,
  fullStrengthGenerator,
  anchorLoopGenerator,
  safetyNetGenerator,
];
