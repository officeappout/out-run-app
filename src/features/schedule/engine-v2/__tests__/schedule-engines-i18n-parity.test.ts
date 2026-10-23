/**
 * i18n wave 2B (namespace `schedule`, keys `engine.*`): text-builder parity for reasonsV2.ts, diff.ts and
 * scheduleRules.ts. Snapshots were recorded from UNMODIFIED origin/main BEFORE the extraction; the extraction
 * commit must pass them unchanged. Covers every V2 reason code with its params, becauseHe branches, the
 * diff labels (kept / moved / new / removed), the rule-engine warnings over 600 seeded weeks and full buildWeek runs.
 */
import { describe, expect, it } from 'vitest';
import { buildWeek } from '../buildWeek';
import { becauseHe, diffWeek } from '../diff';
import { renderV2ReasonHe, renderV2ReasonsHe, dayNameHe, type V2Reason } from '../reasonsV2';
import { resolveDays } from '../availability';
import { validateInitial, validateMultiSession, validateSchedule } from '../../engine/scheduleRules';
import type { ScheduleDay, SessionItem } from '../../types/smartSchedule.types';
import type { PlacedSession, ScheduleEngineInput, SchedulePriority } from '../types';

const snap = (name: string) => `./__snapshots__/schedule-engines-i18n/${name}.txt`;
const SLOTS = ['quality_primary', 'quality_secondary', 'long_run', 'easy_run', 'recovery'] as const;

describe('reasonsV2', () => {
  it('every V2 code x params', async () => {
    const reasons: V2Reason[] = [];
    for (let day = -1; day <= 7; day++) {
      reasons.push({ code: 'LONG_RUN_PREFERRED_DAY', day }, { code: 'LONG_RUN_LAST_FREE_DAY', day });
      reasons.push({ code: 'DOUBLE_ON_QUALITY_DAY', day }, { code: 'EASY_DOUBLE_STRENGTH_FIRST', day });
      reasons.push({ code: 'QUALITY_RUN_FIRST', day }, { code: 'EASY_DAY_DOUBLED', day });
    }
    for (const run of ['quality', 'long'] as const) reasons.push({ code: 'UPPER_ONLY_BEFORE_KEY_RUN', run }, { code: 'FULL_BODY_NO_LEGS', run });
    for (const code of [
      'STRENGTH_OWN_DAY', 'COMBINED_SESSION', 'OAPU_RECOVERY_SESSION', 'HANDSTAND_FREE_SLOT', 'MOBILITY_AFTER_RUN', 'WALK_REST_DAY',
      'NOT_AVAILABLE', 'TRAVEL_DAY_OPTIONAL', 'MOVED_FOR_MAKEUP', 'OPTIONAL_MIDWEEK_MICRO_SESSION', 'STRENGTH_REDUCED_LONG_RUN_PROTECTED',
      'STRENGTH_MERGED', 'Q2_TO_EASY', 'TRAVEL_WEEK', 'RUN_WEEK_REPEATED', 'RE_ENTRY', 'LONG_RUN_NEXT_CAP', 'SEARCH_TRUNCATED',
    ] as const) reasons.push({ code } as V2Reason);
    for (const slot of SLOTS) {
      for (const time of [undefined, '19:00', '06:30']) reasons.push({ code: 'GROUP_RUN_FILLS_SLOT', slot, time });
      reasons.push({ code: 'RUN_OWN_DAY', slot });
    }
    for (const days of [0, 1, 2, 3, 7]) for (const floor of [1, 2, 3]) reasons.push({ code: 'STRENGTH_FLOOR_UNMET_AVAILABILITY', days, floor });
    for (const skills of [1, 2, 5]) for (const required of [2, 4]) for (const available of [1, 3]) reasons.push({ code: 'DAYS_BELOW_SKILL_MIN', skills, required, available });
    for (const days of [0, 1, 5, 6, 7, 1000]) reasons.push({ code: 'LONG_TRAINING_STREAK', days });
    for (const strength of [true, false]) for (const running of [true, false]) reasons.push({ code: 'DELOAD_WEEK', strength, running });
    for (const goal of [0, 1, 999, 1000, 8000, 10000, 12345, 1234567]) reasons.push({ code: 'STEPS_DAILY', goal });
    for (const kind of ['strength', 'run'] as const)
      for (const why of ['too_old', 'no_room', 'easy_run', 'week_limit'] as const) reasons.push({ code: 'MAKEUP_DROPPED', kind, why });
    const lines = reasons.map((r) => `${JSON.stringify(r)} => ${renderV2ReasonHe(r)}`);
    lines.push(`LIST => ${JSON.stringify(renderV2ReasonsHe([...reasons.slice(0, 8), ...reasons.slice(0, 4)]))}`);
    lines.push(`DAYS => ${[-8, -7, -1, 0, 1, 2, 3, 4, 5, 6, 7, 8, 13, 14].map(dayNameHe).join(',')}`);
    await expect(lines.join('\n')).toMatchFileSnapshot(snap('reasons-v2'));
  });
});

const SUN_THU = { days: [0, 1, 2, 3, 4], windows: { '*': ['evening' as const] }, maxSessionsPerDay: 2 as const };
const SUN_FRI = { days: [0, 1, 2, 3, 4, 5], windows: { '*': ['evening' as const] }, maxSessionsPerDay: 2 as const };
const THREE = { days: [0, 2, 4], windows: { '*': ['evening' as const] }, maxSessionsPerDay: 2 as const };

describe('diff.ts', () => {
  it('becauseHe over constructed weeks', async () => {
    const run = (slot: PlacedSession['slot'], optional = false): PlacedSession => ({ kind: 'run', slot, optional });
    const st = (slug: string, optional = false): PlacedSession => ({ kind: 'strength', slug, optional });
    const empty = (): PlacedSession[][] => Array.from({ length: 7 }, () => []);
    const av = (open: boolean[]) => ({ open, marked: open, windows: open.map(() => ['evening' as const]), exception: open.map(() => null) });
    const allOpen = Array(7).fill(true);
    const lines: string[] = [];
    const slugs = ['push', 'pull', 'legs', 'full_body', 'upper_body', 'lower_body', 'calisthenics_upper', 'planche', 'unknown_thing'];
    for (const slug of slugs) {
      for (let day = 0; day < 7; day++) {
        const scenarios: Array<[string, PlacedSession[][], boolean[]]> = [];
        const closed = [...allOpen];
        closed[day] = false;
        scenarios.push(['closed', empty(), closed]);
        const longDay = empty();
        longDay[day] = [run('long_run')];
        scenarios.push(['long-run-day', longDay, allOpen]);
        const keyTomorrow = empty();
        keyTomorrow[(day + 1) % 7] = [run('quality_primary')];
        scenarios.push(['quality-tomorrow', keyTomorrow, allOpen]);
        const longTomorrow = empty();
        longTomorrow[(day + 1) % 7] = [run('long_run')];
        scenarios.push(['long-tomorrow', longTomorrow, allOpen]);
        const busyStrength = empty();
        busyStrength[day] = [st('pull')];
        scenarios.push(['busy-strength', busyStrength, allOpen]);
        const nearby = empty();
        nearby[(day + 1) % 7] = [st('legs')];
        scenarios.push(['strength-next-day', nearby, allOpen]);
        const nearby2 = empty();
        nearby2[(day + 6) % 7] = [st('push')];
        scenarios.push(['strength-prev-day', nearby2, allOpen]);
        scenarios.push(['empty', empty(), allOpen]);
        for (const [name, days, open] of scenarios) {
          lines.push(`strength:${slug} d${day} ${name} => ${becauseHe({ kind: 'strength', slug }, day, days, av(open))}`);
        }
      }
    }
    for (const slot of SLOTS) {
      for (let day = 0; day < 7; day++) {
        const sets: Array<[string, PlacedSession[][]]> = [];
        const busyRun = empty();
        busyRun[day] = [run('easy_run')];
        sets.push(['busy-run', busyRun]);
        const legs = empty();
        legs[day] = [st('legs')];
        sets.push(['heavy-legs', legs]);
        const push = empty();
        push[day] = [st('push')];
        sets.push(['push', push]);
        sets.push(['empty', empty()]);
        const closed = [...allOpen];
        closed[day] = false;
        for (const [name, days] of sets) {
          lines.push(`run:${slot} d${day} ${name} => ${becauseHe({ kind: 'run', slot }, day, days, av(allOpen))}`);
        }
        lines.push(`run:${slot} d${day} closed => ${becauseHe({ kind: 'run', slot }, day, empty(), av(closed))}`);
      }
    }
    await expect(lines.join('\n')).toMatchFileSnapshot(snap('because'));
  });

  it('diffWeek labels (kept / moved / new / removed)', async () => {
    const out: string[] = [];
    const av = resolveDays({ days: [0, 1, 2, 3, 4, 5], windows: { '*': ['evening'] }, maxSessionsPerDay: 2 }, 0);
    const days = (rows: Array<PlacedSession[]>) => Array.from({ length: 7 }, (_, i) => rows[i] ?? []);
    const next = days([
      [{ kind: 'strength', slug: 'push' }],
      [{ kind: 'run', slot: 'easy_run' }],
      [{ kind: 'strength', slug: 'pull' }],
      [{ kind: 'run', slot: 'quality_primary' }],
      [{ kind: 'strength', slug: 'legs' }],
      [{ kind: 'run', slot: 'long_run' }],
    ]);
    const existings = [
      null,
      { mode: 'add_track' as const, days: { 0: [{ kind: 'strength' as const, slug: 'push' }], 2: [{ kind: 'strength' as const, slug: 'pull' }] } },
      { mode: 'add_track' as const, days: { 4: [{ kind: 'strength' as const, slug: 'legs' }], 3: [{ kind: 'run' as const, slot: 'long_run' as const }] } },
      { mode: 'add_track' as const, days: { 1: [{ kind: 'strength' as const, slug: 'full_body' }], 5: [{ kind: 'run' as const, slot: 'recovery' as const }] } },
      { mode: 'add_track' as const, days: { 2: [{ kind: 'strength' as const, slug: 'push' }], 0: [{ kind: 'strength' as const, slug: 'unknown_thing' }] } },
    ];
    for (const ex of existings) {
      for (const frozen of [Array(7).fill(false), [true, true, false, false, false, false, false]]) {
        const entries = diffWeek(next, ex as never, av, frozen);
        out.push(`${JSON.stringify(ex)} frozen=${frozen.filter(Boolean).length} => ${JSON.stringify(entries.map((e) => [e.status, e.labelHe]))}`);
      }
    }
    await expect(out.join('\n')).toMatchFileSnapshot(snap('diff-week'));
  });
});

function planText(input: ScheduleEngineInput): string {
  try {
    const p = buildWeek(input);
    return JSON.stringify({
      days: p.days.map((d) => d.reasonsHe),
      warnings: p.warningsHe,
      diff: p.diff.map((d) => [d.status, d.labelHe]),
    });
  } catch (e) {
    return `ERROR ${(e as Error).message}`;
  }
}

describe('buildWeek end to end', () => {
  it('reasonsHe / warningsHe / diff labels', async () => {
    const lines: string[] = [];
    const priorities: SchedulePriority[] = ['strength_first', 'balanced', 'running_first'] as SchedulePriority[];
    const strengthSets = [
      [{ slug: 'push', sessionsPerWeek: 1, priority: 1 }, { slug: 'pull', sessionsPerWeek: 1, priority: 2 }, { slug: 'legs', sessionsPerWeek: 1, priority: 3 }],
      [{ slug: 'full_body', sessionsPerWeek: 2, priority: 1 }],
      [{ slug: 'full_body', sessionsPerWeek: 3, priority: 1 }, { slug: 'oapu', sessionsPerWeek: 2, priority: 2 }],
      [{ slug: 'upper_body', sessionsPerWeek: 2, priority: 1 }, { slug: 'handstand', sessionsPerWeek: 1, priority: 2 }],
    ];
    const runs = [
      null,
      { level: 'beginner', targetDistance: '10k', sessions: [{ slot: 'quality_primary' }, { slot: 'easy_run' }, { slot: 'long_run' }] },
      { level: 'intermediate', targetDistance: '10k', sessions: [{ slot: 'quality_primary' }, { slot: 'quality_secondary' }, { slot: 'long_run' }] },
    ];
    const avs = [SUN_THU, SUN_FRI, THREE];
    for (const priority of priorities) {
      for (const [si, strength] of strengthSets.entries()) {
        for (const [ri, running] of runs.entries()) {
          for (const [ai, availability] of avs.entries()) {
            for (const cycle of [undefined, 4, 5]) {
              const input = {
                availability,
                strength,
                running,
                priority,
                levels: { strength: 'intermediate', running: running ? running.level : null },
                strengthCycleWeek: cycle,
              } as unknown as ScheduleEngineInput;
              lines.push(`${priority} s${si} r${ri} a${ai} c${cycle ?? '-'} => ${planText(input)}`);
            }
          }
        }
      }
    }
    // add-track runs (diff labels)
    const existings = [
      { mode: 'add_track', days: { 0: [{ kind: 'strength', slug: 'push' }], 2: [{ kind: 'strength', slug: 'pull' }], 4: [{ kind: 'strength', slug: 'legs' }] } },
      { mode: 'add_track', days: { 1: [{ kind: 'strength', slug: 'full_body' }], 3: [{ kind: 'strength', slug: 'full_body' }] } },
    ];
    for (const [ei, existing] of existings.entries()) {
      for (const [ai, availability] of avs.entries()) {
        const input = {
          availability,
          strength: strengthSets[0],
          running: runs[2],
          priority: 'balanced',
          levels: { strength: 'intermediate', running: 'intermediate' },
          existing,
        } as unknown as ScheduleEngineInput;
        lines.push(`add-track e${ei} a${ai} => ${planText(input)}`);
      }
    }
    await expect(lines.join('\n')).toMatchFileSnapshot(snap('build-week'));
  });
});

describe('scheduleRules.ts', () => {
  it('validateInitial grid', async () => {
    const ids = ['PLANCHE', 'HSPU', 'FRONT_LEVER', 'OAPU', 'MUSCLE_UP', 'HANDSTAND'] as const;
    const lines: string[] = [];
    for (let n = 0; n <= 6; n++) {
      for (let days = 0; days <= 7; days++) lines.push(`${n} skills ${days} days => ${JSON.stringify(validateInitial(ids.slice(0, n) as never, days))}`);
    }
    await expect(lines.join('\n')).toMatchFileSnapshot(snap('validate-initial'));
  });

  const IDS = ['PLANCHE', 'HSPU', 'FRONT_LEVER', 'OAPU', 'MUSCLE_UP', 'HANDSTAND', 'FULL_BODY', 'UPPER_BODY', 'UPPER_CALISTHENICS'] as const;
  const item = (skillId: string): SessionItem => ({ skillId: skillId as never, volumePercent: 100, sessionType: 'FULL' });

  it('validateMultiSession over every pair/triple', async () => {
    const lines: string[] = [];
    for (let i = 0; i < IDS.length; i++) {
      for (let j = i; j < IDS.length; j++) {
        lines.push(`${IDS[i]}+${IDS[j]} => ${JSON.stringify(validateMultiSession([item(IDS[i]), item(IDS[j])]))}`);
        for (let k = j; k < IDS.length; k++) {
          lines.push(`${IDS[i]}+${IDS[j]}+${IDS[k]} => ${JSON.stringify(validateMultiSession([item(IDS[i]), item(IDS[j]), item(IDS[k])]))}`);
        }
      }
    }
    await expect(lines.join('\n')).toMatchFileSnapshot(snap('validate-multi'));
  });

  it('validateSchedule over 800 seeded weeks + every code reached', async () => {
    let seed = 12345;
    const rnd = () => ((seed = (Math.imul(seed, 1103515245) + 12345) >>> 0) / 2 ** 32);
    const lines: string[] = [];
    const seen = new Set<string>();
    for (let w = 0; w < 800; w++) {
      const days: ScheduleDay[] = Array.from({ length: 7 }, (_, i) => {
        const sessions: SessionItem[] = [];
        const n = rnd() < 0.35 ? 0 : rnd() < 0.8 ? 1 : 2;
        for (let k = 0; k < n; k++) sessions.push(item(IDS[Math.floor(rnd() * IDS.length)]));
        return { dayOfWeek: i as never, sessions, isRestDay: sessions.length === 0, warnings: [] };
      });
      const res = validateSchedule(days);
      res.forEach((r) => seen.add(r.code));
      lines.push(`w${w} ${days.map((d) => d.sessions.map((s) => s.skillId).join('+') || '-').join(' | ')} => ${JSON.stringify(res)}`);
    }
    lines.push(`CODES ${Array.from(seen).sort().join(',')}`);
    lines.push(`NOT7 => ${JSON.stringify(validateSchedule([]))}`);
    await expect(lines.join('\n')).toMatchFileSnapshot(snap('validate-schedule'));
  });
});
