import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';

/**
 * Regression — Sderot field test (G2.1, 10.10.2026): the equipment-tabata
 * assessment nudge used to render INSIDE segments.map() in HybridJourneyAxis,
 * once per qualifying strength station — a yellow/amber warning-styled banner
 * stacking down the whole route for a no-questionnaire user, even though doing
 * ad-hoc station work there is legitimate, not a problem. Fixed by hoisting to
 * ONE route-level, softer prompt shown before the segment list.
 *
 * Source-level, not a render test — no jsdom/component harness in this repo
 * (vitest.config.ts: "node" env only) — same convention as the sibling
 * hybrid-overview-screen-design-unification.test.ts.
 */

const axisPath = fileURLToPath(new URL('../HybridJourneyAxis.tsx', import.meta.url));
const axisSrc = readFileSync(axisPath, 'utf8');

describe('HybridJourneyAxis — single route-level assessment nudge, not one per station', () => {
  it('no longer renders the per-station assessmentNudge banner inside segments.map()', () => {
    expect(axisSrc).not.toContain('seg.content?.assessmentNudge &&');
    expect(axisSrc).not.toContain('seg.content!.assessmentNudge!.assessmentDomains');
    expect(axisSrc).not.toContain('{seg.content.assessmentNudge.message}');
  });

  it('hoists a single hasAssessmentNudge banner BEFORE segments.map(, computed from the union of all segments', () => {
    const nudgeDeclIdx = axisSrc.indexOf('const hasAssessmentNudge');
    const mapIdx = axisSrc.indexOf('segments.map((seg, i) => {');
    expect(nudgeDeclIdx).toBeGreaterThan(-1);
    expect(mapIdx).toBeGreaterThan(-1);
    expect(nudgeDeclIdx).toBeLessThan(mapIdx);

    // The banner's own render condition is used exactly once (one banner, not N).
    const renderGateCount = axisSrc.split('{hasAssessmentNudge &&').length - 1;
    expect(renderGateCount).toBe(1);
    const renderGateIdx = axisSrc.indexOf('{hasAssessmentNudge &&');
    expect(renderGateIdx).toBeLessThan(mapIdx);
  });

  it('uses the softer, non-warning copy and styling (not the amber locked-card tone)', () => {
    expect(axisSrc).toContain('רוצים אימון מותאם יותר? השלימו שאלון כוח');
    expect(axisSrc).toContain("border: '1px dashed #CBD5E1'");
    expect(axisSrc).toContain("color: '#00C9F2'");
  });

  it('leaves the sibling needsAssessment (fully-locked, no-equipment) amber banner untouched', () => {
    // Different condition, different real symptom (zero content at all) — out of
    // scope for this fix, must still exist exactly as before.
    expect(axisSrc).toContain('seg.content?.needsAssessment');
    expect(axisSrc).toContain('{fallbackHint}');
    expect(axisSrc).toContain("background: '#FFFBEB'");
  });
});
