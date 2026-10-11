/**
 * parseDateParam — input-guard fix (authority-manager report-only audit
 * round 2, finding #2), 11.10.2026. Pure logic, no emulator needed.
 */
import { describe, it, expect, vi } from 'vitest';

// route.ts imports '@/lib/firebase-admin' at module scope, which does
// `import 'server-only'` — throws unconditionally outside Next's
// server-component bundler (confirmed empirically this engagement).
// parseDateParam itself never touches firebase-admin at all — this mock
// exists purely so importing route.ts (to get parseDateParam out of it)
// doesn't crash vitest.
vi.mock('@/lib/firebase-admin', () => ({
  getAdminDb: () => { throw new Error('getAdminDb should never be called from parseDateParam'); },
  getAdminAuth: () => { throw new Error('getAdminAuth should never be called from parseDateParam'); },
}));

import { parseDateParam } from '../route';

describe('parseDateParam', () => {
  it('[DENY] a malformed date string → ok:false with a clean error message naming the param, not an Invalid Date that would later throw', () => {
    const result = parseDateParam('start', 'not-a-date', () => new Date());
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toContain('start');
    expect(result.error).toContain('not-a-date');
  });

  it('[CONTROL] a real ISO date string parses correctly', () => {
    const result = parseDateParam('start', '2026-01-15', () => new Date());
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.date.getUTCFullYear()).toBe(2026);
    expect(result.date.getUTCMonth()).toBe(0);
    expect(result.date.getUTCDate()).toBe(15);
  });

  it('[CONTROL] no param at all (null) → falls back, same as before this fix', () => {
    const fallbackDate = new Date('2026-06-01');
    const result = parseDateParam('end', null, () => fallbackDate);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.date).toBe(fallbackDate);
  });

  it('[DENY] empty string is treated as absent → falls back (matches the pre-fix `startParam ? ... : fallback` truthiness check exactly)', () => {
    const fallbackDate = new Date('2026-06-01');
    const result = parseDateParam('start', '', () => fallbackDate);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.date).toBe(fallbackDate);
  });
});
