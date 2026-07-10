/**
 * MOCK of @/features/content/programs/core/program.service — overrides getAllPrograms
 * (which getCachedPrograms wraps) to replay the frozen corpus. See README.md.
 */
export * from '../../../src/features/content/programs/core/program.service';
import { CORPUS } from '../fixtures';
import type { Program } from '../../../src/features/content/programs/core/program.types';

export async function getAllPrograms(): Promise<Program[]> {
  return CORPUS.programs as Program[];
}
