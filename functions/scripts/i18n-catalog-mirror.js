// Builds functions/src/shared/i18n-catalogs.ts from the app's translation
// catalogs, src/messages/<locale>/<namespace>.json (docs/i18n/PLAN.md §2.1).
//
// Same idea as COMMITTED_MIRRORS in vendor-copy-geo-discovery.js: the app's
// JSON stays the single source of truth, the functions copy is generated,
// COMMITTED (so the root tsc and the functions tests resolve it with no build
// step) and refreshed on every functions build. A root vitest
// (src/lib/i18n/__tests__/functions-i18n-mirror.test.ts) regenerates it in
// memory and compares byte for byte, so a catalog edit that wasn't mirrored
// can't merge.
//
// Why a generated .ts and not the .json files themselves: functions/ builds
// with plain tsc (commonjs, no resolveJsonModule, no bundler) and deploys
// lib/ only. A .ts module is compiled into lib/ like any other file, needs no
// copy step and no fs read at runtime, and gives typed keys (`as const`).
//
// Only the namespaces listed below are mirrored: Cloud Functions need the
// server-side text (push, errors, ...), not the whole app.
'use strict';
const fs = require('fs');
const path = require('path');

/** Namespaces Cloud Functions can translate. Add one here, then run the functions build. */
const FUNCTIONS_I18N_NAMESPACES = ['common'];

/** Must match LOCALES in src/lib/i18n/locales.ts (the root test checks it). */
const I18N_MIRROR_LOCALES = ['he', 'en', 'ru', 'de'];

const OUT_REL = 'functions/src/shared/i18n-catalogs.ts';

function readCatalog(repoRoot, locale, ns) {
  const rel = `src/messages/${locale}/${ns}.json`;
  const abs = path.join(repoRoot, rel);
  if (!fs.existsSync(abs)) throw new Error(`[i18n-catalog-mirror] missing ${rel}`);
  const parsed = JSON.parse(fs.readFileSync(abs, 'utf8'));
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error(`[i18n-catalog-mirror] ${rel} must be a flat object of key -> message`);
  }
  for (const [k, v] of Object.entries(parsed)) {
    if (typeof v !== 'string') throw new Error(`[i18n-catalog-mirror] ${rel}: "${k}" is not a string`);
  }
  return parsed;
}

function indent(text, spaces) {
  const pad = ' '.repeat(spaces);
  return text.split('\n').map((line, i) => (i === 0 ? line : pad + line)).join('\n');
}

/** The full source of functions/src/shared/i18n-catalogs.ts. Throws on a missing/bad catalog. */
function buildCatalogMirrorSource(repoRoot) {
  const lines = [
    '// AUTO-GENERATED from src/messages/<locale>/<namespace>.json by functions/scripts/i18n-catalog-mirror.js — do not edit.',
    '// To give Cloud Functions a namespace: add it to FUNCTIONS_I18N_NAMESPACES there and run the functions build.',
    '',
    '/** Mirrored namespaces → locale → flat dotted key → ICU message (same shape as the app\'s JSON). */',
    'export const FUNCTIONS_CATALOGS = {',
  ];
  for (const ns of FUNCTIONS_I18N_NAMESPACES) {
    lines.push(`  ${JSON.stringify(ns)}: {`);
    for (const locale of I18N_MIRROR_LOCALES) {
      const catalog = readCatalog(repoRoot, locale, ns);
      lines.push(`    ${JSON.stringify(locale)}: ${indent(JSON.stringify(catalog, null, 2), 4)},`);
    }
    lines.push('  },');
  }
  lines.push('} as const;', '');
  return lines.join('\n');
}

/** Writes the mirror; returns its repo-relative path. */
function writeCatalogMirror(repoRoot) {
  fs.writeFileSync(path.join(repoRoot, OUT_REL), buildCatalogMirrorSource(repoRoot));
  return OUT_REL;
}

module.exports = {
  FUNCTIONS_I18N_NAMESPACES,
  I18N_MIRROR_LOCALES,
  OUT_REL,
  buildCatalogMirrorSource,
  writeCatalogMirror,
};
