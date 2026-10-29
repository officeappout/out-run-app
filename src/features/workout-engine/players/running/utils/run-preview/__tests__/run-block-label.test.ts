import { describe, expect, it } from 'vitest';
import type { RunBlock } from '../../../types/run-block.type';
import { cleanRunBlockLabel, runBlockLabel } from '../run-block-label';
import { buildRunStructure } from '../run-structure';

const hill = (label: string): RunBlock => ({
  id: 'b1',
  type: 'interval',
  label, // i18n-allow-hebrew: Hebrew is the stored label
  labelLocalized: { he: 'עליות', en: 'Hill repeats' }, // i18n-allow-hebrew: Hebrew is the stored label
  durationSeconds: 60,
  colorHex: '#000',
});

describe('runBlockLabel', () => {
  it('Hebrew returns the stored label untouched, suffix and all', () => {
    expect(runBlockLabel(hill('עליות (2/6)'), 'he')).toBe('עליות (2/6)');
    expect(cleanRunBlockLabel(hill('עליות (2/6)'), 'he')).toBe('עליות');
  });
  it('English shows the pair and keeps the rep suffix', () => {
    expect(runBlockLabel(hill('עליות (2/6)'), 'en')).toBe('Hill repeats (2/6)');
    expect(cleanRunBlockLabel(hill('עליות (2/6)'), 'en')).toBe('Hill repeats');
  });
  it('English without a pair falls back to the engine table, then to Hebrew', () => {
    expect(runBlockLabel({ label: 'חימום' }, 'en')).toBe('Warm-up');
    expect(runBlockLabel({ label: 'סטריידס (1/4)' }, 'en')).toBe('Strides (1/4)');
    expect(runBlockLabel({ label: 'משהו אחר' }, 'en')).toBe('משהו אחר');
  });
  it('ignores a pair whose Hebrew no longer matches (main-set swap rewrote the label)', () => {
    expect(runBlockLabel({ ...hill('600 מ׳') }, 'en')).toBe('600 מ׳');
  });
});

describe('buildRunStructure lang', () => {
  it('only the shown words change', () => {
    const blocks = [hill('עליות (1/2)'), hill('עליות (2/2)')];
    const he = buildRunStructure(blocks, { basePace: 0, zones: null }, { showPaceNumbers: false });
    const en = buildRunStructure(blocks, { basePace: 0, zones: null }, { showPaceNumbers: false, lang: 'en' });
    expect(en.length).toBe(he.length);
    expect(he.flatMap((s) => s.rows.map((r) => r.text)).join()).toContain('עליות');
    expect(en.flatMap((s) => s.rows.map((r) => r.text)).join()).toContain('Hill repeats');
  });
});
