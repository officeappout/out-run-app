/**
 * MOCK of @/features/content/programs/core/programLevelSettings.service — overrides
 * getProgramLevelSetting to look the doc up in the frozen corpus (id format
 * `${programId}_level_${level}`) instead of hitting Firestore per-domain. Returns
 * null when absent, exactly like the real fallback. See README.md.
 */
export * from '../../../src/features/content/programs/core/programLevelSettings.service';
import { CORPUS } from '../fixtures';
import type { ProgramLevelSettings } from '../../../src/features/content/programs/core/program.types';

export async function getProgramLevelSetting(
  programId: string,
  levelNumber: number,
): Promise<ProgramLevelSettings | null> {
  const id = `${programId}_level_${levelNumber}`;
  const hit = CORPUS.programLevelSettings.find(d => d.id === id);
  return (hit as ProgramLevelSettings) ?? null;
}
