/**
 * Gender rule (owner decisions 21.10.2026, docs/copy/GENDER-INVENTORY.md §9, src/lib/i18n/gender-copy.ts):
 * `other` (unknown gender / chose "other") is NEUTRAL, never the masculine form.
 *
 * In a catalog that means every `{gender, select, …}` spells out `male {…}` — the `other`
 * branch is then free to be neutral. A message that has only `female {…} other {…}` shows
 * its masculine `other` text to everyone whose gender is unknown.
 *
 * LEGACY_MASCULINE_OTHER is the backlog recorded on 21.10.2026 (batch 1): selects whose
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

const LEGACY_MASCULINE_OTHER: readonly string[] = [
  'community:group.dropIn.join',
  'community:banner.late.toggle',
  'community:banner.register',
  'community:banner.onMyWay.done',
  'community:banner.joinWorkout',
  'community:banner.participants',
  'community:banner.ended',
  'community:pressure.message',
  'community:pressure.body',
  'community:pressure.cta',
  'community:outreach.school.message',
  'community:outreach.school.subtitle',
  'community:outreach.school.cta',
  'community:outreach.company.message',
  'community:outreach.company.subtitle',
  'community:outreach.company.cta',
  'community:outreach.youth.message',
  'community:outreach.youth.subtitle',
  'community:outreach.youth.cta',
  'map:partners.empty.live.sub',
  'map:partners.empty.scheduled.sub',
  'onboarding:quiz.tier.subtitle',
  'onboarding:quiz.tier.beginner.label',
  'onboarding:quiz.tier.beginner.description',
  'onboarding:quiz.tier.beginner.experience',
  'onboarding:quiz.tier.intermediate.label',
  'onboarding:quiz.tier.intermediate.description',
  'onboarding:quiz.tier.intermediate.experience',
  'onboarding:quiz.tier.advanced.label',
  'onboarding:quiz.tier.advanced.description',
  'onboarding:quiz.tier.advanced.experience',
  'onboarding:quiz.tier.footer',
  'onboarding:quiz.slider.tutorial.drag',
  'onboarding:quiz.slider.tutorial.checkMin',
  'onboarding:quiz.slider.tutorial.notSure',
  'onboarding:quiz.slider.escape',
  'onboarding:quiz.slider.escapeAria',
  'onboarding:quiz.slider.instruction',
  'onboarding:quiz.slider.notSure',
  'onboarding:quiz.hint.intro.title',
  'onboarding:quiz.hint.after.title',
  'onboarding:quiz.hint.after.sub',
  'onboarding:quiz.why.title',
  'onboarding:quiz.why.age14to18.health.body',
  'onboarding:quiz.why.age14to18.health.cta',
  'onboarding:quiz.why.age14to18.muscle.body',
  'onboarding:quiz.why.age14to18.muscle.cta',
  'onboarding:quiz.why.age14to18.skills.body',
  'onboarding:quiz.why.age14to18.skills.cta',
  'onboarding:quiz.why.age18to21.health.body',
  'onboarding:quiz.why.age18to21.health.cta',
  'onboarding:quiz.why.age18to21.muscle.body',
  'onboarding:quiz.why.age18to21.muscle.cta',
  'onboarding:quiz.why.age18to21.skills.body',
  'onboarding:quiz.why.age18to21.skills.cta',
  'onboarding:quiz.why.age21to26.health.body',
  'onboarding:quiz.why.age21to26.health.cta',
  'onboarding:quiz.why.age21to26.muscle.body',
  'onboarding:quiz.why.age21to26.muscle.cta',
  'onboarding:quiz.why.age21to26.skills.body',
  'onboarding:quiz.why.age21to26.skills.cta',
  'onboarding:quiz.why.age26to50.health.body',
  'onboarding:quiz.why.age26to50.health.cta',
  'onboarding:quiz.why.age26to50.muscle.body',
  'onboarding:quiz.why.age26to50.muscle.cta',
  'onboarding:quiz.why.age26to50.skills.body',
  'onboarding:quiz.why.age26to50.skills.cta',
  'onboarding:quiz.why.age50plus.health.body',
  'onboarding:quiz.why.age50plus.health.cta',
  'onboarding:quiz.why.age50plus.muscle.body',
  'onboarding:quiz.why.age50plus.muscle.cta',
  'onboarding:quiz.why.age50plus.skills.body',
  'onboarding:quiz.why.age50plus.skills.cta',
  'onboarding:tier.beginner',
  'onboarding:tier.advanced',
  'onboarding:location.initial.headline.running',
  'onboarding:location.confirm.pioneerLine',
  'onboarding:location.entry.confirm.pioneerLine',
  'onboarding:steps.processing.personaGendered',
  'onboarding:steps.account.subtitle',
  'onboarding:steps.account.warning.loss',
  'onboarding:steps.account.warning.secureLater',
  'onboarding:steps.persona.label',
  'onboarding:steps.persona.madlib.many',
  'onboarding:steps.persona.hint.persona',
  'onboarding:steps.persona.hint.personaGoal',
  'onboarding:steps.persona.intro',
  'onboarding:steps.persona.continue',
  'onboarding:steps.persona.code.continue',
  'onboarding:steps.schedule.recommendation.atLeastTwo',
  'onboarding:steps.schedule.time.title',
  'onboarding:steps.schedule.cta.continue',
];

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
