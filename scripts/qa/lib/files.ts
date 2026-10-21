/** Loads and validates scripts/qa/personas/*.json + missions/*.json. Throws on any invalid file. */
import { readdirSync, readFileSync } from 'fs';
import { join, resolve } from 'path';
import { validateMission, validatePersona, type Mission, type Persona } from './missions';
import { missionUids } from './design/checkpoints';
import { DEFAULT_PRECONDITION, preconditionConflicts } from './seed/preconditions';

export const QA_DIR = resolve(process.cwd(), 'scripts/qa');

function readJsonDir(dir: string): Array<{ file: string; data: unknown }> {
  return readdirSync(dir)
    .filter((f) => f.endsWith('.json'))
    .sort()
    .map((f) => ({ file: f, data: JSON.parse(readFileSync(join(dir, f), 'utf8')) as unknown }));
}

export function loadPersonasAndMissions(dir = QA_DIR): { personas: Map<string, Persona>; missions: Mission[] } {
  const errors: string[] = [];
  const personas = new Map<string, Persona>();
  for (const { file, data } of readJsonDir(join(dir, 'personas'))) {
    const v = validatePersona(data);
    if (v.ok) personas.set(v.value.id, v.value);
    else errors.push(`personas/${file}: ${v.errors.join(', ')}`);
  }
  const missions: Mission[] = [];
  for (const { file, data } of readJsonDir(join(dir, 'missions'))) {
    const v = validateMission(data, new Set(personas.keys()));
    if (v.ok) missions.push(v.value);
    else errors.push(`missions/${file}: ${v.errors.join(', ')}`);
  }
  const ids = missions.map((m) => m.id);
  if (new Set(ids).size !== ids.length) errors.push('duplicate mission id');
  for (const c of preconditionConflicts(testerStates(missions))) errors.push(`precondition conflict — ${c}`);
  if (errors.length) throw new Error(`invalid QA files:\n${errors.join('\n')}`);
  return { personas, missions };
}

/** Every tester account with the state its missions start in (one row per mission × uid). */
export function testerStates(missions: readonly Mission[]): Array<{ mission: string; uid: string; precondition: NonNullable<Mission['precondition']> }> {
  return missions.flatMap((m) => missionUids(m).map((uid) => ({ mission: m.id, uid, precondition: m.precondition ?? DEFAULT_PRECONDITION })));
}
