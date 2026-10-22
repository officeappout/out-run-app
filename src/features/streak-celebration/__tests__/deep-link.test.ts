import { describe, expect, it } from 'vitest';
import { parseCelebrateParam, stripCelebrateParam } from '../core/deep-link';

describe('parseCelebrateParam', () => {
  it('accepts ?celebrate=streak with or without the "?"', () => {
    expect(parseCelebrateParam('?celebrate=streak')).toBe(true);
    expect(parseCelebrateParam('celebrate=streak')).toBe(true);
    expect(parseCelebrateParam('?tab=1&celebrate=STREAK')).toBe(true);
  });
  it('rejects anything else', () => {
    expect(parseCelebrateParam('')).toBe(false);
    expect(parseCelebrateParam(null)).toBe(false);
    expect(parseCelebrateParam('?celebrate=steps')).toBe(false);
    expect(parseCelebrateParam('?streak=celebrate')).toBe(false);
    expect(parseCelebrateParam('?celebrate=')).toBe(false);
  });
});

describe('stripCelebrateParam', () => {
  it('removes only the celebrate param', () => {
    expect(stripCelebrateParam('/home', '?celebrate=streak')).toBe('/home');
    expect(stripCelebrateParam('/home', '?a=1&celebrate=streak&b=2', '#x')).toBe('/home?a=1&b=2#x');
  });
});
