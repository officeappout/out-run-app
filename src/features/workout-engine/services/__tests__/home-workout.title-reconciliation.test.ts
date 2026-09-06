import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { GeneratedWorkout } from '../../logic/WorkoutGenerator';
import type { WorkoutMetadataContext, ResolvedWorkoutMetadata } from '../workout-metadata.service';

/**
 * Snapshot-seam bug (discovered tracing the desk-workout constraint,
 * home-workout.service.ts:~1180): title/description are picked while
 * isDeskWorkout is true (workout-metadata.service.ts's persona+time-window
 * "Desk Reset Boost", +30 for office_worker/student, 12:00-14:00), but if
 * the desk-workout filter finds fewer than 2 desk-friendly exercises it
 * silently keeps the ORIGINAL (non-desk) exercise pool — leaving copy that
 * promises a chair/desk session over a plan that isn't one.
 *
 * First attempt at this fix re-derived category/dominantMuscle from the
 * final exercise list and re-resolved when that diverged from the pre-
 * mutation snapshot — an independent review caught that this was backwards
 * (the fallback branch leaves exercises UNCHANGED, so category never
 * diverges in the bug case; the desk-filter SUCCEEDING is what changes
 * category, which is the already-correct case) and additionally that
 * category/dominantMuscle are not scoring inputs anywhere in
 * scoreContentRow, so even a correctly-firing re-resolve using them
 * couldn't change the outcome. The corrected mechanism: the desk-filter's
 * own fallback branch sets `deskThemeAbandoned = true` directly (the exact
 * point of the mismatch, not an inferred proxy), and reconciliation clears
 * `persona` for the re-resolve — the one field the Desk Reset Boost (and
 * the "David Clause" demographic hard-exclusion office_worker/student rows
 * are already subject to, scoreContentRow's userHasNoPersona branch) key
 * off.
 *
 * These tests exercise reconcileDeskThemeMismatch and applyTitleDedupSuffix,
 * the exact functions generateHomeWorkoutTrio calls — not re-implementations.
 */

vi.mock('../workout-metadata.service', async () => {
  const actual = await vi.importActual<typeof import('../workout-metadata.service')>(
    '../workout-metadata.service',
  );
  return { ...actual, resolveWorkoutMetadata: vi.fn() };
});

import { resolveWorkoutMetadata } from '../workout-metadata.service';
import {
  reconcileDeskThemeMismatch,
  applyTitleDedupSuffix,
} from '../home-workout.service';

const mockResolveWorkoutMetadata = vi.mocked(resolveWorkoutMetadata);

const baseWorkout = (): GeneratedWorkout =>
  ({
    title: 'אימון כיסא קליל',
    description: 'כמה דקות של מתיחות ליד השולחן',
    exercises: [],
    estimatedDuration: 15,
    structure: 'standard',
    difficulty: 2,
    mechanicalBalance: {} as any,
    stats: {} as any,
    isRecovery: false,
    totalPlannedSets: 0,
  } as unknown as GeneratedWorkout);

// The context the desk-themed title/description were originally picked
// against — a real office_worker in the lunch window (the exact condition
// that drives workout-metadata.service.ts's Desk Reset Boost).
const priorDeskCtx: WorkoutMetadataContext = {
  persona: 'office_worker',
  location: 'home',
  timeOfDay: 'afternoon',
  category: 'general',
  dominantMuscle: undefined,
  categoryLabel: 'כללי',
  durationMinutes: 15,
  difficulty: 2,
} as WorkoutMetadataContext;

const genericMetadata: ResolvedWorkoutMetadata = {
  title: 'אימון כוח מלא',
  description: 'סבב תרגילי כוח לכל הגוף',
  aiCue: 'קדימה!',
  logicCue: null,
  source: 'firestore',
  bundleId: 'bundle-generic',
};

beforeEach(() => {
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  mockResolveWorkoutMetadata.mockReset();
});
afterEach(() => vi.restoreAllMocks());

describe('reconcileDeskThemeMismatch — the demonstrated desk-theme-abandoned bug', () => {
  it('BUG scenario: desk theme abandoned — re-resolves WITHOUT persona (the lever that actually ' +
     'disables the Desk Reset Boost and the demographic hard-exclusion) and applies the result', async () => {
    mockResolveWorkoutMetadata.mockResolvedValue(genericMetadata);

    const workout = baseWorkout();
    expect(workout.title).toBe('אימון כיסא קליל'); // stale desk-themed title, pre-reconciliation

    const result = await reconcileDeskThemeMismatch(workout, priorDeskCtx, 'balanced', {});

    expect(result.reconciled).toBe(true);
    expect(result.staleTitle).toBe('אימון כיסא קליל');
    // The title now matches the delivered (non-desk) exercises, not the
    // desk-themed copy the exercise list no longer represents.
    expect(workout.title).toBe(genericMetadata.title);
    expect(workout.description).toBe(genericMetadata.description);
    expect(result.bundleId).toBe('bundle-generic');

    // The critical assertion: persona must be cleared on the re-resolve call.
    // category/dominantMuscle are NOT scoring inputs in workout-metadata.
    // service.ts — only clearing persona actually prevents the same
    // desk-themed row (or another office_worker/student-tagged row) from
    // winning again.
    expect(mockResolveWorkoutMetadata).toHaveBeenCalledWith(
      expect.objectContaining({ persona: null, location: 'home', timeOfDay: 'afternoon' }),
      'balanced',
      {},
    );
  });

  it('re-resolve returns no candidate row (Firestore error, or nothing survives the persona-' +
     'neutral guard) — leaves the stale desk-themed title/description in place rather than ' +
     'clobber them with a description-less null bundle', async () => {
    mockResolveWorkoutMetadata.mockResolvedValue({
      title: null, description: null, aiCue: null, logicCue: null, source: 'fallback',
    });

    const workout = baseWorkout();
    const result = await reconcileDeskThemeMismatch(workout, priorDeskCtx, 'balanced', {});

    expect(result.reconciled).toBe(false);
    expect(workout.title).toBe('אימון כיסא קליל');
    expect(workout.description).toBe('כמה דקות של מתיחות ליד השולחן');
  });

  it('carries forward the WORKOUT\'s current estimatedDuration/difficulty at reconciliation ' +
     'time, not the (potentially stale) values captured in priorCtx', async () => {
    mockResolveWorkoutMetadata.mockResolvedValue(genericMetadata);

    const workout = baseWorkout();
    workout.estimatedDuration = 22; // diverged from priorCtx.durationMinutes (15) since the pick
    workout.difficulty = 3;         // — simulates enforceVolumeCap/promise-revalidation having run

    await reconcileDeskThemeMismatch(workout, priorDeskCtx, 'balanced', {});

    expect(mockResolveWorkoutMetadata).toHaveBeenCalledWith(
      expect.objectContaining({ durationMinutes: 22, difficulty: 3 }),
      'balanced',
      {},
    );
  });
});

describe('applyTitleDedupSuffix — usedTitles interaction (the self-collision the review caught)', () => {
  it('leaves a title untouched when nothing else has claimed it', () => {
    const usedTitles = new Set<string>(['אימון אחר']);
    expect(applyTitleDedupSuffix('אימון כוח מלא', usedTitles, 1)).toBe('אימון כוח מלא');
  });

  it('appends a dedup suffix when a sibling option already claimed the exact same title', () => {
    const usedTitles = new Set<string>(['אימון כוח מלא']);
    expect(applyTitleDedupSuffix('אימון כוח מלא', usedTitles, 1)).toBe('אימון כוח מלא (משלים)');
  });

  it('self-collision fix: deleting the stale (pre-reconciliation) title from usedTitles before ' +
     'checking the reconciled title prevents it from colliding with its own prior entry', () => {
    const usedTitles = new Set<string>();
    const staleTitle = 'אימון כיסא קליל';
    usedTitles.add(staleTitle); // registered by the original resolve's own dedup step

    // Reconciliation's own cleanup: drop the stale entry before re-checking.
    usedTitles.delete(staleTitle);

    const reconciledTitle = 'אימון כוח מלא';
    expect(applyTitleDedupSuffix(reconciledTitle, usedTitles, 1)).toBe(reconciledTitle); // no spurious suffix
  });
});
