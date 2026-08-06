import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

/**
 * Regression guard for the LegalDocModal / .cursorrules z-[110]/[111]
 * collision with the documented "Hybrid aerobic CTA" (z-[110], .cursorrules
 * Z-Index Budget) entry. Source-level, not a render test — this repo has
 * no jsdom/component harness (vitest.config.ts: "node" env only).
 */

const legalDocModalPath = fileURLToPath(new URL('../LegalDocModal.tsx', import.meta.url));
const cursorrulesPath = path.resolve(path.dirname(legalDocModalPath), '../../../../.cursorrules');

describe('LegalDocModal z-index', () => {
  it('no longer uses z-[110]/z-[111] (collided with the Hybrid aerobic CTA budget entry)', () => {
    const src = readFileSync(legalDocModalPath, 'utf8');
    expect(src).not.toContain('z-[110]');
    expect(src).not.toContain('z-[111]');
  });

  it('uses the new budgeted z-[130] backdrop / z-[131] sheet pair', () => {
    const src = readFileSync(legalDocModalPath, 'utf8');
    expect(src).toContain('z-[130]');
    expect(src).toContain('z-[131]');
  });
});

describe('.cursorrules Z-Index Budget table', () => {
  /**
   * Only reads the z-index value(s) named in each bullet's LEADING
   * declaration (before the first ":") — a bullet's free-text description
   * may legitimately cross-reference another entry's z-index in prose
   * (e.g. "must clear X (z-[120])"), which is not itself a second budget
   * entry and must not be flagged as a duplicate.
   */
  function extractBudgetValues(): number[] {
    const rules = readFileSync(cursorrulesPath, 'utf8');
    const section = rules.split('## Z-Index Budget')[1]?.split('## State Management')[0] ?? '';
    const values: number[] = [];
    for (const line of section.split('\n')) {
      const bullet = line.match(/^- (.+?):/);
      if (!bullet) continue;
      for (const m of Array.from(bullet[1].matchAll(/z-\[?(-?\d+)\]?/g))) values.push(Number(m[1]));
    }
    return values;
  }

  it('has no duplicate z-index values (each documented value is unique)', () => {
    const values = extractBudgetValues();
    expect(values.length).toBeGreaterThan(0);
    const duplicates = values.filter((v, i) => values.indexOf(v) !== i);
    expect(duplicates).toEqual([]);
  });

  it('documents the LegalDocModal z-[130]/z-[131] entry', () => {
    const values = extractBudgetValues();
    expect(values).toContain(130);
    expect(values).toContain(131);
  });
});
