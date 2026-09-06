import fs from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';

/**
 * Regression guard for the exact bug this module shipped with once:
 * `captureMarketingAttribution()` was fully implemented, documented, and
 * unit-tested — but had ZERO call sites outside its own definition file,
 * so it silently never ran and every user was attributed 'organic'.
 *
 * A behavioral test (marketingAttribution.test.ts) cannot catch this
 * class of bug — it imports and calls the function directly, which is
 * exactly what production code failed to do. This test instead scans the
 * actual source tree for a real call site, deliberately excluding test
 * files (which will always "call" it) and the definition file itself.
 */

const SRC_ROOT = path.resolve(__dirname, '../../..', 'src');
const DEFINITION_FILE = path.join(SRC_ROOT, 'lib', 'marketingAttribution.ts');
const CALL_PATTERN = /captureMarketingAttribution\s*\(/;

function collectSourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === '__tests__' || entry.name === 'node_modules') continue;
      out.push(...collectSourceFiles(full));
      continue;
    }
    if (!/\.(ts|tsx)$/.test(entry.name)) continue;
    if (entry.name.endsWith('.test.ts') || entry.name.endsWith('.test.tsx')) continue;
    if (full === DEFINITION_FILE) continue;
    out.push(full);
  }
  return out;
}

describe('captureMarketingAttribution wiring', () => {
  it('is called from at least one real (non-test) source file', () => {
    const files = collectSourceFiles(SRC_ROOT);
    const callers = files.filter((f) => CALL_PATTERN.test(fs.readFileSync(f, 'utf8')));

    expect(
      callers.length,
      callers.length === 0
        ? 'captureMarketingAttribution() has NO call sites in production code — ' +
          'every user will be attributed "organic" regardless of UTM/QR source. ' +
          'It must be called from a mounted entry-point component (see ' +
          'MarketingAttributionBootstrap.tsx).'
        : undefined,
    ).toBeGreaterThan(0);
  });
});
