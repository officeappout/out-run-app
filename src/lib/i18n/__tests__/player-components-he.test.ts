/**
 * Namespace `player`, keys `gps.*` / `shareLive.*` / `preview.*` / `coachNote.*` / `strengthOverview.*`
 * (i18n wave 2, the shared workout components in src/features/workout-engine/components: GpsIndicator,
 * ShareAsLiveToggle, WorkoutPreviewHeader, CoachNoteBlock, StrengthOverviewCard). Every key returns
 * exactly what the code rendered before the extraction: the `old` side is the original literal /
 * template, or the old map / g() helper re-declared verbatim.
 *
 * The parity snapshots (src/features/workout-engine/components/__tests__/workout-components-i18n-parity.test.tsx)
 * cover the keys in context; this test also pins every gender / select branch (incl. non-standard
 * gender values) and counts ≥ 1000.
 */
import { describe, expect, it } from 'vitest';
import he from '@/messages/he/player.json';
import { player } from '@/messages/ns/player';
import { makeT } from '../t';

const t = makeT('he', player);
type Key = keyof typeof he;

// ShareAsLiveToggle's old helper: src/lib/utils/gendered-text.ts g(), called without `other`.
const g = (gender: unknown, male: string, female: string) => (gender === 'female' ? female : male);
const ACTIVITY_LABELS = {
  strength: { male: 'שתף שאני יוצא לאימון', female: 'שתפי שאני יוצאת לאימון' },
  running: { male: 'שתף שאני יוצא לריצה', female: 'שתפי שאני יוצאת לריצה' },
  walking: { male: 'שתף שאני יוצא להליכה', female: 'שתפי שאני יוצאת להליכה' },
  cycling: { male: 'שתף שאני יוצא לרכיבה', female: 'שתפי שאני יוצאת לרכיבה' },
} as const;
const MUSCLE_GROUP_LABELS: Record<string, string> = {
  chest: 'חזה', back: 'גב', shoulders: 'כתפיים', abs: 'בטן', obliques: 'אלכסונים', forearms: 'אמות',
  biceps: 'דו-ראשי', triceps: 'שלושה ראשים', quads: 'ארבע ראשי', hamstrings: 'המסטרינג', glutes: 'ישבן',
  calves: 'שוקיים', traps: 'טרפז', cardio: 'קרדיו', full_body: 'כל הגוף', core: 'ליבה', legs: 'רגליים',
};
const DIFFICULTY_LABELS: Record<string, string> = { easy: 'קל', medium: 'בינוני', hard: 'קשה' };

describe('player (he) shared workout components — byte-identical to the pre-extraction literals', () => {
  it('owns exactly the keys this test pins (count per prefix)', () => {
    const PREFIXES: Record<string, number> = { gps: 5, shareLive: 5, preview: 6, coachNote: 1, strengthOverview: 8 };
    for (const [prefix, n] of Object.entries(PREFIXES)) {
      expect([prefix, Object.keys(he).filter((k) => k.startsWith(`${prefix}.`)).length]).toEqual([prefix, n]);
    }
  });

  it('plain strings', () => {
    const cases: Array<[Key, string]> = [
      ['gps.simulated', 'מצב סימולציה'],
      ['gps.perfect', 'קליטה מעולה'],
      ['gps.good', 'קליטה טובה'],
      ['gps.poor', 'קליטה חלשה'],
      ['gps.searching', 'מחפש GPS...'],
      ['preview.back', 'חזרה'],
      ['preview.share', 'שיתוף'],
      ['preview.difficulty.easy', 'קל'],
      ['preview.difficulty.medium', 'בינוני'],
      ['preview.difficulty.hard', 'קשה'],
      ['coachNote.title', 'דגשי האימון'],
      ['strengthOverview.muscles', 'שרירים'],
      ['strengthOverview.equipment', 'ציוד'],
      ['strengthOverview.exercises', 'תרגילים באימון'],
    ];
    for (const [key, old] of cases) expect([key, t(key)]).toEqual([key, old]);
  });

  it('share-as-live: every activity × gender (incl. non-standard values)', () => {
    for (const gender of ['female', 'male', 'other', 'nonbinary', undefined, null]) {
      for (const a of Object.keys(ACTIVITY_LABELS) as Array<keyof typeof ACTIVITY_LABELS>) {
        expect(t(`shareLive.headline.${a}`, { gender })).toBe(g(gender, ACTIVITY_LABELS[a].male, ACTIVITY_LABELS[a].female));
      }
      expect(t('shareLive.sub', { gender })).toBe(g(gender, 'תופיע לאחרים שמחפשים שותף', 'תופיעי לאחרים שמחפשות שותפה'));
    }
  });

  it('durations (no thousands separator) + selects with fallback', () => {
    for (const n of [0, 5, 45, 1234]) {
      expect(t('preview.minutes', { minutes: String(n) })).toBe(`${n} דק'`);
      expect(t('strengthOverview.duration.minutes', { minutes: String(n) })).toBe(`${n} דק'`);
      expect(t('strengthOverview.duration.hours', { hours: String(n) })).toBe(`${n}ש`);
      expect(t('strengthOverview.duration.hoursMinutes', { hours: String(n), minutes: '30' })).toBe(`${n}ש ${30}דק'`);
    }
    for (const m of [...Object.keys(MUSCLE_GROUP_LABELS), 'neck', 'other', '']) {
      expect(t('strengthOverview.muscle', { muscle: m })).toBe(MUSCLE_GROUP_LABELS[m] || m);
    }
    for (const d of ['easy', 'medium', 'hard', 'extreme', '2']) {
      expect(t('strengthOverview.difficulty', { difficulty: d })).toBe(DIFFICULTY_LABELS[d] || d);
    }
  });
});
