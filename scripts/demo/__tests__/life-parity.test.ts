/**
 * The live engine (functions/src/demo-life) mirrors a few app constants because functions/
 * cannot import src/. These tests keep the mirrors equal to the app, and check that every
 * seeded persona's registry life block is something the engine accepts.
 */
import { describe, expect, it } from 'vitest';
import { postActivityCredit } from '@/features/social/services/feed-hybrid';
import { DEFAULT_DAILY_GOALS, DEFAULT_WEEKLY_GOALS } from '@/features/activity/types/activity.types';
import { feedCredit } from '../../../functions/src/demo-life/session-docs';
import { DAILY_GOALS_MIRROR, WEEKLY_GOALS_MIRROR } from '../../../functions/src/demo-life/daily-docs';
import { parseLifePersonas } from '../../../functions/src/demo-life/persona';
import { assertDemoDocs } from '../lib/guard';
import { PERSONAS, personaUid } from '../lib/personas';
import { weekFor } from '../lib/schedule';
import { buildDemoWorld } from '../lib/world';

describe('life engine mirrors', () => {
  it('feed credit = the app postActivityCredit', () => {
    for (const cat of ['strength', 'cardio', 'maintenance'] as const) {
      for (const m of [10, 37, 90]) expect(feedCredit(cat, m)).toBe(postActivityCredit({ activityCategory: cat, durationMinutes: m }));
    }
  });
  it('daily / weekly goals = the app defaults', () => {
    expect(DAILY_GOALS_MIRROR).toEqual(DEFAULT_DAILY_GOALS);
    expect(WEEKLY_GOALS_MIRROR).toEqual(DEFAULT_WEEKLY_GOALS);
  });
});

describe('registry life blocks (seed → live engine)', () => {
  const world = buildDemoWorld({ now: new Date('2026-10-20T10:00:00+03:00'), parksByCity: { 'demo-tlv': [{ id: 'realParkTlv1', name: 'פארק', lat: 32.1, lng: 34.8 }] }, historyDays: 2 });
  const reg = world.docs.find((d) => d.path === 'demo_registry/personas')!;
  const lifes = parseLifePersonas(reg.data);

  it('every persona parses, with its whole engine-built week', () => {
    expect(lifes).toHaveLength(PERSONAS.length);
    for (const p of PERSONAS) {
      const life = lifes.find((l) => l.uid === personaUid(p))!;
      expect(life, p.key).toBeDefined();
      expect(life.sessions.length, p.key).toBe(weekFor(p).days.flat().length);
      expect(life.tone).toBe(p.personaKind);
    }
  });

  it('no nested arrays (Firestore) and the registry still passes the allowlist', () => {
    const hasNested = (v: unknown): boolean => (Array.isArray(v) ? v.some((x) => Array.isArray(x) || hasNested(x)) : !!v && typeof v === 'object' && Object.values(v).some(hasNested));
    expect(hasNested(reg.data)).toBe(false);
    expect(() => assertDemoDocs([reg])).not.toThrow();
  });
});
