import { describe, it, expect } from 'vitest';
import { RULES, RULE_IDS, DESIGN_RULE_IDS } from '../lib/checklist';
import { buildDesignChecklist, buildRuleSections, buildScoringSection } from '../lib/design/checklist-builder';
import { decodeScores, encodeScores, lowDimensions, normalizeScreenId, overallScore, parseScores, SCORE_RULE_ID } from '../lib/design/dimensions';
import { checkpointsFrom, missionUids, parseMissionRef, uidFor, validateSweepFields } from '../lib/design/checkpoints';
import { buildScoreFinding, screenKey, scoreAck, scoresOf, withScreen } from '../lib/design/score-finding';
import { aggregateScreens, isDesignFinding, sweepCoverage } from '../lib/overseer/design-aggregate';
import { buildDesignReport, buildDesignSummary } from '../lib/overseer/design-report';
import { splitFindings } from '../lib/overseer/split';
import { clusterFindings } from '../lib/overseer/cluster';
import { buildReport } from '../lib/overseer/report';
import { parseToolCall } from '../lib/tool-input';
import { planRun } from '../lib/plan';
import { buildSystemPrompt } from '../lib/prompt';
import { loadPersonasAndMissions } from '../lib/files';
import { keyboardViewport } from '../lib/keyboard-sim';
import { TOOLS } from '../lib/tools';
import type { Finding } from '../lib/findings';
import type { Mission } from '../lib/missions';

const f = (p: Partial<Finding> = {}): Finding => ({
  id: 'x', fingerprint: Math.random().toString(16).slice(2, 12), runId: 'qa-1', mission: 'D04_home_states', persona: 'noa_designer', device: 'iphone-13', cohort: 'v2', url: '/home', route: '/home', step: 3,
  category: 'design-rule', severity: 'P2', rule: 'LAY-SPACING', title: 'ריווח לא אחיד', expected: 'ריווח 16px', actual: 'הכרטיס צמוד לקצה', screenshot: 'qa/qa-1/D04_home_states/003-abcdef12.png',
  repro: [{ name: 'tap', ref: 'e3' }], confidence: 0.8, source: 'llm', count: 1, createdAtMs: 0, ...p,
});
const base = (p: Partial<Finding> = {}) => {
  const { id, fingerprint, category, severity, rule, title, expected, actual, screenshot, confidence, source, ...b } = f(p);
  void id; void fingerprint; void category; void severity; void rule; void title; void expected; void actual; void screenshot; void confidence; void source;
  return b;
};
const score = (screen: string, s: [number, number, number, number], p: Partial<Finding> = {}) =>
  ({ ...buildScoreFinding(base(p), screen, { clarity: s[0], consistency: s[1], density: s[2], rtl: s[3] }, 'הערה'), screenshot: 'qa/qa-1/D04_home_states/004-12345678.png' });

describe('design checklist builder', () => {
  it('covers every rule once, grouped by area, with focus stars', () => {
    const txt = buildRuleSections({ focus: ['V2-MIXED-GEN'] });
    for (const r of RULES) expect(txt.split(`${r.id}:`).length - 1).toBe(1);
    expect(txt).toMatch(/### Buttons — one gradient CTA per screen/);
    expect(txt).toMatch(/★ V2-MIXED-GEN/);
    expect(txt).not.toMatch(/★ V2-CTA-1/);
  });
  it('derives the brief topics: tokens, CTA, tint, labels, 11px, 44px, sheets, RTL, spacing, overlap, cut text, safe area, keyboard, empty, loading, contrast, icons, v1/v2', () => {
    for (const id of ['V2-TOKENS', 'V2-CTA-1', 'V2-SELECTED-TINT', 'V2-NOWRAP', 'V2-FONT-11', 'MOB-TARGET-44', 'V2-SHEET', 'RTL-ALIGN', 'LAY-SPACING', 'LAY-OVERLAP', 'LAY-CUT-TEXT', 'MOB-SAFE-AREA', 'MOB-KEYBOARD', 'STATE-EMPTY', 'STATE-LOADING', 'A11Y-CONTRAST', 'V2-ICONS', 'V2-MIXED-GEN', 'RUN-NO-PACE-400', 'SUM-MAP-BEHIND']) {
      expect(RULE_IDS.has(id)).toBe(true);
    }
    for (const r of RULES) expect(r.id).toMatch(/^[A-Z0-9-]{2,30}$/); // the function's sanitiser
    expect(DESIGN_RULE_IDS.has('STAB-CONSOLE')).toBe(false);
    expect(RULE_IDS.has(SCORE_RULE_ID)).toBe(false);
  });
  it('scoring section: 4 dimensions, the ≤3 → finding contract, the phone', () => {
    const s = buildScoringSection('iPhone SE, 375×667');
    for (const d of ['clarity', 'consistency', 'density', 'rtl']) expect(s).toContain(`- ${d}:`);
    expect(s).toMatch(/3 or lower, also call report_finding/);
    expect(s).toContain('iPhone SE, 375×667');
  });
  it('is deterministic', () => {
    expect(buildDesignChecklist({ focus: ['V2-CTA-1'] })).toBe(buildDesignChecklist({ focus: ['V2-CTA-1'] }));
  });
});

describe('scores', () => {
  it('parse, clamp, overall, low dims', () => {
    expect(parseScores({ clarity: 4, consistency: 2.6, density: 9, rtl: 0 })).toEqual({ clarity: 4, consistency: 3, density: 5, rtl: 1 });
    expect(parseScores({ clarity: 4 })).toBeNull();
    expect(overallScore({ clarity: 4, consistency: 3, density: 4, rtl: 5 })).toBe(4);
    expect(lowDimensions({ clarity: 4, consistency: 3, density: 2, rtl: 5 })).toEqual(['consistency', 'density']);
  });
  it('encode/decode round-trips through `actual`', () => {
    const s = { clarity: 2, consistency: 3, density: 4, rtl: 5 };
    expect(decodeScores(encodeScores(s, ' כפתור חתוך '))).toEqual({ scores: s, notes: 'כפתור חתוך' });
    expect(decodeScores('just text')).toBeNull();
    expect(encodeScores(s, 'x'.repeat(900)).length).toBeLessThanOrEqual(600);
  });
  it('screen ids normalise to snake_case', () => {
    expect(normalizeScreenId('Home – Strength')).toBe('home_strength');
    expect(normalizeScreenId('בית')).toBeNull();
    expect(normalizeScreenId(3)).toBeNull();
  });
  it('a score finding carries the screen marker and passes the sanitiser shapes', () => {
    const sf = score('home_future_day', [4, 2, 4, 5]);
    expect(sf.rule).toBe(SCORE_RULE_ID);
    expect(sf.fingerprint).toMatch(/^[a-f0-9]{8,40}$/);
    expect(screenKey(sf)).toBe('home_future_day');
    expect(scoresOf(sf)).toEqual({ clarity: 4, consistency: 2, density: 4, rtl: 5 });
    for (const step of sf.repro) for (const k of Object.keys(step)) expect(k).toMatch(/^[a-z_]{1,20}$/);
    expect(scoreAck('home_future_day', { clarity: 4, consistency: 2, density: 4, rtl: 5 })).toMatch(/report_finding.*consistency/);
    expect(scoreAck('x_y', { clarity: 5, consistency: 5, density: 4, rtl: 4 })).not.toMatch(/report_finding/);
  });
  it('withScreen keeps ≤ 25 steps and one marker', () => {
    const many = Array.from({ length: 40 }, (_, i) => ({ name: 'tap', ref: `e${i}` }));
    const r = withScreen([...many, { name: 'screen', screen: 'old' }], 'new_one');
    expect(r).toHaveLength(25);
    expect(r.filter((x) => x.name === 'screen')).toEqual([{ name: 'screen', screen: 'new_one' }]);
    expect(withScreen(many, null)).toHaveLength(25);
  });
});

describe('tools', () => {
  it('score_screen and keyboard parse; report_finding takes a screen', () => {
    expect(TOOLS.map((t) => t.name)).toEqual(expect.arrayContaining(['score_screen', 'keyboard']));
    const ok = parseToolCall('score_screen', { screen: 'Map Route Drawer', clarity: 3, consistency: 4, density: 2, rtl: 5, notes: 'צפוף' });
    expect(ok).toMatchObject({ ok: true, call: { name: 'score_screen', screen: 'map_route_drawer', scores: { density: 2 } } });
    expect(parseToolCall('score_screen', { screen: 'map', clarity: 3 }).ok).toBe(false);
    expect(parseToolCall('keyboard', { state: 'open' })).toEqual({ ok: true, call: { name: 'keyboard', state: 'open' } });
    expect(parseToolCall('keyboard', { state: 'up' }).ok).toBe(false);
    const rf = parseToolCall('report_finding', { category: 'design-rule', severity: 'P2', title: 't', expected: 'e', actual: 'a', confidence: 1, rule: 'LAY-OVERLAP', screen: 'map' });
    expect(rf).toMatchObject({ ok: true, call: { rule: 'LAY-OVERLAP', screen: 'map' } });
  });
  it('the keyboard shrinks the viewport by ~40%', () => {
    expect(keyboardViewport({ width: 375, height: 667 })).toEqual({ width: 375, height: 400 });
  });
});

describe('sweep missions', () => {
  const { missions, personas } = loadPersonasAndMissions();
  const sweeps = missions.filter((m) => m.kind === 'design-sweep');
  it('every sweep is bounded (≤ 40 steps), on SE / 13 / Pro Max, with checkpoints', () => {
    expect(sweeps.length).toBeGreaterThanOrEqual(12);
    for (const m of sweeps) {
      expect(m.budget.maxSteps).toBeLessThanOrEqual(40);
      expect(m.devices).toEqual(['iphone-se', 'iphone-13', 'iphone-15-pro-max']);
      expect(m.checkpoints!.length).toBeGreaterThan(0);
    }
    const all = new Set(sweeps.flatMap((m) => m.checkpoints!.map((c) => c.id)));
    for (const id of ['home_new_user', 'home_run', 'home_walk', 'home_after_workout', 'home_future_day', 'map_route_drawer', 'map_route_overview', 'strength_player', 'run_player', 'walk_player', 'strength_summary', 'run_summary', 'walk_summary', 'agenda', 'progress', 'progress_compare', 'exercise_page', 'profile', 'profile_records', 'community_groups', 'group_chat', 'onb_profile_keyboard', 'onb_run_pace_keyboard', 'onb_walk_keyboard', 'settings']) {
      expect(all.has(id)).toBe(true);
    }
  });
  it('validation rejects an over-budget sweep and bad checkpoints', () => {
    const e: string[] = [];
    validateSweepFields({ kind: 'design-sweep', budget: { maxSteps: 50 }, checkpoints: [{ id: 'A', screen: 'x', how: 'short' }] }, e);
    expect(e.join()).toMatch(/checkpoints.*maxSteps|maxSteps.*checkpoints/);
  });
  it('per-device uids, refs, checkpointsFrom', () => {
    const m = { uid: 'demo_qa_ds_run', device: 'iphone-13', devices: ['iphone-se', 'iphone-13'], uidPerDevice: true };
    expect(uidFor(m, 'iphone-se')).toBe('demo_qa_ds_run_se');
    expect(missionUids(m)).toEqual(['demo_qa_ds_run_se', 'demo_qa_ds_run_i13']);
    expect(parseMissionRef('D06_run_player@run_summary')).toEqual({ id: 'D06_run_player', checkpoint: 'run_summary' });
    expect(parseMissionRef('M01')).toEqual({ id: 'M01', checkpoint: null });
    const cps = [{ id: 'a', screen: 'א', how: 'הגיעי' }, { id: 'b', screen: 'ב', how: 'הגיעי' }];
    expect(checkpointsFrom(cps, 'b')!.map((c) => c.id)).toEqual(['b']);
    expect(checkpointsFrom(cps, 'zz')).toBeNull();
  });
  it('plan: sweeps only on request, filtered by device, resumable', () => {
    const roster = new Set(missions.flatMap(missionUids));
    expect(planRun(missions, { missions: null, device: 'iphone-13', maxSessions: 8 }, roster).sessions.every((s) => s.mission.kind !== 'design-sweep')).toBe(true);
    const sweep = planRun(missions, { missions: ['sweep'], device: 'iphone-se', maxSessions: 3 }, roster);
    expect(sweep.sessions.map((s) => s.mission.id)).toEqual(['D01_onboard_strength', 'D02_onboard_run', 'D03_onboard_walk']);
    expect(sweep.sessions[0].uid).toBe('demo_qa_ds_strength_se');
    expect(sweep.skipped.every((s) => s.reason === 'over_session_cap')).toBe(true);
    const all3 = planRun(missions, { missions: ['D09_map_routes'], device: null, maxSessions: 8 }, roster);
    expect(all3.sessions.map((s) => s.device)).toEqual(['iphone-se', 'iphone-13', 'iphone-15-pro-max']);
    const resumed = planRun(missions, { missions: ['D09_map_routes@map', 'D09_map_routes@nope'], device: 'iphone-13', maxSessions: 8 }, roster);
    expect(resumed.sessions[0]).toMatchObject({ resumeFrom: 'map', mission: { start: '/map' } });
    expect(resumed.skipped).toEqual([{ id: 'D09_map_routes@nope', reason: 'unknown_checkpoint' }]);
    expect(planRun(missions, { missions: ['D09_map_routes'], device: 'android-small', maxSessions: 8 }, roster).skipped[0].reason).toBe('device_not_in_mission');
  });
  it('the sweep prompt lists checkpoints, the phone and the scoring contract; resume starts later', () => {
    const m = missions.find((x) => x.id === 'D09_map_routes')!;
    const p = personas.get(m.persona)!;
    const full = buildSystemPrompt(p, m, { deviceId: 'iphone-se' });
    expect(full).toMatch(/DESIGN SWEEP/);
    expect(full).toContain('iPhone SE, 375×667');
    expect(full).toMatch(/1\. map — /);
    expect(full).toMatch(/score_screen/);
    const res = buildSystemPrompt(p, m, { deviceId: 'iphone-se', resumeFrom: 'map_route_overview' });
    expect(res).not.toMatch(/\d\. map_route_drawer — /);
    expect(res).toMatch(/1\. map_route_overview — /);
    expect(buildSystemPrompt(p, m, { deviceId: 'iphone-se' })).toBe(full);
  });
});

describe('overseer — design aggregation', () => {
  const fs: Finding[] = [
    score('home_future_day', [4, 2, 3, 5]),
    score('home_future_day', [4, 4, 3, 5], { device: 'iphone-se' }),
    f({ repro: withScreen([], 'home_future_day'), rule: 'V2-MIXED-GEN', severity: 'P2', title: 'כרטיס ישן' }),
    f({ repro: withScreen([], 'home_future_day'), rule: 'MOB-TARGET-44', category: 'a11y', severity: 'P3', source: 'lint', confidence: 1 }),
    score('map', [5, 5, 4, 5]),
    score('agenda', [3, 4, 4, 4]), // low, but no finding filed
    f({ route: '/profile', rule: null, category: 'design-rule', severity: 'P1', title: 'כותרת חתוכה' }), // no screen → route
    f({ rule: 'STAB-CONSOLE', category: 'broken', severity: 'P1' }), // not design
  ];
  const { issues, scores } = splitFindings(fs);
  const rows = aggregateScreens(issues, scores, new Map([['home_future_day', 'בית — יום עתידי']]));

  it('splits scores from issues (scores never become clusters)', () => {
    expect(scores).toHaveLength(4);
    expect(issues).toHaveLength(4);
    expect(clusterFindings(issues).some((c) => c.rule === SCORE_RULE_ID)).toBe(false);
  });
  it('groups by screen, averages per dimension and per device, worst first', () => {
    expect(rows.map((r) => r.screen)).toEqual(['home_future_day', 'agenda', 'map', '/profile']);
    const home = rows[0];
    expect(home).toMatchObject({ label: 'בית — יום עתידי', samples: 2, scores: { clarity: 4, consistency: 3, density: 3, rtl: 5 }, overall: 3.8, worst: 'P2' });
    expect(home.byDevice).toEqual({ 'iphone-13': 3.5, 'iphone-se': 4 });
    expect(home.minScores!.consistency).toBe(2);
    expect(home.findings).toHaveLength(2);
    expect(home.topRules.map((t) => t.rule).sort()).toEqual(['MOB-TARGET-44', 'V2-MIXED-GEN']);
    expect(home.lowWithoutFinding).toBe(false);
    expect(rows[1]).toMatchObject({ screen: 'agenda', lowWithoutFinding: true });
    expect(rows[3]).toMatchObject({ screen: '/profile', overall: null, worst: 'P1' });
  });
  it('design findings exclude runtime errors', () => {
    expect(isDesignFinding({ rule: 'STAB-CONSOLE', category: 'broken' })).toBe(false);
    expect(isDesignFinding({ rule: null, category: 'copy' })).toBe(true);
    expect(isDesignFinding({ rule: 'HEALTH-ONCE', category: 'ux' })).toBe(false);
  });
  it('coverage: covered / missing checkpoints and the resume ref per device', () => {
    const missions = [
      { id: 'D04_home_states', kind: 'design-sweep', device: 'iphone-13', devices: ['iphone-se', 'iphone-13'], checkpoints: [{ id: 'home_strength_today', screen: 'א', how: 'הגיעי' }, { id: 'home_future_day', screen: 'ב', how: 'הגיעי' }] },
      { id: 'D09_map_routes', kind: 'design-sweep', device: 'iphone-13', devices: ['iphone-13'], checkpoints: [{ id: 'map', screen: 'מפה', how: 'הגיעי' }] },
      { id: 'D10_progress', kind: 'design-sweep', device: 'iphone-13', devices: ['iphone-13'], checkpoints: [{ id: 'progress', screen: 'התקדמות', how: 'הגיעי' }] },
    ] as unknown as Mission[];
    const mapScore = score('map', [5, 5, 5, 5], { mission: 'D09_map_routes' });
    const cov = sweepCoverage(missions, [...scores, mapScore], []);
    expect(cov.find((c) => c.mission === 'D04_home_states' && c.device === 'iphone-13')).toMatchObject({ covered: ['home_future_day'], missing: ['home_strength_today'], resume: 'D04_home_states@home_strength_today' });
    expect(cov.find((c) => c.mission === 'D09_map_routes')).toMatchObject({ resume: null });
    expect(cov.find((c) => c.mission === 'D10_progress')).toMatchObject({ resume: 'D10_progress' }); // never ran
  });
  it('the Hebrew design report has the score table, device table, details and coverage', () => {
    const cov = [{ mission: 'D04_home_states', device: 'iphone-13', total: 2, covered: ['home_future_day'], missing: ['home_strength_today'], resume: 'D04_home_states@home_strength_today' }];
    const md = buildDesignReport('qa-1', rows, cov);
    expect(md).toMatch(/^# דוח עיצוב — qa-1/);
    expect(md).toMatch(/\| מסך \| ציון \| בהירות \| עקביות v2 \| צפיפות \| RTL \|/);
    expect(md).toMatch(/בית — יום עתידי \(`home_future_day`\) \| 3\.8 \| 4\.0 \| \*\*3\.0\*\*/);
    expect(md).toMatch(/## לפי גודל מסך/);
    expect(md).toMatch(/ציון נמוך בלי ממצא/);
    expect(md).toMatch(/D04_home_states@home_strength_today/);
    expect(md).toMatch(/V2-MIXED-GEN/);
  });
  it('summary design block: counts, worst screens, resume refs', () => {
    const d = buildDesignSummary(rows, [{ mission: 'D04', device: 'iphone-13', total: 2, covered: [], missing: ['a'], resume: 'D04' }]);
    expect(d).toMatchObject({ screensScored: 3, lowScreens: 0, findings: 3, resume: ['D04'] });
    expect(d.avgScore).toBeCloseTo(4.1, 1);
    expect(d.screens[0]).toMatchObject({ screen: 'home_future_day', score: 3.8, consistency: 3, findings: 2, worst: 'P2', topRule: expect.any(String) });
  });
  it('the main report hides screen markers in repro lines', () => {
    const md = buildReport('qa-1', issues, clusterFindings(issues), []);
    expect(md).not.toMatch(/screen\(/);
  });
});
