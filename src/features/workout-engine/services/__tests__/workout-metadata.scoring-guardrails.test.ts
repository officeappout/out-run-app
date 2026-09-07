import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * Covers the two scoring-frame fixes proposed after the parent-bleed root-
 * cause investigation (docs/research/notification-content-scenario-sweep.md,
 * parent-bleed-audit.ts, 06.09.2026):
 *
 * 1. Seasonal Summer Boost — 'ים' substring-matched the plural suffix inside
 *    ordinary words ("ילדים", "לימודים"), firing +20 on nearly every row
 *    regardless of season. Fixed via includesWholeWord() (Unicode \p{L}
 *    lookaround — plain \b doesn't work for Hebrew, since JS defines \b via
 *    ASCII \w only). Also routed the month check through ctx.previewNow,
 *    matching the earlier Desk Reset / Parent Time-Window fix.
 *
 * 2. Soft Persona Mismatch Guard — the David Clause only ever protected
 *    NO-persona users from demographic content. A user WITH a specific
 *    persona had no protection from a DIFFERENT demographic persona's
 *    content winning by tie or near-tie. Fixed via a soft penalty (not a
 *    hard exclusion, so mismatched content can still win when it's the only
 *    option — the safety net thin-inventory personas like pupil/pro_athlete
 *    depend on).
 */

const state = vi.hoisted(() => ({
  ROWS: {} as Record<string, any[]>,
}));

vi.mock('@/lib/firebase', () => ({ db: {} }));
vi.mock('firebase/firestore', () => ({
  collection: (_db: unknown, _base: string, parentDoc: string, _subCol: string) => ({ __parentDoc: parentDoc }),
  getDocs: async (ref: { __parentDoc: string }) => {
    const rows = state.ROWS[ref.__parentDoc] ?? [];
    return { empty: rows.length === 0, docs: rows.map(r => ({ data: () => r })) };
  },
  query: vi.fn(),
  where: vi.fn(),
}));

import {
  resolveWorkoutMetadataWithCandidates,
  type WorkoutMetadataContext,
} from '../workout-metadata.service';

function setTitles(rows: any[]) {
  state.ROWS.workoutTitles = rows;
}
function setDescriptions(rows: any[]) {
  state.ROWS.smartDescriptions = rows;
}

beforeEach(() => {
  state.ROWS = {};
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

function dateFor(month: number, day = 15): Date {
  const d = new Date();
  d.setMonth(month, day);
  d.setHours(10, 0, 0, 0);
  return d;
}

describe('Seasonal Summer Boost — word-boundary fix', () => {
  const baseCtx: WorkoutMetadataContext = {
    persona: null,
    location: 'home',
    timeOfDay: 'morning',
  };

  it('a plain plural like "ילדים" / "לימודים" no longer false-positives the summer boost', async () => {
    setTitles([
      { text: 'אימון שקט לפני שהילדים קמים' },      // contains "ילדים" — plural suffix, not the word "ים"
      { text: 'להתעורר לפני הלימודים' },              // contains "לימודים" — same suffix trap
    ]);
    setDescriptions([]);

    const july = dateFor(6); // June (index 5) .. September (index 8) = isSummer
    const result = await resolveWorkoutMetadataWithCandidates({ ...baseCtx, previewNow: july });

    for (const c of result.titleCandidates) {
      expect(c.score).toBe(0);
      expect(c.reasons.join(' ')).not.toContain('summer_boost');
    }
  });

  it('the standalone word "ים" (sea) still earns the boost — the fix narrows the match, it does not disable it', async () => {
    setTitles([
      { text: 'ריצה לאורך חוף הים' },   // standalone "הים" (the sea) — real summer content
    ]);
    setDescriptions([]);

    const july = dateFor(6);
    const result = await resolveWorkoutMetadataWithCandidates({ ...baseCtx, previewNow: july });

    const row = result.titleCandidates[0];
    expect(row.reasons.join(' ')).toContain('summer_boost');
    expect(row.score).toBeGreaterThanOrEqual(20);
  });

  it('previewNow — not the real wall clock — decides the season: winter-tagged text scores higher under a December previewNow than under a July previewNow', async () => {
    setTitles([{ text: 'אימון חורפי בסלון' }]); // "סלון" = winter keyword
    setDescriptions([]);

    const decemberResult = await resolveWorkoutMetadataWithCandidates({ ...baseCtx, previewNow: dateFor(11) });
    const julyResult = await resolveWorkoutMetadataWithCandidates({ ...baseCtx, previewNow: dateFor(6) });

    const decScore = decemberResult.titleCandidates[0].score;
    const julScore = julyResult.titleCandidates[0].score;
    expect(decScore).toBeGreaterThan(julScore);
    expect(decemberResult.titleCandidates[0].reasons.join(' ')).toContain('winter_boost');
    expect(julyResult.titleCandidates[0].reasons.join(' ')).not.toContain('winter_boost');
  });
});

describe('Soft Persona Mismatch Guard', () => {
  it('penalizes a mismatched row by exactly SOFT_PERSONA_MISMATCH_PENALTY (-3) when the row scores comfortably above the floor', async () => {
    // Same row, scored against two different requesting personas: a matching
    // one (no penalty — persona itself contributes +1) and a mismatched one
    // (penalty applies). Isolates the penalty's magnitude from any
    // Math.max(0, ...) floor effect by giving the row enough OTHER matching
    // fields (location + gender + timeOfDay) that the floor never engages.
    setTitles([
      { text: 'אימון הורים', persona: 'parent', location: 'home', timeOfDay: 'morning', gender: 'female' },
    ]);
    setDescriptions([]);

    const matchScore = (await resolveWorkoutMetadataWithCandidates({
      persona: 'parent', location: 'home', timeOfDay: 'morning', gender: 'female',
    })).titleCandidates[0].score; // persona(+1) + location(+1) + timeOfDay(+1) + gender(+1) = 4

    const mismatchScore = (await resolveWorkoutMetadataWithCandidates({
      persona: 'student', location: 'home', timeOfDay: 'morning', gender: 'female',
    })).titleCandidates[0].score; // location(+1) + timeOfDay(+1) + gender(+1) - penalty(3) = 0

    expect(matchScore - mismatchScore).toBe(4); // the persona's own +1 AND the -3 penalty both apply
    expect(mismatchScore).toBe(0);
  });

  it('a genuine pre-fix tie (parent row wins an unrelated field, student row wins on persona) now resolves to the student-tagged row', async () => {
    // Reproduces the real tie-break pattern found in the audit: the parent
    // row matches on an unrelated field (gender) instead of persona, landing
    // at the exact same score as the student row (which matches on persona
    // instead) — a coin-flip before this fix, since persona match/mismatch
    // was worth the same as any other single-point field.
    setTitles([
      { text: 'אימון שקט לפני שהילדים קמים', persona: 'parent', location: 'home', gender: 'female' },
      { text: 'להתעורר לפני הלימודים', persona: 'student', location: 'home' },
    ]);
    setDescriptions([]);

    const ctx: WorkoutMetadataContext = {
      persona: 'student', location: 'home', timeOfDay: 'morning', gender: 'female',
    };
    const result = await resolveWorkoutMetadataWithCandidates(ctx);

    expect(result.title).toBe('להתעורר לפני הלימודים');
    const parentRow = result.titleCandidates.find(c => c.persona === 'parent')!;
    const studentRow = result.titleCandidates.find(c => c.persona === 'student')!;
    expect(parentRow.reasons.join(' ')).toContain('personaMismatch_penalty');
    expect(studentRow.score).toBeGreaterThan(parentRow.score);
  });

  it('a parent-tagged row still wins when it is the ONLY candidate (thin-inventory safety net preserved)', async () => {
    setTitles([
      { text: 'אימון שקט לפני שהילדים קמים', persona: 'parent', location: 'home' },
    ]);
    setDescriptions([]);

    const result = await resolveWorkoutMetadataWithCandidates({
      persona: 'pro_athlete', location: 'home', timeOfDay: 'morning',
    });

    expect(result.title).toBe('אימון שקט לפני שהילדים קמים');
  });

  it('does NOT penalize a row correctly tagged for the requesting persona', async () => {
    setTitles([
      { text: 'אימון כוח למשרד', persona: 'office_worker', location: 'home' },
    ]);
    setDescriptions([]);

    const result = await resolveWorkoutMetadataWithCandidates({
      persona: 'office_worker', location: 'home', timeOfDay: 'morning',
    });

    const row = result.titleCandidates[0];
    expect(row.reasons.join(' ')).not.toContain('personaMismatch_penalty');
    expect(row.score).toBeGreaterThanOrEqual(0);
  });

  it('does NOT penalize a row tagged for a non-demographic persona (pupil/pro_athlete are not in DEMOGRAPHIC_PERSONA_TAGS)', async () => {
    setTitles([
      { text: 'אימון אתגרי לספורטאי', persona: 'pro_athlete', location: 'home' },
    ]);
    setDescriptions([]);

    const result = await resolveWorkoutMetadataWithCandidates({
      persona: 'student', location: 'home', timeOfDay: 'morning',
    });

    const row = result.titleCandidates[0];
    expect(row.reasons.join(' ')).not.toContain('personaMismatch_penalty');
    expect(row.score).toBe(1); // location match only — no persona bonus, no penalty either
  });

  it('still hard-excludes demographic content for a NO-persona user — the pre-existing David Clause is untouched', async () => {
    setTitles([
      { text: 'אימון שקט לפני שהילדים קמים', persona: 'parent', location: 'home' },
      { text: 'אימון כללי', persona: 'any', location: 'home' },
    ]);
    setDescriptions([]);

    const result = await resolveWorkoutMetadataWithCandidates({
      persona: null, location: 'home', timeOfDay: 'morning',
    });

    expect(result.title).toBe('אימון כללי');
  });
});
