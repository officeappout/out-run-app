/** Namespace `summary`: the workout summary screens (src/features/workout-engine/summary). See docs/i18n/HOW-TO.md. */
import he from '../he/summary.json';
import { defineNamespace, type NamespaceKey } from '@/lib/i18n/catalogs';

export const summary = defineNamespace('summary', he);

/** A key of the `summary` namespace — keep keys (not text) in constants / state, translate at render. */
export type SummaryKey = NamespaceKey<typeof summary>;
