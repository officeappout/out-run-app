import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

/**
 * Regression guard for the "health-questionnaire content leaks through the
 * background" bug (10.08.2026 diagnosis): JITSetupModal's inline Health
 * Declaration state used z-[60] — a value already budgeted for a DIFFERENT
 * component (WorkoutDrawer/NavigationHub/RoutePreviewCard, .cursorrules) and
 * lower than search bars (z-[70]), the referral toast (z-[95]), and every
 * full-screen overlay (z-[100], incl. HybridSlotCarousel/HybridOverviewScreen)
 * — any of those still mounted painted ON TOP of the "full-screen" white div
 * and stayed clickable. Source-level, not a render test — no jsdom/component
 * harness in this repo (vitest.config.ts: "node" env only).
 */

const modalPath = fileURLToPath(new URL('../JITSetupModal.tsx', import.meta.url));
const modalSrc = readFileSync(modalPath, 'utf8');
const cursorrulesPath = path.resolve(path.dirname(modalPath), '../../../../../.cursorrules');

describe('JITSetupModal — inline Health Declaration z-index', () => {
  it('the inline-questionnaire className no longer uses z-[60] (collided with the WorkoutDrawer/NavigationHub/RoutePreviewCard budget entry)', () => {
    expect(modalSrc).not.toMatch(/className="fixed inset-0 z-\[60\]/);
  });

  it('uses the new budgeted z-[140] on the inline-questionnaire className, clearing search bars / toast / full-screen overlays', () => {
    expect(modalSrc).toMatch(/className="fixed inset-0 z-\[140\]/);
  });

  it('the confirmation-card state keeps its own separate z-[90] (unaffected — different, mutually exclusive render)', () => {
    expect(modalSrc).toContain('z-[90]');
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

  it('documents both JITSetupModal states with DIFFERENT values (z-90 confirmation, z-140 questionnaire)', () => {
    const rules = readFileSync(cursorrulesPath, 'utf8');
    const section = rules.split('## Z-Index Budget')[1]?.split('## State Management')[0] ?? '';
    const jitLines = section.split('\n').filter((l) => l.includes('JITSetupModal'));
    expect(jitLines.length).toBe(2);
    expect(jitLines.some((l) => l.includes('z-[90]'))).toBe(true);
    expect(jitLines.some((l) => l.includes('z-[140]'))).toBe(true);
  });
});
