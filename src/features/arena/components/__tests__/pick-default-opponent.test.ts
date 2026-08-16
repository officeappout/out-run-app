import { describe, it, expect, vi } from 'vitest';

vi.mock('@/lib/firebase', () => ({ db: {} }));
vi.mock('firebase/firestore', () => ({
  collection: vi.fn(), query: vi.fn(), where: vi.fn(), orderBy: vi.fn(),
  limit: vi.fn(), getDocs: vi.fn(), getDoc: vi.fn(), doc: vi.fn(), Timestamp: { fromDate: vi.fn() },
}));

import { pickDefaultOpponent } from '../pick-default-opponent';
import type { ScopeCompetitionEntry } from '@/features/arena/services/ranking.service';

function entry(rank: number, scopeId: string, totalScore: number): ScopeCompetitionEntry {
  return { rank, scopeId, scopeName: scopeId, totalScore, activeMemberCount: 1 };
}

describe('pickDefaultOpponent — "who am I chasing" framing', () => {
  it('when not #1, defaults to whoever is one rank above (the one to chase)', () => {
    const entries = [entry(1, 'a', 100), entry(2, 'b', 80), entry(3, 'c', 60)];
    // I am rank 3 ('c'), index 2 -> should chase rank 2 ('b')
    expect(pickDefaultOpponent(entries, 2)?.scopeId).toBe('b');
  });

  it('when I am #1 (index 0), defaults to whoever is one rank below (defend the lead)', () => {
    const entries = [entry(1, 'a', 100), entry(2, 'b', 80), entry(3, 'c', 60)];
    expect(pickDefaultOpponent(entries, 0)?.scopeId).toBe('b');
  });

  it('when I am #1 and alone (no one else), returns null — nobody to battle', () => {
    const entries = [entry(1, 'a', 100)];
    expect(pickDefaultOpponent(entries, 0)).toBeNull();
  });

  it('when rank 2 chases rank 1 specifically (not just "index 0")', () => {
    const entries = [entry(1, 'leader', 500), entry(2, 'me', 300)];
    expect(pickDefaultOpponent(entries, 1)?.scopeId).toBe('leader');
  });
});
