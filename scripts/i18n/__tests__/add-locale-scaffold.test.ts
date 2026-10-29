import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { scaffoldLocale } from '../add-locale-scaffold';
import { checkLocale, SITES } from '../locale-registry';

const repo = path.resolve(__dirname, '../../..');
const ES = { code: 'es', native: 'Español', hebrew: 'ספרדית' };
let tmp = '';

function copy(rel: string) {
  fs.mkdirSync(path.dirname(path.join(tmp, rel)), { recursive: true });
  fs.copyFileSync(path.join(repo, rel), path.join(tmp, rel));
}

beforeAll(() => {
  tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'add-locale-'));
  for (const f of Array.from(new Set(SITES.map((s) => s.file)))) copy(f);
  copy('src/lib/i18n/locale-profiles.ts');
  fs.mkdirSync(path.join(tmp, 'src/messages/he'), { recursive: true });
  for (const f of ['common', 'push']) fs.writeFileSync(path.join(tmp, `src/messages/he/${f}.json`), '{"a":"א"}\n');
});
afterAll(() => fs.rmSync(tmp, { recursive: true, force: true }));

const read = (rel: string) => fs.readFileSync(path.join(tmp, rel), 'utf8');

describe('add-locale-scaffold', () => {
  it('dry run changes nothing', () => {
    const before = read('src/lib/i18n/locales.ts');
    const r = scaffoldLocale({ root: tmp, spec: ES, dryRun: true });
    expect(r.changed.length).toBeGreaterThan(5);
    expect(read('src/lib/i18n/locales.ts')).toBe(before);
    expect(fs.existsSync(path.join(tmp, 'src/messages/es'))).toBe(false);
  });

  it('registers a new locale everywhere, flag OFF, in the pattern of the existing ones', () => {
    expect(checkLocale(tmp, ES).filter((i) => !i.ok).length).toBeGreaterThan(8);
    const r = scaffoldLocale({ root: tmp, spec: ES });
    expect(r.created).toContain('src/messages/es/common.json');
    expect(checkLocale(tmp, ES).filter((i) => !i.ok)).toEqual([]);
    expect(read('src/lib/i18n/locales.ts')).toContain("'de', 'es'] as const");
    expect(read('src/lib/i18n/locales.ts')).toContain("es: 'Español'");
    expect(read('src/hooks/feature-flag-defs.ts')).toContain("{ key: 'enableLocaleEs', firestoreKey: 'enable_locale_es', defaultValue: false, superAdminValue: false },");
    expect(read('src/app/admin/system-settings/page.tsx')).toContain("key: 'enable_locale_es'");
    expect(read('src/app/admin/system-settings/page.tsx')).toContain(`שפה: ${ES.hebrew}`);
    expect(read('src/lib/i18n/locale-resolution.ts')).toContain("if (flags.enableLocaleEs) out.push('es');");
    expect(read('functions/src/services/user-locale.service.ts')).toContain("if (flags.enable_locale_es === true) out.push('es');");
    expect(read('functions/scripts/i18n-catalog-mirror.js')).toMatch(/I18N_MIRROR_LOCALES = \[[^\]]*'es'\]/);
    expect(read('src/lib/i18n/catalogs.ts')).toContain('(en|ru|de|es)[');
    expect(read('src/lib/i18n/locale-profiles.ts')).toContain("{ locale: 'es', status: 'partial' }");
    expect(read('functions/src/shared/locales.ts')).toContain('AUTO-GENERATED');
    expect(fs.readFileSync(path.join(tmp, 'src/messages/es/push.json'), 'utf8')).toBe('{}\n');
  });

  it('is idempotent', () => {
    const r = scaffoldLocale({ root: tmp, spec: ES });
    expect(r.changed).toEqual([]);
    expect(r.created).toEqual([]);
    expect(read('src/lib/i18n/locales.ts').match(/es: '/g)).toHaveLength(2); // INTL_TAG + LOCALE_NATIVE_NAME, once each
    expect(read('src/lib/i18n/locales.ts').match(/'de', 'es'/g)).toHaveLength(1);
  });

  it('rejects the source locale and bad codes', () => {
    expect(() => scaffoldLocale({ root: tmp, spec: { ...ES, code: 'he' } })).toThrow();
    expect(() => scaffoldLocale({ root: tmp, spec: { ...ES, code: 'E_S' } })).toThrow();
  });
});

describe('the real repo registry', () => {
  it('en is registered everywhere', () => {
    expect(checkLocale(repo, { code: 'en', native: 'English', hebrew: 'אנגלית' }).filter((i) => !i.ok)).toEqual([]);
  });
});
