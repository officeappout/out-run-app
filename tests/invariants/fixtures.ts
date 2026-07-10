/**
 * fixtures.ts — loads the frozen corpus snapshot (tests/invariants/fixtures/*.json).
 * Read once, cached at module scope. See scripts/snapshot-workout-corpus.ts + README.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const DIR = join(process.cwd(), 'tests/invariants/fixtures');

function load<T>(name: string): T {
  return JSON.parse(readFileSync(join(DIR, `${name}.json`), 'utf8')) as T;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const CORPUS = {
  exercises: load<any[]>('exercises'),
  programs: load<any[]>('programs'),
  gymEquipment: load<any[]>('gym_equipment'),
  programLevelSettings: load<any[]>('program_level_settings'),
};
