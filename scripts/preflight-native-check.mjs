#!/usr/bin/env node
/**
 * scripts/preflight-native-check.mjs
 *
 * OutRun — Pre-flight Native Build Validator
 * ──────────────────────────────────────────
 * Run before every TestFlight / App Store / Play Store release build to
 * catch missing native configuration that would silently break Firebase
 * Auth, Google Sign-In, Apple Sign-In, or App Check at runtime.
 *
 * Usage:
 *   node scripts/preflight-native-check.mjs    # direct
 *   npm run preflight                          # via npm script
 *
 * Exit codes:
 *   0  — all checks passed (warnings are informational only)
 *   1  — one or more CRITICAL checks failed → do NOT build
 *
 * Type contract:
 *   The result object satisfies NativeAuthValidation from
 *   src/lib/native-auth-validation.ts. That interface is the source of
 *   truth for which checks exist; extend it there first, then add the
 *   corresponding check below.
 */

import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

// ─── ANSI colour helpers ──────────────────────────────────────────────────────
const R  = '\x1b[31m';   // red
const Y  = '\x1b[33m';   // yellow
const G  = '\x1b[32m';   // green
const B  = '\x1b[36m';   // cyan
const DIM = '\x1b[90m';  // dim grey
const X  = '\x1b[0m';    // reset bold

// ─── Result accumulator (matches NativeAuthValidation interface) ──────────────
/** @type {import('../src/lib/native-auth-validation.js').NativeAuthValidation} */
const result = {
  isIosUrlSchemeValid:    false,
  isFirebaseConfigBundled: false,
  isAndroidConfigPresent:  false,
  isServerBlockDisabled:   false,
  isSha1Present:           false,
};

let hasCritical = false;

// ─── Reporting helpers ────────────────────────────────────────────────────────
function pass(label, detail = '') {
  console.log(`  ${G}✔${X} ${label}${detail ? `  ${DIM}(${detail})${X}` : ''}`);
}

function warn(label, detail = '') {
  console.log(`  ${Y}⚠  ${label}${X}`);
  if (detail) console.log(`     ${DIM}${detail}${X}`);
}

function fail(label, detail = '') {
  hasCritical = true;
  console.log(`  ${R}✘  CRITICAL — ${label}${X}`);
  if (detail) console.log(`     ${DIM}${detail}${X}`);
}

function section(name) {
  console.log(`\n${B}── ${name} ${'─'.repeat(Math.max(0, 46 - name.length))}${X}`);
}

// ─── File helpers ─────────────────────────────────────────────────────────────
function readFile(relPath) {
  const abs = resolve(ROOT, relPath);
  return existsSync(abs) ? readFileSync(abs, 'utf8') : null;
}

// ─── Plist parsers (zero external dependencies) ───────────────────────────────

/**
 * Extract the string value immediately following <key>KEY</key>.
 * @param {string} content - raw plist XML
 * @param {string} key
 * @returns {string|null}
 */
function plistValue(content, key) {
  const m = content.match(
    new RegExp(`<key>${escapeRx(key)}<\\/key>\\s*<string>([^<]+)<\\/string>`)
  );
  return m ? m[1].trim() : null;
}

/**
 * Collect every <string> inside every <array> that follows <key>CFBundleURLSchemes</key>.
 *
 * Searches the whole plist directly for CFBundleURLSchemes arrays rather than
 * first extracting the CFBundleURLTypes block. The outer CFBundleURLTypes array
 * contains nested <array> elements, which defeats a lazy [\s\S]*? match; the
 * inner CFBundleURLSchemes arrays are flat (no nesting), so lazy matching is safe.
 *
 * @param {string} infoPlistContent
 * @returns {string[]}
 */
function allUrlSchemes(infoPlistContent) {
  const schemes = [];
  for (const m of infoPlistContent.matchAll(
    /<key>CFBundleURLSchemes<\/key>\s*<array>([\s\S]*?)<\/array>/g
  )) {
    for (const s of m[1].matchAll(/<string>([^<]+)<\/string>/g)) {
      schemes.push(s[1].trim());
    }
  }
  return schemes;
}

function escapeRx(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// ─── Check: iOS GoogleService-Info.plist ──────────────────────────────────────
section('iOS — Firebase config');

const gsiPlist = readFile('ios/App/App/GoogleService-Info.plist');

if (!gsiPlist) {
  fail(
    'GoogleService-Info.plist not found at ios/App/App/',
    'Add the file AND include it in Xcode → Target → Build Phases →\n' +
    '     "Copy Bundle Resources". Without it, FirebaseApp.configure()\n' +
    '     is silently skipped in Release builds and all plugins fail.',
  );
} else {
  result.isFirebaseConfigBundled = true;
  const bundleId  = plistValue(gsiPlist, 'BUNDLE_ID')  ?? '?';
  const projectId = plistValue(gsiPlist, 'PROJECT_ID') ?? '?';
  const appId     = plistValue(gsiPlist, 'GOOGLE_APP_ID') ?? '?';
  pass(
    'GoogleService-Info.plist found',
    `bundle=${bundleId}  project=${projectId}  appId=${appId}`,
  );
}

// ─── Check: iOS REVERSED_CLIENT_ID URL Scheme ────────────────────────────────
section('iOS — Google Sign-In URL Scheme');

const infoPlist     = readFile('ios/App/App/Info.plist');
const expectedScheme = gsiPlist ? plistValue(gsiPlist, 'REVERSED_CLIENT_ID') : null;

if (!infoPlist) {
  fail('ios/App/App/Info.plist not found');
} else {
  const schemes       = allUrlSchemes(infoPlist);
  const reversedScheme = schemes.find(s => s.startsWith('com.googleusercontent.apps.'));

  if (!reversedScheme) {
    fail(
      'REVERSED_CLIENT_ID missing from URL Schemes in Info.plist',
      `Add "${expectedScheme ?? 'com.googleusercontent.apps.<id>'}" via:\n` +
      '     Xcode → App target → Info tab → URL Types → (+)',
    );
    // Machine-readable sentinel for CI log scanning:
    console.error(`[OutRun Deploy] CRITICAL: REVERSED_CLIENT_ID missing from URL Schemes!`);
  } else {
    // Cross-check: matches the value in GoogleService-Info.plist
    if (expectedScheme && reversedScheme !== expectedScheme) {
      warn(
        'URL Scheme does not match GoogleService-Info.plist REVERSED_CLIENT_ID',
        `Info.plist:              ${reversedScheme}\n` +
        `     GoogleService-Info: ${expectedScheme}`,
      );
    } else {
      result.isIosUrlSchemeValid = true;
      pass('REVERSED_CLIENT_ID URL Scheme present and matches plist', reversedScheme);
    }
  }
}

// ─── Check: iOS — Sign in with Apple capability ───────────────────────────────
section('iOS — Sign in with Apple');

const entitlementsFiles = [
  'ios/App/App/App.entitlements',
  'ios/App/App/App.Debug.entitlements',
  'ios/App/App/App.Release.entitlements',
];
const entitlementsContent = entitlementsFiles
  .map(f => readFile(f))
  .find(Boolean) ?? null;

if (!entitlementsContent) {
  warn(
    'No .entitlements file found — cannot verify Sign in with Apple capability',
    'Ensure "Sign In with Apple" is enabled in Xcode → Signing & Capabilities.',
  );
} else if (!entitlementsContent.includes('com.apple.developer.applesignin')) {
  fail(
    'Sign in with Apple entitlement not found in .entitlements',
    'Enable it via Xcode → App target → Signing & Capabilities → + → Sign In with Apple.',
  );
} else {
  pass('Sign in with Apple entitlement present');
}

// ─── Check: Capacitor server block ───────────────────────────────────────────
section('Capacitor — build mode');

const capConfig = readFile('capacitor.config.ts') ?? readFile('capacitor.config.json');

if (!capConfig) {
  warn('capacitor.config.ts / capacitor.config.json not found');
} else {
  // Strip comments before checking for an active url: line
  const stripped = capConfig
    .replace(/\/\/[^\n]*/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '');

  const hasActiveServerUrl = /\burl\s*:\s*['"]https?:\/\//.test(stripped);

  if (hasActiveServerUrl) {
    warn(
      'capacitor.config.ts: server.url is ACTIVE (Vercel remote load)',
      'Correct for live-reload dev, but a TestFlight build will load JS\n' +
      '     from Vercel at runtime — your code fixes may not be in effect\n' +
      '     unless you deployed to Vercel first.\n' +
      '     Comment out the server block to use the local bundle instead.',
    );
  } else {
    result.isServerBlockDisabled = true;
    pass('capacitor.config.ts: server block disabled — local bundle mode (production-ready)');
  }
}

// ─── Check: App Check plugin config in capacitor.config.ts ───────────────────
section('App Check — plugin config');

if (capConfig) {
  const hasDeviceCheck   = /providerIOS\s*:\s*['"]deviceCheck['"]/.test(capConfig);
  const hasPlayIntegrity = /providerAndroid\s*:\s*['"]playIntegrity['"]/.test(capConfig);

  hasDeviceCheck
    ? pass('iOS App Check provider: deviceCheck')
    : fail(
        'iOS App Check provider missing or not "deviceCheck"',
        'Set providerIOS: "deviceCheck" inside plugins.FirebaseAppCheck in capacitor.config.ts.',
      );

  hasPlayIntegrity
    ? pass('Android App Check provider: playIntegrity')
    : fail(
        'Android App Check provider missing or not "playIntegrity"',
        'Set providerAndroid: "playIntegrity" inside plugins.FirebaseAppCheck in capacitor.config.ts.',
      );
}

// ─── Check: Android google-services.json ─────────────────────────────────────
section('Android — Firebase config');

const gsJsonRaw = readFile('android/app/google-services.json');

if (!gsJsonRaw) {
  fail(
    'android/app/google-services.json not found',
    'Download it from Firebase Console → Project Settings → Android app\n' +
    '     and place it at android/app/google-services.json.',
  );
} else {
  let parsed;
  try {
    parsed = JSON.parse(gsJsonRaw);
  } catch {
    fail('android/app/google-services.json is malformed JSON');
    parsed = null;
  }

  if (parsed) {
    result.isAndroidConfigPresent = true;
    const clients     = parsed?.client ?? [];
    const packageName = clients[0]?.client_info?.android_client_info?.package_name ?? '?';
    pass('google-services.json found and valid JSON', `package=${packageName}`);

    // Detect SHA certificate hashes (the field name in google-services.json)
    const certHashes = [...gsJsonRaw.matchAll(/"certificate_hash"\s*:\s*"([^"]+)"/g)]
      .map(m => m[1]);

    if (certHashes.length === 0) {
      warn(
        'No certificate_hash entries found in google-services.json',
        'Add your production SHA-1 and SHA-256 fingerprints:\n' +
        '     Firebase Console → Project Settings → Android app → Add fingerprint\n' +
        '     Then re-download and replace android/app/google-services.json.',
      );
    } else {
      result.isSha1Present = true;
      const preview = certHashes.map(h => `${h.substring(0, 12)}…`).join(', ');
      pass(`SHA certificate hashes present (${certHashes.length})`, preview);
    }
  }
}

// ─── Summary ──────────────────────────────────────────────────────────────────
section('Result');
console.log('\nNativeAuthValidation:');
console.log(
  Object.entries(result)
    .map(([k, v]) => `  ${v ? G + '✔' : Y + '○'} ${k}: ${v}${X}`)
    .join('\n'),
);

if (hasCritical) {
  console.log(
    `\n${R}╔══════════════════════════════════════════════════════╗\n` +
    `║  Pre-flight FAILED — fix critical issues before      ║\n` +
    `║  building for TestFlight / App Store.                ║\n` +
    `╚══════════════════════════════════════════════════════╝${X}\n`,
  );
  process.exit(1);
} else {
  console.log(
    `\n${G}╔══════════════════════════════════════════════════════╗\n` +
    `║  Pre-flight PASSED — safe to build.                  ║\n` +
    `╚══════════════════════════════════════════════════════╝${X}\n`,
  );
  process.exit(0);
}
