import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import { QA_DIR, loadPersonasAndMissions } from '../lib/files';
import { loadOwnerRulesFile, mergeOwnerRules, ruleAppliesTo, validateOwnerRulesFile, type OwnerRule } from '../lib/owner/owner-rules';
import { buildLearning, isSuppressed } from '../lib/owner/learning';
import { buildLearningSection, buildOwnerRulesSection } from '../lib/owner/prompt-section';
import { buildDesignChecklist } from '../lib/design/checklist-builder';
import { buildSystemPrompt } from '../lib/prompt';
import { parseToolCall } from '../lib/tool-input';
import { RULE_IDS } from '../lib/checklist';
import { parseStatus } from '../lib/store';
import type { Dismissal } from '@/lib/demo-control/owner-rules-model';

const fileRules = loadOwnerRulesFile(QA_DIR);
const dis = (p: Partial<Dismissal> = {}): Dismissal => ({ findingId: 'qa-1__a', rule: 'LAY-OVERLAP', screen: 'home_strength_today', title: 'כפתור צף', reason: 'בכוונה', atMs: 1, ...p });

describe('owner-rules.json (seed)', () => {
  it('is valid, has the seed notes, and every id is documented in owner-rules.md', () => {
    expect(fileRules.map((r) => r.id)).toEqual(['OWN-001', 'OWN-002', 'OWN-003', 'OWN-004', 'OWN-005', 'OWN-006', 'OWN-007', 'OWN-008', 'OWN-009', 'OWN-010', 'OWN-011',
      // first-launch screens (owner notes 21.10, PR #636)
      'OWN-012', 'OWN-013', 'OWN-014', 'OWN-015',
    ]);
    const md = readFileSync(join(QA_DIR, 'owner-rules.md'), 'utf8');
    for (const r of fileRules) {
      expect(md).toContain(`### ${r.id} · ${r.severity}`);
      expect(md).toContain(r.text);
    }
    for (const r of fileRules) expect(RULE_IDS.has(r.id)).toBe(false);
  });

  it('rejects bad files', () => {
    const ok = { id: 'OWN-010', text: 'טקסט ארוך מספיק', scope: { screens: [], flows: [] }, severity: 'P2' };
    expect(validateOwnerRulesFile({ rules: [ok] }).ok).toBe(true);
    for (const bad of [
      { ...ok, id: 'OWN-101' }, // panel range
      { ...ok, id: 'OWN-10' },
      { ...ok, text: 'קצר' },
      { ...ok, severity: 'P5' },
      { ...ok, scope: { screens: ['a b'], flows: [] } },
      { ...ok, scope: { screens: ['../x'], flows: [] } },
      { ...ok, example: { screenshot: '/etc/passwd.png' } },
    ]) expect(validateOwnerRulesFile({ rules: [bad] }).ok).toBe(false);
    expect(validateOwnerRulesFile({ rules: [ok, ok] }).ok).toBe(false);
    expect(validateOwnerRulesFile({}).ok).toBe(false);
  });

  it('missions may focus on OWN-* ids from the file', () => {
    const { ownerRules } = loadPersonasAndMissions();
    expect(ownerRules).toHaveLength(fileRules.length);
  });
});

describe('merge + scope', () => {
  it('file rules first, then panel notes; a panel note never shadows a file id', () => {
    const merged = mergeOwnerRules(fileRules, [
      { id: 'OWN-102', text: 'ב', screen: null, severity: 'P2', createdAtMs: 2 },
      { id: 'OWN-101', text: 'א', screen: 'map', severity: 'P1', createdAtMs: 1 },
      { id: 'OWN-001', text: 'מתנגש', screen: null, severity: 'P3', createdAtMs: 3 },
    ]);
    expect(merged.map((r) => r.id).slice(-3)).toEqual([fileRules[fileRules.length - 1].id, 'OWN-101', 'OWN-102']);
    expect(merged.find((r) => r.id === 'OWN-101')).toMatchObject({ origin: 'panel', scope: { screens: ['map'], flows: [] } });
    expect(merged.find((r) => r.id === 'OWN-001')!.origin).toBe('file');
  });

  it('scope: unscoped = everywhere; screens match checkpoints / paths; flows match mission words', () => {
    const r = (scope: OwnerRule['scope']): OwnerRule => ({ id: 'OWN-050', text: 'x', scope, severity: 'P2', origin: 'file' });
    const map = { id: 'D09_map_routes', start: '/map', checkpoints: [{ id: 'map' }, { id: 'map_park_sheet', path: '/parks/x' }] };
    expect(ruleAppliesTo(r({ screens: [], flows: [] }), map)).toBe(true);
    expect(ruleAppliesTo(r({ screens: ['map'], flows: [] }), map)).toBe(true);
    expect(ruleAppliesTo(r({ screens: ['/parks'], flows: [] }), map)).toBe(true);
    expect(ruleAppliesTo(r({ screens: ['home_today'], flows: [] }), map)).toBe(false);
    expect(ruleAppliesTo(r({ screens: [], flows: ['onboarding'] }), { id: 'D01_onboard_strength', start: '/', checkpoints: [{ id: 'onb_strength_path' }] })).toBe(true);
    expect(ruleAppliesTo(r({ screens: [], flows: ['onboarding'] }), map)).toBe(false);
  });
});

describe('learning from triage', () => {
  it('two dismissals of one rule on one screen suppress it there (screen id or route)', () => {
    const l = buildLearning([dis({ findingId: 'a' }), dis({ findingId: 'b' }), dis({ findingId: 'c', rule: 'V2-CTA-1' })]);
    expect(l.suppressed.map((g) => g.rule)).toEqual(['LAY-OVERLAP']);
    expect(l.clarifications.map((g) => g.rule)).toEqual(['V2-CTA-1']);
    expect(isSuppressed(l, 'LAY-OVERLAP', ['home_strength_today', '/home'])).toBe(true);
    expect(isSuppressed(l, 'LAY-OVERLAP', [null, '/home'])).toBe(false);
    expect(isSuppressed(l, 'V2-CTA-1', ['home_strength_today'])).toBe(false);
    expect(isSuppressed(l, null, ['home_strength_today'])).toBe(false);
  });

  it('prompt sections: owner rules outrank, ★ in scope; learning lists suppressions + reasons', () => {
    const own = buildOwnerRulesSection(fileRules, new Set(['OWN-004']));
    expect(own).toMatch(/OUTRANK every generic rule/);
    expect(own).toContain('★ OWN-004 (P1)');
    expect(own).not.toContain('★ OWN-001');
    expect(own).toMatch(/bad: .*good: /);
    const learned = buildLearningSection(buildLearning([dis({ findingId: 'a' }), dis({ findingId: 'b', reason: 'זה בכוונה', atMs: 2 }), dis({ findingId: 'c', rule: 'V2-CTA-1', reason: '' })]));
    expect(learned).toMatch(/Do NOT report this rule on this screen/);
    expect(learned).toContain('- LAY-OVERLAP on home_strength_today (dismissed 2×) — owner: "זה בכוונה" / "בכוונה"');
    expect(learned).toContain('- V2-CTA-1 on home_strength_today ("כפתור צף")');
    expect(buildLearningSection({ suppressed: [], clarifications: [] })).toBe('');
  });

  it('the checklist lists owner rules BEFORE the generic rules, learning after scoring', () => {
    const txt = buildDesignChecklist({ ownerRules: fileRules, learning: buildLearning([dis(), dis({ findingId: 'b' })]) });
    expect(txt.indexOf('## Owner rules')).toBe(0);
    expect(txt.indexOf('## Owner rules')).toBeLessThan(txt.indexOf('## Design checklist'));
    expect(txt.indexOf('## Score every screen')).toBeLessThan(txt.indexOf('## Learned from'));
    expect(buildDesignChecklist({}).startsWith('## Design checklist')).toBe(true);
  });

  it('the system prompt carries owner rules + learning, stays deterministic, and findings may cite OWN ids', () => {
    const { personas, missions } = loadPersonasAndMissions();
    const m = missions.find((x) => x.id === 'D09_map_routes')!;
    const owner = { rules: mergeOwnerRules(fileRules, [{ id: 'OWN-101', text: 'הערה מהפאנל', screen: 'map', severity: 'P1' as const, createdAtMs: 1 }]), learning: buildLearning([dis(), dis({ findingId: 'b' })]) };
    const p1 = buildSystemPrompt(personas.get(m.persona)!, m, { deviceId: 'iphone-13', owner });
    expect(p1).toContain('★ OWN-004'); // map scope
    expect(p1).toContain('★ OWN-101');
    expect(p1).toContain('LAY-OVERLAP on home_strength_today');
    expect(p1.indexOf('## Owner rules')).toBeLessThan(p1.indexOf('## Design checklist'));
    expect(buildSystemPrompt(personas.get(m.persona)!, m, { deviceId: 'iphone-13', owner })).toBe(p1);
    const ids = new Set([...Array.from(RULE_IDS), 'OWN-004', 'OWN-101']);
    expect(parseToolCall('report_finding', { category: 'ux', severity: 'P1', rule: 'OWN-101', title: 't', expected: 'e', actual: 'a', confidence: 1 }, ids)).toMatchObject({ ok: true, call: { rule: 'OWN-101' } });
    // without this run's owner ids an OWN id is dropped like any unknown id
    expect(parseToolCall('report_finding', { category: 'ux', severity: 'P1', rule: 'OWN-101', title: 't', expected: 'e', actual: 'a', confidence: 1 })).toMatchObject({ ok: true, call: { rule: null } });
  });

  it('the runner status carries the owner doc (empty before the function is redeployed)', () => {
    expect(parseStatus({}).ownerRules).toEqual({ notes: [], dismissals: [] });
    const s = parseStatus({ ownerRules: { notes: [{ id: 'OWN-101', text: 'הערה', severity: 'P1' }], dismissals: [dis()] } });
    expect(s.ownerRules.notes.map((n) => n.id)).toEqual(['OWN-101']);
    expect(s.ownerRules.dismissals).toHaveLength(1);
  });
});
