/**
 * Race prediction — the ONE model every surface uses.
 *
 * Input: `running.paceProfile.basePace` (seconds per km). calibrateBasePace
 * (running-engine.service.ts) derives it from the runner's own race result
 * already adjusted to the plan's target distance (3 km −5 s, 10 km +10 s),
 * and the self-correction step keeps it current after quality runs. So
 * basePace IS the predicted race pace at the target distance.
 *
 * Model: Riegel, reference distance = the plan's target distance
 * (5 km when unknown):
 *   T(d) = basePace × refKm × (d / refKm)^1.06
 *
 * Used by: the home widgets (RacePredictionCard, RunProgressCircle,
 * RaceAndKmCarousel) and the plan's race-day workout
 * (buildRaceDayWorkout). Pure — no Firestore, no stores.
 */

export const RIEGEL_EXPONENT = 1.06;

const TARGET_DISTANCE_KM: Record<string, number> = {
  '2k': 2,
  '3k': 3,
  '5k': 5,
  '10k': 10,
};

/** Plan goal distance → km. 'maintenance' / unknown / missing → 5. */
export function targetDistanceKm(targetDistance: unknown): number {
  if (typeof targetDistance !== 'string') return 5;
  return TARGET_DISTANCE_KM[targetDistance] ?? 5;
}

/** Riegel from a reference time: T2 = T1 × (D2 / D1)^1.06. 0 for invalid input. */
export function riegelFromTime(referenceSeconds: number, referenceKm: number, targetKm: number): number {
  if (!(referenceSeconds > 0) || !(referenceKm > 0) || !(targetKm > 0)) return 0;
  return referenceSeconds * Math.pow(targetKm / referenceKm, RIEGEL_EXPONENT);
}

/** Predicted race time (seconds) at `targetKm` from basePace. 0 for invalid input. */
export function predictRaceSeconds(basePaceSecPerKm: number, refKm: number, targetKm: number): number {
  if (!(basePaceSecPerKm > 0)) return 0;
  return riegelFromTime(basePaceSecPerKm * refKm, refKm, targetKm);
}

/**
 * Predicted race pace (seconds per km, rounded to whole seconds) for the
 * plan's own target distance. At the reference distance Riegel reduces to
 * basePace itself — this is what the race-day workout targets.
 */
export function predictedRacePaceSecPerKm(basePaceSecPerKm: number, targetDistance: unknown): number {
  const km = targetDistanceKm(targetDistance);
  const seconds = predictRaceSeconds(basePaceSecPerKm, km, km);
  return seconds > 0 ? Math.round(seconds / km) : 0;
}
