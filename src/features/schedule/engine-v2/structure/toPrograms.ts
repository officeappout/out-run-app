import type { StrengthProgramInput } from '../types';
import type { StrengthDayKind, StructurePlan } from './types';

/** Host program slug per day kind (PROGRAM_PROFILES keys). A skill never adds its own program: it lives inside the host. */
export const HOST_SLUG: Record<StrengthDayKind, string> = {
  full_body: 'full_body', upper: 'upper_body', lower: 'legs', push: 'push', pull: 'pull', legs: 'legs',
};

/** Bridge to engine v2's buildWeek input: sessions per week by host slug. Movement days are not programs. */
export function toStrengthPrograms(plan: StructurePlan): StrengthProgramInput[] {
  const counts = new Map<string, number>();
  for (const d of plan.sequence) if (d.type === 'strength') counts.set(HOST_SLUG[d.kind], (counts.get(HOST_SLUG[d.kind]) ?? 0) + 1);
  return [...counts].map(([slug, sessionsPerWeek], i) => ({ slug, sessionsPerWeek, priority: i + 1 }));
}
