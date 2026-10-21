import { describe, it, expect } from 'vitest';
import { backResultText, classifyBack, hasAppHistory, isMidFlowPath, planBack, type BackSnapshot } from '../lib/android-back';
import { APP_HOSTS } from '../lib/config';
import { parseToolCall } from '../lib/tool-input';
import { TOOL_NAMES } from '../lib/tools';
import { buildSystemPrompt } from '../lib/prompt';
import { loadPersonasAndMissions } from '../lib/files';

const snap = (p: Partial<BackSnapshot> = {}): BackSnapshot => ({
  url: 'https://outrun.co.il/home', host: 'outrun.co.il', path: '/home', dialogs: 0, textLen: 500, sig: 'בית', prevPath: '/map', canGoBack: true, ...p,
});

describe('android back — plan', () => {
  it('sheet open → Escape; app history → history.back; first app screen → none', () => {
    expect(planBack(snap({ dialogs: 1 }))).toBe('escape');
    expect(planBack(snap())).toBe('history');
    expect(planBack(snap({ prevPath: '/qa/signin' }))).toBe('none');
    expect(planBack(snap({ canGoBack: false, prevPath: null }))).toBe('none');
    expect(hasAppHistory({ prevPath: null, canGoBack: null })).toBe(false);
  });
  it('mid-flow paths', () => {
    expect(isMidFlowPath('/onboarding-new/step')).toBe(true);
    expect(isMidFlowPath('/workouts/abc/active')).toBe(true);
    expect(isMidFlowPath('/home')).toBe(false);
    expect(isMidFlowPath('/running-club')).toBe(false);
  });
});

describe('android back — classify', () => {
  const c = (b: Partial<BackSnapshot>, a: Partial<BackSnapshot> | null) => classifyBack(snap(b), a ? snap(a) : null, APP_HOSTS);
  it('good outcomes', () => {
    expect(c({ dialogs: 1 }, { dialogs: 0 })).toMatchObject({ kind: 'sheet_closed', ok: true });
    expect(c({ path: '/map' }, { path: '/home' })).toMatchObject({ kind: 'went_back', ok: true });
    expect(c({ path: '/onboarding-new', sig: 'שאלה 3' }, { path: '/onboarding-new', sig: 'שאלה 2' })).toMatchObject({ kind: 'step_back', ok: true });
    expect(c({ path: '/home', prevPath: '/qa/signin' }, null)).toMatchObject({ kind: 'exit_at_root', ok: true });
  });
  it('wrong outcomes, worst first', () => {
    expect(c({ path: '/onboarding-new', prevPath: '/qa/signin' }, null)).toMatchObject({ kind: 'would_exit_app', ok: false, severity: 'P1', midFlow: true });
    expect(c({ path: '/progress', prevPath: null, canGoBack: false }, null)).toMatchObject({ kind: 'would_exit_app', severity: 'P2' });
    expect(c({}, { host: 'accounts.google.com', url: 'https://accounts.google.com/' })).toMatchObject({ kind: 'left_app', severity: 'P1' });
    expect(c({}, { url: 'https://outrun.co.il/qa/signin', path: '/qa/signin' })).toMatchObject({ kind: 'left_app' });
    expect(c({ path: '/map' }, { path: '/home', textLen: 3 })).toMatchObject({ kind: 'blank_page', severity: 'P1' });
    expect(c({ dialogs: 1, path: '/map' }, { dialogs: 1, path: '/home' })).toMatchObject({ kind: 'went_back', ok: false, severity: 'P2' });
    expect(c({ dialogs: 1 }, { dialogs: 1 })).toMatchObject({ kind: 'sheet_stayed', ok: false, confidence: 0.5 });
    expect(c({}, {})).toMatchObject({ kind: 'no_change', ok: false, severity: 'P3' });
  });
  it('result text for the model', () => {
    expect(backResultText(c({ dialogs: 1 }, { dialogs: 0 }))).toMatch(/^back_button → sheet_closed \(ok\)/);
    expect(backResultText(c({}, {}))).toMatch(/WRONG, P3/);
  });
});

describe('android back — tool + prompt', () => {
  it('is a tool with no input', () => {
    expect(TOOL_NAMES.has('back_button')).toBe(true);
    expect(parseToolCall('back_button', { anything: 1 })).toEqual({ ok: true, call: { name: 'back_button' } });
  });
  it('sweeps on the Android phone get the back check; other phones and opted-out sweeps do not', () => {
    const { personas, missions } = loadPersonasAndMissions();
    const m = missions.find((x) => x.id === 'D01_onboard_strength')!;
    const p = personas.get(m.persona)!;
    expect(buildSystemPrompt(p, m, { deviceId: 'android-small' })).toMatch(/## Android back check/);
    expect(buildSystemPrompt(p, m, { deviceId: 'iphone-13' })).not.toMatch(/Android back check/);
    expect(buildSystemPrompt(p, { ...m, androidBack: false }, { deviceId: 'android-small' })).not.toMatch(/Android back check/);
    const journey = missions.find((x) => x.kind !== 'design-sweep')!;
    expect(buildSystemPrompt(personas.get(journey.persona)!, journey, { deviceId: 'android-small' })).not.toMatch(/Android back check/);
  });
});
