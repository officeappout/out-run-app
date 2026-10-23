/**
 * ride-mode — pure decisions for "is this session a ride?" (cycling-fixes-v1,
 * docs/routes/BIKE-GENERATOR-AUDIT.md item 4/5).
 *
 * Before: a ride was a ride only under enable_home_v2; everyone else got 'running'
 * (HUD, calories, history, icon). With enable_cycling_fixes_v1 on, a ride started from
 * the map is a ride for everyone. Flag off ⇒ every function returns exactly what the
 * code it replaced did.
 *
 * XP IS NOT TOUCHED: .cursoragents/XP_Progression_Truth.md defines no cycling, so for a
 * non-home-v2 ride `xpActivityFor` keeps handing the XP calculation + the Guardian audit
 * source the same value a run gets today ('running'). Amounts and source stay as they are.
 */
import type { AerobicActivity } from './aerobic-activity';

/** Whether a ride session is allowed to be a ride (home v2 OR the cycling-fixes flag). */
export function rideModeOn(homeV2: boolean, cyclingFixes: boolean): boolean {
  return homeV2 || cyclingFixes;
}

/** The player's activity for a chip / route activity pick. Walk stays a walk; cycling only when ride mode is on. */
export function playerActivityForPick(picked: string | null | undefined, rideMode: boolean): AerobicActivity {
  if (picked === 'walking') return 'walking';
  if (picked === 'cycling' && rideMode) return 'cycling';
  return 'running';
}

/**
 * The activity handed to the XP calculation and the Guardian source label.
 * Flag off / home v2 ⇒ the player's own activity (today's behaviour). Flag on and NOT home v2 ⇒ a
 * ride keeps XP as a run ('running'), as it has always for these users.
 */
export function xpActivityFor(
  activity: AerobicActivity | null | undefined,
  opts: { homeV2: boolean; cyclingFixes: boolean },
): AerobicActivity {
  if (opts.cyclingFixes && !opts.homeV2 && activity === 'cycling') return 'running';
  return activity ?? 'running';
}
