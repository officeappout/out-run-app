import { describe, expect, it } from 'vitest';
import { hasNoPublishedField, isVisibleToUsers, planPublishState, summarizePublishPlan } from '../publish-status';
import { publishPayload } from '../../../../scripts/routes-nationwide/lib/publish-status-apply.node';

describe('what a missing published field means (reader parity)', () => {
  it('absent / null published = visible to users (app hides only published === false)', () => {
    expect(isVisibleToUsers({})).toBe(true);
    expect(isVisibleToUsers({ published: null })).toBe(true);
    expect(isVisibleToUsers({ published: true })).toBe(true);
    expect(isVisibleToUsers({ published: false })).toBe(false);
  });
  it('absent / null published is what the approval-center query can never see', () => {
    expect(hasNoPublishedField({})).toBe(true);
    expect(hasNoPublishedField({ published: null })).toBe(true);
    expect(hasNoPublishedField({ published: false })).toBe(false);
    expect(hasNoPublishedField({ published: true })).toBe(false);
  });
});

describe('planPublishState — fills only absent keys, never changes visibility', () => {
  it('both absent (the Sderot case) → published:true + status:published', () => {
    expect(planPublishState({})).toEqual({ kind: 'fill', patch: { published: true, status: 'published' } });
  });
  it('published absent, status published → published:true only', () => {
    expect(planPublishState({ status: 'published' })).toEqual({ kind: 'fill', patch: { published: true } });
  });
  it('published true, status absent → status:published only', () => {
    expect(planPublishState({ published: true })).toEqual({ kind: 'fill', patch: { status: 'published' } });
  });
  it('published false, status absent → status:pending only (already in the queue)', () => {
    expect(planPublishState({ published: false })).toEqual({ kind: 'fill', patch: { status: 'pending' } });
  });
  it('published absent but status pending/archived/rejected → conflict, never written', () => {
    for (const status of ['pending', 'archived', 'rejected']) {
      expect(planPublishState({ status }).kind).toBe('conflict');
    }
  });
  it('unknown / wrong-typed values → conflict', () => {
    expect(planPublishState({ published: 'yes' }).kind).toBe('conflict');
    expect(planPublishState({ published: true, status: 'live' }).kind).toBe('conflict');
  });
  it('both explicit → nothing to do', () => {
    expect(planPublishState({ published: true, status: 'published' })).toEqual({ kind: 'ok' });
    expect(planPublishState({ published: false, status: 'pending' })).toEqual({ kind: 'ok' });
  });
  it('a fill never turns a visible route invisible', () => {
    const cases = [{}, { published: null }, { status: 'published' }, { published: true }, { published: false }];
    for (const c of cases) {
      const p = planPublishState(c);
      if (p.kind !== 'fill') continue;
      expect(isVisibleToUsers({ ...c, ...p.patch })).toBe(isVisibleToUsers(c));
    }
  });
});

describe('summarizePublishPlan', () => {
  it('counts no-published docs per city', () => {
    const rows = [
      { id: 'a', name: '', city: 'שדרות', authorityId: 'x', plan: planPublishState({}), noPublished: true },
      { id: 'b', name: '', city: 'שדרות', authorityId: 'x', plan: planPublishState({}), noPublished: true },
      { id: 'c', name: '', city: null, authorityId: null, plan: planPublishState({ published: true, status: 'published' }), noPublished: false },
      { id: 'd', name: '', city: 'חיפה', authorityId: 'y', plan: planPublishState({ status: 'archived' }), noPublished: true },
    ];
    expect(summarizePublishPlan(rows)).toEqual({ total: 4, noPublishedField: 3, fills: 2, conflicts: 1, noPublishedByCity: { 'שדרות': 2, 'חיפה': 1 } });
  });
});

describe('publishPayload (write-site chokepoint)', () => {
  const known = new Set(['sderot']);
  const base = { id: 'r1', existingAuthorityId: 'sderot', existingCity: 'שדרות' };
  it('passes exactly the planned keys through buildValidatedDoc', () => {
    expect(publishPayload({ ...base, patch: { published: true, status: 'published' } }, known)).toEqual({ published: true, status: 'published' });
    expect(publishPayload({ ...base, patch: { status: 'pending' } }, known)).toEqual({ status: 'pending' });
  });
  it('rejects an empty or foreign payload', () => {
    expect(() => publishPayload({ ...base, patch: {} }, known)).toThrow(/non-empty subset/);
    expect(() => publishPayload({ ...base, patch: { published: true, name: 'x' } as never }, known)).toThrow(/non-empty subset/);
  });
  it('never writes published:false', () => {
    expect(() => publishPayload({ ...base, patch: { published: false } as never }, known)).toThrow(/only ever writes published: true/);
  });
  it('works on a legacy doc with no authorityId / city', () => {
    expect(publishPayload({ id: 'r2', existingAuthorityId: null, existingCity: null, patch: { published: true, status: 'published' } }, known)).toEqual({ published: true, status: 'published' });
  });
});
