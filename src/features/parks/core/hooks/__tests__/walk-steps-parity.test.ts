/** i18n extraction batch 3: the walk-to-route turn instructions. File snapshots recorded from unmodified origin/main (commit 1). */
import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/firebase', () => ({ db: {}, auth: {}, app: {} }));

import { transformWalkSteps } from '../useWalkToRoute';

const snap = (name: string) => `./__snapshots__/walk-steps/${name}.json`;

describe('walk steps (Hebrew)', () => {
  it('every maneuver type x modifier x street', async () => {
    const types = ['depart', 'arrive', 'continue', 'roundabout', 'rotary', 'merge', 'fork', 'turn', 'new name', 'end of road', undefined];
    const mods = ['right', 'left', 'slight right', 'slight left', 'sharp right', 'sharp left', 'straight', 'uturn', 'Right', undefined, 'weird'];
    const out: unknown[] = [];
    for (const type of types) for (const modifier of mods) for (const name of [undefined, '', '  ', 'הרצל', 'רחוב ז׳בוטינסקי ']) {
      out.push([type ?? null, modifier ?? null, name ?? null, transformWalkSteps([{ maneuver: { type, modifier }, name, distance: 120 }])]);
    }
    out.push(transformWalkSteps([{ maneuver: { type: 'turn', modifier: 'left' }, name: 'א', distance: 9 }, { maneuver: { type: 'turn', modifier: 'left' }, name: 'ב', distance: 10.4 }]));
    out.push(transformWalkSteps(null as never), transformWalkSteps([null as never, {}]));
    await expect(JSON.stringify(out, null, 2) + '\n').toMatchFileSnapshot(snap('all'));
    expect(out.length).toBeGreaterThan(100);
  });
});
