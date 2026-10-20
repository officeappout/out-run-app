import { describe, expect, it } from 'vitest';
import { demoActorTargetBlocked, demoScopedId, isDemoActorClaims, isDemoWorldId } from '../demo-actor';

describe('demo actor (B1 sandbox, API side)', () => {
  it('a demo actor is a demo_ uid OR a demo:true claim', () => {
    expect(isDemoActorClaims({ uid: 'demo_qa_walker' })).toBe(true);
    expect(isDemoActorClaims({ uid: 'abc', demo: true })).toBe(true);
    expect(isDemoActorClaims({ uid: 'abc', demo: 'true' })).toBe(false);
    expect(isDemoActorClaims({ uid: 'demoUser' })).toBe(false);
    expect(isDemoActorClaims(null)).toBe(false);
  });
  it('demo-world ids', () => {
    expect(isDemoWorldId('demo_tlv01')).toBe(true);
    expect(isDemoWorldId('demo_tlv01_post_2026-10-20_0')).toBe(true);
    expect(isDemoWorldId('demo-grp-tlv-run')).toBe(true);
    expect(isDemoWorldId('sderot')).toBe(false);
    expect(isDemoWorldId('')).toBe(false);
    expect(isDemoWorldId(undefined)).toBe(false);
  });
  it('a real actor is never blocked, whatever the target', () => {
    expect(demoActorTargetBlocked(false, ['sderot'])).toBe(false);
    expect(demoActorTargetBlocked(false, [])).toBe(false);
    expect(demoActorTargetBlocked(false, [undefined])).toBe(false);
  });
  it('a demo actor reaches only demo targets (missing target = blocked)', () => {
    expect(demoActorTargetBlocked(true, ['demo-tlv'])).toBe(false);
    expect(demoActorTargetBlocked(true, ['demo-tlv', 'demo-tlv-n1'])).toBe(false);
    expect(demoActorTargetBlocked(true, ['demo-tlv', 'sderot-n1'])).toBe(true);
    expect(demoActorTargetBlocked(true, ['real-group'])).toBe(true);
    expect(demoActorTargetBlocked(true, [undefined])).toBe(true);
    expect(demoActorTargetBlocked(true, [])).toBe(true);
  });
  it('a demo actor-created group gets a demo- id; a real one is untouched', () => {
    expect(demoScopedId(true, 'Ab12', 'run')).toBe('demo-run-Ab12');
    expect(demoScopedId(false, 'Ab12', 'run')).toBe('Ab12');
  });
});
