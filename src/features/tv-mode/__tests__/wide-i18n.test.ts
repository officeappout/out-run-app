/**
 * Namespace `wide` (TV mode): ICU counts (Hebrew plural), host-gender select, Intl numbers,
 * placeholder hygiene and the key prefixes the brief fixed (pair / remote / lost / lobby).
 */
import { describe, expect, it } from 'vitest';
import he from '@/messages/he/wide.json';
import { wide } from '@/messages/ns/wide';
import { makeT } from '@/lib/i18n/t';

const t = makeT('he', wide);

describe('wide catalog shape', () => {
  it('uses the agreed prefixes only', () => {
    const prefixes = new Set(Object.keys(he).map((k) => k.split('.')[0]));
    expect(Array.from(prefixes).sort()).toEqual(['download', 'joined', 'lobby', 'lost', 'pair', 'remote', 'stage']);
  });
  it('has no empty strings and no leftover placeholders without a value', () => {
    for (const [k, v] of Object.entries(he)) {
      expect(v.trim().length, k).toBeGreaterThan(0);
      expect(v, k).not.toMatch(/\{\s*\}/);
    }
  });
  it('every other locale file exists (empty = falls back to Hebrew)', async () => {
    for (const l of ['en', 'ru', 'de']) {
      const mod = (await import(`@/messages/${l}/wide.json`)) as { default: Record<string, string> };
      expect(typeof mod.default).toBe('object');
    }
  });
});

describe('participant counts (ICU plural)', () => {
  it('lobby.count', () => {
    expect(t('lobby.count', { n: 1 })).toBe('משתתף אחד');
    expect(t('lobby.count', { n: 2 })).toBe('שני משתתפים');
    expect(t('lobby.count', { n: 3 })).toBe('3 משתתפים');
    expect(t('lobby.count', { n: 12 })).toBe('12 משתתפים');
  });
  it('remote.host.joined covers zero', () => {
    expect(t('remote.host.joined', { n: 0 })).toBe('עדיין אף אחד לא הצטרף');
    expect(t('remote.host.joined', { n: 1 })).toBe('משתתף אחד הצטרף');
    expect(t('remote.host.joined', { n: 2 })).toBe('שני משתתפים הצטרפו');
    expect(t('remote.host.joined', { n: 4 })).toBe('4 משתתפים הצטרפו');
  });
  it('joined.count matches the lobby wording', () => {
    for (const n of [1, 2, 5]) expect(t('joined.count', { n })).toBe(t('lobby.count', { n }));
  });
  it('the 4-hour note is a plural too', () => {
    expect(t('pair.tv.valid', { hours: 4 })).toBe('הקוד תקף ל־4 שעות');
    expect(t('pair.tv.valid', { hours: 2 })).toBe('הקוד תקף לשעתיים');
    expect(t('pair.tv.valid', { hours: 1 })).toBe('הקוד תקף לשעה אחת');
  });
});

describe('gender via select (host)', () => {
  it('female / male host, neutral when unknown', () => {
    expect(t('lobby.waitingHost', { hostGender: 'female' })).toBe('ממתינים שהמארחת תתחיל');
    expect(t('lobby.waitingHost', { hostGender: 'male' })).toBe('ממתינים שהמארח יתחיל');
    expect(t('lobby.waitingHost', { hostGender: 'other' })).toBe('ממתינים להתחלת האימון');
    expect(t('joined.waiting', { hostGender: 'other' })).toBe('ממתינים להתחלת האימון');
  });
  it('a select never leaves `other` as the masculine form', () => {
    for (const [k, v] of Object.entries(he)) {
      if (!v.includes('hostGender, select')) continue;
      expect(v, k).toMatch(/male \{/);
      expect(v, k).toMatch(/other \{/);
    }
  });
});

describe('Intl numbers and interpolation', () => {
  it('sets and reps are formatted by the formatter, not concatenated', () => {
    expect(t('remote.setOf', { set: 3, total: 5 })).toBe('סט 3 מתוך 5');
    expect(t('remote.target.reps', { min: 8, max: 12 })).toBe('יעד: 8–12 חזרות');
    expect(t('joined.meta', { min: 35 })).toBe('35 דק׳ · אותו אימון לכולם');
    expect(t('joined.meta', { min: 1200 })).toBe('1,200 דק׳ · אותו אימון לכולם');
  });
  it('names go through the placeholder', () => {
    expect(t('joined.title', { host: 'נועה' })).toBe('הצטרפת לאימון של נועה');
    expect(t('lobby.workout', { title: 'מתח רחב' })).toBe('אימון כוח · מתח רחב');
    expect(t('pair.tv.openUrl', { url: 'outrun.co.il/tv' })).toBe('או נכנסים אל outrun.co.il/tv');
  });
  it('the buttons are nouns / infinitive-free, no gendered imperatives', () => {
    expect(t('pair.phone.cta')).toBe('התחברות למסך');
    expect(t('remote.host.start')).toBe('התחלת אימון');
    expect(t('lost.phone.retry')).toBe('ניסיון חוזר');
  });
});
