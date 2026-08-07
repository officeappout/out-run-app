import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

/**
 * Regression guard for the "health-questionnaire content leaks through the
 * background" bug family (10.08.2026 diagnosis): JITSetupModal has TWO
 * mutually exclusive render states, and BOTH were under-budgeted relative to
 * z-[95] (referral toast) / z-[100] (full-screen overlays, incl.
 * HybridSlotCarousel/HybridOverviewScreen):
 *   - inline Health Declaration (fixed first): z-[60] → z-[140]
 *   - centered confirmation card (fixed here): z-[90] → z-[141]
 * Source-level, not a render test — no jsdom/component harness in this repo
 * (vitest.config.ts: "node" env only).
 */

const modalPath = fileURLToPath(new URL('../JITSetupModal.tsx', import.meta.url));
const modalSrc = readFileSync(modalPath, 'utf8');
const cursorrulesPath = path.resolve(path.dirname(modalPath), '../../../../../.cursorrules');

describe('JITSetupModal — inline Health Declaration z-index', () => {
  it('the inline-questionnaire className no longer uses z-[60] (collided with the WorkoutDrawer/NavigationHub/RoutePreviewCard budget entry)', () => {
    expect(modalSrc).not.toMatch(/className="fixed inset-0 z-\[60\]/);
  });

  it('uses the budgeted z-[140] on the inline-questionnaire className, clearing search bars / toast / full-screen overlays', () => {
    expect(modalSrc).toMatch(/className="fixed inset-0 z-\[140\]/);
  });
});

describe('JITSetupModal — centered confirmation-card z-index', () => {
  it('the confirmation-card className no longer uses z-[90] (collided with the referral toast z-[95] and every full-screen overlay z-[100])', () => {
    expect(modalSrc).not.toMatch(/className="fixed inset-0 z-\[90\]/);
  });

  it('uses the budgeted z-[141], a distinct value from its sibling z-[140] questionnaire state', () => {
    expect(modalSrc).toMatch(/className="fixed inset-0 z-\[141\]/);
  });
});

describe('.cursorrules Z-Index Budget table — JITSetupModal entries', () => {
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

  it('documents both JITSetupModal states with their NEW, distinct values (z-140 questionnaire, z-141 confirmation) and no longer z-90', () => {
    const rules = readFileSync(cursorrulesPath, 'utf8');
    const section = rules.split('## Z-Index Budget')[1]?.split('## State Management')[0] ?? '';
    // Find each JITSetupModal bullet by its full line (unambiguous — the string
    // "JITSetupModal" isn't a z-index number), but only check the LEADING
    // declaration (before the first ":") for which z-value it documents — the
    // free-text description may legitimately mention another number in prose
    // (e.g. "was z-[90] — too low"), which is not itself a second budget entry.
    const jitBullets = section.split('\n')
      .filter((l) => l.includes('JITSetupModal'))
      .map((l) => l.match(/^- (.+?):/)?.[1] ?? '');
    expect(jitBullets.length).toBe(2);
    expect(jitBullets.some((b) => b.includes('z-[140]'))).toBe(true);
    expect(jitBullets.some((b) => b.includes('z-[141]'))).toBe(true);
    expect(jitBullets.some((b) => b.includes('z-[90]'))).toBe(false);
  });
});
