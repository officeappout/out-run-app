import { describe, expect, it } from 'vitest';
import { computeWideLayout, isWideLayout, wideScale, WIDE_OFF } from '../wide-layout-logic';
import { wideIntentForKey } from '../wide-keys';
import { resolveWideAction, type WideKeyContext } from '../../../strength/logic/wide-key-actions';

describe('isWideLayout', () => {
  it('portrait phone / portrait tablet are not wide', () => {
    expect(isWideLayout({ width: 390, height: 844 })).toBe(false);
    expect(isWideLayout({ width: 768, height: 1024 })).toBe(false);
    expect(isWideLayout({ width: 899, height: 900 })).toBe(false);
  });
  it('width >= 900 is wide, even portrait', () => {
    expect(isWideLayout({ width: 900, height: 1200 })).toBe(true);
    expect(isWideLayout({ width: 1920, height: 1080 })).toBe(true);
    expect(isWideLayout({ width: 3840, height: 2160 })).toBe(true);
  });
  it('landscape under 700px high is wide', () => {
    expect(isWideLayout({ width: 844, height: 390 })).toBe(true);
    expect(isWideLayout({ width: 699, height: 360 })).toBe(true);
    expect(isWideLayout({ width: 880, height: 700 })).toBe(false); // landscape but not short
  });
  it('unmeasured is not wide', () => {
    expect(isWideLayout({ width: 0, height: 0 })).toBe(false);
    expect(computeWideLayout({ width: 0, height: 800 })).toBe(WIDE_OFF);
  });
});

describe('wideScale', () => {
  it('stays proportional and clamped', () => {
    const phone = wideScale({ width: 844, height: 390 });
    const hd = wideScale({ width: 1920, height: 1080 });
    const uhd = wideScale({ width: 3840, height: 2160 });
    expect(phone).toBeGreaterThanOrEqual(0.6);
    expect(phone).toBeLessThan(hd);
    expect(hd).toBeLessThan(uhd);
    expect(uhd).toBeLessThanOrEqual(4.5);
    expect(computeWideLayout({ width: 1920, height: 1080 })).toEqual({ wide: true, scale: hd });
  });
});

describe('wideIntentForKey', () => {
  it('maps the four keys', () => {
    expect(wideIntentForKey({ key: ' ' })).toBe('primary');
    expect(wideIntentForKey({ key: 'ArrowRight' })).toBe('next');
    expect(wideIntentForKey({ key: 'ArrowLeft' })).toBe('back');
    expect(wideIntentForKey({ key: 'Escape' })).toBe('minimize');
    expect(wideIntentForKey({ key: 'a' })).toBeNull();
  });
  it('leaves typing, modifiers and focused buttons alone', () => {
    expect(wideIntentForKey({ key: ' ', target: { tag: 'INPUT' } })).toBeNull();
    expect(wideIntentForKey({ key: ' ', target: { tag: 'DIV', editable: true } })).toBeNull();
    expect(wideIntentForKey({ key: ' ', target: { tag: 'BUTTON' } })).toBeNull();
    expect(wideIntentForKey({ key: 'ArrowLeft', metaKey: true })).toBeNull();
    expect(wideIntentForKey({ key: 'ArrowRight', target: { tag: 'BUTTON' } })).toBe('next');
  });
});

describe('resolveWideAction', () => {
  const base: WideKeyContext = { workoutState: 'ACTIVE', clockDriven: false, minimized: false, paused: false, blocked: false };
  it('reps set: Space and → complete', () => {
    expect(resolveWideAction('primary', base)).toBe('complete');
    expect(resolveWideAction('next', base)).toBe('complete');
  });
  it('clock-driven: Space pauses, → does nothing', () => {
    const c = { ...base, clockDriven: true };
    expect(resolveWideAction('primary', c)).toBe('togglePause');
    expect(resolveWideAction('next', c)).toBeNull();
  });
  it('rest: → skips, Space pauses', () => {
    const c = { ...base, workoutState: 'RESTING' };
    expect(resolveWideAction('next', c)).toBe('skipRest');
    expect(resolveWideAction('primary', c)).toBe('togglePause');
  });
  it('back opens exit confirm, Esc minimizes, minimized expands', () => {
    expect(resolveWideAction('back', base)).toBe('exitConfirm');
    expect(resolveWideAction('minimize', base)).toBe('minimize');
    expect(resolveWideAction('minimize', { ...base, minimized: true })).toBe('expand');
    expect(resolveWideAction('next', { ...base, minimized: true })).toBeNull();
  });
  it('paused: only Space (resume); blocked: nothing', () => {
    expect(resolveWideAction('primary', { ...base, paused: true })).toBe('togglePause');
    expect(resolveWideAction('next', { ...base, paused: true })).toBeNull();
    expect(resolveWideAction('primary', { ...base, blocked: true })).toBeNull();
  });
});
