import { describe, it, expect } from 'vitest';
import { spawnSync } from 'child_process';
import { mkdtempSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { fileURLToPath } from 'url';
import { normalizeLine, splitTopLevelUnion } from '../tsc-normalize.mjs';

// The tsc "no NEW errors" gate (scripts/ci/tsc-baseline.sh) must ignore union MEMBER ORDER
// (tsc prints it in type-id order, which shifts with module load order — 17.10.2026 this
// produced 7 false "new" errors on main) while still failing on a genuinely new error.

const SCRIPT = fileURLToPath(new URL('../tsc-baseline.sh', import.meta.url));

// The real lines from 17.10.2026 (baseline vs what tsc printed after unrelated commits).
const BASE_RANK =
  `src/app/admin/running/import/rank-hills/page.tsx: TS2367: This comparison appears to be unintentional because the types '"warmup" | "cooldown" | "recovery" | "walk"' and '"float"' have no overlap.`;
const NOW_RANK =
  `src/app/admin/running/import/rank-hills/page.tsx: TS2367: This comparison appears to be unintentional because the types '"recovery" | "warmup" | "cooldown" | "walk"' and '"float"' have no overlap.`;
const BASE_STRENGTH =
  `src/features/profile/components/widgets/RecentActivityList.tsx: TS2678: Type '"STRENGTH"' is not comparable to type '"running" | "strength" | "walking" | "cycling" | "hybrid" | "recovery"'.`;
const NOW_STRENGTH =
  `src/features/profile/components/widgets/RecentActivityList.tsx: TS2678: Type '"STRENGTH"' is not comparable to type '"running" | "strength" | "walking" | "cycling" | "recovery" | "hybrid"'.`;
const OTHER = `src/lib/x.ts: TS2322: Type 'string' is not assignable to type 'number'.`;

function runCompare(baseline: string[], current: string[]) {
  const dir = mkdtempSync(join(tmpdir(), 'tsc-baseline-'));
  const b = join(dir, 'baseline.txt');
  const c = join(dir, 'current.txt');
  writeFileSync(b, baseline.join('\n') + '\n');
  writeFileSync(c, current.join('\n') + '\n');
  const r = spawnSync('bash', [SCRIPT, 'compare', b, c], { encoding: 'utf8' });
  return { code: r.status, out: `${r.stdout}${r.stderr}` };
}

describe('normalizeLine — union member order only', () => {
  it('reordered unions normalize to the same line', () => {
    expect(normalizeLine(NOW_RANK)).toBe(normalizeLine(BASE_RANK));
    expect(normalizeLine(NOW_STRENGTH)).toBe(normalizeLine(BASE_STRENGTH));
  });
  it('a different member SET stays different', () => {
    const added = BASE_STRENGTH.replace('"recovery"', '"recovery" | "swim"');
    expect(normalizeLine(added)).not.toBe(normalizeLine(BASE_STRENGTH));
  });
  it('only top-level members are reordered (nested unions / strings untouched)', () => {
    expect(splitTopLevelUnion('A<"x" | "y"> | B | "p | q"')).toEqual(['A<"x" | "y">', 'B', '"p | q"']);
    expect(splitTopLevelUnion('(a: string) => void | null')).toEqual(['(a: string) => void', 'null']);
  });
  it('lines without unions are unchanged', () => {
    expect(normalizeLine(OTHER)).toBe(OTHER);
  });
});

describe('tsc-baseline.sh compare — the gate itself', () => {
  it('reordered unions → PASS (exit 0, no NEW errors)', () => {
    const r = runCompare([BASE_RANK, BASE_STRENGTH, OTHER], [NOW_RANK, NOW_STRENGTH, OTHER]);
    expect(r.out).toContain('no new TypeScript errors');
    expect(r.code).toBe(0);
  });
  it('a genuinely new error → FAIL (exit 1)', () => {
    const fresh = `src/features/new/thing.ts: TS2339: Property 'foo' does not exist on type 'Bar'.`;
    const r = runCompare([BASE_RANK, OTHER], [NOW_RANK, OTHER, fresh]);
    expect(r.code).toBe(1);
    expect(r.out).toContain('1 NEW TypeScript error');
    expect(r.out).toContain('thing.ts');
  });
  it('a second identical error in the same file is still NEW (multiset kept)', () => {
    const r = runCompare([OTHER], [OTHER, OTHER]);
    expect(r.code).toBe(1);
  });
  it('a union that gained a member is NEW, not "reordered"', () => {
    const grown = NOW_STRENGTH.replace('"hybrid"', '"hybrid" | "swim"');
    const r = runCompare([BASE_STRENGTH], [grown]);
    expect(r.code).toBe(1);
  });
});

describe('normalizeLine — nested unions and truncated objects (21.10.2026)', () => {
  it('sorts unions nested in generics', async () => {
    const { normalizeLine } = await import('../tsc-normalize.mjs');
    expect(normalizeLine(`a.ts: TS2802: Type 'Set<"push" | "pull" | "legs">' x`)).toBe(
      normalizeLine(`a.ts: TS2802: Type 'Set<"legs" | "push" | "pull">' x`),
    );
  });
  it('collapses an object type tsc truncated with "..."', async () => {
    const { normalizeLine } = await import('../tsc-normalize.mjs');
    expect(normalizeLine(`a.ts: TS7053: index type '{ core?: A | undefined; running?: B; ...'.`)).toBe(
      normalizeLine(`a.ts: TS7053: index type '{ core?: A | undefined; flexibility?: C; ...'.`),
    );
  });
  it('still tells genuinely different errors apart', async () => {
    const { normalizeLine } = await import('../tsc-normalize.mjs');
    expect(normalizeLine(`a.ts: TS2322: Type '"a" | "b"' x`)).not.toBe(normalizeLine(`a.ts: TS2322: Type '"a" | "c"' x`));
  });
});

describe('normalizeLine — contractions in the message', () => {
  it("handles \"can't\" before a truncated object type", async () => {
    const { normalizeLine } = await import('../tsc-normalize.mjs');
    const a = `a.ts: TS7053: Element implicitly has an 'any' type because expression of type 'string' can't be used to index type '{ core?: A | undefined; running?: B | undefin...'.`;
    const b = `a.ts: TS7053: Element implicitly has an 'any' type because expression of type 'string' can't be used to index type '{ core?: A | undefined; flexibility?: C | undefin...'.`;
    expect(normalizeLine(a)).toBe(normalizeLine(b));
    expect(normalizeLine(a)).toContain("can't");
  });
});

describe('normalizeLine — object members with union types', () => {
  it('sorts the union after the colon, not across members', async () => {
    const { normalizeLine } = await import('../tsc-normalize.mjs');
    const a = `w.ts: TS2802: Type 'Map<string, { count: number; broadPattern: "push" | "pull" | "legs" | "other"; }>' can only`;
    const b = `w.ts: TS2802: Type 'Map<string, { broadPattern: "other" | "legs" | "push" | "pull"; count: number; }>' can only`;
    expect(normalizeLine(a)).toBe(normalizeLine(b));
    expect(normalizeLine(a)).toContain('broadPattern: "legs" | "other" | "pull" | "push"');
  });
});
