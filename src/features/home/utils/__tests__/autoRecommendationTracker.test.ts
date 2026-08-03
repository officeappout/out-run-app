import { describe, it, expect } from 'vitest';
import {
  isAutoActive,
  shouldCaptureSnapshot,
  type RecommendationSnapshot,
} from '../autoRecommendationTracker';

/**
 * "Auto" un-highlight — Feature C regression + scope tests.
 *
 * These pin the exact bug the prior investigation flagged (naive snapshot
 * captured too early vs. the settle-gated fix) plus the two behavioral
 * contracts requested: full reset-cycle, and location/equipmentOverride
 * exclusion from the comparison.
 */

const BASE: RecommendationSnapshot = {
  availableTime: 45,
  difficulty: 2,
  selectedProgramIds: [],
  selectedChips: [],
};

describe('fresh-load timing regression (WorkoutBuilderSheet.tsx:325-329 fallback effect)', () => {
  it('BEFORE (naive): a snapshot captured at first render — synchronously, before the async activeTemplateId fallback effect fires — incorrectly reports Auto as un-highlighted once the fallback populates selectedProgramIds', () => {
    // Fresh mount, no explicit defaultProgramId param → selectedProgramIds seeds empty.
    const naiveOriginal: RecommendationSnapshot = { ...BASE, selectedProgramIds: [] };

    // The activeTemplateId fallback effect fires shortly after mount (profile
    // was already hydrated) and populates selectedProgramIds — the user did
    // NOT touch anything.
    const afterFallback: RecommendationSnapshot = { ...BASE, selectedProgramIds: ['push'] };

    // A naive "capture at first render" implementation compares against the
    // stale empty snapshot → mismatch → Auto would incorrectly un-highlight.
    expect(isAutoActive(afterFallback, naiveOriginal)).toBe(false);
  });

  it('AFTER (fix): gating the snapshot capture on shouldCaptureSnapshot (programs.length > 0) captures the POST-fallback value, so Auto stays highlighted on an untouched screen', () => {
    let initialized = false;
    let originalRecommendation: RecommendationSnapshot | null = null;

    // t0 — mount. selectedProgramIds is still empty in this same synchronous
    // pass (fallback effect + programs fetch have not resolved yet).
    let current: RecommendationSnapshot = { ...BASE, selectedProgramIds: [] };
    let programsLength = 0;

    // Capture-gate effect runs on mount — programs not loaded yet → skip.
    if (shouldCaptureSnapshot({ initialized, programsLength })) {
      originalRecommendation = { ...current };
      initialized = true;
    }
    expect(initialized).toBe(false);
    expect(originalRecommendation).toBeNull();

    // t1 — the activeTemplateId fallback effect fires (profile already
    // hydrated synchronously) and populates selectedProgramIds. Note:
    // `originalRecommendation` is still null here (not yet initialized) —
    // WorkoutBuilderSheet does not consult `isAutoActive` in this window; it
    // uses the legacy `selectedProgramIds.length === 0` display rule instead
    // (see WorkoutBuilderSheet.tsx pre-init fallback), so no bug is visible
    // even though a naive snapshot would already be frozen wrong by now.
    current = { ...current, selectedProgramIds: ['push'] };

    // t2 — the async getAllPrograms() fetch resolves.
    programsLength = 12;

    // Capture-gate effect re-evaluates on this later render — now settles,
    // capturing the POST-fallback value as "original".
    if (shouldCaptureSnapshot({ initialized, programsLength })) {
      originalRecommendation = { ...current };
      initialized = true;
    }
    expect(initialized).toBe(true);
    expect(originalRecommendation).toEqual(current);

    // Now that the snapshot reflects the settled state, Auto correctly reads
    // as highlighted — the user never touched anything.
    expect(isAutoActive(current, originalRecommendation)).toBe(true);
  });
});

describe('full cycle: load → change one field → un-highlight → tap Auto → full revert', () => {
  it('changing availableTime un-highlights Auto; resetting to the original snapshot re-highlights it and restores all 4 fields', () => {
    const original: RecommendationSnapshot = {
      availableTime: 45,
      difficulty: 2,
      selectedProgramIds: ['push'],
      selectedChips: ['chest'],
    };

    // Load: current === original → highlighted.
    let current: RecommendationSnapshot = { ...original };
    expect(isAutoActive(current, original)).toBe(true);

    // User changes ONE field (availableTime 45 → 30).
    current = { ...current, availableTime: 30 };
    expect(isAutoActive(current, original)).toBe(false);

    // Tap "Auto" — resets ALL 4 fields back to the original snapshot in one batch.
    current = { ...original };
    expect(current).toEqual(original);
    expect(isAutoActive(current, original)).toBe(true);
  });

  it('un-highlights on a mismatch in ANY of the 4 in-scope fields (difficulty, selectedProgramIds, selectedChips)', () => {
    const original: RecommendationSnapshot = {
      availableTime: 45,
      difficulty: 2,
      selectedProgramIds: ['push'],
      selectedChips: ['chest'],
    };

    expect(isAutoActive({ ...original, difficulty: 3 }, original)).toBe(false);
    expect(isAutoActive({ ...original, selectedProgramIds: ['pull'] }, original)).toBe(false);
    expect(isAutoActive({ ...original, selectedProgramIds: [] }, original)).toBe(false);
    expect(isAutoActive({ ...original, selectedChips: ['back'] }, original)).toBe(false);

    // Selection order must not matter (order-independent set comparison).
    expect(
      isAutoActive(
        { ...original, selectedProgramIds: ['a', 'b'], selectedChips: ['x', 'y'] },
        { ...original, selectedProgramIds: ['b', 'a'], selectedChips: ['y', 'x'] },
      ),
    ).toBe(true);
  });
});

describe('scope decision: location and equipmentOverride are excluded from the comparison', () => {
  it('RecommendationSnapshot has no location/equipmentOverride fields — a location-only change cannot affect isAutoActive because the type does not carry it', () => {
    const original: RecommendationSnapshot = {
      availableTime: 45,
      difficulty: 2,
      selectedProgramIds: ['push'],
      selectedChips: [],
    };
    // Simulates: user changes location (park → home) and/or equipmentOverride,
    // but none of the 4 tracked fields change. Since RecommendationSnapshot
    // structurally excludes location/equipmentOverride, a location swap can
    // only ever produce an object equal on all 4 tracked fields.
    const afterLocationChange: RecommendationSnapshot = { ...original };
    expect(isAutoActive(afterLocationChange, original)).toBe(true);
  });
});
