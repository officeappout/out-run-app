import { describe, expect, it } from 'vitest';
import { isDemoCore, isDemoTenantId, isDemoUid } from '@/lib/demo';
import { DEMO_TENANTS } from '../lib/config';
import { assertDemoDoc, assertDemoDocs, DemoGuardError } from '../lib/guard';
import { PERSONAS, personaUid } from '../lib/personas';
import { weekFor } from '../lib/schedule';
import { buildDemoWorld } from '../lib/world';

const NOW = new Date('2026-10-20T10:00:00');
const PARKS = { 'demo-tlv': [{ id: 'realParkTlv1', name: 'גן ציבורי', lat: 32.09, lng: 34.78 }] };
const world = buildDemoWorld({ now: NOW, parksByCity: PARKS });
const docsOf = (col: string) => world.docs.filter((d) => d.path.split('/')[0] === col && d.path.split('/').length === 2);

describe('personas', () => {
  it('~30 personas, unique demo_ uids, every tenant populated', () => {
    expect(PERSONAS.length).toBeGreaterThanOrEqual(30);
    const uids = PERSONAS.map(personaUid);
    expect(new Set(uids).size).toBe(uids.length);
    uids.forEach((u) => expect(isDemoUid(u)).toBe(true));
    for (const t of DEMO_TENANTS) expect(PERSONAS.some((p) => p.tenantId === t.id)).toBe(true);
  });

  it('covers every base-week schedule-combos scenario (not the one-week events S11/S12/S16) and walkers', () => {
    const used = new Set(PERSONAS.map((p) => p.scenario));
    for (let i = 1; i <= 33; i++) {
      const id = `S${String(i).padStart(2, '0')}`;
      if (['S11', 'S12', 'S16'].includes(id)) continue;
      expect(used.has(id), id).toBe(true);
    }
    expect(PERSONAS.filter((p) => p.scenario === 'WR').length).toBeGreaterThanOrEqual(3);
    expect(new Set(PERSONAS.map((p) => p.journey))).toEqual(new Set(['J1', 'J2', 'J3', 'J4', 'WR']));
  });

  it('every persona gets a real week (engine v2 or the walking plan) with at least one session', () => {
    for (const p of PERSONAS) {
      const w = weekFor(p);
      expect(w.days).toHaveLength(7);
      expect(w.days.flat().length, p.key).toBeGreaterThan(0);
      expect(w.source).toBe(p.scenario === 'WR' ? 'walk-plan' : `engine-v2:${p.scenario}`);
    }
  });
});

describe('the seeded world', () => {
  it('passes the write allowlist end to end', () => {
    expect(() => assertDemoDocs(world.docs)).not.toThrow();
  });

  it('every user: core.isMockData, core.demo stamp, demo tenantId + authorityId (PR 2 dashboards rely on all three)', () => {
    const users = docsOf('users');
    expect(users).toHaveLength(PERSONAS.length);
    for (const u of users) {
      const core = u.data.core as Record<string, unknown>;
      expect(core.isMockData, u.path).toBe(true);
      expect(isDemoCore(core), u.path).toBe(true);
      expect(isDemoTenantId(core.tenantId), u.path).toBe(true);
      expect(isDemoTenantId(core.authorityId), u.path).toBe(true);
      expect(core.discoverable).toBe(false);
    }
  });

  it('is deterministic (same ids, same workouts) — a re-run rewrites the same docs', () => {
    const again = buildDemoWorld({ now: NOW, parksByCity: PARKS });
    expect(again.docs.map((d) => d.path)).toEqual(world.docs.map((d) => d.path));
    expect(again.workoutIds).toEqual(world.workoutIds);
  });

  it('has 60 days of history: workouts, steps, schedule, posts, check-ins', () => {
    expect(docsOf('dailyActivity')).toHaveLength(PERSONAS.length * 61);
    expect(docsOf('workouts').length).toBeGreaterThan(PERSONAS.length * 10);
    expect(docsOf('feed_posts').length).toBeGreaterThan(100);
    expect(docsOf('userSchedule').length).toBeGreaterThan(PERSONAS.length * 20);
    expect(docsOf('sessions').length).toBeGreaterThan(0);
    const kinds = new Set(docsOf('workouts').map((d) => d.data.workoutType));
    expect(kinds).toEqual(new Set(['strength', 'running', 'walking']));
  });

  it('real parks are only referenced from check-ins under a demo authority; workouts never carry a parkId', () => {
    for (const d of docsOf('workouts')) expect(d.data.parkId).toBeUndefined();
    for (const d of docsOf('sessions')) {
      expect(isDemoTenantId(d.data.authorityId)).toBe(true);
      expect(d.data.parkId).toBe('realParkTlv1');
    }
    expect(world.docs.some((d) => d.path.startsWith('parks/'))).toBe(false);
  });

  it("public surfaces are fenced: posts / steps mirror / streaks are ageGroup 'demo', groups private", () => {
    for (const col of ['feed_posts', 'dailyActivityPublic', 'streaks']) for (const d of docsOf(col)) expect(d.data.ageGroup).toBe('demo');
    for (const d of docsOf('community_groups')) expect(d.data.isPublic).toBe(false);
    expect(world.docs.some((d) => /^(userPublic|presence|userLocations|planned_sessions)\//.test(d.path))).toBe(false);
  });

  it('a done schedule entry points at its workout', () => {
    const ids = new Set(world.workoutIds);
    const done = docsOf('userSchedule').flatMap((d) => (d.data.entries as Array<{ completed: boolean; completedWorkoutId?: string }>).filter((e) => e.completedWorkoutId));
    expect(done.length).toBeGreaterThan(0);
    done.forEach((e) => expect(ids.has(e.completedWorkoutId!)).toBe(true));
  });
});

describe('guard (L5 allowlist)', () => {
  const user = { core: { demo: { v: 1 }, isMockData: true, discoverable: false, tenantId: 'demo-tlv', authorityId: 'demo-tlv' } };
  it('refuses paths outside the demo world', () => {
    expect(() => assertDemoDoc('users/realUser', user)).toThrow(DemoGuardError);
    expect(() => assertDemoDoc('authorities/tel-aviv', { isDemo: true })).toThrow(DemoGuardError);
    expect(() => assertDemoDoc('parks/abc', {})).toThrow(DemoGuardError);
    expect(() => assertDemoDoc('community_groups/realGroup', { isPublic: false, isDemo: true })).toThrow(DemoGuardError);
  });
  it('refuses a demo doc pointing at real users / scopes', () => {
    expect(() => assertDemoDoc('workouts/demo_x_w', { userId: 'realUid', authorityId: 'demo-tlv' })).toThrow(/userId/);
    expect(() => assertDemoDoc('workouts/demo_x_w', { userId: 'demo_x', authorityId: 'tel-aviv' })).toThrow(/authorityId/);
    expect(() => assertDemoDoc('chats/group_demo-grp-x', { participants: ['demo_a', 'realUid'] })).toThrow(/participants/);
    expect(() => assertDemoDoc('feed_posts/demo_x_post', { authorUid: 'demo_x', ageGroup: 'adult' })).toThrow(/ageGroup/);
    expect(() => assertDemoDoc('users/demo_x', { core: { ...user.core, discoverable: true } })).toThrow();
    expect(() => assertDemoDoc('users/demo_x', { core: { ...user.core, tenantId: undefined } })).toThrow(/tenantId/);
  });
  it('a registered viewer may be a member / participant', () => {
    const viewers = new Set(['viewerUid']);
    expect(() => assertDemoDoc('community_groups/demo-grp-x/members/viewerUid', { uid: 'viewerUid' }, viewers)).not.toThrow();
    expect(() => assertDemoDoc('chats/group_demo-grp-x', { participants: ['demo_a', 'viewerUid'] }, viewers)).not.toThrow();
  });
});
