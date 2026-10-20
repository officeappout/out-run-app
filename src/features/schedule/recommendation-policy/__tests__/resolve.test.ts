import { describe, expect, it } from 'vitest';
import { MIN_DAYS_FOR_HARD_SKILLS } from '../../engine/scheduleRules';
import { MAX_RUNNING_FREQUENCY, MIN_RUNNING_FREQUENCY } from '@/lib/running-frequency-bounds';
import { SPLIT_MATRIX } from '@/features/workout-engine/services/split-decision/split-decision.types';
import { RECOMMENDATION_POLICY } from '../policy.config';
import { resolveRecommendation } from '../resolve';
import { buildPolicySignals, collectGoalIds, strengthLevelOf, addOnsLineHe } from '../fromProfile';
import { ageFromDob, normalizeGoals, resolveAudience, runBandOf } from '../signals';
import type { PolicySignals, RecommendationPolicy } from '../types';

const sig = (p: Partial<PolicySignals> = {}): PolicySignals => ({
  tracks: 'strength',
  strengthLevel: 3,
  runBand: null,
  goals: [],
  audience: 'general',
  hardSkillCount: 0,
  availableDays: null,
  ...p,
});

describe('policy config stays in sync with the code it mirrors', () => {
  it('skill minimum = MIN_DAYS_FOR_HARD_SKILLS, run bounds = running-frequency-bounds', () => {
    for (const [k, v] of Object.entries(MIN_DAYS_FOR_HARD_SKILLS)) expect(RECOMMENDATION_POLICY.strength.skillMinDays[k]).toBe(v);
    expect(RECOMMENDATION_POLICY.running.bounds).toEqual({ min: MIN_RUNNING_FREQUENCY, max: MAX_RUNNING_FREQUENCY });
  });

  it('is JSON-safe (can move to a Firestore config doc unchanged)', () => {
    const copy = JSON.parse(JSON.stringify(RECOMMENDATION_POLICY)) as RecommendationPolicy;
    expect(copy).toEqual(RECOMMENDATION_POLICY);
    expect(resolveRecommendation(sig({ goals: ['fat_loss'] }), copy)).toEqual(resolveRecommendation(sig({ goals: ['fat_loss'] })));
  });

  it('every split the generator can produce has a Hebrew name', () => {
    for (const row of Object.values(SPLIT_MATRIX)) for (const t of Object.values(row)) expect(RECOMMENDATION_POLICY.splitNamesHe[t]).toBeTruthy();
  });

  it('the policy split table: a Hebrew name per cell; only the owner-approved cells differ from SPLIT_MATRIX', () => {
    const approved = new Set(['intermediate:3', 'advanced:3', 'intermediate:4', 'advanced:4', 'advanced:6']);
    const freqIndex = (n: number) => (n <= 2 ? 0 : n === 3 ? 1 : n <= 5 ? 2 : 3);
    for (const [band, row] of Object.entries(RECOMMENDATION_POLICY.strength.splits)) {
      for (let n = 1; n <= 6; n++) {
        const t = row[String(n)];
        expect(RECOMMENDATION_POLICY.splitNamesHe[t]).toBeTruthy();
        if (!approved.has(`${band}:${n}`)) expect(t).toBe(SPLIT_MATRIX[freqIndex(n)][band as 'beginner']);
      }
    }
    // The shared generator matrix itself is unchanged (flag-off users).
    expect(SPLIT_MATRIX[1]).toEqual({ beginner: 'full_body_ab', intermediate: 'upper_lower', advanced: 'push_pull_mixed' });
    expect(SPLIT_MATRIX[2]).toEqual({ beginner: 'habit_builder', intermediate: 'push_pull_rotation', advanced: 'skill_dominance' });
  });

  it('Saturday is off by default and the default pool is Sun–Fri', () => {
    expect(RECOMMENDATION_POLICY.saturdayDefaultOff).toBe(true);
    expect(RECOMMENDATION_POLICY.defaultAvailableDays).toBe(6);
  });
});

describe('strength by level', () => {
  it('beginner: full body ×3 — the most effective at this level', () => {
    const r = resolveRecommendation(sig({ strengthLevel: 3 }));
    expect(r.strength).toMatchObject({ frequency: 3, split: 'full_body_ab', band: 'beginner' });
    expect(r.reasonsHe[0]).toBe('מתחיל · כל הגוף 3 פעמים — הכי יעיל ברמה הזו');
    expect(r.running).toBeNull();
  });

  it('no level yet counts as beginner', () => {
    expect(resolveRecommendation(sig({ strengthLevel: null })).strength).toMatchObject({ frequency: 3, band: 'beginner' });
  });

  it('3 free days → full body ×3 at every level (owner 20.10.2026)', () => {
    for (const lvl of [3, 9, 16]) {
      const r = resolveRecommendation(sig({ strengthLevel: lvl, availableDays: 3 }));
      expect(r.strength?.frequency).toBe(3);
      expect(r.strength?.splitHe).toBe('כל הגוף');
    }
    expect(resolveRecommendation(sig({ strengthLevel: 9, availableDays: 3 })).strength?.split).toBe('full_body_ab');
  });

  it('intermediate with 4+ free days → upper / lower ×4, with or without a muscle goal', () => {
    for (const days of [4, 5, 6, null]) {
      const r = resolveRecommendation(sig({ strengthLevel: 9, availableDays: days }));
      expect(r.strength).toMatchObject({ frequency: 4, split: 'upper_lower', splitHe: 'עליון / תחתון', band: 'intermediate' });
      expect(r.firedRuleIds).toContain('upper_lower_intermediate');
      expect(r.reasonsHe[0]).toBe('ביניים · עליון / תחתון 4 פעמים בשבוע');
    }
    expect(resolveRecommendation(sig({ strengthLevel: 9, goals: ['muscle'], availableDays: 4 })).strength?.frequency).toBe(4);
  });

  it('advanced: 4 → upper / lower; skill users still see skill + support (skill logic untouched)', () => {
    expect(resolveRecommendation(sig({ strengthLevel: 16 })).strength).toMatchObject({ frequency: 4, split: 'upper_lower', band: 'advanced' });
    expect(resolveRecommendation(sig({ strengthLevel: 16, hardSkillCount: 2 })).strength?.splitHe).toBe('סקיל + תמיכה');
  });

  it('beginner with 5+ free days: 3 strength + light movement / walk days on the rest', () => {
    const r6 = resolveRecommendation(sig({ strengthLevel: 3 }));
    expect(r6.strength).toMatchObject({ frequency: 3, split: 'full_body_ab' });
    expect(r6.addOns).toContainEqual({ kind: 'movement', minutes: 20, perWeek: 3, fillsFreeDays: true, labelHe: 'הליכה / תנועה קלה 20′ ×3' });
    expect(r6.firedRuleIds).toContain('beginner_light_days');
    const r5 = resolveRecommendation(sig({ strengthLevel: 3, availableDays: 5 }));
    expect(r5.strength?.frequency).toBe(3);
    expect(r5.addOns.find((a) => a.kind === 'movement')?.perWeek).toBe(2);
    expect(addOnsLineHe(r5.addOns)).toBe('+ הליכה / תנועה קלה 20′ ×2');
    // 4 free days, seniors, skill users, both tracks → no light days
    expect(resolveRecommendation(sig({ strengthLevel: 3, availableDays: 4 })).addOns).toEqual([]);
    expect(resolveRecommendation(sig({ strengthLevel: 3, audience: 'senior' })).addOns.map((a) => a.kind)).toEqual(['mobility']);
    expect(resolveRecommendation(sig({ strengthLevel: 3, hardSkillCount: 4 })).firedRuleIds).not.toContain('beginner_light_days');
    expect(resolveRecommendation(sig({ tracks: 'both', runBand: 'beginner' })).firedRuleIds).not.toContain('beginner_light_days');
  });

  it('seniors and both-tracks users keep their numbers (the 4th day is strength-only, general audience)', () => {
    expect(resolveRecommendation(sig({ strengthLevel: 9, audience: 'senior' })).strength?.frequency).toBe(2);
    expect(resolveRecommendation(sig({ tracks: 'both', strengthLevel: 9, runBand: 'intermediate' })).strength?.frequency).toBe(2);
  });

  it('health / routine goal caps at 3', () => {
    const r = resolveRecommendation(sig({ strengthLevel: 9, goals: ['health'] }));
    expect(r.strength?.frequency).toBe(3);
    expect(r.firedRuleIds).toContain('health_cap');
  });
});

describe('goals', () => {
  it('fat loss: 10′ evening core on 2 days as an add-on', () => {
    const r = resolveRecommendation(sig({ goals: ['fat_loss'], availableDays: 4 }));
    expect(r.addOns).toEqual([{ kind: 'core', minutes: 10, perWeek: 2, window: 'evening', labelHe: 'ליבה 10′ ×2 בערב' }]);
    expect(r.reasonsHe).toContain('בטן וליבה · 2 אימוני ליבה קצרים של 10′ בערב');
    expect(r.strength?.frequency).toBe(3);
    expect(addOnsLineHe(r.addOns)).toBe('+ ליבה 10′ ×2 בערב');
  });

  it('belly (muscle focus "core") gets the same core add-on', () => {
    expect(resolveRecommendation(sig({ goals: ['core_abs'] })).addOns[0]?.kind).toBe('core');
  });

  it('skill goal: the hard-skill minimum and a skill reason', () => {
    const r = resolveRecommendation(sig({ strengthLevel: 4, goals: ['skills'], hardSkillCount: 3 }));
    expect(r.strength?.frequency).toBe(4);
    expect(r.firedRuleIds).toEqual(expect.arrayContaining(['skills_focus', 'skill_min_days']));
    expect(r.reasonsHe.some((x) => x.startsWith('סקילים · לפחות 4'))).toBe(true);
  });

  it('one skill never drops below 2', () => {
    expect(resolveRecommendation(sig({ hardSkillCount: 1, audience: 'senior' })).strength?.frequency).toBe(2);
  });
});

describe('audience', () => {
  it('seniors: strength 2 with mobility, runs 2', () => {
    const s = resolveRecommendation(sig({ audience: 'senior', strengthLevel: 9 }));
    expect(s.strength).toMatchObject({ frequency: 2, split: 'full_body_high' });
    expect(s.addOns.map((a) => a.kind)).toEqual(['mobility']);
    expect(s.reasonsHe).toContain('מותאם לגיל הזהב · יום מנוחה בין אימונים');
    const r = resolveRecommendation(sig({ tracks: 'running', audience: 'senior', runBand: 'intermediate' }));
    expect(r.running?.frequency).toBe(2);
  });

  it('extreme athlete: at least 4', () => {
    expect(resolveRecommendation(sig({ audience: 'athlete', strengthLevel: 2 })).strength?.frequency).toBe(4);
  });
});

describe('running', () => {
  it('beginner runner: 3 short runs', () => {
    const r = resolveRecommendation(sig({ tracks: 'running', runBand: 'beginner' }));
    expect(r.strength).toBeNull();
    expect(r.running).toEqual({ frequency: 3, band: 'beginner' });
    expect(r.reasonsHe[0]).toBe('ריצה למתחילים · 3 ריצות קצרות — בונים בסיס בהדרגה');
  });

  it('experienced runner: 4', () => {
    expect(resolveRecommendation(sig({ tracks: 'running', runBand: 'advanced' })).running?.frequency).toBe(4);
  });

  it('intermediate runner aiming at 10k with 5+ days: 4, else 3', () => {
    expect(resolveRecommendation(sig({ tracks: 'running', runBand: 'intermediate', targetDistance: '10k' })).running?.frequency).toBe(4);
    expect(resolveRecommendation(sig({ tracks: 'running', runBand: 'intermediate', targetDistance: '5k' })).running?.frequency).toBe(3);
  });
});

describe('both tracks', () => {
  it('beginner + beginner runner: strength 2 + runs 2', () => {
    const r = resolveRecommendation(sig({ tracks: 'both', runBand: 'beginner' }));
    expect(r.strength?.frequency).toBe(2);
    expect(r.running?.frequency).toBe(2);
    expect(r.firedRuleIds).toContain('both_tracks');
  });

  it('advanced + experienced runner: strength 3 + runs 4 on 6 days → strength gives way first', () => {
    const r = resolveRecommendation(sig({ tracks: 'both', strengthLevel: 16, runBand: 'advanced' }));
    expect(r.strength!.frequency + r.running!.frequency).toBeLessThanOrEqual(6);
    expect(r.running?.frequency).toBe(4);
    expect(r.strength?.frequency).toBe(2);
  });

  it('never below the strength floor of 2 (overflow becomes doubles)', () => {
    const r = resolveRecommendation(sig({ tracks: 'both', runBand: 'intermediate', availableDays: 3 }));
    expect(r.strength?.frequency).toBe(2);
    expect(r.running?.frequency).toBe(2);
  });
});

describe('available days 2–6', () => {
  it.each([
    [2, 2],
    [3, 3],
    [4, 3],
    [5, 3],
    [6, 3],
  ])('beginner with %i free days → %i', (days, expected) => {
    const r = resolveRecommendation(sig({ availableDays: days }));
    expect(r.strength?.frequency).toBe(expected);
    if (days < 3) expect(r.reasonsHe).toContain(`לפי ${days} הימים הפנויים שלך`);
  });

  it.each([
    [2, 2],
    [3, 3],
    [4, 4],
    [5, 4],
    [6, 6], // chose 6 → push / pull / legs ×2 (owner 20.10.2026)
  ])('advanced with %i free days → %i', (days, expected) => {
    expect(resolveRecommendation(sig({ strengthLevel: 18, availableDays: days })).strength?.frequency).toBe(expected);
  });

  it('a runner with 2 free days gets 2', () => {
    expect(resolveRecommendation(sig({ tracks: 'running', runBand: 'advanced', availableDays: 2 })).running?.frequency).toBe(2);
  });
});

describe('signals', () => {
  it('normalizes the app\'s real goal ids, ignores unknown ones', () => {
    expect(normalizeGoals(['routine', 'skills', 'weight_loss', 'glutes_abs', 'nope', 'body_focus'])).toEqual(['health', 'skills', 'fat_loss', 'core_abs', 'muscle']);
  });

  it('collects goals from store, program path, muscle focus and profile (sync default ignored)', () => {
    const ids = collectGoalIds({
      storeGoalIds: ['aesthetics'],
      programPathRaw: '["health","skills"]',
      muscleFocusRaw: '["core"]',
      mainGoal: 'healthy_lifestyle',
      profileGoalIds: ['fat_loss'],
    });
    expect(normalizeGoals(ids)).toEqual(['muscle', 'health', 'skills', 'core_abs', 'fat_loss']);
    expect(collectGoalIds({ programPathRaw: 'body_focus' })).toEqual(['body_focus']);
  });

  it('audience: vatikim / 60+ → senior, pro_athlete → athlete', () => {
    expect(resolveAudience(['parent', 'vatikim'])).toBe('senior');
    expect(resolveAudience([], 64)).toBe('senior');
    expect(resolveAudience(['pro_athlete'])).toBe('athlete');
    expect(resolveAudience(['student'], 25)).toBe('general');
  });

  it('run band from ability tier, goal path, pace and profile type', () => {
    expect(runBandOf({ abilityTier: 'none' })).toBe('beginner');
    expect(runBandOf({ goalPath: 'start_running' })).toBe('beginner');
    expect(runBandOf({ abilityTier: '15_30' })).toBe('intermediate');
    expect(runBandOf({ abilityTier: '45_plus', goalPath: 'maintain_fitness' })).toBe('intermediate');
    // 5k in 25:00 = 5:00/km → advanced; 5k in 35:00 = 7:00/km → intermediate
    expect(runBandOf({ goalPath: 'improve_time', targetDistance: '5k', paceInputSeconds: 1500 })).toBe('advanced');
    expect(runBandOf({ goalPath: 'improve_time', targetDistance: '5k', paceInputSeconds: 2100 })).toBe('intermediate');
    expect(runBandOf({ profileType: 1, abilityTier: 'none' })).toBe('advanced');
  });

  it('split level = average of push / pull / legs, rounded down (not the max)', () => {
    expect(strengthLevelOf({ tracks: { pull: { currentLevel: 14 }, push: { currentLevel: 8 }, legs: { currentLevel: 4 } } })).toBe(8);
    expect(strengthLevelOf({ domains: { push: { currentLevel: 7 }, pull: { currentLevel: 8 } } })).toBe(7);
    // track vs domain of the same category → the higher; others (core, skills, running) ignored
    expect(strengthLevelOf({ tracks: { running: { currentLevel: 20 }, push: { currentLevel: 7 } }, domains: { push: { currentLevel: 9 }, core: { currentLevel: 15 } } })).toBe(9);
  });

  it('no push / pull / legs level → the highest other strength level; running / flexibility ignored', () => {
    expect(strengthLevelOf({ tracks: { full_body: { currentLevel: 6 }, running: { currentLevel: 20 } }, domains: { core: { currentLevel: 9 } } })).toBe(9);
    expect(strengthLevelOf({ tracks: { running: { currentLevel: 4 } } })).toBeNull();
    expect(strengthLevelOf(null)).toBeNull();
  });

  it('age from YYYY-MM-DD', () => {
    expect(ageFromDob('1960-12-31', new Date(2026, 9, 20))).toBe(65);
    expect(ageFromDob('bad', new Date())).toBeNull();
  });

  it('buildPolicySignals: no run band for strength-only', () => {
    const s = buildPolicySignals({ tracks: 'strength', strengthLevel: 4, run: { abilityTier: 'none' }, goalIds: ['routine'], personaIds: [] });
    expect(s.runBand).toBeNull();
    expect(s.goals).toEqual(['health']);
  });
});

describe('skill users see the skill split name', () => {
  it('"סקיל + תמיכה" whenever hard skills are trained', () => {
    const r = resolveRecommendation(sig({ hardSkillCount: 2 }));
    expect(r.strength?.splitHe).toBe('סקיל + תמיכה');
    expect(r.reasonsHe[0]).toBe('מתחיל · סקיל + תמיכה 3 פעמים — הכי יעיל ברמה הזו');
  });
});

describe('6 chosen days → push / pull / legs ×2 (owner 20.10.2026)', () => {
  it('advanced who chose 6 days → 6 · push / pull / legs', () => {
    const r = resolveRecommendation(sig({ strengthLevel: 16, availableDays: 6 }));
    expect(r.strength).toMatchObject({ frequency: 6, split: 'push_pull_legs', splitHe: 'דחיפה / משיכה / רגליים' });
    expect(r.firedRuleIds).toContain('ppl_six_days_advanced');
  });

  it('intermediate with a muscle or performance goal who chose 6 days → 6 · push / pull / legs', () => {
    for (const goal of ['muscle', 'performance'] as const) {
      const r = resolveRecommendation(sig({ strengthLevel: 9, availableDays: 6, goals: [goal] }));
      expect(r.strength).toMatchObject({ frequency: 6, split: 'push_pull_legs' });
      expect(r.firedRuleIds).toContain('ppl_six_days_intermediate');
    }
  });

  it('everyone else stays as before', () => {
    // intermediate without a muscle / performance goal → upper / lower ×4
    expect(resolveRecommendation(sig({ strengthLevel: 9, availableDays: 6 })).strength).toMatchObject({ frequency: 4, split: 'upper_lower' });
    // beginner → 3 full body
    expect(resolveRecommendation(sig({ strengthLevel: 3, availableDays: 6, goals: ['muscle'] })).strength?.frequency).toBe(3);
    // advanced with 5 days → 4 upper / lower
    expect(resolveRecommendation(sig({ strengthLevel: 16, availableDays: 5 })).strength).toMatchObject({ frequency: 4, split: 'upper_lower' });
    // days not chosen yet (the default Sun–Fri pool) → no 6-day jump
    expect(resolveRecommendation(sig({ strengthLevel: 16, availableDays: null })).strength).toMatchObject({ frequency: 4, split: 'upper_lower' });
    // strength + running → the rule doesn't apply
    expect(resolveRecommendation(sig({ tracks: 'both', strengthLevel: 16, availableDays: 6, runBand: 'intermediate' })).firedRuleIds)
      .not.toContain('ppl_six_days_advanced');
    // senior / hard skills → unchanged
    expect(resolveRecommendation(sig({ strengthLevel: 16, availableDays: 6, audience: 'senior' })).strength?.frequency).toBeLessThanOrEqual(3);
    expect(resolveRecommendation(sig({ strengthLevel: 16, availableDays: 6, hardSkillCount: 1 })).firedRuleIds).not.toContain('ppl_six_days_advanced');
  });
});
