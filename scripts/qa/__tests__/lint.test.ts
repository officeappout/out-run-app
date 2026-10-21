import { describe, it, expect } from 'vitest';
import { COLLECT_JS } from '../lib/lint/collect';
import type { ControlFact, PageFacts } from '../lib/lint/collect';
import { lintFacts, nowrapVerdict, routePattern } from '../lib/lint/rules';
import nowrapFixtures from './fixtures/nowrap-controls.json';
import { SIGNED_IN_UID_JS } from '../lib/demo-guard';

const ctl = (p: Partial<ControlFact> = {}): ControlFact => ({ label: 'המשך', w: 200, h: 48, kind: 'button', nowrapHint: false, textNodes: 1, textLines: 1, textHeight: 20, lineHeight: 20, clippedNoEllipsis: false, gradient: false, selected: false, bgLuminance: 1, inlineLink: false, ...p });
const facts = (p: Partial<PageFacts> = {}): PageFacts => ({ url: '/home', viewport: { w: 390, h: 844 }, docScrollWidth: 390, dir: 'rtl', smallTexts: [], emojiTexts: [], controls: [ctl()], ...p });
const rules = (f: PageFacts, e?: Parameters<typeof lintFacts>[1]) => lintFacts(f, e).map((i) => i.rule);

describe('lintFacts', () => {
  it('a clean screen has no issues', () => {
    expect(lintFacts(facts())).toEqual([]);
  });
  it('flags text under 11px', () => {
    const r = lintFacts(facts({ smallTexts: [{ text: 'קטן', px: 10 }] }));
    expect(r[0]).toMatchObject({ rule: 'V2-FONT-11', severity: 'P2', examples: ['10px: קטן'] });
  });
  it('flags wrapped or clipped labels, not inline links', () => {
    expect(rules(facts({ controls: [ctl({ textLines: 2, textHeight: 40 })] }))).toContain('V2-NOWRAP');
    expect(rules(facts({ controls: [ctl({ clippedNoEllipsis: true })] }))).toContain('V2-NOWRAP');
    expect(rules(facts({ controls: [ctl({ textLines: 2, textHeight: 40, inlineLink: true })] }))).not.toContain('V2-NOWRAP');
  });
  it('V2-NOWRAP judges only button / chip / tab / label with a single text node', () => {
    expect(nowrapVerdict(ctl({ kind: 'other', textLines: 2, textHeight: 40 }))).toBeNull();
    expect(nowrapVerdict(ctl({ kind: 'link', textLines: 2, textHeight: 40 }))).toBeNull();
    expect(nowrapVerdict(ctl({ kind: 'button', textNodes: 3, textLines: 2, textHeight: 40 }))).toBeNull();
    expect(nowrapVerdict(ctl({ kind: 'chip', textLines: 2, textHeight: 40 }))).toBe('wrap');
    expect(nowrapVerdict(ctl({ kind: 'tab', textLines: 2, textHeight: 40 }))).toBe('wrap');
    // explicit data-qa-nowrap: judged whatever the kind / node count
    expect(nowrapVerdict(ctl({ kind: 'other', nowrapHint: true, textNodes: 2, textLines: 2, textHeight: 40 }))).toBe('wrap');
  });
  it('V2-NOWRAP: more line boxes but no taller than ~1 line-height is not a wrap', () => {
    expect(nowrapVerdict(ctl({ textLines: 2, textHeight: 24, lineHeight: 21 }))).toBeNull();
    expect(nowrapVerdict(ctl({ textLines: 2, textHeight: 32, lineHeight: 21 }))).toBe('wrap');
  });
  it('V2-NOWRAP: the first run\'s false positives (gateway cards, gender chips, CTA + icon) are not flagged', () => {
    for (const c of nowrapFixtures.falsePositives as unknown as Array<ControlFact & { why: string }>) {
      expect(nowrapVerdict(c), c.why).toBeNull();
    }
    expect(rules(facts({ controls: nowrapFixtures.falsePositives as unknown as ControlFact[] }))).not.toContain('V2-NOWRAP');
  });
  it('V2-NOWRAP: real wraps / clips are still flagged (controls and data-qa-nowrap labels)', () => {
    for (const c of nowrapFixtures.truePositives as unknown as Array<ControlFact & { why: string }>) {
      expect(nowrapVerdict(c), c.why).not.toBeNull();
    }
    const [wrap, clip, label] = nowrapFixtures.truePositives as unknown as ControlFact[];
    const issue = lintFacts(facts({ controls: [wrap, clip], labels: [label] })).find((i) => i.rule === 'V2-NOWRAP');
    expect(issue?.examples).toEqual(['2 שורות: התחלת אימון עכשיו', 'נחתך: התקדמות שבועית', '2 שורות: 3 סטים']);
  });
  it('one gradient CTA is fine, two is a finding', () => {
    expect(rules(facts({ controls: [ctl({ gradient: true })] }))).not.toContain('V2-CTA-1');
    expect(rules(facts({ controls: [ctl({ gradient: true }), ctl({ gradient: true, label: 'עוד' })] }))).toContain('V2-CTA-1');
  });
  it('flags emoji, dark selected state, small targets and horizontal scroll', () => {
    expect(rules(facts({ emojiTexts: ['כל הכבוד 🎉'] }))).toContain('V2-NO-EMOJI');
    expect(rules(facts({ controls: [ctl({ selected: true, bgLuminance: 0.01 })] }))).toContain('V2-SELECTED-TINT');
    expect(rules(facts({ controls: [ctl({ selected: true, bgLuminance: 0.8 })] }))).not.toContain('V2-SELECTED-TINT');
    expect(rules(facts({ controls: [ctl({ w: 30, h: 30 })] }))).toContain('MOB-TARGET-44');
    expect(rules(facts({ docScrollWidth: 420 }))).toContain('MOB-NO-HSCROLL');
  });
  it('permission-denied and 5xx are P1, other errors P2', () => {
    expect(lintFacts(facts(), { console: ['FirebaseError: Missing or insufficient permissions.'], failedRequests: [] })[0]).toMatchObject({ rule: 'STAB-CONSOLE', severity: 'P1' });
    expect(lintFacts(facts(), { console: [], failedRequests: ['503 GET api/x'] })[0]).toMatchObject({ severity: 'P1' });
    expect(lintFacts(facts(), { console: ['oops'], failedRequests: [] })[0]).toMatchObject({ severity: 'P2' });
  });
  it('caps examples at 5', () => {
    const smallTexts = Array.from({ length: 12 }, (_, i) => ({ text: `t${i}`, px: 9 }));
    expect(lintFacts(facts({ smallTexts }))[0].examples).toHaveLength(5);
  });
});

describe('routePattern', () => {
  it('collapses ids', () => {
    expect(routePattern('/run/planned/abcdefghijklmnopqrst?x=1')).toBe('/run/planned/:id');
    expect(routePattern('/profile/demo_qa_walker58')).toBe('/profile/:id');
    expect(routePattern('/home')).toBe('/home');
    expect(routePattern('')).toBe('/');
  });
});

describe('in-page scripts', () => {
  it('are valid JavaScript expressions', () => {
    expect(() => new Function(`return ${COLLECT_JS}`)).not.toThrow();
    expect(() => new Function(`return ${SIGNED_IN_UID_JS}`)).not.toThrow();
  });
});
