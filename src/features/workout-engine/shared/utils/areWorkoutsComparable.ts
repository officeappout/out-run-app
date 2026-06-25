/**
 * areWorkoutsComparable — decides whether VS / live comparison UI should render.
 *
 * Comparability is based on activity type alone (are both doing the same thing?),
 * NOT on whether a goal is set. Two free-runners with sessionGoal=null are
 * comparable; a runner and a walker are not.
 *
 * Data source: `presence/{uid}.activity.status` — the activity type broadcast by
 * each participant. For the local user, `useRunningPlayer.activityType` is the
 * equivalent field.
 *
 * Usage:
 *   const show = areWorkoutsComparable(myActivityType, partner.activity?.status);
 *   if (show) return <RunPartnerComparison />;
 */
export function areWorkoutsComparable(
  myActivity:      string,
  partnerActivity: string | null | undefined,
): boolean {
  return !!partnerActivity && myActivity === partnerActivity;
}
