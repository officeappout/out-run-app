import { barrierStories } from '../intro-copy';
import { makeT } from '@/lib/i18n/t';
import { onboarding } from '@/messages/ns/onboarding';

export const storiesUnderTest = () => barrierStories(makeT('he', onboarding));
