import { describe, it, expect } from 'vitest';
import { resolveProgramByIdOrSlug, programDisplayName } from '../shared.utils';
import type { Program } from '@/features/content/programs/core/program.types';

/**
 * Regression coverage for the admin progression-tab movementPattern/slug
 * collision bug (2026-10-10 fix). Companion to lead-program.service.ts's
 * and visual-content-resolver.service.ts's fixes -- same root cause
 * (PR #160, 08.10.2026, wrote movementPattern onto 7 skill programs), this
 * call site: buildProgramHierarchy's full_body "push" child node resolved
 * via resolveProgramByIdOrSlug('push', programs) -- which used to match ANY
 * program sharing movementPattern:'push', landing on whichever sorted
 * first (getAllPrograms() orderBy name -- "דגל אנושי" before "דחיפה"). A
 * user's full_body hierarchy displayed "דגל אנושי" for the push node
 * instead of "דחיפה".
 */

function makeProgram(id: string, name: string, slug: string, movementPattern?: string): Program {
  return { id, name, slug, movementPattern, isMaster: false } as any;
}

const PROGRAMS: Program[] = [
  makeProgram('human-flag-id', 'דגל אנושי', 'human_flag', 'push'),
  makeProgram('push-id', 'דחיפה', 'push', 'push'),
  makeProgram('pull-id', 'משיכה', 'pull', 'pull'),
];

describe('resolveProgramByIdOrSlug / programDisplayName — movementPattern/slug collision (2026-10-10 fix)', () => {
  it('"push" resolves to the real push program, not the alphabetically-first skill sharing its movementPattern', () => {
    const resolved = resolveProgramByIdOrSlug('push', PROGRAMS);
    expect(resolved?.id).toBe('push-id');
  });

  it('programDisplayName("push", ...) shows "דחיפה", not "דגל אנושי"', () => {
    const { name, resolved } = programDisplayName('push', PROGRAMS);
    expect(resolved).toBe(true);
    expect(name).toBe('דחיפה');
  });

  it('a skill\'s own slug ("human_flag") still resolves directly, unaffected', () => {
    const resolved = resolveProgramByIdOrSlug('human_flag', PROGRAMS);
    expect(resolved?.id).toBe('human-flag-id');
  });

  it('resolving by the real program\'s own Firestore id still works unaffected', () => {
    const resolved = resolveProgramByIdOrSlug('push-id', PROGRAMS);
    expect(resolved?.id).toBe('push-id');
  });
});
