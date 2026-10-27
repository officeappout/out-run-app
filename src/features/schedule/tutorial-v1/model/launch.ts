/**
 * When the schedule tutorial shows on home, and whether the home tour must wait for it. Pure
 * (__tests__/launch.test.ts).
 *
 * candidate = flag on, a strength program, no schedule yet, a signed-in user. It shows to new users
 * (the first-run tours' rule) who haven't seen it. While any of that is still loading it counts as
 * busy, so the home tour never starts first and then gets covered.
 */
export interface LaunchInput {
  candidate: boolean;
  isNew: boolean | null;
  seen: boolean | null;
  stage: 'idle' | 'flow' | 'done';
  calm: boolean;
  targetPresent: boolean;
}

export interface LaunchPhase {
  show: 'none' | 'coach' | 'flow';
  busy: boolean;
}

export function tutorialPhase(i: LaunchInput): LaunchPhase {
  if (i.stage === 'flow') return { show: 'flow', busy: true };
  if (!i.candidate || i.stage === 'done' || i.isNew === false || i.seen === true) return { show: 'none', busy: false };
  const ready = i.isNew === true && i.seen === false;
  return { show: ready && i.calm && i.targetPresent ? 'coach' : 'none', busy: true };
}
