import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'fs';
import { fileURLToPath } from 'url';

/**
 * Walker home (enable_home_v2, owner 20.10.2026) — source-level (vitest here can't
 * import .tsx): no walking block above the week strip any more; today's walk is a
 * slide of the daily carousel (the run card's slot) or standalone; its start goes
 * through the JIT health gate.
 */
const rel = (p: string) => fileURLToPath(new URL(p, import.meta.url));
const pageSrc = readFileSync(rel('../page.tsx'), 'utf8');

describe('home/page.tsx — walker pinned card', () => {
  it('the old top block is gone', () => {
    expect(pageSrc).not.toContain('HomeWalkToday');
    expect(existsSync(rel('../../../features/home/components/walk/HomeWalkToday.tsx'))).toBe(false);
  });

  it('the walk card is a carousel slide placed by placeWalkCard, and standalone otherwise', () => {
    expect(pageSrc).toContain("placeWalkCard(withRun, { id: WALK_CARD_ID }, walkSlot)");
    expect(pageSrc).toContain('isWalkCarouselItem(s) ? (');
    expect(pageSrc).toContain('{standaloneWalkCard}');
  });

  it('starting a walk passes the health gate first (running = no equipment prompt)', () => {
    const fnIdx = pageSrc.indexOf('const startWalkFromHome = () => {');
    const gateIdx = pageSrc.indexOf('interceptWorkoutStart(', fnIdx);
    const entryIdx = pageSrc.indexOf('startWalkEntry(walkSlot.entry, push)', fnIdx);
    expect(fnIdx).toBeGreaterThan(-1);
    expect(gateIdx).toBeGreaterThan(fnIdx);
    expect(entryIdx).toBeGreaterThan(gateIdx);
    expect(pageSrc.slice(entryIdx, entryIdx + 200)).toContain("'running'");
  });

  it('the walk slot is v2-only', () => {
    expect(pageSrc).toMatch(/resolveHomeWalkSlot\(\{\s*v2: featureFlags\.enableHomeV2,/);
  });

  it('a walking-only user sees just today\'s walk card; the weekly top-up is v2 + walker only', () => {
    expect(pageSrc).toContain("if (walkOnlyUser && walkSlotSurface === 'carousel' && walkSlot) return [{ id: WALK_CARD_ID }];");
    expect(pageSrc).toContain('enabled: featureFlags.enableHomeV2 && walkWeek.isWalker,');
  });
});
