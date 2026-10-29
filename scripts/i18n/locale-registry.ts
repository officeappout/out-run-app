// @ts-nocheck -- standalone tsx script (scripts/ is not compiled with the app tsconfig target)
/**
 * Locale registry: every place that must know about a locale, with a present() check and an apply() edit.
 * Used by `add-locale-scaffold.ts` (apply) and `--check` (report) and by the tests.
 *
 *   npx tsx scripts/i18n/add-locale-scaffold.ts --check es     # what is still missing for "es"
 *
 * The edits follow EXACTLY the pattern of the last locale already registered (the "anchor", the last entry of LOCALES):
 * its line/block is copied and renamed, so a new locale looks like ru / de / en do.
 */
import fs from 'fs';
import path from 'path';

export interface LocaleSpec {
  /** ISO 639-1 code, lower case: 'es'. */
  code: string;
  /** Native name for the picker: 'Español'. */
  native: string;
  /** Hebrew name for the admin flag card: 'ספרדית'. */
  hebrew: string;
  /** Intl tag for dates and numbers: 'es' or 'es-ES'. Default: the code. */
  intlTag?: string;
  /** Right-to-left script (ar, fa, ur). */
  rtl?: boolean;
}

export interface Site {
  id: string;
  /** Repo-relative file the edit touches. */
  file: string;
  /** What this site is, for the report. */
  what: string;
  present: (src: string, ctx: Ctx) => boolean;
  apply: (src: string, ctx: Ctx) => string;
}

export interface Ctx extends LocaleSpec {
  /** 'Es' (flag key suffix). */
  cap: string;
  /** The last locale already registered: its lines are the template. */
  anchor: string;
  anchorCap: string;
  root: string;
  /** Reads a repo-relative file (the scaffold overlays its pending in-memory edits). */
  read: (rel: string) => string;
}

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
export const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** The last non-source locale in locales.ts (the template for every edit). */
export function anchorOf(root: string): string {
  const src = fs.readFileSync(path.join(root, 'src/lib/i18n/locales.ts'), 'utf8');
  const m = /export const LOCALES = \[([^\]]*)\] as const;/.exec(src);
  if (!m) throw new Error('locales.ts: LOCALES not found');
  const list = [...m[1]!.matchAll(/'([a-z]{2,3})'/g)].map((x) => x[1]!);
  return list[list.length - 1]!;
}

export function makeCtx(root: string, spec: LocaleSpec, anchor = anchorOf(root)): Ctx {
  return { ...spec, cap: capitalize(spec.code), anchor, anchorCap: capitalize(anchor), root, read: (rel) => fs.readFileSync(path.join(root, rel), 'utf8') };
}

/** Insert a copy of every line matching `lineRe` (anchor version) right after it, renamed. */
function copyLines(src: string, lineRe: RegExp, rename: (line: string) => string): string {
  return src.replace(lineRe, (line) => `${line}\n${rename(line)}`);
}

const renameKeys = (line: string, c: Ctx) =>
  line
    .replace(new RegExp(`enable_locale_${c.anchor}\\b`, 'g'), `enable_locale_${c.code}`)
    .replace(new RegExp(`enableLocale${c.anchorCap}\\b`, 'g'), `enableLocale${c.cap}`)
    .replace(new RegExp(`'${c.anchor}'`, 'g'), `'${c.code}'`);

const inRecord = (src: string, name: string) => new RegExp(`export const ${name}[^{]*\\{([\\s\\S]*?)\\n\\};`).exec(src);

export const SITES: Site[] = [
  {
    id: 'locales.LOCALES', file: 'src/lib/i18n/locales.ts', what: 'LOCALES list',
    present: (s, c) => new RegExp(`export const LOCALES = \\[[^\\]]*'${c.code}'`).test(s),
    apply: (s, c) => s.replace(/(export const LOCALES = \[[^\]]*)\] as const;/, `$1, '${c.code}'] as const;`),
  },
  {
    id: 'locales.INTL_TAG', file: 'src/lib/i18n/locales.ts', what: 'INTL_TAG entry (Intl formatting)',
    present: (s, c) => new RegExp(`${c.code}: '`).test(inRecord(s, 'INTL_TAG')?.[1] ?? ''),
    apply: (s, c) => s.replace(/(export const INTL_TAG[^{]*\{[\s\S]*?)\n\};/, `$1\n  ${c.code}: '${c.intlTag ?? c.code}',\n};`),
  },
  {
    id: 'locales.LOCALE_NATIVE_NAME', file: 'src/lib/i18n/locales.ts', what: 'LOCALE_NATIVE_NAME entry (language picker)',
    present: (s, c) => new RegExp(`${c.code}: '`).test(inRecord(s, 'LOCALE_NATIVE_NAME')?.[1] ?? ''),
    apply: (s, c) => s.replace(/(export const LOCALE_NATIVE_NAME[^{]*\{[\s\S]*?)\n\};/, `$1\n  ${c.code}: '${c.native}',\n};`),
  },
  {
    id: 'locales.RTL_LOCALES', file: 'src/lib/i18n/locales.ts', what: 'RTL_LOCALES entry (only for right-to-left languages)',
    present: (s, c) => !c.rtl || new RegExp(`RTL_LOCALES: readonly Locale\\[\\] = \\[[^\\]]*'${c.code}'`).test(s),
    apply: (s, c) => (c.rtl ? s.replace(/(RTL_LOCALES: readonly Locale\[\] = \[[^\]]*)\];/, `$1, '${c.code}'];`) : s),
  },
  {
    id: 'functions.locales-copy', file: 'functions/src/shared/locales.ts', what: 'functions mirror of locales.ts (vendor script, byte for byte)',
    present: (s, c) => {
      const app = c.read('src/lib/i18n/locales.ts');
      return s.slice(s.indexOf('\n') + 1) === app;
    },
    apply: (_s, c) => {
      const app = c.read('src/lib/i18n/locales.ts');
      return `// AUTO-GENERATED from src/lib/i18n/locales.ts by functions/scripts/vendor-copy-geo-discovery.js — do not edit.\n${app}`;
    },
  },
  {
    id: 'catalogs.webpackInclude', file: 'src/lib/i18n/catalogs.ts', what: 'lazy catalog loader webpackInclude regex',
    present: (s, c) => new RegExp(`\\/\\((?:[a-z]{2,3}\\|)*${c.code}(?:\\|[a-z]{2,3})*\\)\\[`).test(s),
    apply: (s, c) => s.replace(/\/\(((?:[a-z]{2,3}\|?)+)\)\[/, (_m, list) => `/(${list}|${c.code})[`),
  },
  {
    id: 'flags.def', file: 'src/hooks/feature-flag-defs.ts', what: 'flag enable_locale_<xx> (default OFF, superAdminValue false)',
    present: (s, c) => s.includes(`'enable_locale_${c.code}'`),
    apply: (s, c) => copyLines(s, new RegExp(`^.*firestoreKey: 'enable_locale_${c.anchor}'.*$`, 'm'), (l) => renameKeys(l, c)),
  },
  {
    id: 'admin.interface', file: 'src/app/admin/system-settings/page.tsx', what: 'admin system-settings flag type',
    present: (s, c) => new RegExp(`^[ \\t]*enable_locale_${c.code}: boolean;`, 'm').test(s),
    apply: (s, c) => copyLines(s, new RegExp(`^[ \\t]*enable_locale_${c.anchor}: boolean;$`, 'm'), (l) => renameKeys(l, c)),
  },
  {
    id: 'admin.card', file: 'src/app/admin/system-settings/page.tsx', what: 'admin system-settings switch card',
    present: (s, c) => s.includes(`key: 'enable_locale_${c.code}'`),
    apply: (s, c) => {
      const re = new RegExp(`  \\{\\n    key: 'enable_locale_${c.anchor}',[\\s\\S]*?parentKey: 'enable_i18n',\\n  \\},\\n`);
      const m = re.exec(s);
      if (!m) throw new Error(`admin card for enable_locale_${c.anchor} not found`);
      const oldName = /title: '[^:']*: ([^']+)'/.exec(m[0])?.[1];
      let block = renameKeys(m[0], c);
      if (oldName) block = block.split(oldName).join(c.hebrew);
      return s.replace(m[0], m[0] + block);
    },
  },
  {
    id: 'resolution.flags', file: 'src/lib/i18n/locale-resolution.ts', what: 'LocaleFlags field + allowedLocales()',
    present: (s, c) => s.includes(`enableLocale${c.cap}: boolean;`) && s.includes(`flags.enableLocale${c.cap}`),
    apply: (s, c) => {
      s = copyLines(s, new RegExp(`^[ \\t]*enableLocale${c.anchorCap}: boolean;$`, 'm'), (l) => renameKeys(l, c));
      return copyLines(s, new RegExp(`^[ \\t]*if \\(flags\\.enableLocale${c.anchorCap}\\) out\\.push\\('${c.anchor}'\\);$`, 'm'), (l) => renameKeys(l, c));
    },
  },
  {
    id: 'sync.flags', file: 'src/components/system/LocaleSync.tsx', what: 'LocaleSync flag destructure / deps',
    present: (s, c) => s.includes(`enableLocale${c.cap}`),
    apply: (s, c) => s.replace(new RegExp(`enableLocale${c.anchorCap}\\b`, 'g'), `enableLocale${c.anchorCap}, enableLocale${c.cap}`),
  },
  {
    id: 'hook.deps', file: 'src/hooks/useLanguageSetting.ts', what: 'useLanguageSetting deps',
    present: (s, c) => s.includes(`flags.enableLocale${c.cap}`),
    apply: (s, c) => s.replace(new RegExp(`flags\\.enableLocale${c.anchorCap}\\b`, 'g'), `flags.enableLocale${c.anchorCap}, flags.enableLocale${c.cap}`),
  },
  {
    id: 'functions.user-locale', file: 'functions/src/services/user-locale.service.ts', what: 'functions flag fields + allowedLocalesFromFlags()',
    present: (s, c) => s.includes(`enable_locale_${c.code}`),
    apply: (s, c) => {
      s = copyLines(s, new RegExp(`^[ \\t]*enable_locale_${c.anchor}\\?: unknown;$`, 'm'), (l) => renameKeys(l, c));
      return copyLines(s, new RegExp(`^[ \\t]*if \\(flags\\.enable_locale_${c.anchor} === true\\) out\\.push\\('${c.anchor}'\\);$`, 'm'), (l) => renameKeys(l, c));
    },
  },
  {
    id: 'functions.mirror', file: 'functions/scripts/i18n-catalog-mirror.js', what: 'I18N_MIRROR_LOCALES (then regenerate functions/src/shared/i18n-catalogs.ts)',
    present: (s, c) => new RegExp(`I18N_MIRROR_LOCALES = \\[[^\\]]*'${c.code}'`).test(s),
    apply: (s, c) => s.replace(/(I18N_MIRROR_LOCALES = \[[^\]]*)\];/, `$1, '${c.code}'];`),
  },
  {
    id: 'profiles', file: 'src/lib/i18n/locale-profiles.ts', what: 'LOCALE_PROFILES line (validator + generic test)',
    present: (s, c) => new RegExp(`locale: '${c.code}'`).test(s),
    apply: (s, c) => s.replace(/(LOCALE_PROFILES: readonly LocaleProfile\[\] = \[[\s\S]*?)\n\];/, `$1\n  { locale: '${c.code}', status: 'partial' },\n];`),
  },
];

export interface CheckItem { id: string; what: string; file: string; ok: boolean }

/** Everything a locale needs, with its current state. Also checks the catalog files and docs. */
export function checkLocale(root: string, spec: LocaleSpec): CheckItem[] {
  const ctx = makeCtx(root, spec);
  const items: CheckItem[] = SITES.map((site) => {
    const file = path.join(root, site.file);
    return { id: site.id, what: site.what, file: site.file, ok: fs.existsSync(file) && site.present(fs.readFileSync(file, 'utf8'), ctx) };
  });
  const heDir = path.join(root, 'src/messages/he');
  const heFiles = fs.existsSync(heDir) ? fs.readdirSync(heDir).filter((f) => f.endsWith('.json')) : [];
  const missing = heFiles.filter((f) => !fs.existsSync(path.join(root, 'src/messages', spec.code, f)));
  items.push({ id: 'messages', what: `src/messages/${spec.code}/<ns>.json for every he file (${missing.length} missing)`, file: `src/messages/${spec.code}/`, ok: heFiles.length > 0 && missing.length === 0 });
  for (const [suffix, what] of [['GLOSSARY', 'glossary (with a ```lint block)'], ['VOICE', 'voice guide'], ['EXERCISE-NAMES', 'canonical exercise names']] as const) {
    const rel = `docs/i18n/${spec.code.toUpperCase()}-${suffix}.md`;
    items.push({ id: `docs.${suffix}`, what, file: rel, ok: fs.existsSync(path.join(root, rel)) });
  }
  return items;
}
