import { BARRIER_STORIES, BARRIER_LABELS, BRIDGE_COPY, LANDING_COPY, INTRO_UI } from '../intro-copy';
export const copySnapshot = () => ({
  landing: LANDING_COPY,
  bridge: BRIDGE_COPY,
  ui: { next: INTRO_UI.next, skip: INTRO_UI.skip, of_1_5: INTRO_UI.of(1, 5), of_5_5: INTRO_UI.of(5, 5), pushApp: INTRO_UI.pushApp, pushNow: INTRO_UI.pushNow },
  labels: BARRIER_LABELS,
  stories: BARRIER_STORIES,
});
