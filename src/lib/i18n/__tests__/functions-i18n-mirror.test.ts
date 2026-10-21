import { readFileSync } from 'fs';
import { createRequire } from 'module';
import path from 'path';
import { describe, expect, it } from 'vitest';
import { LOCALES } from '../locales';

/**
 * The Cloud Functions copies of the i18n pieces must not drift from the app
 * (docs/i18n/PLAN.md §2.1, COMMITTED_MIRRORS in functions/scripts/vendor-copy-geo-discovery.js).
 * Fix a failure by running the functions build (`cd functions && npm run build`, or just
 * `node functions/scripts/vendor-copy-geo-discovery.js`) and committing the result.
 */
const root = path.resolve(__dirname, '../../../..');
const require = createRequire(import.meta.url);
const mirror = require(path.join(root, 'functions/scripts/i18n-catalog-mirror.js')) as {
  FUNCTIONS_I18N_NAMESPACES: string[];
  I18N_MIRROR_LOCALES: string[];
  OUT_REL: string;
  buildCatalogMirrorSource: (repoRoot: string) => string;
};

describe('functions i18n mirrors', () => {
  it('functions/src/shared/locales.ts is src/lib/i18n/locales.ts, byte for byte', () => {
    const app = readFileSync(path.join(root, 'src/lib/i18n/locales.ts'), 'utf8');
    const copy = readFileSync(path.join(root, 'functions/src/shared/locales.ts'), 'utf8');
    expect(copy.slice(copy.indexOf('\n') + 1)).toBe(app);
  });

  it('functions/src/shared/i18n-catalogs.ts is generated from the current src/messages JSON', () => {
    const committed = readFileSync(path.join(root, mirror.OUT_REL), 'utf8');
    expect(committed).toBe(mirror.buildCatalogMirrorSource(root));
  });

  it('the mirror covers every app locale, and each mirrored namespace equals its JSON', async () => {
    expect(mirror.I18N_MIRROR_LOCALES).toEqual([...LOCALES]);
    const { FUNCTIONS_CATALOGS } = await import('../../../../functions/src/shared/i18n-catalogs');
    const catalogs = FUNCTIONS_CATALOGS as unknown as Record<string, Record<string, unknown>>;
    expect(Object.keys(catalogs)).toEqual(mirror.FUNCTIONS_I18N_NAMESPACES);
    for (const ns of mirror.FUNCTIONS_I18N_NAMESPACES) {
      for (const loc of LOCALES) {
        const json = JSON.parse(readFileSync(path.join(root, `src/messages/${loc}/${ns}.json`), 'utf8'));
        expect(catalogs[ns][loc]).toEqual(json);
      }
    }
  });
});
