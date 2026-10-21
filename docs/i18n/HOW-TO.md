# i18n — how to extract a component's strings (wave 2 recipe)

> For build agents in wave 2+ of `docs/i18n/PLAN.md`. Infrastructure: wave 1 (`feat/i18n-infra`).
> Goal of every extraction PR: **Hebrew stays byte-identical**, the text moves to a catalog, the code calls `t()`.
> This file is the whole recipe. It folds in the lessons of the pilot (#571) and batch 1 (#573 partners, #575 search).

## 0. The pieces

| What | Where |
|---|---|
| Hebrew catalog (source of truth) | `src/messages/he/<namespace>.json` — flat dotted keys → ICU message |
| Other languages | `src/messages/{en,ru,de}/<namespace>.json` — same keys, start as `{}` |
| Namespace handle (typed keys) | `src/messages/ns/<namespace>.ts` — `defineNamespace('<namespace>', he)` |
| Client components | `const t = useT(ns)` from `@/hooks/useT` |
| Server / services / API routes | `const t = await getT(locale, ns)` from `@/lib/i18n/t` |
| Tests | `makeT('he', ns)` from `@/lib/i18n/t` (sync, no store) |
| Firestore content (`{he,en,...}` fields) | `pickText(value, locale, gender)` from `@/lib/i18n/core/i18n-core` |
| Numbers / dates | `formatNumber/formatDate/formatTime/weekdayName` from `@/lib/i18n/core/fmt` (wave 3) |
| Locale type | `Locale` from `@/lib/i18n/locales` |
| Folders where new Hebrew is blocked | `src/lib/i18n/migrated-paths.txt` (enforced by `scripts/safety-check.sh` Check 5) |

Flags: `enable_i18n` (master) + `enable_locale_en/ru/de`. All off = locale is always `he` and `t()` returns the
Hebrew catalog text exactly. Your PR does not need its own flag: moving text to the catalog is invisible.

## 1. The recipe at a glance

1. Pick the namespace from the ownership table (§2). Create its files only if they don't exist yet.
2. List the files in your folders. Skip dead files, admin screens and data (§8).
3. **Commit 1 — parity snapshots, before touching any component** (§9). Recorded from unmodified `origin/main`,
   with `<!-- -->` already stripped.
4. **Commit 2 — the extraction** (§3–§7). The commit-1 snapshots must still pass unchanged.
5. Key test per namespace (§9.4); re-pin any source-hash test you broke (§9.5).
6. Finish: `migrated-paths.txt`, checks, PR body with the "manual" list (§10).

## 2. Namespaces: who owns which folder

One JSON file per namespace per locale. **Add your keys to the file that owns your folder** — never create a second
file for an area that already has one. Keys inside a namespace are prefixed by sub-area (`partners.*`, `search.*`,
`steps.*`) so two PRs adding keys to the same namespace don't collide on keys (they may still both touch the JSON
file — resolve that conflict by keeping both sides).

| Folder(s) | Namespace (`src/messages/he/…`) | Status |
|---|---|---|
| `src/features/{progression-map,activity}`, `app/{progression-map,activity}` | `profile.json` | exists (#571) |
| `src/features/{profile,user/{progression,identity,places,core,scheduling},progression-hub}` | `profile.json` | add keys under a new prefix |
| `src/features/partners` (listed under verticals in PLAN §1.1, but it is the map's partner finder) | `map.json` | created by #573 (`partners.*`) |
| `src/features/{parks,safecity,heatmap,weather,navigation}`, `app/map` | `map.json` | add keys there — **don't create a new map file** |
| `src/features/{search,content (not admin),workouts,favorites}`, `app/{library,search,workouts}` | `library.json` | created by #575 (`search.*`, `search.legacy.*`) |
| `src/features/home`, `app/home` | `home.json` | new |
| `src/features/user/onboarding`, `app/{onboarding*,gateway,intro,join}` | `onboarding.json` | new |
| `workout-engine/{players,components,budget-light}`, `app/{run,session,active-workout-ui}` | `player.json` | new |
| `workout-engine/summary` | `summary.json` | new |
| `src/features/schedule` | `schedule.json` | new |
| `src/features/notifications` (push library, client side) | `push.json` | new (wave 2A, server mirror) |
| `src/features/arena`, `app/{community,arena,league}` (community / arena / group screens) | `community.json` | exists (#583 `group.*`; arena components: `banner.*`, `groupCard.*`, `report.*`, …) |
| `src/features/{social,challenge,messages}` | `social.json` | new |
| `src/lib/ai`, `src/features/ai-coach`, `app/ai-coach` | `coach.json` | new |
| `src/features/{legal,help}`, `app/{privacy,accessibility,delete-data}`, `src/lib/app-help` | `legal.json` | new |
| `src/app/api/**` (not admin) — error codes | `errors.json` | new (wave 2A) |
| Shared words only (buttons, statuses) | `common.json` | exists |
| `workout-engine/{services,core,logic,hybrid,shared,engines,generator,utils}` (generated text) | not assigned yet | the brief must name it; don't invent one |

Check `ls src/messages/he` on `origin/main` **and** the open i18n PRs (`gh pr list --search i18n`) before creating a
file: an unmerged PR may already own it (#573 `map`, #575 `library` were still open when this was written).

### Creating a namespace (only if it doesn't exist)

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

There is no central registry. The catalog test (`src/lib/i18n/__tests__/catalogs.test.ts`) fails if a locale is
missing a file or `ns/<name>.ts` is missing.

**Name clashes:**
- The export name is the namespace name. If the component already has a variable with that name (very common:
  `const profile = useUserStore((s) => s.profile)`), import it under an alias:
  `import { profile as profileNs } from '@/messages/ns/profile'`.
- `const t = useT(...)` collides with locals named `t` (timers, `.map((t) => …)`, `const t = setTimeout(…)`).
  Rename the locals (`timer`, `tab`, `item`), not the translator.

**Keys:** `<area>.<thing>[.<variant>]`, lower camelCase segments, describe the meaning not the words
(`hero.cta.start`, not `hero.letsGo`). Never reuse a key for two different places just because the Hebrew is equal
today. Only `common` holds shared words.

## 3. Plain text

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

**What "the Hebrew" is in JSX:** the text React renders, after JSX whitespace rules — whitespace that touches a
line break is dropped, spaces on the same line are kept. `<b>הרמה שלך · {level}: </b>` renders a trailing
space, so the key is `"הרמה שלך · {level}: "`. Text sitting next to an element on the same line
(`<span>{pct}%</span> מהיעד`) is one sentence: use `t.rich` (§6), not two keys.

**Module-level constants** (`const TABS = [{ key: 'day', label: 'יום' }]`): never call `t()` at module scope (no
locale yet). Store the key and translate in render:
`[{ key: 'day', labelKey: 'steps.range.day' }] as const` → `{t(labelKey)}`.
Module-level helpers that build text (`formatDistance`, `resolveActivityLine`) take `t` as a parameter.

**Copy the Hebrew exactly** into the JSON (same spaces, punctuation, emoji, geresh `׳` vs apostrophe `'`, `״` vs `"`).
A literal `'` in Hebrew is fine (`"צ'אט"`); only `'{` / `'}` start ICU quoting — write `''` if you really need a
literal apostrophe right before a brace. A literal `{` / `}` must be quoted: `'{'`.
Don't "improve" Hebrew in an extraction PR, even an obvious typo or a half-gendered sentence
(#573 kept "הוסיפי אימון ללוז ושתף אותו…" as is). List it in the PR body instead.

## 4. Numbers & plurals

Template literals become ICU arguments. Never concatenate pieces of a sentence: word order differs per language.

```tsx
// before
`${minutes} דקות · ${km} ק״מ`
`שלום ${name}!`
// after — he
"stats.line": "{minutes} דקות · {km} ק״מ",
"hello": "שלום {name}!"

t('stats.line', { minutes: String(minutes), km })
t('hello', { name })
```

**Pass counts as `String(n)`.** ICU formats a plain number argument with a thousands separator
(`1234` → `"1,234"`); the old `${n}` didn't. Any number that can reach 1000 (results, members, steps, XP) goes in as a
string: `t('search.live.results', { count: String(total) })`. Small bounded numbers (a level 1–25) are safe either way,
but `String()` everywhere is the simple rule.

**`n === 1` ternary → `=1`, not `one`:**

```tsx
// before
n === 1 ? 'גינה אחת עד 1 ק״מ' : `${n} גינות עד 1 ק״מ`
// after — he
"park.sub": "{n, plural, =1 {גינה אחת עד 1 ק״מ} other {{n} גינות עד 1 ק״מ}}"
t('park.sub', { n })
```

`=1` matches exactly what the old `=== 1` did. (Hebrew's CLDR categories are `one`, `two`, `other`; a translator adds
`few`/`many` for Russian later — you only write the Hebrew branches the code had.)

**`#` vs `{n}` inside `plural`:** the plural argument must be a number, so it gets formatted — `#` and `{n}` both print
`1,234`. Use `#` only where the old text already had a separator (`toLocaleString`). Otherwise use `{n}` and make sure
the count that reaches `plural` stays small (parks within 1 km, events this week) — or keep the count out of `plural`
and pass it as `String(n)`. If the original had no special case for 1, don't add a `plural` at all: `"{n} דקות"` with
`String(n)`.

**Pre-formatted numbers** (`toFixed`, `toLocaleString('he-IL')`) stay formatted in code for now and are passed in as a
string: `t('pace', { pace: pace.toFixed(1) })`. Wave 3 moves the formatting to `fmt.ts`.

## 5. Selects & fallbacks

### 5.1 A ternary or a map that swaps a word on a value

```tsx
// before
{unit === 'seconds' ? 'שניות' : 'חזרות'}
// after
"reps.value": "{value} {unit, select, seconds {שניות} other {חזרות}}"
```

**Label map + fallback** (`MAP[c] ?? 'x'`) → one `select` with the fallback as `other`, and pass `c ?? ''` (a missing
argument throws; an empty string falls to `other`):

```tsx
// before
const CATEGORY_LABEL = { running: 'ריצה', walking: 'הליכה' };
{CATEGORY_LABEL[group.category] ?? 'אימון'}
// after — he
"group.category": "{category, select, running {ריצה} walking {הליכה} other {אימון}}"
t('group.category', { category: group.category ?? '' })
```

Keep select keys plain ASCII ids (`fitness_day` is fine). If the map is keyed by something else, or the map is also
used as data (§8), render through the select and leave the map marked.

A ternary between two **whole sentences** stays two keys (`cond ? t('a') : t('b')`).

### 5.2 Gendered text (`isFemale`, `=== 'female'`, slash forms)

One key with an ICU `select` on `gender`. **useT() injects the signed-in user's gender automatically**
(`male` | `female` | `other`), so most call sites pass nothing:

```tsx
// before
{isFemale ? 'מוכנה להתחיל?' : 'מוכן להתחיל?'}
// after — he
"start.ready": "{gender, select, female {מוכנה להתחיל?} other {מוכן להתחיל?}}"
t('start.ready')
```

- Keep exactly the branches the code had. A two-way ternary → `female {…} other {…}` (the `else` branch becomes
  `other`, because that is what an unknown / 'other' gender saw before). A three-way → `female {…} male {…} other {…}`.
  A helper like `g(gender, male, female)` is a two-way pick → same shape.
- `other` is required by ICU — always the branch the old code's default path produced.
- Gender of **someone else** (a partner, a group member, a kudos sender): pass it explicitly —
  `t('kudos.from', { name, gender: sender.gender ?? 'other' })` — it overrides the injected one.
- Gender from a prop / local state that is **not** the profile (the onboarding gender picker): pass it explicitly too.
- Slash forms (`את/ה`, `מוכן/ה`, `מאשר.ת`, `חבר/י`): copy them as they are. Do not turn them into a select in an
  extraction PR (that changes what users see). List them as "slash form" in the PR body.
- Copy gendered by a bigger helper (`getGenderedCtaText`, `genderize`, `copyGenderOf`, `resolveGenderedText`):
  replace it with a select key only if it is a simple two-way pick; otherwise leave it and list it in "manual".

## 6. JSX with markup inside the text

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

## 7. Code that is not a component

```ts
import { getT } from '@/lib/i18n/t';
import { push } from '@/messages/ns/push';

const t = await getT(locale, push);           // locale: from users/{uid}.core.locale (default 'he')
const title = t('streak.title', { days: String(days), gender: user.core?.gender ?? 'other' });
```

Inside React but outside render (event handlers, effects): use the `t` from `useT` captured in the component.
`useLocaleStore.getState().locale` gives the current locale anywhere on the client.

**Synchronous client services that return display text** (a `lockedHint`, a `formatRequirementsHint()`, an exported
`CHECK_LEVEL_CTA`) are the hard case: `getT` is async, and a module-level string can't follow the locale.
Don't import the locale store into a pure service. The fix is a signature change: return a key + values (or an id /
discriminant) and let the component render it with `t` — e.g. #575's `Situation` became `{ id, n?, icon, action }`
and the card renders `search.situation.<id>.title`. Do it only when **all callers are inside your PR's folders**
(update their tests). Otherwise leave the service as is, keep its folder out of `migrated-paths.txt`, and list it in
"manual".

## 8. Don't extract

- **Data.** Hebrew that is compared, stored or matched is not copy:
  - values compared with `===` / `case` labels / object keys (`lockedHint === NEEDS_ASSESSMENT_HINT` — changing the
    text breaks the comparison; it needs a discriminant first, list it in "manual");
  - values written to Firestore (a fallback sender name `'אווטיר'` that `openDM` saves to `chats.participantNames`,
    a fallback member name `'משתמש'`), values compared with Firestore data (`` `רמה ${lvl}` `` vs an admin placeholder);
  - regex patterns, stop words, search-match words (category labels a scorer searches against), city names
    (`israel-locations.ts`), CMS tags (`@שם`).

  Before extracting a string, grep where the value goes: if it is saved, compared or matched anywhere, it is data.
  If the same words are ALSO rendered, render them through a new key (select, §5.1) and leave the data constant marked.
- **Dead files:** anything in `docs/architecture/dead-files.txt` — skip entirely. Also components that are imported
  but never rendered (check the parent; #573 found `PartnerBubbles`). Say so in the PR body.
- **v1 branches:** `enable_home_v2` is on for everyone. Extract only the v2 branch; mark the v1 branch's Hebrew lines
  `i18n-allow-hebrew: legacy v1 (enable_home_v2 on)`. A value shared by both branches is extracted once and used by
  both. Snapshots still cover v1 and v2 (§9).
- **Weekday / month names** (`['א','ב',…]`, `'אוק׳'`, the ` ו־` joiner): leave for wave 3 (`fmt`) and mark them.
  `Intl` does not produce the same Hebrew (`א׳` vs `א`), so it is a visible change, not an extraction.
- **Content names** read with `getLocalizedText(x, 'he')`, `PROGRAM_NAME_HE`, CMS labels from `src/lib`: leave; they
  move to `pickText(value, locale)` with the content model (PLAN §2.7). List them in "manual".
- **Text composed outside your folders** (a verb fragment passed into another area's component): leave and list it.
- `console.*` / log messages, comments, tests.
- **Admin screens** (`src/app/admin`, `**/admin/**`, components only imported by admin pages) — Hebrew only
  (PLAN decision 1).
- **Layout:** do not touch `dir="rtl"`, `ml-/mr-`, chevrons. That is wave 4.

### Marking a line you leave in a migrated folder

Check 5 blocks any added line with Hebrew in a migrated folder unless it carries `i18n-allow-hebrew: <reason>`.

```ts
const FALLBACK_NAME = 'אווטיר'; // i18n-allow-hebrew: data — written to chats.participantNames
```

**In JSX text `//` is not a comment — it renders.** Use the JSX comment form, placed *before* the text on the
same line:

```tsx
<span>{/* i18n-allow-hebrew: legacy v1 (enable_home_v2 on) */}אתה כאן</span>
```

After the text it adds a rendered trailing space. As a sibling after a lone child of `cond && (<span/>)` it doesn't
parse — put it inside the element. Between JSX attributes a plain `// i18n-allow-hebrew: …` at the end of the line works.

## 9. Parity tests (the proof)

Two commits, in this order: **commit 1** adds snapshots recorded from unmodified `origin/main`; **commit 2** is the
extraction and must pass them unchanged. A failing snapshot = changed Hebrew. Sanity check once: change one character
in your catalog and watch snapshots fail.

### 9.1 The test file

Static markup, node env, file snapshots. Real examples:
`src/features/activity/components/__tests__/steps-analytics-i18n-parity.test.tsx` (#571),
`src/features/partners/components/__tests__/partners-i18n-parity.test.tsx` (#573),
`src/features/search/__tests__/search-i18n-parity.test.tsx` (#575). Skeleton:

```tsx
/**
 * i18n wave 2 (namespace `<ns>`): snapshots recorded BEFORE the extraction.
 * Zustand stores render their INITIAL state under react-dom/server, so state is written into getInitialState().
 * `<!-- -->` is stripped before comparing (react-dom/server's separator between adjacent text nodes; not rendered text).
 */
import { afterAll, beforeAll, beforeEach, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { ReactElement } from 'react';

const flags = { enableHomeV2: false };
vi.mock('@/hooks/useFeatureFlags', () => ({ useFeatureFlags: () => ({ flags }) }));
vi.mock('@/lib/firebase', () => ({ db: {}, auth: {}, app: {} }));

import { MyCard } from '../MyCard';
import { useLocaleStore } from '@/store/useLocaleStore';

const NOW = new Date('2026-10-15T12:00:00');
const html = (el: ReactElement) => renderToStaticMarkup(el).replaceAll('<!-- -->', '');
const snap = (name: string) => `./__snapshots__/my-area-i18n/${name}.html`;

beforeAll(() => { vi.useFakeTimers(); vi.setSystemTime(NOW); vi.spyOn(Math, 'random').mockReturnValue(0.5); });
afterAll(() => { vi.useRealTimers(); vi.restoreAllMocks(); });
beforeEach(() => { flags.enableHomeV2 = false; Object.assign(useLocaleStore.getInitialState(), { gender: 'other' }); });

it.each([false, true])('card, female, v2=%s', async (v2) => {
  flags.enableHomeV2 = v2;
  Object.assign(useLocaleStore.getInitialState(), { gender: 'female' });
  await expect(html(<MyCard {...props} />)).toMatchFileSnapshot(snap(`card-female-v${v2 ? 2 : 1}`));
});
```

### 9.2 Zustand: write the INITIAL state

Under `renderToStaticMarkup`, `useSyncExternalStore` reads the store's **server snapshot, which is
`getInitialState()`** — `store.setState()` does nothing there. Write the case's state into that object:

```ts
Object.assign(usePartnerFilters.getInitialState(), { liveActivity: 'running' });
Object.assign(useLocaleStore.getInitialState(), { gender: 'female' });   // female branches of the injected gender
```

Reset it in `beforeEach` (keep a copy of the defaults: `const DEFAULTS = { ...store.getInitialState() }`).
Stores you don't need real can be replaced with a `vi.mock` returning a plain object (`useUserStore`, `useChatStore`).

### 9.3 Strip `<!-- -->` from the start

react-dom/server inserts `<!-- -->` between adjacent text nodes. `עד {x}` is two text nodes before the extraction and
one `t()` string after: same visible text, different markup. Record the BEFORE snapshots already stripped
(`.replaceAll('<!-- -->', '')`) — re-recording them after the extraction would throw away the proof. Say so in the
test header.

### 9.4 Cover every state, then one key test per namespace

- Snapshots: every state that shows text — v1 and v2 (`enable_home_v2`), male / female / unset, empty, error, loading,
  each tab / filter / card type. Pin time and randomness (`vi.setSystemTime`, `vi.spyOn(Math, 'random')`).
- Key test: `src/lib/i18n/__tests__/<ns>-he.test.ts`, one per namespace (if it already exists, add a `describe` for
  your area). `makeT('he', ns)(key, args)` must equal the **old literal / template copied verbatim**, for every key —
  including what a static render can't reach (behind a click or a swipe), every select / gender branch, and a count
  ≥ 1000. Examples: `profile-he.test.ts` (#571), `map-he.test.ts` (#573), `library-he.test.ts` (#575).

```ts
import he from '@/messages/he/<ns>.json';
import { myNs } from '@/messages/ns/<ns>';
import { makeT } from '../t';

const t = makeT('he', myNs);
it('plain strings', () => {
  const cases: Array<[keyof typeof he, string]> = [
    ['area.title', '<the old literal, pasted verbatim>'],
  ];
  for (const [key, old] of cases) expect(t(key)).toBe(old);
});
it('values and branches', () => {
  expect(t('area.results', { count: String(1234) })).toBe(`${1234} תוצאות`);   // the old template, verbatim
  // re-declare the old helper and compare every branch
  const g = (gender: string | undefined, m: string, f: string) => (gender === 'female' ? f : m);
  for (const gender of ['female', 'male', 'other'] as const)
    expect(t('area.ready', { gender })).toBe(g(gender, 'מוכן', 'מוכנה'));
});
```

### 9.5 Re-pin source-hash tests

Some existing tests pin a file's sha256 (e.g. `src/features/search/__tests__/search-page-parity.test.tsx` pins
`LegacySearchPage.tsx`). The extraction changes the source, so re-pin the hash in commit 2 and update the test's
comment: the Hebrew output is now pinned by your snapshots; the hash only guards further edits.

### 9.6 Vitest `include`

`.test.tsx` files only run from folders listed in `vitest.config.ts` `include` (`.test.ts` under `__tests__` runs
everywhere). Add your folder in commit 1, with a one-line comment:

```ts
// i18n wave 2 (map namespace) — Hebrew markup parity, static markup.
'src/features/partners/components/__tests__/**/*.test.tsx',
```

## 10. Finish the PR

1. Append your folders to `src/lib/i18n/migrated-paths.txt` (one path prefix per line, under a comment naming the
   batch and namespace). Leave out folders that still return Hebrew to outside callers (services) or are admin-only.
   From then on Check 5 blocks new hard-coded Hebrew there — verify once by adding a Hebrew line and running it.
2. `npx vitest run src/lib/i18n <your __tests__ folders>` (catalog test: ICU parses, files per locale, `ns/` handle).
3. `bash scripts/ci/tsc-baseline.sh check` — typed keys catch typos. With node_modules symlinked from the main
   checkout it reports ~9 "new" errors for missing `@sentry/nextjs` / `@capacitor-community/media`; check that a clean
   `origin/main` shows the same ones and that none are in your files.
4. `bash scripts/safety-check.sh` and `npm run test:invariants`.
5. Diff review: every removed Hebrew literal appears verbatim in `src/messages/he/<ns>.json` (or is marked and listed).
6. Rebase on `origin/main` before opening. Conflicts in `vitest.config.ts`, `migrated-paths.txt` and a shared
   namespace JSON are resolved by keeping both sides.
7. PR body: namespace and key prefix, number of keys, folders migrated and skipped (with why), the two-commit proof
   (snapshot count), and a **"manual"** list: data strings left, services with outside callers, slash forms,
   wave-3 dates/numbers, content names, copy oddities kept verbatim.
