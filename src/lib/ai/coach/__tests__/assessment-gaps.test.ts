/**
 * "קלי AI" level-check nudges: the sheet's assessmentGaps (same bucket as the progress
 * tab's "עוד לא בדקת רמה"), the session-context note, and the "בדוק רמה ב<תחום>" chip
 * (when it appears, and that it never repeats within the cooldown).
 */
import { describe, it, expect } from 'vitest';
import { deriveAssessmentGaps, gapForWorkout, MAX_ASSESSMENT_GAPS, type AssessmentGap } from '../assessment-gaps';
import { buildUserContextSheet, summarizeProgress } from '../context-sheet';
import { assessmentGapNote, buildSessionContext } from '../persona';
import {
  CHECK_LEVEL_NUDGE_COOLDOWN_MS,
  COACH_ACTIONS,
  chipsForTurn,
  checkLevelChipFor,
  isCheckLevelActionId,
  isCoachActionId,
  nudgeStateFrom,
} from '../action-chips';
import { inferProgressQuestion } from '../intent';

const NOW = new Date('2026-10-18T09:00:00Z');

/** Active full_body; push / pull / legs assessed, core never. */
const fullBodyNoCore = {
  core: { name: 'יואב לוי', gender: 'male' },
  progression: {
    activePrograms: [{ templateId: 'full_body' }],
    tracks: { full_body: { currentLevel: 5 }, push: { currentLevel: 6 }, pull: { currentLevel: 4 }, legs: { currentLevel: 5 } },
  },
};

const coreGap: AssessmentGap = { slug: 'core', name: 'ליבה', partOf: 'כל הגוף', why: 'x' };

describe('deriveAssessmentGaps', () => {
  it('an unassessed child of the active parent (full_body → core) is a gap, with the parent named', () => {
    const gaps = deriveAssessmentGaps({ profile: fullBodyNoCore });
    expect(gaps).toHaveLength(1);
    expect(gaps[0]).toMatchObject({ slug: 'core', name: 'ליבה', partOf: 'כל הגוף' });
    expect(gaps[0].why).toContain('ליבה');
  });

  it('a level in progression.domains counts as assessed (same rule as the progress tab)', () => {
    const profile = { ...fullBodyNoCore, progression: { ...fullBodyNoCore.progression, domains: { core: { currentLevel: 3 } } } };
    expect(deriveAssessmentGaps({ profile })).toEqual([]);
  });

  it('raw Firestore ids resolve through the program index (ids and slugs are mixed in real data)', () => {
    const profile = {
      progression: {
        activePrograms: [{ templateId: 'FBdocid123456789xyz' }],
        tracks: { PUSHdocid1234567890: { currentLevel: 6 }, pull: { currentLevel: 4 } },
      },
    };
    const ids: Record<string, string> = { FBdocid123456789xyz: 'full_body', PUSHdocid1234567890: 'push' };
    const gaps = deriveAssessmentGaps({ profile, resolveSlug: (id) => ids[id] ?? id });
    expect(gaps.map((g) => g.slug)).toEqual(['legs', 'core']);
    expect(gaps[0].partOf).toBe('כל הגוף');
  });

  it("a parent's loaded subPrograms win over the static list", () => {
    const profile = { progression: { activePrograms: [{ templateId: 'upper_body' }], tracks: { push: { currentLevel: 3 } } } };
    expect(deriveAssessmentGaps({ profile }).map((g) => g.slug)).toEqual(['pull']);
    expect(deriveAssessmentGaps({ profile, subProgramsBySlug: { upper_body: ['push', 'pull', 'core'] } }).map((g) => g.slug)).toEqual(['pull', 'core']);
  });

  it('an active skill never assessed is a gap of its own (no parent)', () => {
    const profile = { progression: { activePrograms: [{ templateId: 'planche' }], tracks: {} } };
    const gaps = deriveAssessmentGaps({ profile });
    expect(gaps).toEqual([expect.objectContaining({ slug: 'planche', partOf: null })]);
  });

  it('no active program, a fully assessed user, or a program the mini check cannot run → no gaps', () => {
    expect(deriveAssessmentGaps({ profile: {} })).toEqual([]);
    expect(deriveAssessmentGaps({ profile: { progression: { activePrograms: [], tracks: { push: { currentLevel: 2 } } } } })).toEqual([]);
    const all = { progression: { activePrograms: [{ templateId: 'full_body' }], tracks: { push: { currentLevel: 1 }, pull: { currentLevel: 1 }, legs: { currentLevel: 1 }, core: { currentLevel: 1 } } } };
    expect(deriveAssessmentGaps({ profile: all })).toEqual([]);
    expect(deriveAssessmentGaps({ profile: { progression: { activePrograms: [{ templateId: 'running' }] } } })).toEqual([]);
  });

  it('is capped', () => {
    const profile = { progression: { activePrograms: [{ templateId: 'full_body' }, { templateId: 'planche' }, { templateId: 'front_lever' }], tracks: {} } };
    expect(deriveAssessmentGaps({ profile }).length).toBe(MAX_ASSESSMENT_GAPS);
  });
});

describe('gapForWorkout', () => {
  const legsGap: AssessmentGap = { slug: 'legs', name: 'רגליים', partOf: null, why: 'x' };
  it('a gap in the workout domains; any base-area gap for a full-body workout; none otherwise', () => {
    expect(gapForWorkout([coreGap], ['core'])?.slug).toBe('core');
    expect(gapForWorkout([legsGap, coreGap], ['core'])?.slug).toBe('core');
    expect(gapForWorkout([coreGap], [])?.slug).toBe('core');
    expect(gapForWorkout([coreGap], ['push'])).toBeNull();
    expect(gapForWorkout([], ['core'])).toBeNull();
  });
});

describe('the user sheet and get_progress carry the gaps', () => {
  it('buildUserContextSheet', () => {
    const sheet = buildUserContextSheet({ profile: fullBodyNoCore, workouts: [], weekSchedule: [], todayKey: '2026-10-18', areaName: null, now: NOW });
    expect(sheet.assessmentGaps?.map((g) => g.slug)).toEqual(['core']);
    // PII rule still holds: first name only.
    expect(JSON.stringify(sheet)).not.toContain('לוי');
  });

  it('summarizeProgress', () => {
    expect(summarizeProgress('week', [], fullBodyNoCore, NOW).assessmentGaps.map((g) => g.slug)).toEqual(['core']);
  });
});

describe('session context: the level check note', () => {
  it('allowed: names the gap and the button, once per conversation', () => {
    const note = assessmentGapNote({ assessmentGaps: [coreGap] }, true)!;
    expect(note).toContain('ליבה (part of כל הגוף)');
    expect(note).toContain('once');
    expect(note).toContain('בכפתור למטה');
  });

  it('nudged recently: tells Kelly not to bring it up', () => {
    expect(assessmentGapNote({ assessmentGaps: [coreGap] }, false)).toContain('Do not bring it up again');
  });

  it('no gaps: no note; the note lands in the session block', () => {
    expect(assessmentGapNote({ assessmentGaps: [] }, true)).toBeNull();
    const sheet = buildUserContextSheet({ profile: fullBodyNoCore, workouts: [], weekSchedule: [], todayKey: '2026-10-18', areaName: null, now: NOW });
    const ctx = buildSessionContext({ firstName: 'יואב', gender: 'male', todayKey: '2026-10-18', israelDayOfWeek: 0, israelHour: 9, sheet });
    expect(ctx).toContain('- Level check: the user never checked a level for ליבה');
    const quiet = buildSessionContext({ firstName: 'יואב', gender: 'male', todayKey: '2026-10-18', israelDayOfWeek: 0, israelHour: 9, sheet, assessmentNudgeAllowed: false });
    expect(quiet).toContain('already suggested recently');
  });
});

describe('the "בדוק רמה" chip', () => {
  const sheet = { today: [], assessmentGaps: [coreGap] };

  it('ids, label and target', () => {
    expect(isCoachActionId('check_level_core')).toBe(true);
    expect(isCoachActionId('check_level_javascript')).toBe(false);
    expect(isCheckLevelActionId('check_level_core')).toBe(true);
    expect(COACH_ACTIONS.check_level_core.label).toBe('בדוק רמה בליבה');
    expect(COACH_ACTIONS.check_level_core.assess).toEqual({ slug: 'core', domainType: 'category', route: '/onboarding-new/assessment-visual', returnTo: '/ai-coach' });
    expect(COACH_ACTIONS.check_level_planche.assess?.domainType).toBe('skill');
  });

  it('a workout in the unassessed area carries it; a workout elsewhere does not', () => {
    expect(chipsForTurn({ userText: 'אימון בטן', toolNames: ['generate_workout'], sheet, workoutDomains: ['core'] })).toEqual(['check_level_core']);
    expect(chipsForTurn({ userText: 'אימון חזה', toolNames: ['generate_workout'], sheet, workoutDomains: ['push'] })).toEqual([]);
  });

  it('a progress question carries it (by words or by get_progress)', () => {
    expect(inferProgressQuestion('איך אני מתקדם?')).toBe(true);
    expect(inferProgressQuestion('תבנה לי אימון')).toBe(false);
    expect(chipsForTurn({ userText: 'איך אני מתקדם?', toolNames: [], sheet })).toEqual(['check_level_core']);
    expect(chipsForTurn({ userText: 'מה המצב?', toolNames: ['get_progress'], sheet })).toEqual(['check_level_core']);
  });

  it('the opening of a new conversation carries it; a random mid-conversation turn does not', () => {
    expect(chipsForTurn({ userText: 'היי', toolNames: [], sheet, opening: true })).toEqual(['check_level_core']);
    expect(chipsForTurn({ userText: 'היי', toolNames: [], sheet, opening: false })).toEqual([]);
  });

  it('never twice: not while a recent reply carried one, unless the engine refused the workout for lack of a level', () => {
    expect(chipsForTurn({ userText: 'איך אני מתקדם?', toolNames: [], sheet, nudgeAllowed: false })).toEqual([]);
    expect(
      checkLevelChipFor({ userText: 'אימון בטן', toolNames: ['generate_workout'], sheet, nudgeAllowed: false, needsAssessmentDomains: ['core'] }),
    ).toBe('check_level_core');
  });

  it('schedule answers keep their chips and come first', () => {
    expect(chipsForTurn({ userText: 'מה מצפה לי השבוע?', toolNames: [], sheet, opening: true })).toEqual(['open_schedule', 'check_level_core']);
    expect(chipsForTurn({ userText: 'מה מצפה לי השבוע?', toolNames: [], sheet: { today: [] } })).toEqual(['open_schedule']);
  });

  it('nudgeStateFrom: a chip in the last 3 days blocks; an old one or none does not; opening after 6 quiet hours', () => {
    const now = NOW.getTime();
    const recent = (agoMs: number, actions: string[]) => [{ role: 'assistant' as const, createdAtMs: now - agoMs, actions }];
    expect(nudgeStateFrom(recent(3_600_000, ['check_level_core']), now)).toEqual({ nudgeAllowed: false, opening: false });
    expect(nudgeStateFrom(recent(CHECK_LEVEL_NUDGE_COOLDOWN_MS + 1, ['check_level_core']), now)).toEqual({ nudgeAllowed: true, opening: true });
    expect(nudgeStateFrom(recent(60_000, ['open_schedule']), now)).toEqual({ nudgeAllowed: true, opening: false });
    expect(nudgeStateFrom([], now)).toEqual({ nudgeAllowed: true, opening: true });
  });
});
