import { describe, it, expect } from 'vitest';
import { resolveMasterAssessDomainType } from '../program-groups.utils';

// vitest.config.ts runs in a plain 'node' environment with no JSX transform
// configured — ProgramDrawer.tsx and ProgramsSection.tsx can't be imported
// or rendered here. This tests the one new piece of decision logic behind
// the drawer's "עדכן רמה" (re-assess) CTA: whether the MASTER card should
// offer it, and if so, with which domainType.

describe('resolveMasterAssessDomainType — master-card re-assess CTA eligibility', () => {
  it('BEFORE (gap): ProgramDrawer was 100% read-only — no edit/re-assess action existed anywhere. ' +
     'AFTER: a standalone leaf master (no children, e.g. activePrograms = ["planche"] alone) is ' +
     'now eligible, routed with its own category/skill domainType.', () => {
    expect(resolveMasterAssessDomainType(0, 'push')).toBe('category');
    expect(resolveMasterAssessDomainType(0, 'planche')).toBe('skill');
  });

  it('a composite master WITH children (e.g. full_body → push/pull/legs) is NOT eligible — its level ' +
     'is derived (recalculateAncestorMasters averages the children), not independently assessable', () => {
    expect(resolveMasterAssessDomainType(2, 'full_body')).toBeUndefined();
    expect(resolveMasterAssessDomainType(1, 'full_body')).toBeUndefined();
  });

  it('no master slug (nothing resolved / no active program) → not eligible, regardless of child count', () => {
    expect(resolveMasterAssessDomainType(0, null)).toBeUndefined();
    expect(resolveMasterAssessDomainType(3, null)).toBeUndefined();
  });
});
