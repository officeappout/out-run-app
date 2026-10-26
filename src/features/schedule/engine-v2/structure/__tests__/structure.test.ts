import { describe, expect, it } from 'vitest';
import { MOVEMENT_COUNTS_TOWARD_SET_TARGETS, planStructure, toStrengthPrograms, weekBandOf, weekLevelOf, isSkillUnlocked } from '..';
import type { GroupLevels, StrengthDay, StructureInput } from '..';

const L = (n: number): GroupLevels => ({ push: n, pull: n, legs: n });
const BANDS = { beginner: 3, intermediate: 9, advanced: 18 } as const;
const strengthOf = (p: ReturnType<typeof planStructure>) => p.sequence.filter((d): d is StrengthDay => d.type === 'strength');
const kinds = (p: ReturnType<typeof planStructure>) => strengthOf(p).map((d) => d.kind);

describe('week level', () => {
  it('is the average of push/pull/legs and cuts at 5 / 13', () => {
    expect(weekLevelOf({ push: 4, pull: 6, legs: 8 })).toBe(6);
    expect(weekBandOf(L(5))).toBe('beginner');
    expect(weekBandOf(L(6))).toBe('intermediate');
    expect(weekBandOf(L(13))).toBe('intermediate');
    expect(weekBandOf(L(14))).toBe('advanced');
    expect(weekBandOf({ push: 20, pull: 16, legs: 2 })).toBe('intermediate'); // avg 12.67 floors to 12
  });
  it('a lopsided profile is judged by the average, not the max', () => {
    expect(weekBandOf({ push: 20, pull: 2, legs: 2 })).toBe('intermediate'); // 8
  });
});

describe('table: every day count x every band', () => {
  for (const [band, lvl] of Object.entries(BANDS)) {
    for (let d = 1; d <= 7; d++) {
      it(`${band} / ${d} days`, () => {
        const p = planStructure({ days: d, levels: L(lvl) });
        expect(p.band).toBe(band);
        expect(p.sequence.length).toBe(d);
        expect(p.strengthDays + p.movementDays).toBe(d);
        if (band === 'beginner') {
          expect(p.strengthDays).toBe(Math.min(d, 3));
          expect(kinds(p).every((k) => k === 'full_body')).toBe(true);
        } else if (d <= 3) expect(kinds(p)).toEqual(Array(d).fill('full_body'));
        else if (d === 4) expect(kinds(p)).toEqual(['upper', 'lower', 'upper', 'lower']);
        else if (d === 5) expect(kinds(p).sort()).toEqual(['full_body', 'lower', 'lower', 'upper', 'upper']);
        else expect(kinds(p).sort()).toEqual(['legs', 'legs', 'pull', 'pull', 'push', 'push']);
        if (d === 7) expect(p.movementDays).toBeGreaterThanOrEqual(1);
      });
    }
  }
  it('full-body days rotate the emphasis', () => {
    expect(strengthOf(planStructure({ days: 3, levels: L(9) })).map((d) => d.emphasis)).toEqual(['push', 'pull', 'legs']);
  });
  it('4+ days (non-beginner): each muscle group is hit at least twice', () => {
    for (let d = 4; d <= 7; d++) {
      const k = kinds(planStructure({ days: d, levels: L(9) }));
      const upper = k.filter((x) => x === 'upper' || x === 'push' || x === 'pull' || x === 'full_body').length;
      const lower = k.filter((x) => x === 'lower' || x === 'legs' || x === 'full_body').length;
      expect(upper).toBeGreaterThanOrEqual(2);
      expect(lower).toBeGreaterThanOrEqual(2);
    }
  });
  it('the 7th day is movement; non-beginners get exactly one', () => {
    const p = planStructure({ days: 7, levels: L(18) });
    expect(p.movementDays).toBe(1);
    expect(p.notes.some((n) => n.code === 'seventh_day_movement')).toBe(true);
  });
  it('clamps day counts', () => {
    expect(planStructure({ days: 12, levels: L(9) }).days).toBe(7);
    expect(planStructure({ days: 0, levels: L(9) }).days).toBe(1);
  });
});

describe('beginner with more than 3 days', () => {
  it('3 strength days + movement days kept in the schedule', () => {
    const p = planStructure({ days: 5, levels: L(2) });
    expect(p.strengthDays).toBe(3);
    expect(p.movementDays).toBe(2);
    expect(p.notes.map((n) => n.code)).toContain('beginner_extra_days_are_movement');
    expect(p.sequence.map((d) => d.type[0]).join('')).not.toContain('sss');
  });
  it('3 days or fewer: no movement filler', () => {
    expect(planStructure({ days: 3, levels: L(2) }).movementDays).toBe(0);
  });
});

describe('skills', () => {
  it('unlock thresholds', () => {
    expect(isSkillUnlocked('front_lever', { push: 1, pull: 13, legs: 1 })).toBe(false);
    expect(isSkillUnlocked('front_lever', { push: 1, pull: 14, legs: 1 })).toBe(true);
    expect(isSkillUnlocked('planche', { push: 15, pull: 1, legs: 1 })).toBe(false);
    expect(isSkillUnlocked('planche', { push: 16, pull: 1, legs: 1 })).toBe(true);
  });
  it('pending-owner skills never unlock and are reported with a clear code', () => {
    const hi = { push: 25, pull: 25, legs: 25 };
    for (const id of ['one_arm_pullup', 'handstand', 'hspu', 'muscle_up'] as const) expect(isSkillUnlocked(id, hi, true)).toBe(false);
    const p = planStructure({ days: 4, levels: hi, skills: [{ id: 'handstand' }, { id: 'muscle_up' }] });
    expect(p.lockedSkills).toEqual(['handstand', 'muscle_up']);
    expect(p.notes.filter((n) => n.code === 'skill_pending_owner')).toHaveLength(2);
    expect(strengthOf(p).some((d) => d.skill)).toBe(false);
  });
  it('movement days do not count toward set targets', () => {
    expect(MOVEMENT_COUNTS_TOWARD_SET_TARGETS).toBe(false);
  });
  it('a locked skill is reported, never scheduled', () => {
    const p = planStructure({ days: 4, levels: { push: 15, pull: 13, legs: 10 }, skills: [{ id: 'front_lever' }, { id: 'planche' }] });
    expect(p.lockedSkills).toEqual(['front_lever', 'planche']);
    expect(strengthOf(p).some((d) => d.skill)).toBe(false);
    expect(p.notes.filter((n) => n.code === 'skill_locked')).toHaveLength(2);
  });
  it('a skill is a focus inside a day and never its own day', () => {
    for (let d = 1; d <= 7; d++) {
      const p = planStructure({ days: d, levels: L(18), skills: [{ id: 'front_lever' }, { id: 'planche' }] });
      expect(p.sequence.length).toBe(d);
      for (const day of strengthOf(p)) {
        if (day.skill) expect(['full_body', 'upper', 'push', 'pull']).toContain(day.kind);
        if (day.kind === 'lower' || day.kind === 'legs') expect(day.skill).toBeUndefined();
      }
      expect(strengthOf(p).some((x) => x.skill)).toBe(true);
    }
  });
  it('planche on a push day, front lever on a pull day (6 days)', () => {
    const p = planStructure({ days: 6, levels: L(18), skills: [{ id: 'planche' }, { id: 'front_lever' }] });
    for (const d of strengthOf(p)) {
      if (d.kind === 'push') expect(d.skill?.lead).toBe('planche');
      if (d.kind === 'pull') expect(d.skill?.lead).toBe('front_lever');
      if (d.kind === 'legs') expect(d.skill).toBeUndefined();
    }
  });
  it('the lead gets most of the session', () => {
    const d = strengthOf(planStructure({ days: 4, levels: L(18), skills: [{ id: 'planche' }] })).find((x) => x.skill)!;
    expect(d.skill!.leadShare).toBeGreaterThan(0.5);
  });
  it('3 days, 40 min, two skills: one lead per session of ~12-15 min, leads alternate, soft hint', () => {
    const p = planStructure({ days: 3, levels: L(18), skills: [{ id: 'planche' }, { id: 'front_lever' }], sessionMinutes: 40 });
    const leads = strengthOf(p).map((d) => d.skill!.lead);
    expect(new Set(leads).size).toBe(2);
    expect(leads[0]).not.toBe(leads[1]);
    for (const d of strengthOf(p)) {
      expect(d.skill!.leadMinutes).toBeGreaterThanOrEqual(12);
      expect(d.skill!.leadMinutes).toBeLessThanOrEqual(15);
    }
    expect(p.notes.map((n) => n.code)).toContain('skill_hint_add_day_or_pick_focus');
  });
  it('edge case: an unlocked chosen skill leads although the average gives a lower band', () => {
    const p = planStructure({ days: 4, levels: { push: 1, pull: 14, legs: 1 }, skills: [{ id: 'front_lever' }] });
    expect(p.band).toBe('beginner');
    expect(p.notes.map((n) => n.code)).toContain('skill_leads_despite_week_band');
    expect(strengthOf(p).some((d) => d.skill?.lead === 'front_lever')).toBe(true);
  });
  it('no soft hint above 3 days', () => {
    const p = planStructure({ days: 4, levels: L(18), skills: [{ id: 'planche' }] });
    expect(p.notes.map((n) => n.code)).not.toContain('skill_hint_add_day_or_pick_focus');
  });
});

describe('advanced without skills: varied styles', () => {
  const base: StructureInput = { days: 4, levels: L(18) };
  it('normal time: strength sessions with alternating EMOM / AMRAP finishers', () => {
    const s = strengthOf(planStructure(base));
    expect(s.every((d) => d.style!.primary === 'strength')).toBe(true);
    expect(s.map((d) => d.style!.finisher)).toEqual(['emom', 'amrap', 'emom', 'amrap']);
  });
  it('little time + high intensity: EMOM / AMRAP / circuits come first', () => {
    const s = strengthOf(planStructure({ ...base, sessionMinutes: 25, intensity: 'high' }));
    expect(s.map((d) => d.style!.primary)).toEqual(['emom', 'amrap', 'circuit', 'emom']);
  });
  it('high intensity alone (plenty of time) does not displace strength', () => {
    expect(strengthOf(planStructure({ ...base, sessionMinutes: 60, intensity: 'high' }))[0].style!.primary).toBe('strength');
  });
  it('no style layer for intermediate, or for a skills user', () => {
    expect(strengthOf(planStructure({ days: 4, levels: L(9) })).some((d) => d.style)).toBe(false);
    expect(strengthOf(planStructure({ days: 4, levels: L(18), skills: [{ id: 'planche' }] })).some((d) => d.style)).toBe(false);
  });
});

describe('bridge to engine programs', () => {
  it('counts host programs; movement days are not programs', () => {
    expect(toStrengthPrograms(planStructure({ days: 5, levels: L(9) }))).toEqual([
      { slug: 'upper_body', sessionsPerWeek: 2, priority: 1 },
      { slug: 'legs', sessionsPerWeek: 2, priority: 2 },
      { slug: 'full_body', sessionsPerWeek: 1, priority: 3 },
    ]);
    expect(toStrengthPrograms(planStructure({ days: 6, levels: L(2) }))).toEqual([{ slug: 'full_body', sessionsPerWeek: 3, priority: 1 }]);
  });
});
