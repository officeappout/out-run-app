import { barrierStories, barrierLabels, bridgeCopy, landingCopy, introUi } from '../intro-copy';
import { makeT } from '@/lib/i18n/t';
import { onboarding } from '@/messages/ns/onboarding';

const t = makeT('he', onboarding);
export const copySnapshot = () => {
  const ui = introUi(t);
  return {
    landing: landingCopy(t),
    bridge: bridgeCopy(t),
    ui: { next: ui.next, skip: ui.skip, of_1_5: ui.of(1, 5), of_5_5: ui.of(5, 5), pushApp: ui.pushApp, pushNow: ui.pushNow },
    labels: barrierLabels(t),
    stories: barrierStories(t),
  };
};
