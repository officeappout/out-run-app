/**
 * Progress hub v2 — the deeper pages are /progress/{run,strength,steps} (the
 * paths home's progress slot, enable_home_progress_slot_v1 / #807, links to).
 * The progress TAB itself stays /progression; bare /progress is still the
 * legacy activity log and is not touched. Back = browser history, so a page
 * opened from home returns home; opened cold → the tab.
 */
export const HUB_HOME = '/progression';

export const HUB_ROUTES = {
  strength: '/progress/strength',
  run: '/progress/run',
  steps: '/progress/steps',
} as const;

export type HubPage = keyof typeof HUB_ROUTES;

/** Summary-ring chips (strength / run / walk) → the page that explains them. */
export function hubRouteForKind(kind: 'strength' | 'run' | 'walk'): string {
  return kind === 'strength' ? HUB_ROUTES.strength : HUB_ROUTES.run;
}
