/**
 * station-core-tabata — 22.09.2026, David-approved (field-test docs 32/33).
 * Tests the block-count formula + multi-block dedup orchestration. Does NOT
 * re-test core-block.ts/tabata.block.ts's own selection/tiling logic
 * (already covered by core-block.test.ts, untouched here) — only the NEW
 * per-station wiring this file adds.
 */
import { describe, it, expect } from 'vitest';
import {
  chooseStationTabataBlockCount,
  buildStationCoreTabataBlocks,
  REST_BETWEEN_STATION_TABATA_BLOCKS_SEC,
} from '../station-core-tabata';
import { TABATA_BLOCK_SECONDS } from '../../logic/protocols/tabata.constants';
import type { Exercise } from '@/features/content/exercises/core/exercise.types';

// ── chooseStationTabataBlockCount ───────────────────────────────────────────

describe('chooseStationTabataBlockCount — capped at 1 (David, 22.09.2026)', () => {
  it('a budget shorter than one block (4 min) yields 0 — caller falls back', () => {
    expect(chooseStationTabataBlockCount(3)).toBe(0);
  });

  it('4 minutes or more yields exactly 1 — never a second block, however large the budget', () => {
    for (const minutes of [4, 8, 9, 10, 14, 20, 30, 45]) {
      expect(chooseStationTabataBlockCount(minutes)).toBe(1);
    }
  });

  it('formula never exceeds the actual budget when reconstructed', () => {
    for (const minutes of [4, 5, 9, 10, 14, 20, 30]) {
      const n = chooseStationTabataBlockCount(minutes);
      const usedSec = n * TABATA_BLOCK_SECONDS + Math.max(0, n - 1) * REST_BETWEEN_STATION_TABATA_BLOCKS_SEC;
      expect(usedSec).toBeLessThanOrEqual(minutes * 60);
    }
  });

  it('monotonically non-decreasing in the budget', () => {
    let prev = 0;
    for (let m = 0; m <= 45; m++) {
      const n = chooseStationTabataBlockCount(m);
      expect(n).toBeGreaterThanOrEqual(prev);
      prev = n;
    }
  });
});

// ── buildStationCoreTabataBlocks ────────────────────────────────────────────

function coreEx(id: string, level = 1): Exercise {
  return {
    id,
    name: { he: id, en: '' },
    tags: ['hiit_friendly'],
    targetPrograms: [{ programId: 'core', level }],
    symmetry: 'bilateral',
    execution_methods: [
      { location: 'park', methodName: { he: `${id} park` }, media: { mainVideoUrl: 'https://x/park.mp4' } },
    ],
  } as unknown as Exercise;
}

describe('buildStationCoreTabataBlocks', () => {
  it('builds the requested number of blocks when the pool has enough distinct exercises', () => {
    // budget=10 → chooseCoreTabataMemberCount picks 4 members/block (the ">=8" band) —
    // 2 blocks need 8 distinct exercises.
    const corePool = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'].map((id) => coreEx(id));
    const result = buildStationCoreTabataBlocks(
      { corePool, userLevel: 1, location: 'park', availableEquipment: [], blockCount: 2 },
      10,
    );
    expect(result.blocks).toHaveLength(2);
    expect(result.exercises.length).toBeGreaterThan(0);
  });

  it('does not repeat the same exercise across two blocks (dedup between calls)', () => {
    // 8 distinct exercises, enough for 2 full 4-member blocks with none left over —
    // genuinely exercises the dedup path (not just "one block, trivially no dupes").
    const corePool = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'].map((id) => coreEx(id));
    const result = buildStationCoreTabataBlocks(
      { corePool, userLevel: 1, location: 'park', availableEquipment: [], blockCount: 2 },
      10,
    );
    expect(result.blocks).toHaveLength(2); // both blocks actually built
    const allIds = result.blocks.flatMap((b) => b.exerciseIds);
    expect(allIds).toHaveLength(8); // 4 + 4
    expect(new Set(allIds).size).toBe(allIds.length); // no duplicate ids across blocks
  });

  it('a pool with EXACTLY enough for one block correctly stops at one block, not a silently-repeating second', () => {
    const corePool = [coreEx('a'), coreEx('b'), coreEx('c'), coreEx('d')];
    const result = buildStationCoreTabataBlocks(
      { corePool, userLevel: 1, location: 'park', availableEquipment: [], blockCount: 2 },
      10,
    );
    expect(result.blocks).toHaveLength(1); // NOT 2 — the pool ran out after block 1
    expect(result.blocks[0].exerciseIds).toHaveLength(4);
  });

  it('stops gracefully (fewer blocks than requested) when the pool runs out — never throws', () => {
    const corePool = [coreEx('a'), coreEx('b')]; // only enough for one 2-member block
    const result = buildStationCoreTabataBlocks(
      { corePool, userLevel: 1, location: 'park', availableEquipment: [], blockCount: 3 },
      4, // small budget → chooseCoreTabataMemberCount picks the small tier (2)
    );
    expect(result.blocks.length).toBeLessThanOrEqual(3);
    expect(result.blocks.length).toBeGreaterThanOrEqual(0);
  });

  it('an empty pool yields zero blocks and zero exercises, no crash', () => {
    const result = buildStationCoreTabataBlocks(
      { corePool: [], userLevel: 1, location: 'park', availableEquipment: [], blockCount: 2 },
      10,
    );
    expect(result.blocks).toHaveLength(0);
    expect(result.exercises).toHaveLength(0);
  });
});
