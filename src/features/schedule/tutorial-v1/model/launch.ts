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

/**
 * The schedule tutorial replaces the old lifestyle bridge (BlurryBridge) for the users it serves
 * (owner 27.10): a candidate who is new, or still loading. Seen / skipped counts too, so a user
 * who skipped ל1 is not sent to the old wizard. Old users (not new) keep the bridge, and users
 * who finished the old wizard never reach it (they have schedule days).
 */
export const replacesBridge = (i: Pick<LaunchInput, 'candidate' | 'isNew'>): boolean => i.candidate && i.isNew !== false;
