import { describe, it, expect } from 'vitest';
import { firstRunTourSteps, FIRST_RUN_COACH } from '../first-run-tour';

describe('live park workout tour (enable_park_live_v2, board Park 4, pilot M4)', () => {
  it('runs data → story bars → list → follow the route, never opening on the finish button', () => {
    const steps = firstRunTourSteps('route-player', 'male', { parkLiveV2: true });
    expect(steps.map((s) => s.target)).toEqual(['park-live-data', 'park-live-bars', 'park-live-list', FIRST_RUN_COACH.routePlayerControls]);
    expect(steps[0].title).toBe('כאן כל הנתונים');
    expect(steps[3].title).toBe('התחילו ללכת בעקבות המסלול');
  });

  it('enable_unified_player_v1: the list step points at the pull-down header, with its own copy', () => {
    const steps = firstRunTourSteps('route-player', 'male', { parkLiveV2: true, unifiedPlayerV1: true });
    expect(steps.map((s) => s.target)).toEqual(['park-live-data', 'park-live-bars', 'park-live-header', FIRST_RUN_COACH.routePlayerControls]);
    expect(steps[2].title).toBe('כל האימון');
    expect(steps[2].text).toContain('מושכים את הכותרת למטה');
  });

  it('unified flag alone (no park live): today’s single controls tip', () => {
    const steps = firstRunTourSteps('route-player', 'male', { unifiedPlayerV1: true });
    expect(steps.map((s) => s.target)).toEqual([FIRST_RUN_COACH.routePlayerControls]);
  });

  it('flag off: today’s single controls tip', () => {
    const steps = firstRunTourSteps('route-player', 'male');
    expect(steps).toHaveLength(1);
    expect(steps[0].target).toBe(FIRST_RUN_COACH.routePlayerControls);
  });
});
