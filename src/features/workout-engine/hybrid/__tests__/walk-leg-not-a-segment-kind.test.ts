import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Tripwire (Phase 2b). Round-trip walk legs are DISPLAY-ONLY (HybridJourneyAxis `walkLegs`,
 * the overview strip, the map overlay). HybridPlannedSegment.kind must stay 'aerobic' | 'strength':
 * the union feeds the run (hybrid-orchestrator, useHybridRun), history, weekly-load and the summary
 * through binary `kind === 'aerobic' ? … : …` ternaries, so a 'walk' member would silently be RUN
 * and credited as strength. If you genuinely need a 'walk' segment, audit every `.kind` consumer
 * (grep "\.kind ===" under src/features/workout-engine and parks/core/components/hybrid) first.
 */
describe('HybridPlannedSegment.kind stays a closed aerobic|strength union', () => {
  const src = readFileSync(join(__dirname, '..', 'compose-hybrid-session.service.ts'), 'utf8');
  it("declares exactly 'aerobic' | 'strength'", () => {
    const m = src.match(/export interface HybridPlannedSegment \{[\s\S]*?\n\s*kind: ([^;]+);/);
    expect(m?.[1].trim()).toBe("'aerobic' | 'strength'");
  });
});
