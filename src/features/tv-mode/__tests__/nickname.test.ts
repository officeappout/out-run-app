import { describe, expect, it } from 'vitest';
import { TV_NICKNAME_MAX } from '../core/constants';
import { checkNickname, normalizeNickname } from '../core/nickname';

describe('guest nickname', () => {
  it('trims and squeezes whitespace', () => {
    expect(normalizeNickname('  גיא   הגדול \n')).toBe('גיא הגדול');
  });
  it('accepts letters of any script, marks (niqqud), digits and . _ \' -', () => {
    for (const ok of ['דני', 'שָׁלוֹם', 'Dana-Lee', "O'Neil", 'Анна', 'nick_7', 'a', 'x.y', 'ב'.repeat(TV_NICKNAME_MAX)]) {
      expect(checkNickname(ok), ok).toEqual({ ok: true, value: ok });
    }
  });
  it('refuses empty, over-long, and anything outside the charset', () => {
    expect(checkNickname('   ')).toEqual({ ok: false, reason: 'empty' });
    expect(checkNickname('ב'.repeat(TV_NICKNAME_MAX + 1))).toEqual({ ok: false, reason: 'too-long' });
    for (const bad of ['<b>x</b>', 'hi 😀', 'a/b', 'a\\b', '@home', 'x#1', '"q"']) {
      expect(checkNickname(bad), bad).toEqual({ ok: false, reason: 'charset' });
    }
  });
  it('counts characters, not UTF-16 units (an astral letter is one)', () => {
    expect(checkNickname('𠀀'.repeat(TV_NICKNAME_MAX))).toMatchObject({ ok: true });
    expect(checkNickname('𠀀'.repeat(TV_NICKNAME_MAX + 1))).toMatchObject({ ok: false, reason: 'too-long' });
  });
  it('is idempotent on its own output', () => {
    const r = checkNickname('  גיא   הגדול ');
    expect(r.ok && checkNickname(r.value)).toEqual(r);
  });
});
