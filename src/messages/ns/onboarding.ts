/** Namespace `onboarding`: onboarding, gateway, intro and join screens (`quiz.*` = the strength quiz). See docs/i18n/HOW-TO.md. */
import he from '../he/onboarding.json';
import { defineNamespace, type NamespaceKey } from '@/lib/i18n/catalogs';

export const onboarding = defineNamespace('onboarding', he);

/** A key of the `onboarding` namespace — keep keys (not text) in constants / state, translate at render. */
export type OnboardingKey = NamespaceKey<typeof onboarding>;
