/**
 * where-location-options, PURE: which locations the "איפה מתאמנים?" toggle offers (phone test AA4).
 *
 * A workout with no home version (location gate dry-run, or a refused switch) drops בית; when only
 * one location is left the drawer hides the toggle and shows the parks alone. The current location
 * is always kept, so a user already at home can still switch back.
 */
export type WhereLocation = 'park' | 'home' | 'service';

export function whereLocationOptions({
  current,
  showService,
  homeBlocked,
}: {
  current: WhereLocation;
  showService: boolean;
  homeBlocked: boolean;
}): WhereLocation[] {
  const all: WhereLocation[] = ['park', 'home', ...(showService ? (['service'] as const) : [])];
  return all.filter((loc) => loc !== 'home' || !homeBlocked || current === 'home');
}
