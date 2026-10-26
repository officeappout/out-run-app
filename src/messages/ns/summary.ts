/** Namespace `summary`: the workout summary screens (src/features/workout-engine/summary). See docs/i18n/HOW-TO.md. */
import he from '../he/summary.json';
import { defineNamespace, type NamespaceKey } from '@/lib/i18n/catalogs';
import type { MessageValues } from '@/lib/i18n/core/i18n-core';

export const summary = defineNamespace('summary', he);

/** A key of the `summary` namespace — keep keys (not text) in constants / state, translate at render. */
export type SummaryKey = NamespaceKey<typeof summary>;

/** A `summary` translator passed into pure helpers (the caller's `useT(summary)` / `makeT('he', summary)`). */
export type SummaryT = (key: SummaryKey, values?: MessageValues) => string;
