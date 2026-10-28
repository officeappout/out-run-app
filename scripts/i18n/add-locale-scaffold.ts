// @ts-nocheck -- standalone tsx script (scripts/ is not compiled with the app tsconfig target)
/**
 * Registers a new locale everywhere the app needs it, following the pattern of the locales already there.
 * Local files only. The flag it adds is OFF by default; nothing user-facing changes until the owner flips it.
 *
 *   npx tsx scripts/i18n/add-locale-scaffold.ts es --native Español --hebrew ספרדית [--intl es-ES] [--rtl] [--dry-run]
 *   npx tsx scripts/i18n/add-locale-scaffold.ts --check es --native Español --hebrew ספרדית     # report only
 *
 * Does: locales.ts (LOCALES, INTL_TAG, LOCALE_NATIVE_NAME, RTL_LOCALES) + functions copy, catalogs.ts loader regex,
 * flag def enable_locale_<xx>, admin switch card, locale-resolution / LocaleSync / useLanguageSetting, functions
 * user-locale + catalog mirror, locale-profiles line (status partial), empty `{}` catalogs for every he file,
 * doc skeletons docs/i18n/<XX>-{GLOSSARY,VOICE,EXERCISE-NAMES}.md, and regenerates functions/src/shared/i18n-catalogs.ts.
 * Then prints the manual follow-ups (test fixtures that build LocaleFlags objects).
 */
import { execSync } from 'child_process';
import fs from 'fs';
import { createRequire } from 'module';
import path from 'path';
import { checkLocale, makeCtx, SITES, type LocaleSpec } from './locale-registry';

export interface ScaffoldOptions {
  root: string;
  spec: LocaleSpec;
  dryRun?: boolean;
  /** Regenerate functions/src/shared/i18n-catalogs.ts (needs the real src/messages tree). */
  regenerateMirror?: boolean;
}

export interface ScaffoldResult {
  changed: string[];
  skipped: string[];
  created: string[];
  followUps: string[];
}

const GLOSSARY_SKELETON = (code: string) => `# ${code.toUpperCase()} glossary (he -> ${code})

> Derived from EN-GLOSSARY.md. Hebrew is the source of truth. Owner approves product terms (!) before the catalogs start.

## 0. DO-NOT-TRANSLATE list

Same as EN-GLOSSARY.md section 0 (OUT, Kelly, XP, placeholders, emoji, legal entity).

## 1. Core product vocabulary

| # | Hebrew | ${code.toUpperCase()} | Rationale | Status |
|---|---|---|---|---|

## Lint rules (read by scripts/i18n/validate-catalog.ts)

Lines: \`hebrew-regex => required-target-regex => label\` (warning when the Hebrew trigger has no target term),
\`!! forbidden-target-regex => message\` (error).

\`\`\`lint
# גינ(ת|ות) כושר => <target term> => outdoor gym
\`\`\`
`;

const VOICE_SKELETON = (code: string) => `# ${code.toUpperCase()} voice guide

> Derived from EN-VOICE.md: tone, formality (tu/usted, du/Sie...), punctuation, capitalization, emoji and exclamation policy, no long dash.
`;

const NAMES_SKELETON = (code: string) => `# ${code.toUpperCase()} exercise names (he -> ${code}) - canonical list

> Derived from EN-EXERCISE-NAMES.md. Same sections; one row per Hebrew name. Owner choices and UNMAPPED items listed at the end.
`;

export function scaffoldLocale({ root, spec, dryRun = false, regenerateMirror = false }: ScaffoldOptions): ScaffoldResult {
  const res: ScaffoldResult = { changed: [], skipped: [], created: [], followUps: [] };
  if (!/^[a-z]{2,3}$/.test(spec.code)) throw new Error(`bad locale code "${spec.code}"`);
  if (spec.code === 'he') throw new Error('he is the source locale');
  const ctx = makeCtx(root, spec);
  const touched = new Map<string, string>();
  const read = (rel: string) => touched.get(rel) ?? fs.readFileSync(path.join(root, rel), 'utf8');
  ctx.read = read;

  for (const site of SITES) {
    const src = read(site.file);
    if (site.present(src, ctx)) { res.skipped.push(site.id); continue; }
    const next = site.apply(src, ctx);
    if (next === src) throw new Error(`site ${site.id} (${site.file}): the edit changed nothing; add it by hand`);
    touched.set(site.file, next);
    if (!site.present(next, ctx)) throw new Error(`site ${site.id} (${site.file}): edit applied but the check still fails`);
    res.changed.push(site.id);
  }

  const heDir = path.join(root, 'src/messages/he');
  const newFiles = new Map<string, string>();
  for (const f of fs.readdirSync(heDir).filter((x) => x.endsWith('.json'))) {
    const rel = `src/messages/${spec.code}/${f}`;
    if (!fs.existsSync(path.join(root, rel))) newFiles.set(rel, '{}\n');
  }
  const U = spec.code.toUpperCase();
  for (const [suffix, body] of [['GLOSSARY', GLOSSARY_SKELETON], ['VOICE', VOICE_SKELETON], ['EXERCISE-NAMES', NAMES_SKELETON]] as const) {
    const rel = `docs/i18n/${U}-${suffix}.md`;
    if (!fs.existsSync(path.join(root, rel))) newFiles.set(rel, body(spec.code));
  }

  if (!dryRun) {
    for (const [rel, text] of touched) fs.writeFileSync(path.join(root, rel), text);
    for (const [rel, text] of newFiles) {
      fs.mkdirSync(path.dirname(path.join(root, rel)), { recursive: true });
      fs.writeFileSync(path.join(root, rel), text);
    }
    const mirrorJs = path.join(root, 'functions/scripts/i18n-catalog-mirror.js');
    if (regenerateMirror && fs.existsSync(mirrorJs)) {
      const req = createRequire(path.join(root, 'package.json'));
      delete req.cache[req.resolve(mirrorJs)];
      const mirror = req(mirrorJs);
      fs.writeFileSync(path.join(root, mirror.OUT_REL), mirror.buildCatalogMirrorSource(root));
      res.changed.push('functions.i18n-catalogs.ts (regenerated)');
    }
  }
  res.created.push(...newFiles.keys());

  try {
    const out = execSync(`grep -rlE "enableLocale${ctx.anchorCap}\\b" src functions/src --include=*.ts --include=*.tsx`, { cwd: root, encoding: 'utf8' });
    for (const f of out.split('\n').filter(Boolean)) {
      if (/__tests__/.test(f)) res.followUps.push(`${f}: fixture builds LocaleFlags with enableLocale${ctx.anchorCap}; add enableLocale${ctx.cap} (typecheck fails otherwise)`);
    }
  } catch { /* grep exit 1 = none */ }
  res.followUps.push('Run: node functions/scripts/vendor-copy-geo-discovery.js  (refreshes the functions mirrors), then the targeted vitest in ADD-LANGUAGE.md.');
  res.followUps.push(`Optional (owner decision): let the super admin preview ${spec.code} before the flag is on (effectiveLocaleFlags in locale-resolution.ts does it for en).`);
  return res;
}

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

if (process.argv[1] && /add-locale-scaffold\.ts$/.test(process.argv[1])) {
  const root = path.resolve(__dirname, '../..');
  const check = process.argv.includes('--check');
  const code = check ? arg('--check') : process.argv[2];
  const native = arg('--native');
  const hebrew = arg('--hebrew');
  if (!code || !native || !hebrew) {
    console.error('usage: add-locale-scaffold.ts <xx> --native <Name> --hebrew <שם> [--intl <tag>] [--rtl] [--dry-run] | --check <xx> --native .. --hebrew ..');
    process.exit(2);
  }
  const spec: LocaleSpec = { code, native, hebrew, intlTag: arg('--intl'), rtl: process.argv.includes('--rtl') };
  if (check) {
    const items = checkLocale(root, spec);
    for (const i of items) console.log(`${i.ok ? 'ok     ' : 'MISSING'} ${i.id.padEnd(28)} ${i.file}  (${i.what})`);
    process.exit(items.every((i) => i.ok) ? 0 : 1);
  }
  const r = scaffoldLocale({ root, spec, dryRun: process.argv.includes('--dry-run'), regenerateMirror: !process.argv.includes('--dry-run') });
  console.log(`${process.argv.includes('--dry-run') ? 'DRY RUN ' : ''}changed: ${r.changed.join(', ') || '-'}\nalready present: ${r.skipped.join(', ') || '-'}\ncreated (${r.created.length}): ${r.created.join(', ') || '-'}`);
  for (const f of r.followUps) console.log(`TODO ${f}`);
}
