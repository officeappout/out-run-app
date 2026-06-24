import MainMetrics from '../components/FreeRun/StatsCarousel/MainMetrics';
import LapMetrics from '../components/FreeRun/StatsCarousel/LapMetrics';
import VSSlide from '../components/FreeRun/StatsCarousel/VSSlide';
import type { DrawerSlide, StoryContext } from '../types/story-spec';

/**
 * Assembles the drawer slide list from session context.
 * Add new slides by appending a conditional push — no changes needed in StatsCarousel.
 */
export function buildDrawerSlides(ctx: Pick<StoryContext, 'selectedUid'>): DrawerSlide[] {
  return [
    { id: 'main', component: MainMetrics },
    { id: 'laps', component: LapMetrics },
    ...(ctx.selectedUid ? [{ id: 'vs', component: VSSlide }] : []),
  ];
}
