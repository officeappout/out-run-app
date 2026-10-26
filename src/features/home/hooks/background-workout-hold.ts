/**
 * Holds home's BACKGROUND workout generation (StatsOverview's mount trio) away
 * from the workout drawer while a park workout is open in it (pure, owner
 * device feedback 26.10).
 *
 * The bug it fixes: a park start (park page card / park sheet "התחל אימון")
 * hands off to /home, which composes the park workout and opens the drawer.
 * /home's StatsOverview mounts at the same time and generates the daily trio
 * — whose location chain (resolveWorkoutContext: no equipped park within
 * 2 km / no GPS fix / rain → home) usually lands on HOME — then pushes it into
 * the same drawer state (onWorkoutGenerated + onTrioSelectorChange). Whichever
 * finished last won, so the park workout silently turned into a home workout.
 *
 * While held, background results are kept (not applied); when the park
 * preview ends, the latest background workout is handed back so home's hero
 * shows its own workout again, never the park one.
 */

export interface BackgroundWorkoutHold<W> {
  /** A park workout now owns the drawer. */
  begin(): void;
  /** The park preview closed. Returns the home workout to restore (null = nothing to restore). */
  end(): W | null;
  isHeld(): boolean;
  /** A background workout arrived: true = apply it now, false = held. Always remembered. */
  offerWorkout(workout: W): boolean;
  /** A background drawer control (the trio selector) arrived: true = apply it now. */
  offerControl(): boolean;
}

export function createBackgroundWorkoutHold<W>(): BackgroundWorkoutHold<W> {
  let held = false;
  let latest: W | null = null;
  return {
    begin() { held = true; },
    end() {
      if (!held) return null;
      held = false;
      return latest;
    },
    isHeld: () => held,
    offerWorkout(workout) {
      latest = workout;
      return !held;
    },
    offerControl: () => !held,
  };
}
