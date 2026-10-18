import { describe, it, expect, vi } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

/**
 * Push deep links must land on a real page (18.10.2026). The onboarding
 * drop-off push pointed at /onboarding-new/selection for two months after
 * that route was deleted (e806cb42), and the kudos push at /activity, which
 * never existed — every tap was a 404. These tests resolve each sender's
 * deepLink against the app router tree (src/app) so a route removal that
 * strands a push fails here instead of on users' phones.
 */

vi.mock('firebase-admin', () => {
  const firestoreFn = () => ({});
  (firestoreFn as any).Timestamp = { fromMillis: (ms: number) => ({ toMillis: () => ms }) };
  (firestoreFn as any).FieldValue = {};
  return { apps: [{}], initializeApp: vi.fn(), firestore: firestoreFn, messaging: () => ({}) };
});
vi.mock('firebase-functions', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));
vi.mock('firebase-functions/v2/scheduler', () => ({ onSchedule: (_o: unknown, fn: unknown) => fn }));

import { ONBOARDING_DROPOFF_DEEP_LINK } from '../onboardingDropoffDispatcher';

const FUNCTIONS_SRC = path.resolve(__dirname, '..');
const APP_DIR = path.resolve(FUNCTIONS_SRC, '../../src/app');

/** True when `link` (path + optional query) matches a page in src/app. */
function routeExists(link: string): boolean {
  const segments = link.split(/[?#]/)[0].split('/').filter(Boolean);
  const walk = (dir: string, i: number): boolean => {
    if (i === segments.length) {
      return ['page.tsx', 'page.ts', 'page.jsx', 'page.js'].some((f) =>
        fs.existsSync(path.join(dir, f)),
      );
    }
    if (!fs.existsSync(dir)) return false;
    const children = fs
      .readdirSync(dir, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name);
    const seg = segments[i];
    if (children.includes(seg) && walk(path.join(dir, seg), i + 1)) return true;
    // Dynamic segment ([id], [chatId]…) — or a template placeholder from the
    // sender source, which always maps onto one.
    return children.some((c) => /^\[[^.]/.test(c) && walk(path.join(dir, c), i + 1));
  };
  return walk(APP_DIR, 0);
}

describe('onboarding drop-off push', () => {
  it('deep-links to an existing route (the onboarding resume entry)', () => {
    expect(ONBOARDING_DROPOFF_DEEP_LINK).toBe('/gateway');
    expect(routeExists(ONBOARDING_DROPOFF_DEEP_LINK)).toBe(true);
  });

  it('no longer points at the deleted /onboarding-new/selection', () => {
    expect(routeExists('/onboarding-new/selection')).toBe(false);
    expect(ONBOARDING_DROPOFF_DEEP_LINK).not.toBe('/onboarding-new/selection');
  });
});

describe('every push sender in functions/src', () => {
  // Collect literal deepLink values (incl. template strings — `${…}` stands
  // in for a dynamic segment) from all non-test sources.
  const links: Array<{ file: string; link: string }> = [];
  const re = /(?:deepLink|DEEP_LINK)\s*[:=]\s*[`'"](\/[^`'"\s]*)[`'"]/g;
  for (const name of fs.readdirSync(FUNCTIONS_SRC)) {
    if (!name.endsWith('.ts')) continue;
    const src = fs.readFileSync(path.join(FUNCTIONS_SRC, name), 'utf8');
    let m: RegExpExecArray | null;
    re.lastIndex = 0;
    while ((m = re.exec(src)) !== null) {
      links.push({ file: name, link: m[1].replace(/\$\{[^}]*\}/g, 'x') });
    }
  }

  it('finds the senders (sanity check on the scan itself)', () => {
    expect(links.length).toBeGreaterThan(5);
  });

  it('deep-links only to routes that exist under src/app', () => {
    const broken = links.filter(({ link }) => !routeExists(link));
    expect(broken).toEqual([]);
  });
});
