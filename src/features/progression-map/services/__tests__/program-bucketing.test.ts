/**
 * program-bucketing.test.ts — Progression System v2, Phase 4a-fix.
 *
 * Unit tests for bucketProgramsByRealState — directly covers this round's
 * reported bug: a program must never appear in both the active and tracked
 * buckets at once, and a brand-new (no assessment at all) profile must
 * produce two empty buckets.
 */
import { describe, it, expect } from 'vitest';
import { bucketProgramsByRealState } from '../program-bucketing.service';

const identitySlug = (id: string) => id;

describe('bucketProgramsByRealState', () => {
  it('a brand-new profile (no active programs, no tracks) yields two empty buckets', () => {
    const result = bucketProgramsByRealState([], {}, identitySlug);
    expect(result).toEqual({ activeTemplateIds: [], trackedIds: [] });
  });

  it('active programs are returned in their own array order (priority)', () => {
    const result = bucketProgramsByRealState(
      [{ templateId: 'planche' }, { templateId: 'front_lever' }],
      {},
      identitySlug,
    );
    expect(result.activeTemplateIds).toEqual(['planche', 'front_lever']);
  });

  it('a program with a real track entry that is NOT active is "tracked"', () => {
    const result = bucketProgramsByRealState(
      [{ templateId: 'push' }],
      { push: { currentLevel: 10 }, pull: { currentLevel: 5 } },
      identitySlug,
    );
    expect(result.trackedIds).toEqual(['pull']);
  });

  it('mutual exclusivity: a program that is BOTH active and tracked appears ONLY in active, never in tracked (the reported duplication bug)', () => {
    const result = bucketProgramsByRealState(
      [{ templateId: 'planche' }],
      { planche: { currentLevel: 3 } },
      identitySlug,
    );
    expect(result.activeTemplateIds).toEqual(['planche']);
    expect(result.trackedIds).toEqual([]);
  });

  it('mutual exclusivity holds across a slug/raw-id mismatch (real data mixes the two id spaces)', () => {
    const RAW = 'RAWID_planche_77';
    const slugMap: Record<string, string> = { [RAW]: 'planche', planche: 'planche' };
    const resolve = (id: string) => slugMap[id] ?? id;
    const result = bucketProgramsByRealState(
      [{ templateId: RAW }], // active, keyed by raw id
      { planche: { currentLevel: 3 } }, // tracks, keyed by slug — SAME program
      resolve,
    );
    expect(result.activeTemplateIds).toEqual([RAW]);
    expect(result.trackedIds).toEqual([]); // must NOT leak into tracked just because the keys differ
  });

  it('a track entry with currentLevel 0 or missing is not counted as tracked', () => {
    const result = bucketProgramsByRealState(
      [],
      { push: { currentLevel: 0 }, pull: {} },
      identitySlug,
    );
    expect(result.trackedIds).toEqual([]);
  });

  it('an activePrograms entry with no templateId is skipped, not crashed on', () => {
    const result = bucketProgramsByRealState(
      [{ templateId: undefined }, { templateId: 'push' }],
      {},
      identitySlug,
    );
    expect(result.activeTemplateIds).toEqual(['push']);
  });

  describe('within-bucket dedup by resolved slug (Phase 4b round 3 fix — the reported "כל הגוף/עליית כוח/פלג גוף עליון renders twice" bug)', () => {
    const RAW = 'J0fLpmJhG0KDN2tQouxh';
    const slugMap: Record<string, string> = { [RAW]: 'calisthenics_upper', calisthenics_upper: 'calisthenics_upper' };
    const resolve = (id: string) => slugMap[id] ?? id;

    it('two DIFFERENT tracks keys resolving to the SAME slug — neither active — collapse to one tracked entry, first-seen wins', () => {
      const result = bucketProgramsByRealState(
        [],
        {
          calisthenics_upper: { currentLevel: 5 },
          [RAW]: { currentLevel: 14 },
        },
        resolve,
      );
      expect(result.trackedIds).toEqual(['calisthenics_upper']);
    });

    it('iteration-order-independent: the raw id first still collapses to one entry (the raw id, first-seen)', () => {
      const result = bucketProgramsByRealState(
        [],
        {
          [RAW]: { currentLevel: 14 },
          calisthenics_upper: { currentLevel: 5 },
        },
        resolve,
      );
      expect(result.trackedIds).toEqual([RAW]);
    });

    it('two DIFFERENT activePrograms entries resolving to the SAME slug also collapse to one, same treatment as tracked', () => {
      const result = bucketProgramsByRealState(
        [{ templateId: 'calisthenics_upper' }, { templateId: RAW }],
        {},
        resolve,
      );
      expect(result.activeTemplateIds).toEqual(['calisthenics_upper']);
    });

    it('distinct programs (different resolved slugs) are never collapsed into each other', () => {
      const result = bucketProgramsByRealState(
        [],
        { push: { currentLevel: 10 }, pull: { currentLevel: 5 } },
        identitySlug,
      );
      expect(result.trackedIds).toEqual(['push', 'pull']);
    });
  });
});
