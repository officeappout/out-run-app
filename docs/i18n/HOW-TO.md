# i18n — how to extract a component's strings (wave 2 pattern)

> For build agents in wave 2+ of `docs/i18n/PLAN.md`. Infrastructure: wave 1 (`feat/i18n-infra`).
> Goal of every extraction PR: **Hebrew stays byte-identical**, the text moves to a catalog, the code calls `t()`.

## 0. The pieces

| What | Where |
|---|---|
| Hebrew catalog (source of truth) | `src/messages/he/<namespace>.json` — flat dotted keys → ICU message |
| Other languages | `src/messages/{en,ru,de}/<namespace>.json` — same keys, start as `{}` |
| Namespace handle (typed keys) | `src/messages/ns/<namespace>.ts` — `defineNamespace('<namespace>', he)` |
| Client components | `const t = useT(ns)` from `@/hooks/useT` |
| Server / services / API routes | `const t = await getT(locale, ns)` from `@/lib/i18n/t` |
| Firestore content (`{he,en,...}` fields) | `pickText(value, locale, gender)` from `@/lib/i18n/core/i18n-core` |
| Numbers / dates | `formatNumber/formatDate/formatTime/weekdayName` from `@/lib/i18n/core/fmt` (wave 3) |
| Locale type | `Locale` from `@/lib/i18n/locales` |

Flags: `enable_i18n` (master) + `enable_locale_en/ru/de`. All off = locale is always `he` and `t()` returns the
Hebrew catalog text exactly. Your PR does not need its own flag: moving text to the catalog is invisible.

## 1. Set up the namespace (once per area)

Namespaces follow PLAN §2.1: `onboarding`, `home`, `map`, `player`, `summary`, `library`, `profile`, `social`,
`schedule`, `push`, `coach`, `legal`, `common`, `errors`. Use the one your brief names.

```
src/messages/he/home.json      { "hero.title": "האימון שלך להיום" }
src/messages/en/home.json      {}
src/messages/ru/home.json      {}
src/messages/de/home.json      {}
src/messages/ns/home.ts
```

```ts
// src/messages/ns/home.ts
/** Namespace `home`. See docs/i18n/HOW-TO.md. */
import he from '../he/home.json';
import { defineNamespace } from '@/lib/i18n/catalogs';

export const home = defineNamespace('home', he);
```

There is no central registry: two agents adding two namespaces never touch the same file.
The catalog test (`src/lib/i18n/__tests__/catalogs.test.ts`) fails if a locale is missing a file or `ns/<name>.ts` is missing.

**Keys:** `<area>.<thing>[.<variant>]`, lower camelCase segments, describe the meaning not the words
(`hero.cta.start`, not `hero.letsGo`). Never reuse a key for two different places just because the Hebrew is equal today.
Only `common` holds shared words (buttons, statuses).

## 2. Plain text

```tsx
// before
<h2 className="…">האימון שלך להיום</h2>
<input placeholder="חיפוש פארק" aria-label="חיפוש" />

// after
import { useT } from '@/hooks/useT';
import { home } from '@/messages/ns/home';

const t = useT(home);
<h2 className="…">{t('hero.title')}</h2>
<input placeholder={t('search.placeholder')} aria-label={t('search.label')} />
```

Copy the Hebrew **exactly** into the JSON (same spaces, punctuation, emoji, geresh `׳` vs apostrophe `'`).
A literal `'` in Hebrew is fine (`"צ'אט"`); only `'{` / `'}` start ICU quoting — write `''` if you really need a
literal apostrophe right before a brace. A literal `{` / `}` must be quoted: `'{'`.

## 3. Numbers and values inside a string

Template literals become ICU arguments. Never concatenate pieces of a sentence: word order differs per language.

```tsx
// before
`${minutes} דקות · ${km} ק״מ`
`שלום ${name}!`

// after — he/home.json
"stats.line": "{minutes} דקות · {km} ק״מ",
"hello": "שלום {name}!"

t('stats.line', { minutes, km })
t('hello', { name })
```

Numbers that need plural forms use `plural` (Hebrew has `one`, `two`, `other`; Russian needs `one/few/many/other` —
the translator adds those, you only write the Hebrew branches the code had):

```tsx
// before
n === 1 ? 'דקה אחת' : `${n} דקות`
// after
"duration": "{n, plural, one {דקה אחת} other {# דקות}}"
t('duration', { n })
```

If the original had no special case for 1, keep it simple: `"{n} דקות"`. Don't "improve" Hebrew in an extraction PR.
Pre-formatted numbers (`toFixed`, `toLocaleString('he-IL')`) stay formatted in code for now and are passed in as a
string value: `t('pace', { pace: pace.toFixed(1) })`. Wave 3 moves the formatting to `fmt.ts`.

## 4. Gendered text (`isFemale`, `=== 'female'`, slash forms)

Use one key with an ICU `select` on `gender`. **useT() injects the signed-in user's gender automatically**
(`male` | `female` | `other`), so most call sites pass nothing:

```tsx
// before
{isFemale ? 'מוכנה להתחיל?' : 'מוכן להתחיל?'}
// after — he
"start.ready": "{gender, select, female {מוכנה להתחיל?} other {מוכן להתחיל?}}"
t('start.ready')
```

Rules:
- Keep exactly the branches the code had. A two-way ternary → `female {…} other {…}` (the `else` branch becomes
  `other`, because that is what an unknown / 'other' gender saw before). A three-way → `female {…} male {…} other {…}`.
- `other` is required by ICU — always the branch the old code's default path produced.
- Gender of **someone else** (a partner, a group member, the sender of a kudos): pass it explicitly —
  `t('kudos.from', { name, gender: sender.gender })` — and it overrides the injected one.
- Gender from a prop / local state that is **not** the profile (e.g. the onboarding gender picker before the profile
  exists): pass it explicitly too — `t('x', { gender: selectedGender })`.
- Slash forms (`את/ה`, `מוכן/ה`, `מאשר.ת`): copy them as they are — they are the neutral Hebrew text today. Do not
  turn them into a select in an extraction PR (that changes what users see). Add a `// i18n: slash form` note in the
  PR description so a later copy pass can decide.
- Hebrew copy that is gendered **in code** by a helper (`getGenderedCtaText`, `genderize`, `copyGenderOf`,
  `resolveGenderedText`): replace the helper call with a select key only if the helper is a simple two-way pick;
  otherwise leave it and list it in the PR's "manual" section.

## 5. JSX with markup inside the text

One sentence = one key, even when part of it is bold or a link. Use tags + `t.rich()`:

```tsx
// before
<p>קראתי ואני מסכים ל<a href="/terms" className="underline">תנאי השימוש</a></p>
// after — he
"terms.accept": "קראתי ואני מסכים ל<link>תנאי השימוש</link>"

<p>{t.rich('terms.accept', { link: (chunks) => <a href="/terms" className="underline">{chunks}</a> })}</p>
```

Tag names are ours (`<b>`, `<link>`, `<br></br>` for a line break), not HTML: the function decides the element.
Plain `t()` treats `<` as text, so a stray `<` in normal copy is safe. Line breaks that were `<br />` between two
separate sentences may stay two keys.

## 6. Code that is not a component

```ts
import { getT } from '@/lib/i18n/t';
import { push } from '@/messages/ns/push';

const t = await getT(locale, push);           // locale: from users/{uid}.core.locale (default 'he')
const title = t('streak.title', { days, gender: user.core?.gender });
```

Inside React but outside render (event handlers, effects): use the `t` from `useT` captured in the component.
`useLocaleStore.getState().locale` gives the current locale anywhere on the client.

## 7. What NOT to extract

- Hebrew that is **data**: values compared with `===`, `case` labels, object keys, values written to Firestore,
  regex patterns, city names (`israel-locations.ts`), CMS tags (`@שם`). If such a line sits in a migrated folder,
  mark it with `// i18n-allow-hebrew: <reason>` on the same line.
  Before extracting a string, grep where the value goes: if it is saved or compared anywhere, it is data.
- `console.*` / log messages, comments, tests.
- Admin screens (`src/app/admin`, `**/admin/**`) — Hebrew only (PLAN decision 1).
- Layout: do not touch `dir="rtl"`, `ml-/mr-`, chevrons. That is wave 4.

## 8. Finish the PR

1. Append your folders to `src/lib/i18n/migrated-paths.txt` (one path prefix per line). From then on
   `scripts/safety-check.sh` (Check 5) blocks new hard-coded Hebrew there.
2. `npx vitest run src/lib/i18n` (catalog test: ICU parses, files per locale, `ns/` handle).
3. `bash scripts/ci/tsc-baseline.sh check` — typed keys catch typos.
4. Diff review: every removed Hebrew literal appears verbatim in `src/messages/he/<ns>.json`.
5. PR body: namespace, number of keys, the "manual" list (helpers, slash forms, data strings you left).
