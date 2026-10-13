/**
 * Regression guard: a zustand v5 selector must never return a fresh reference.
 *
 * `useXStore((s) => s.a?.b ?? [])` returns a NEW array on every call; zustand v5 compares
 * selector results by identity, so the component re-renders forever and React throws #185
 * ("Maximum update depth exceeded"). This shipped once: RouteDetailSheet's groupIds selector
 * (#225) white-screened the map for every user with no groups. Fix = a module-level constant
 * (or useShallow). This scans src/ for the single-line selector form with a literal
 * `[]` / `{}` / `new Map()` / `new Set()` fallback.
 */
import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

const SRC = path.resolve(__dirname, '..');

// use<Name>Store( [(]s[)] => ... (?? | ||) <fresh literal> ) on one line.
const BAD_SELECTOR =
  /\buse[A-Za-z0-9]*Store\(\s*\(?\s*\w+\s*\)?\s*=>[^\n;]*?(\?\?|\|\|)\s*(\[\s*\]|\{\s*\}|new\s+(Map|Set)\s*\(\s*\))/;

function walk(dir: string, out: string[] = []): string[] {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === 'node_modules' || e.name === '.next') continue;
    const full = path.join(dir, e.name);
    if (e.isDirectory()) walk(full, out);
    else if (/\.(ts|tsx)$/.test(e.name) && !/\.test\.tsx?$/.test(e.name)) out.push(full);
  }
  return out;
}

describe('zustand selectors never return a fresh reference', () => {
  it('the detector flags the original bug shape', () => {
    expect(BAD_SELECTOR.test('const g = useUserStore((s) => s.profile?.social?.groupIds ?? []);')).toBe(true);
    expect(BAD_SELECTOR.test('const m = useMapStore(s => s.x || {});')).toBe(true);
    expect(BAD_SELECTOR.test('const g = useUserStore((s) => s.profile?.social?.groupIds ?? EMPTY_GROUP_IDS);')).toBe(false);
    expect(BAD_SELECTOR.test('const g = (profile?.social?.groupIds ?? []).join(",");')).toBe(false);
  });

  it('no selector-form fresh-literal fallback exists in src/', () => {
    const offenders: string[] = [];
    for (const file of walk(SRC)) {
      fs.readFileSync(file, 'utf8').split('\n').forEach((line, i) => {
        if (BAD_SELECTOR.test(line)) offenders.push(`${path.relative(SRC, file)}:${i + 1}  ${line.trim()}`);
      });
    }
    expect(
      offenders,
      `fresh-reference selector(s), use a module-level constant or useShallow:\n${offenders.join('\n')}`,
    ).toEqual([]);
  });
});
