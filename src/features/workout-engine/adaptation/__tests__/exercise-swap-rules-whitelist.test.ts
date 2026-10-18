/**
 * Pure (no emulator) drift guard: the exercise_swaps create rule's
 * keys().hasOnly([...]) list and its enum lists must match the client's
 * EXERCISE_SWAP_FIELDS / SWAP_* constants exactly — a client field the rule
 * doesn't whitelist would make EVERY swap log fail silently (fire-and-forget).
 * The behavioural emulator suite is tests/firestore-exercise-swaps.rules.test.ts.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import {
  EXERCISE_SWAP_FIELDS,
  SWAP_DIRECTIONS,
  SWAP_FLOWS,
  SWAP_REASONS,
  SWAP_TABS,
} from '../adaptation.types';

const rules = readFileSync(path.resolve(__dirname, '../../../../../firestore.rules'), 'utf8');

function block(name: string): string {
  const start = rules.indexOf(`match /${name}/`);
  expect(start).toBeGreaterThan(-1);
  const end = rules.indexOf('\n    }\n', start);
  return rules.slice(start, end);
}

function quoted(list: string): string[] {
  return Array.from(list.matchAll(/'([^']+)'/g), (m) => m[1]);
}

describe('exercise_swaps rule ↔ client whitelist', () => {
  const swaps = block('exercise_swaps');

  it('hasOnly list === EXERCISE_SWAP_FIELDS', () => {
    const m = swaps.match(/keys\(\)\.hasOnly\(\[([\s\S]*?)\]\)/);
    expect(m).not.toBeNull();
    expect(quoted(m![1]).sort()).toEqual([...EXERCISE_SWAP_FIELDS].sort());
  });

  it.each([
    ['direction', SWAP_DIRECTIONS],
    ['tab', SWAP_TABS],
    ['flow', SWAP_FLOWS],
    ['reason', SWAP_REASONS],
  ] as const)('%s enum matches', (field, values) => {
    const re = new RegExp(`request\\.resource\\.data\\.${field} in \\[([^\\]]*)\\]`);
    const m = swaps.match(re);
    expect(m).not.toBeNull();
    expect(quoted(m![1]).sort()).toEqual([...values].sort());
  });

  it('is self-attributed, immutable, admin-read', () => {
    expect(swaps).toContain('request.resource.data.userId == request.auth.uid');
    expect(swaps).toContain('allow update, delete: if false;');
    expect(swaps).toContain('allow read: if isAdmin();');
  });

  it('exercise_stats is admin-read, never client-written', () => {
    const stats = block('exercise_stats');
    expect(stats).toContain('allow read: if isAdmin();');
    expect(stats).toContain('allow write: if false;');
  });
});
