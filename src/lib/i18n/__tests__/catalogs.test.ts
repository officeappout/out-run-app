/**
 * Catalog guards (docs/i18n/PLAN.md §3.2.2). Every file under src/messages:
 *   - parses as ICU,
 *   - en/ru/de hold no key that Hebrew (the source) lacks,
 *   - a translation uses no variable the Hebrew message doesn't have
 *     (it may drop one, e.g. English collapsing a gender select),
 *   - every locale has the same files as Hebrew, and every namespace has its
 *     src/messages/ns/<name>.ts (legacy-* files excepted),
 *   - a locale listed in COMPLETE_LOCALES has every Hebrew key. Add a locale there
 *     BEFORE switching its enable_locale_* flag on (PLAN decision 10).
 */
import { existsSync, readdirSync, readFileSync } from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';
import { IntlMessageFormat } from 'intl-messageformat';
import { messageArgNames } from '../core/i18n-core';
import { LOCALES, SOURCE_LOCALE } from '../locales';

const COMPLETE_LOCALES: readonly string[] = [];

const root = path.resolve(__dirname, '../../../messages');
const files = (locale: string) =>
  readdirSync(path.join(root, locale)).filter((f) => f.endsWith('.json')).sort();
const load = (locale: string, file: string): Record<string, unknown> =>
  JSON.parse(readFileSync(path.join(root, locale, file), 'utf8'));

const heFiles = files(SOURCE_LOCALE);

describe('catalog files', () => {
  it('every locale has exactly the Hebrew files', () => {
    for (const loc of LOCALES) expect(files(loc), loc).toEqual(heFiles);
  });

  it('every namespace has its ns/<name>.ts', () => {
    for (const f of heFiles) {
      const name = f.replace(/\.json$/, '');
      if (name.startsWith('legacy-')) continue;
      expect(existsSync(path.join(root, 'ns', `${name}.ts`)), `src/messages/ns/${name}.ts`).toBe(true);
    }
  });
});

for (const file of heFiles) {
  describe(file, () => {
    const he = load(SOURCE_LOCALE, file);

    for (const loc of LOCALES) {
      const cat = load(loc, file);

      it(`${loc}: flat key → non-empty string, valid ICU`, () => {
        for (const [key, msg] of Object.entries(cat)) {
          expect(typeof msg, `${loc}/${file} ${key}`).toBe('string');
          expect((msg as string).length, `${loc}/${file} ${key} is empty`).toBeGreaterThan(0);
          expect(() => new IntlMessageFormat(msg as string, loc, undefined, { ignoreTag: true }), `${loc}/${file} ${key}`).not.toThrow();
        }
      });

      if (loc === SOURCE_LOCALE) continue;

      it(`${loc}: no keys Hebrew lacks, no variables Hebrew lacks`, () => {
        for (const [key, msg] of Object.entries(cat)) {
          expect(key in he, `${loc}/${file} has "${key}" but he does not`).toBe(true);
          const heArgs = new Set(messageArgNames(he[key] as string));
          for (const arg of messageArgNames(msg as string)) {
            expect(heArgs.has(arg), `${loc}/${file} ${key} uses {${arg}} which he does not`).toBe(true);
          }
        }
      });

      if (COMPLETE_LOCALES.includes(loc)) {
        it(`${loc}: complete (every Hebrew key translated)`, () => {
          const missing = Object.keys(he).filter((k) => !(k in cat));
          expect(missing, `${loc}/${file} missing`).toEqual([]);
        });
      }
    }
  });
}
