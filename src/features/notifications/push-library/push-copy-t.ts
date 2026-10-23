/**
 * The push library's translator, app side (i18n wave 2A, docs/i18n/PLAN.md §2.6).
 *
 * push-library.core.ts is mirrored byte for byte into Cloud Functions and cannot import
 * either side's catalog loader, so it imports THIS file by relative path. Each side has its
 * own twin with the same exported API:
 *   app:        src/features/notifications/push-library/push-copy-t.ts  (this file)
 *   functions:  functions/src/shared/push-copy-t.ts
 * A root vitest (push-copy-i18n.test.ts) pins that both resolve every `push` key to the same
 * text. Keep the two APIs identical.
 *
 *   const t = pushCopyT('he');                 // locale defaults to 'he'
 *   t('streak_rescue.0.title');                // locale → en → he → the key itself
 */
import { makeT } from '@/lib/i18n/t';
import { push } from '@/messages/ns/push';
import { isLocale, SOURCE_LOCALE } from '@/lib/i18n/locales';

/** A key of the `push` namespace → its text. Untyped on purpose: the keys are built from `<pushType>.<index>`. */
export type PushCopyT = (key: string) => string;

export function pushCopyT(locale: string = SOURCE_LOCALE): PushCopyT {
  const t = makeT(isLocale(locale) ? locale : SOURCE_LOCALE, push);
  return (key) => (t as unknown as (k: string) => string)(key);
}
