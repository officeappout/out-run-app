import { describe, it, expect } from 'vitest';
import { coachToolDefinitions, validateToolInput } from '../tools';
import { stripFormatUnlessOn, workoutFormatFor } from '../workout-format-gate';
import { clientOutcomeToToolResult } from '../turn-engine';
import { buildSessionContext, WORKOUT_FORMAT_NOTE } from '../persona';
import { FLAG_DEFS } from '@/hooks/feature-flag-defs';
import { buildGenerateOptions, compactWorkout, effectiveFormat } from '@/features/ai-coach/services/workout-tool.pure';

const base = { durationMin: 15, location: 'home', difficulty: 3, domains: [] as string[], equipment: [] as string[] };
const gen = (o: Parameters<typeof buildGenerateOptions>[0]) => buildGenerateOptions(o, {} as never, {}, undefined);

describe('ai_coach_workout_format — flag + gate', () => {
  it('flag def: default off, owner + office (super admin) always on', () => {
    const d = FLAG_DEFS.find((x) => x.key === 'aiCoachWorkoutFormat')!;
    expect(d).toMatchObject({ firestoreKey: 'ai_coach_workout_format', defaultValue: false, superAdminValue: true });
  });
  it('super admin: on regardless of the live value; others follow the live value', () => {
    expect(workoutFormatFor({}, true)).toBe(true);
    expect(workoutFormatFor({ aiCoachWorkoutFormat: false }, true)).toBe(true);
    expect(workoutFormatFor({}, false)).toBe(false);
    expect(workoutFormatFor(null, undefined)).toBe(false);
    expect(workoutFormatFor({ aiCoachWorkoutFormat: true }, false)).toBe(true);
  });
});

describe('tool definition', () => {
  const props = (opts?: Parameters<typeof coachToolDefinitions>[0]) =>
    (coachToolDefinitions(opts).find((t) => t.name === 'generate_workout')!.input_schema as { properties: Record<string, unknown> }).properties;
  it('flag off: the exact list as before (no format property)', () => {
    expect(props()).not.toHaveProperty('format');
    expect(JSON.stringify(coachToolDefinitions({ format: false }))).toBe(JSON.stringify(coachToolDefinitions()));
  });
  it('flag on: format enum [emom, tabata] and a description that limits tabata to core', () => {
    expect(props({ format: true })).toHaveProperty('format.enum', ['emom', 'tabata']);
    const d = coachToolDefinitions({ format: true }).find((t) => t.name === 'generate_workout')!.description!;
    expect(d).toMatch(/ONLY for a core/);
  });
  it('zod accepts format and rejects unknown schemes', () => {
    expect(validateToolInput('generate_workout', { ...base, format: 'emom' }).ok).toBe(true);
    expect(validateToolInput('generate_workout', { ...base, format: 'amrap' }).ok).toBe(false);
  });
});

describe('engine options', () => {
  it('no format = as before (auto blast for D3 ≤ 20 min, nothing forced)', () => {
    const o = gen({ ...base } as never);
    expect(o.intentMode).toBe('blast');
    expect(o).not.toHaveProperty('forcedProtocol');
    expect(o).not.toHaveProperty('forcedCoreForm');
  });
  it('emom (any area): forced protocol, no blast', () => {
    const o = gen({ ...base, domains: ['push'], format: 'emom' } as never);
    expect(o.forcedProtocol).toBe('emom');
    expect(o.intentMode).toBeUndefined();
  });
  it('tabata with core only: forced core form, no blast', () => {
    const o = gen({ ...base, domains: ['core'], format: 'tabata' } as never);
    expect(o.forcedCoreForm).toBe('tabata');
    expect(o.intentMode).toBeUndefined();
  });
  it('tabata for anything but core-only is NOT passed (no full-body tabata exists)', () => {
    for (const domains of [[], ['push'], ['core', 'push']]) {
      const o = gen({ ...base, domains, format: 'tabata' } as never);
      expect(o).not.toHaveProperty('forcedCoreForm');
      expect(effectiveFormat({ format: 'tabata', domains: domains as never })).toBeNull();
    }
  });
});

describe('result + prompt', () => {
  const wk = (tabataBlock?: object) =>
    ({ title: 't', estimatedDuration: 12, structure: 'standard', exercises: [], ...(tabataBlock ? { tabataBlock } : {}) }) as never;
  const det = (format?: 'tabata') => ({ methodName: () => '', gearLabels: () => [], area: () => null, requestedMinutes: 15, domains: ['core'], difficulty: 3, ...(format ? { format } : {}) });
  it('a core tabata block reports structure tabata only while the flag-driven format is set', () => {
    expect(compactWorkout('id', 'home', wk({}), () => 'x', det('tabata')).structure).toBe('tabata');
    expect(compactWorkout('id', 'home', wk({}), () => 'x', det()).structure).toBe('standard');
    expect(compactWorkout('id', 'home', wk(), () => 'x', det('tabata')).structure).toBe('standard');
  });
  it('the session note is added only when on', () => {
    const i = { sheet: null, typoHints: [], scheduleAdvisor: false } as never;
    expect(buildSessionContext(i)).not.toContain(WORKOUT_FORMAT_NOTE);
    expect(buildSessionContext({ ...(i as object), workoutFormat: true } as never)).toContain(WORKOUT_FORMAT_NOTE);
  });
});

describe('flag off: a stray format never reaches the engine', () => {
  it('strips format when off, keeps it when on, never mutates', () => {
    const input = { ...base, format: 'emom' };
    expect(stripFormatUnlessOn(input, false)).not.toHaveProperty('format');
    expect(input).toHaveProperty('format', 'emom');
    expect(stripFormatUnlessOn(input, true)).toBe(input);
    const plain = { ...base };
    expect(stripFormatUnlessOn(plain, false)).toBe(plain);
  });
});

describe('honesty when the scheme was not built', () => {
  const outcome = (extra: object) => ({ ok: true as const, result: { workoutId: 'w', title: 't', minutes: 10, location: 'home', exercises: [], ...extra } });
  const notes = (extra: object) => JSON.parse(String(clientOutcomeToToolResult('id', outcome(extra) as never).content)).notesForCoach as string[] | undefined;
  it('requested but not built → a plain note; built or no format → none', () => {
    expect(notes({ formatRequested: 'tabata', formatBuilt: false })?.join(' ')).toMatch(/core Tabata.*could not build.*never call this workout Tabata/);
    expect(notes({ formatRequested: 'emom', formatBuilt: false })?.join(' ')).toMatch(/EMOM/);
    expect(notes({ formatRequested: 'emom', formatBuilt: true })).toBeUndefined();
    expect(notes({})).toBeUndefined();
  });
  it('compactWorkout flags built / not built', () => {
    const dd = { methodName: () => '', gearLabels: () => [], area: () => null, requestedMinutes: 10, domains: ['core'], difficulty: 3 };
    const w = (o: object) => ({ title: 't', estimatedDuration: 12, structure: 'standard', exercises: [], ...o }) as never;
    expect(compactWorkout('i', 'home', w({ tabataBlock: {} }), () => 'x', { ...dd, format: 'tabata' })).toMatchObject({ formatRequested: 'tabata', formatBuilt: true });
    expect(compactWorkout('i', 'home', w({}), () => 'x', { ...dd, format: 'tabata' })).toMatchObject({ formatBuilt: false });
    expect(compactWorkout('i', 'home', w({ structure: 'emom' }), () => 'x', { ...dd, format: 'emom' })).toMatchObject({ formatBuilt: true });
    expect(compactWorkout('i', 'home', w({}), () => 'x', { ...dd })).not.toHaveProperty('formatRequested');
  });
});
