import { describe, it, expect } from 'vitest';
import {
  deriveKellyBubbleText,
  resolveKellyProgramLabel,
  KELLY_GENERIC_FALLBACK,
  type KellyProgramLike,
} from '../kellyBubbleText';

/**
 * Fix C (04.08.2026) — proves Kelly's bubble text is genuinely dynamic
 * across real user states, not a fixed/duplicate string.
 *
 * Scenario A and B below use the exact real coachCue strings produced by
 * `resolveSessionPolicy` in periodization.service.ts (lines 233 and 268 —
 * "detraining" and "peak" tiers), and a real program-label fallback shaped
 * like `DisplayProgram` in WorkoutBuilderSheet.tsx.
 */

describe('deriveKellyBubbleText', () => {
  it('Scenario A — detraining gap coachCue (periodization.service.ts:233) renders verbatim', () => {
    const gapDays = 5;
    const coachCue = `חזרת אחרי ${gapDays} ימי הפסקה — נתחיל בנוח עם נפח מופחת.`;
    const text = deriveKellyBubbleText({ coachCue, autoAppliedProgram: null, resolvedProgramLabel: null });
    expect(text).toBe('חזרת אחרי 5 ימי הפסקה — נתחיל בנוח עם נפח מופחת.');
  });

  it('Scenario B — peak-week coachCue (periodization.service.ts:268) renders a different verbatim string', () => {
    const coachCue = 'שבוע פסגה (Peak) — נפח +20%, פרוטוקולים אינטנסיביים פעילים.';
    const text = deriveKellyBubbleText({ coachCue, autoAppliedProgram: null, resolvedProgramLabel: null });
    expect(text).toBe('שבוע פסגה (Peak) — נפח +20%, פרוטוקולים אינטנסיביים פעילים.');
  });

  it('Scenario A and B produce DIFFERENT bubble text for two different real user states', () => {
    const textA = deriveKellyBubbleText({
      coachCue: 'חזרת אחרי 5 ימי הפסקה — נתחיל בנוח עם נפח מופחת.',
      autoAppliedProgram: null,
      resolvedProgramLabel: null,
    });
    const textB = deriveKellyBubbleText({
      coachCue: 'שבוע פסגה (Peak) — נפח +20%, פרוטוקולים אינטנסיביים פעילים.',
      autoAppliedProgram: null,
      resolvedProgramLabel: null,
    });
    expect(textA).not.toBe(textB);
  });

  it('coachCue absent (build week, periodization.service.ts:282) falls back to autoAppliedProgram reasoning', () => {
    const text = deriveKellyBubbleText({
      coachCue: undefined,
      autoAppliedProgram: { label: 'פלג גוף עליון' },
      resolvedProgramLabel: null,
    });
    expect(text).toBe('יאומן לפי פלג גוף עליון — הותאם אוטומטית לשרירים שבחרת.');
  });

  it('coachCue AND autoAppliedProgram both absent falls back to the resolved program label (NOT the generic string)', () => {
    const text = deriveKellyBubbleText({
      coachCue: undefined,
      autoAppliedProgram: null,
      resolvedProgramLabel: 'Front Lever',
    });
    expect(text).toBe('האימון היום בנוי לפי תוכנית Front Lever.');
    expect(text).not.toBe(KELLY_GENERIC_FALLBACK);
  });

  it('this program-label fallback differs from the build-week/deload coachCue text — proves dynamism on the most common real path', () => {
    const buildWeekText = deriveKellyBubbleText({
      coachCue: undefined, // periodization.service.ts:282 — ordinary build week
      autoAppliedProgram: null, // explicit-pill guard nulls this on the "Build Custom" path
      resolvedProgramLabel: 'עליית מתח',
    });
    const deloadWeekText = deriveKellyBubbleText({
      coachCue: 'שבוע שחזור (Deload) — נפח מופחת ב-50%, פרוטוקולים מנוטרלים.', // periodization.service.ts:254
      autoAppliedProgram: null,
      resolvedProgramLabel: 'עליית מתח',
    });
    expect(buildWeekText).not.toBe(deloadWeekText);
    expect(buildWeekText).toBe('האימון היום בנוי לפי תוכנית עליית מתח.');
  });

  it('only when ALL three sources are empty does the fully generic fallback render', () => {
    const text = deriveKellyBubbleText({ coachCue: undefined, autoAppliedProgram: null, resolvedProgramLabel: null });
    expect(text).toBe(KELLY_GENERIC_FALLBACK);
  });

  it('generic fallback is textually distinct from the info-icon static copy (not a literal duplicate)', () => {
    const infoIconText =
      'אוטו נותן לך המלצה מותאמת אישית לפי ההתקדמות שלך, אבל אתה תמיד יכול לשלוט בהכל בעצמך — משך, תוכנית, אזור-אימון, עוצמה.';
    expect(KELLY_GENERIC_FALLBACK).not.toBe(infoIconText);
  });
});

describe('resolveKellyProgramLabel', () => {
  const displayPrograms: KellyProgramLike[] = [
    { id: 'prog-1', label: 'Front Lever' },
    { id: 'prog-2', label: 'Muscle Up' },
  ];

  it('resolves the label of the first selected program id, regardless of prefill vs explicit-click source', () => {
    expect(resolveKellyProgramLabel(['prog-2'], displayPrograms)).toBe('Muscle Up');
  });

  it('returns null when no program is selected', () => {
    expect(resolveKellyProgramLabel([], displayPrograms)).toBeNull();
  });

  it('returns null when the selected id has no matching display program (defensive, e.g. stale id)', () => {
    expect(resolveKellyProgramLabel(['unknown-id'], displayPrograms)).toBeNull();
  });
});
