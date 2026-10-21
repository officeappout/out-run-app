/**
 * Gender rule (owner decisions 21.10.2026, docs/copy/GENDER-INVENTORY.md §9, src/lib/i18n/gender-copy.ts):
 * `other` (unknown gender / chose "other") is NEUTRAL, never the masculine form.
 *
 * In a catalog that means every `{gender, select, …}` spells out `male {…}` — the `other`
 * branch is then free to be neutral. A message that has only `female {…} other {…}` shows
 * its masculine `other` text to everyone whose gender is unknown.
 *
 * LEGACY_MASCULINE_OTHER is the backlog recorded on 21.10.2026 (batch 1; batch 2 fixed the community + map keys, batch 3 the 71 onboarding keys — empty now): selects whose
 * `other` is still the masculine form, in catalogs other PRs were editing at the time.
 * The list only shrinks: fix a key (add `male {old text}`, make `other` neutral), then
 * delete it here — the test fails on a fixed key that is still listed.
 *
 * Extraction PRs (byte-identical Hebrew, HOW-TO §5.2): write the old default as BOTH
 * `male {…}` and `other {…}` — same output for everyone today, and the later copy PR only
 * has to touch `other`.
 */
import { readdirSync, readFileSync } from 'fs';
import path from 'path';
import { describe, expect, it } from 'vitest';
import { parse, TYPE, type MessageFormatElement } from '@formatjs/icu-messageformat-parser';
import { GENDERED_COPY, pickGendered, resolveUiGender } from '../gender-copy';

const LEGACY_MASCULINE_OTHER: readonly string[] = [];

const root = path.resolve(__dirname, '../../../messages/he');

function genderSelects(nodes: MessageFormatElement[], out: string[][]): void {
  for (const n of nodes) {
    if (n.type === TYPE.select) {
      if (n.value === 'gender') out.push(Object.keys(n.options));
      for (const opt of Object.values(n.options)) genderSelects(opt.value, out);
    } else if (n.type === TYPE.plural) {
      for (const opt of Object.values(n.options)) genderSelects(opt.value, out);
    } else if (n.type === TYPE.tag) {
      genderSelects(n.children, out);
    }
  }
}

function catalogGenderSelects(): Map<string, string[][]> {
  const out = new Map<string, string[][]>();
  for (const file of readdirSync(root).filter((f) => f.endsWith('.json')).sort()) {
    const ns = file.replace(/\.json$/, '');
    const catalog = JSON.parse(readFileSync(path.join(root, file), 'utf8')) as Record<string, string>;
    for (const [key, message] of Object.entries(catalog)) {
      const selects: string[][] = [];
      genderSelects(parse(message), selects);
      if (selects.length > 0) out.set(`${ns}:${key}`, selects);
    }
  }
  return out;
}

describe('catalog gender selects: other = neutral', () => {
  const all = catalogGenderSelects();

  it('every gender select has male, female and other — except the recorded backlog', () => {
    const missing = Array.from(all.entries())
      .filter(([, selects]: [string, string[][]]) => selects.some((branches) => !branches.includes('male') || !branches.includes('female')))
      .map(([id]) => id)
      .filter((id) => !LEGACY_MASCULINE_OTHER.includes(id));
    expect(missing, 'add `male {…}` (and keep `other {…}` neutral) — see this file\'s header').toEqual([]);
  });

  it('the backlog only lists keys that still need the fix', () => {
    const stale = LEGACY_MASCULINE_OTHER.filter((id) => {
      const selects = all.get(id);
      return !selects || selects.every((branches) => branches.includes('male'));
    });
    expect(stale, 'fixed or removed — delete from LEGACY_MASCULINE_OTHER').toEqual([]);
  });
});

describe('pickGendered / resolveUiGender', () => {
  it('male, female, anything else → neutral', () => {
    const text = { male: 'm', female: 'f', other: 'n' };
    expect(pickGendered('male', text)).toBe('m');
    expect(pickGendered('female', text)).toBe('f');
    for (const g of ['other', undefined, null, '', 'MALE', 'x']) expect(pickGendered(g, text)).toBe('n');
  });

  it('profile gender wins; onboarding pick only while the profile has none (decision 4)', () => {
    expect(resolveUiGender('female', 'male')).toBe('female');
    expect(resolveUiGender('other', 'female')).toBe('other');
    expect(resolveUiGender(undefined, 'female')).toBe('female');
    expect(resolveUiGender('', 'male')).toBe('male');
    expect(resolveUiGender(null, null)).toBe('other');
    expect(resolveUiGender(undefined, 'junk')).toBe('other');
  });

  it('shared copy — the three outputs', () => {
    const expected: Record<keyof typeof GENDERED_COPY, [string, string, string]> = {
      startWorkout: ['התחל אימון', 'התחילי אימון', 'יוצאים לאימון'],
      resumeWorkout: ['המשך אימון', 'המשיכי אימון', 'ממשיכים באימון'],
      pauseWorkout: ['השהה אימון', 'השהי אימון', 'השהיית אימון'],
      stopWorkout: ['הפסק אימון', 'הפסיקי אימון', 'הפסקת אימון'],
      retry: ['נסה שוב', 'נסי שוב', 'נסו שוב'],
      retryLater: ['נסה שוב מאוחר יותר', 'נסי שוב מאוחר יותר', 'נסו שוב מאוחר יותר'],
    };
    for (const [id, [m, f, n]] of Object.entries(expected) as Array<[keyof typeof GENDERED_COPY, [string, string, string]]>) {
      expect(pickGendered('male', GENDERED_COPY[id]), id).toBe(m);
      expect(pickGendered('female', GENDERED_COPY[id]), id).toBe(f);
      expect(pickGendered('other', GENDERED_COPY[id]), id).toBe(n);
      expect(n, `${id}: neutral has no slash`).not.toMatch(/\//);
    }
  });
});
