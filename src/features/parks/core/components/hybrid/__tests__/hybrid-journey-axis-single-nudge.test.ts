import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { routeQuestionnaireLine } from '../route-questionnaire-line';

/**
 * Regression — Sderot field test G2.1: the "השלימו שאלון" questionnaire copy repeated on every
 * station of the route's stop list. Wave 1 (#202) hoisted the equipment-tabata `assessmentNudge`
 * to one route-level line; the pilot then found the LOCKED-station card (`needsAssessment`) still
 * repeating an amber warning on every locked stop. Now: ONE neutral, gendered line for the route
 * (union of both sources), and each locked station shows a neutral "locked" state only.
 *
 * Source-level for the .tsx wiring (vitest can't import .tsx); behaviour via the pure helper.
 */

const axisSrc = readFileSync(fileURLToPath(new URL('../HybridJourneyAxis.tsx', import.meta.url)), 'utf8');

const locked = (d: string[]) => ({ kind: 'strength', content: { needsAssessment: { assessmentDomains: d } } });
const nudged = (d: string[]) => ({ kind: 'strength', content: { assessmentNudge: { assessmentDomains: d } } });
const plain = { kind: 'strength', content: {} };
const leg = { kind: 'aerobic' };

describe('route questionnaire line (pure)', () => {
  it('none needed → no line', () => {
    expect(routeQuestionnaireLine([leg, plain, leg], 'male')).toBeNull();
  });
  it('N locked stations → ONE line, union of domains', () => {
    const line = routeQuestionnaireLine([leg, locked(['push']), leg, locked(['pull', 'push']), leg, locked(['legs'])], 'male')!;
    expect(line.domains.sort()).toEqual(['legs', 'pull', 'push']);
    expect(line.hasLocked).toBe(true);
  });
  it('mixed (locked + equipment-tabata nudge) → still ONE line covering both', () => {
    const line = routeQuestionnaireLine([locked(['push']), nudged(['core'])], 'female')!;
    expect(line.domains.sort()).toEqual(['core', 'push']);
    expect(line.hasLocked).toBe(true);
  });
  it('gendered via g(), no slash forms', () => {
    expect(routeQuestionnaireLine([nudged(['push'])], 'male')!.text).toBe('רוצה אימון מותאם יותר? מלא שאלון כוח קצר');
    expect(routeQuestionnaireLine([nudged(['push'])], 'female')!.text).toBe('רוצה אימון מותאם יותר? מלאי שאלון כוח קצר');
    for (const gen of ['male', 'female', 'other', null] as const) {
      for (const segs of [[nudged(['a'])], [locked(['a'])]]) {
        expect(routeQuestionnaireLine(segs, gen)!.text).not.toMatch(/[א-ת]\/[א-ת]|השלימו/);
      }
    }
  });
});

describe('HybridJourneyAxis wiring', () => {
  it('the line renders exactly once, BEFORE segments.map(', () => {
    const mapIdx = axisSrc.indexOf('segments.map((seg, i) => {');
    expect(axisSrc.split('{questionnaireLine && (').length - 1).toBe(1);
    expect(axisSrc.indexOf('{questionnaireLine && (')).toBeLessThan(mapIdx);
    expect(axisSrc).toContain('onSegmentAssessmentLink?.(questionnaireLine.domains)');
  });
  it('neutral styling — no amber warning tokens anywhere in the axis', () => {
    expect(axisSrc).toContain("border: '1px dashed #CBD5E1'");
    expect(axisSrc).not.toContain('#FFFBEB');
    expect(axisSrc).not.toContain('#B45309');
  });
  it('a locked station keeps its place on the axis with a neutral locked state, no per-stop questionnaire copy', () => {
    const lockedBranch = axisSrc.slice(axisSrc.indexOf('if (seg.content?.needsAssessment) {'), axisSrc.indexOf('const exs = seg.content?.exercises'));
    expect(lockedBranch).toContain('תחנה נעולה');
    expect(lockedBranch).not.toContain('fallbackHint');
    expect(lockedBranch).not.toContain('onSegmentAssessmentLink');
    expect(axisSrc).not.toContain('seg.content?.assessmentNudge &&');
  });
});
