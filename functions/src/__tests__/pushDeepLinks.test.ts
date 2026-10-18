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
import {
  PUSH_CATALOG,
  PUSH_DEEP_LINK_ROUTES,
  SAMPLE_LINK_PARAMS,
  buildDeepLink,
  selectPushCopy,
} from '../shared/push-library.core';

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
    // Since the push library (10.2026) most senders take their deep link from
    // the library (covered below), so fewer literals remain to scan.
    expect(links.length).toBeGreaterThan(0);
    expect(links.some((l) => l.link === '/gateway')).toBe(true);
  });

  it('deep-links only to routes that exist under src/app', () => {
    const broken = links.filter(({ link }) => !routeExists(link));
    expect(broken).toEqual([]);
  });
});

describe('push library deep links (shared/push-library.core.ts)', () => {
  it('every path of every route in the list exists under src/app', () => {
    const broken = PUSH_DEEP_LINK_ROUTES.flatMap((r) =>
      r.paths.map((p) => p.replace(/\{\w+\}/g, 'x')).filter((p) => !routeExists(p)).map((p) => `${r.id}: ${p}`),
    );
    expect(broken).toEqual([]);
  });

  it("every pushType's allowed links resolve to a real route, with and without params", () => {
    const broken: string[] = [];
    for (const entry of PUSH_CATALOG) {
      expect(entry.deepLinks.length).toBeGreaterThan(0);
      for (const id of entry.deepLinks) {
        for (const params of [SAMPLE_LINK_PARAMS, {}]) {
          const link = buildDeepLink(id, params);
          if (!link || !routeExists(link)) broken.push(`${entry.pushType} → ${id} → ${link}`);
        }
      }
    }
    expect(broken).toEqual([]);
  });

  it('the drop-off library default is the onboarding resume entry', () => {
    const copy = selectPushCopy('onboarding_dropoff', [], { uid: 'u1', vars: { '@שם': 'דנה' } });
    expect(copy?.deepLink).toBe(ONBOARDING_DROPOFF_DEEP_LINK);
  });

  it('each push leads to the right place by default (spec: "כל פוש מוביל למקום הנכון")', () => {
    const link = (pushType: string, ctx: Parameters<typeof selectPushCopy>[2]) =>
      selectPushCopy(pushType, [], ctx)?.deepLink;
    const all = {
      '@שם': 'דנה', '@אימון': 'אימון כוח', '@שעה': '18:30', '@ימים': '9', '@רמה': '5',
      '@שולח': 'נועה', '@כמות': '3', '@עוד': '2', '@קבוצה': 'רצים', '@מצטרף': 'יואב',
      '@מקום': 'גן הבנים', '@צעדים_שנותרו': '2,000', '@דקות': '18', '@מרחק': '1.5 ק"מ',
    } as const;
    expect(link('workout_reminder_day', { uid: 'u', vars: all })).toBe('/home');
    expect(link('workout_reminder_before', { uid: 'u', vars: all })).toBe('/home');
    expect(link('workout_reminder_slot', { uid: 'u', vars: all })).toBe('/home');
    expect(link('retention_lapse', { uid: 'u', vars: all })).toBe('/home');
    expect(link('level_up', { uid: 'u', vars: all, conditions: { level: '5' }, params: { programId: 'program123' } }))
      .toBe('/progression-map/program123');
    expect(link('level_up', { uid: 'u', vars: all, conditions: { level: '5' } })).toBe('/progression');
    expect(link('kudos_single', { uid: 'u', vars: all })).toBe('/home');
    expect(link('kudos_bundle', { uid: 'u', vars: all, conditions: { others: 'many' } })).toBe('/home');
    expect(link('contribution_approved', { uid: 'u', vars: all, params: { parkId: 'p1' } })).toBe('/map?openPark=p1');
    expect(link('group_join_admin', { uid: 'u', vars: all, params: { groupId: 'g1' } })).toBe('/community/g1');
    expect(link('group_join_welcome', { uid: 'u', vars: all, params: { groupId: 'g1' } })).toBe('/community/g1');
    expect(link('step_goal', { uid: 'u', vars: all, conditions: { bucket: 'mid' }, params: { targetSteps: 2000 } }))
      .toBe('/map?openRun=walking&targetSteps=2000');
    expect(link('partner_plan', { uid: 'u', vars: all, conditions: { activity: 'running' }, params: { routeId: 'r1' } }))
      .toBe('/map?openRoute=r1');
    expect(link('week_start', { uid: 'u', vars: all })).toBe('/home');
  });
});
