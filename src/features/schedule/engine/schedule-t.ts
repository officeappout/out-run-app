/**
 * The translator the pure schedule engines (engine/, engine-v2/) render their text with.
 * Engines have no React: they take an optional `t` and default to Hebrew (`makeT` over the statically
 * bundled catalog), so every existing caller keeps getting the same strings. A caller that knows the
 * user's locale passes `makeT(locale, schedule)` (after `ensureCatalog`).
 */
import type { NamespaceKey } from '@/lib/i18n/catalogs';
import { SOURCE_LOCALE } from '@/lib/i18n/locales';
import { makeT, type TFunction } from '@/lib/i18n/t';
import { schedule } from '@/messages/ns/schedule';

export type ScheduleT = TFunction<NamespaceKey<typeof schedule>>;

export const defaultScheduleT = (): ScheduleT => makeT(SOURCE_LOCALE, schedule);
