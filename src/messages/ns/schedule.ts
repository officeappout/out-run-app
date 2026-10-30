/** Namespace `schedule`: the schedule feature (src/features/schedule) — the week builder (`weekBuilder.*`). See docs/i18n/HOW-TO.md. */
import he from '../he/schedule.json';
import { defineNamespace, type NamespaceKey } from '@/lib/i18n/catalogs';
import type { MessageValues } from '@/lib/i18n/core/i18n-core';

export const schedule = defineNamespace('schedule', he);

/** A key of the `schedule` namespace — keep keys (not text) in constants / state, translate at render. */
export type ScheduleKey = NamespaceKey<typeof schedule>;

/** A `schedule` translator passed into pure helpers / child views (the caller's `useT(schedule)`). */
export type ScheduleT = (key: ScheduleKey, values?: MessageValues) => string;
