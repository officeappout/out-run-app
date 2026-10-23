import { describe, expect, it, vi } from 'vitest';
import { createPresencePublisher, type PublisherClock, type StatusInput } from '../services/presence-publisher';
import { createMemoryPresenceAdapter } from '../services/memory-presence-adapter';
import { orderParticipants } from '../core/presence-order';

function fakeClock() {
  let t = 1_000_000;
  const timers: Array<{ at: number; fn: () => void; id: number }> = [];
  let id = 0;
  const clock: PublisherClock = {
    now: () => t,
    setTimeout: (fn, ms) => { const h = { at: t + ms, fn, id: ++id }; timers.push(h); return h.id; },
    clearTimeout: (h) => { const i = timers.findIndex((x) => x.id === h); if (i >= 0) timers.splice(i, 1); },
  };
  const advance = (ms: number) => {
    const end = t + ms;
    for (;;) {
      timers.sort((a, b) => a.at - b.at);
      const next = timers[0];
      if (!next || next.at > end) break;
      timers.shift();
      t = next.at;
      next.fn();
    }
    t = end;
  };
  return { clock, advance };
}

const REF = { groupId: 'g', attendanceId: '2026-10-22_18-00' };
const s = (o: Partial<StatusInput> = {}): StatusInput => ({ uid: 'me', name: 'אני', kind: 'run', state: 'active', distanceKm: 0, ...o });

describe('presence publisher', () => {
  it('collapses a burst of GPS ticks into one write per 4 s, latest wins', () => {
    const { clock, advance } = fakeClock();
    const adapter = createMemoryPresenceAdapter({ serverNow: clock.now });
    const pub = createPresencePublisher({ adapter, ref: REF, clock });
    pub.update(s({ distanceKm: 0.1 }));
    for (let i = 2; i <= 20; i++) { advance(100); pub.update(s({ distanceKm: i / 10 })); }
    expect(adapter.writes).toHaveLength(1);
    advance(4000);
    expect(adapter.writes).toHaveLength(2);
    expect(adapter.writes[1].status.distanceKm).toBe(2);
    expect(adapter.writes[1].atMs - adapter.writes[0].atMs).toBeGreaterThanOrEqual(4000);
  });
  it('heartbeats an unchanged status and keeps seq increasing', () => {
    const { clock, advance } = fakeClock();
    const adapter = createMemoryPresenceAdapter({ serverNow: clock.now });
    const pub = createPresencePublisher({ adapter, ref: REF, clock });
    pub.update(s());
    advance(10_000); pub.tick();
    expect(adapter.writes).toHaveLength(1);
    advance(10_000); pub.tick();
    expect(adapter.writes).toHaveLength(2);
    expect(adapter.writes[1].status.seq).toBeGreaterThan(adapter.writes[0].status.seq);
  });
  it('finish() publishes done (after the gap) and then nothing more', () => {
    const { clock, advance } = fakeClock();
    const adapter = createMemoryPresenceAdapter({ serverNow: clock.now });
    const pub = createPresencePublisher({ adapter, ref: REF, clock });
    pub.update(s({ distanceKm: 1 }));
    advance(1000);
    pub.finish({ distanceKm: 1.5 });
    advance(3000);
    expect(adapter.writes).toHaveLength(2);
    expect(adapter.writes[1].status).toMatchObject({ state: 'done', distanceKm: 1.5 });
    pub.update(s({ distanceKm: 9 }));
    advance(10_000);
    expect(adapter.writes).toHaveLength(2);
  });
  it('stop() cancels a pending write; a failing adapter never throws', async () => {
    const { clock, advance } = fakeClock();
    const adapter = createMemoryPresenceAdapter({ serverNow: clock.now });
    const pub = createPresencePublisher({ adapter, ref: REF, clock });
    pub.update(s()); pub.update(s({ distanceKm: 1 }));
    pub.stop(); advance(10_000);
    expect(adapter.writes).toHaveLength(1);

    const onError = vi.fn();
    const bad = { publish: () => Promise.reject(new Error('denied')), subscribe: () => () => {} };
    const pub2 = createPresencePublisher({ adapter: bad, ref: REF, clock, onError });
    pub2.update(s());
    await Promise.resolve(); await Promise.resolve();
    expect(onError).toHaveBeenCalled();
  });
});

describe('memory adapter + ordering end to end', () => {
  it('two publishers → ordered rail for a subscriber; stale seq is ignored', async () => {
    const { clock } = fakeClock();
    const adapter = createMemoryPresenceAdapter({ serverNow: clock.now });
    let seen: ReturnType<typeof orderParticipants> = [];
    adapter.subscribe(REF, (e) => { seen = orderParticipants(e, 'me', clock.now()); });
    await adapter.publish(REF, { ...s({ uid: 'me', distanceKm: 1 }), clientMs: clock.now(), seq: 5 });
    await adapter.publish(REF, { ...s({ uid: 'dani', name: 'דני', distanceKm: 2 }), clientMs: clock.now(), seq: 1 });
    await adapter.publish(REF, { ...s({ uid: 'dani', name: 'דני', distanceKm: 0.1 }), clientMs: clock.now(), seq: 0 });
    expect(seen.map((p) => p.uid)).toEqual(['me', 'dani']);
    expect(seen[1].distanceKm).toBe(2);
  });
});
