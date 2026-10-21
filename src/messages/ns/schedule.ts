/** Namespace `schedule`: the schedule feature (src/features/schedule) — the week builder (`weekBuilder.*`). See docs/i18n/HOW-TO.md. */
import he from '../he/schedule.json';
import { defineNamespace, type NamespaceKey } from '@/lib/i18n/catalogs';

export const schedule = defineNamespace('schedule', he);

/** A key of the `schedule` namespace — keep keys (not text) in constants / state, translate at render. */
export type ScheduleKey = NamespaceKey<typeof schedule>;
