import { describe, it, expect } from 'vitest';
import { completedSetsFor, loggedSetEquivalent, plannedSetEquivalents, plannedSetTotal, TABATA_BLOCK_SETS } from '../block-volume';

describe('plannedSetEquivalents', () => {
  it('density members share the block minutes; tabata members share 4 sets; classic keeps its sets', () => {
    const exs = [
      { sets: 3 },
      { sets: 1, protocolBlock: 'density' as const, densityBlockMinutes: 9 },
      { sets: 1, protocolBlock: 'density' as const, densityBlockMinutes: 9 },
      { sets: 1, protocolBlock: 'density' as const, densityBlockMinutes: 9 },
      { sets: 3, protocolBlock: 'tabata' as const },
      { sets: 3, protocolBlock: 'tabata' as const },
    ];
    expect(plannedSetEquivalents(exs)).toEqual([3, 3, 3, 3, 2, 2]);
    expect(plannedSetTotal(exs)).toBe(16);
  });
});

describe('completed sets', () => {
  it('EMOM / AMRAP: one logged value = one set; tabata: 8 intervals = 4 sets', () => {
    expect(loggedSetEquivalent(3, 'emom')).toBe(3);
    expect(loggedSetEquivalent(5, 'amrap')).toBe(5);
    expect(loggedSetEquivalent(8, 'tabata', 8)).toBe(TABATA_BLOCK_SETS);
    expect(loggedSetEquivalent(4, 'tabata', 8)).toBe(2); // one of two members
  });

  it('nothing logged → the plan: block minutes ÷ members, classic sets otherwise', () => {
    const emom = { protocol: 'emom', protocolConfig: { intervalSec: 60, totalIntervals: 9 }, exercises: [{}, {}, {}] };
    const amrap = { protocol: 'amrap', protocolConfig: { capSec: 600, roundItems: [] }, exercises: [{}, {}] };
    const tabata = { protocol: 'tabata', protocolConfig: { workSec: 20, restSec: 10, rounds: 8 }, exercises: [{}, {}] };
    expect(completedSetsFor(emom, 1, undefined)).toBe(3);
    expect(completedSetsFor(amrap, 1, undefined)).toBe(5);
    expect(completedSetsFor(tabata, 3, undefined)).toBe(2);
    expect(completedSetsFor({ exercises: [{}] }, 3, undefined)).toBe(3);
    expect(completedSetsFor(tabata, 3, 4)).toBe(2);
  });
});
