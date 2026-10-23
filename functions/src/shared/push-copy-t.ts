/**
 * The push library's translator, functions side (i18n wave 2A, docs/i18n/PLAN.md §2.6).
 * Twin of src/features/notifications/push-library/push-copy-t.ts — same exported API, see
 * the note there. Hand-written (not mirrored): the app reaches its catalogs through
 * `@/lib/i18n/t`, Cloud Functions through ./i18n-t and the generated ./i18n-catalogs.
 */
import { makeT } from './i18n-t';
import { SOURCE_LOCALE } from './locales';

/** A key of the `push` namespace (+ ICU values, all strings) → its text. Untyped on purpose: the keys are built from `<pushType>.<index>`. */
export type PushCopyT = (key: string, values?: Record<string, string>) => string;

export function pushCopyT(locale: string = SOURCE_LOCALE): PushCopyT {
  const t = makeT(locale, 'push');
  return (key, values) => t(key, values);
}
