import { describe, it, expect } from 'vitest';
import { prevHeaderApplies, ruleText } from '../lib/checklist';
import { buildRuleSections } from '../lib/design/checklist-builder';

describe('PREV-HEADER scope (owner 21.10.2026)', () => {
  it('applies to run / interval / hybrid previews only', () => {
    expect(prevHeaderApplies('run')).toBe(true);
    expect(prevHeaderApplies('interval')).toBe(true);
    expect(prevHeaderApplies('Hybrid')).toBe(true);
    expect(prevHeaderApplies('strength')).toBe(false);
    expect(prevHeaderApplies(null)).toBe(false);
    expect(prevHeaderApplies(undefined)).toBe(false);
  });

  it('the rule text tells the tester that strength previews are exempt', () => {
    const t = ruleText('PREV-HEADER')!;
    expect(t).toMatch(/^Run \/ interval \/ hybrid workout preview/);
    expect(t).toMatch(/NOT apply to a pure strength workout preview/);
    expect(buildRuleSections()).toContain('PREV-HEADER: Run / interval / hybrid');
  });
});
