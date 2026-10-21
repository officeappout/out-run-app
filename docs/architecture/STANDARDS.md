# Code standards — guidelines

Source: the A0 architecture audit (`docs/architecture/AUDIT-2026-10.md` on
`origin/docs/architecture-audit`, §3). Owner, 21.10.2026: **these are
guidelines, not iron rules.** Nothing here blocks a build or a commit; the CI
check below only reports.

## 1. Folder layout per feature

```
src/features/<domain>/
  screens/      # screen-level composition; the page in src/app just renders one
  components/   # one component per file, rendering only
  hooks/        # state + data wiring (useX.ts)
  services/     # Firestore/API access (x.service.ts); no React
  lib/          # pure logic (x.ts / x.utils.ts); no React, no Firebase
  store/        # Zustand (axioms §7)
  types/        # x.types.ts
  data/         # tables / catalogs (x.data.ts) — exempt from the size guideline
  server/       # server-only code (import 'server-only'), called from src/app/api
  admin/        # panel editors for the domain — never imported from a user screen
  legacy/       # code waiting for a flag removal; flag name in the header
  __tests__/
```

- `src/app/**/page.tsx` stays thin: params, flag choice, `<Screen />`.
- Duplicate roots (`src/@core`, `src/core`, `src/utils`, `src/constants`) fold into `src/lib` over time.

## 2. Size guideline

| Kind | Target | Guideline (warned above) |
|---|---:|---:|
| component / hook | ≤ 300 | 500 |
| service / lib | ≤ 400 | 600 |
| `page.tsx` / `route.ts` | ≤ 150 | 300 |
| `*.data.ts`, `data/**`, `src/lib/data/**`, `*.fixtures.ts`, tests, `functions/src/shared/**` (mirror) | exempt | exempt |

An existing file over the guideline may be touched freely; try not to grow it.
When a feature touches one, extracting the part being touched first is the
preferred move.

**Advisory check:** `bash scripts/ci/file-size-advisory.sh` (CI job
`file size guideline (changed files, advisory)`). For files added or changed
in the PR it warns when a new file is over the guideline, or when an existing
file over the guideline grew by more than 25 lines; touching a big file
without growing it is only a note. It always exits 0 and is intentionally not
part of `scripts/safety-check.sh`.

## 3. One component per file

Small private sub-components (≤ ~40 lines) may share a file. Anything larger,
or exported, gets its own file.

## 4. Shared UI

- New UI goes through `src/components/ui/v2` (`Sheet`, `Card`, `Chip`, `Button`, …). `scripts/ci/v2-raw-style-grep.sh` reports drift.
- The old `src/components/ui/*` is frozen; duplicates living inside big files (`Toggle`, `SettingsRow`, `Pill`…) move to v2 when that file is split.

## 5. Boundaries

- **admin → user: no.** Code under `src/features/admin/**` or `src/features/*/admin/**` is not imported from code reachable from a user screen. Shared reads move to `src/lib/<x>` or the domain's `services/`.
- No `require()` in client code, no whole-barrel `import * as`.
- No new domain-level `export *` barrels; import by direct path.
- `'use client'` at screen level. Modules using the Admin SDK start with `import 'server-only'`. `src/app/api/**/route.ts` stays thin: auth guard (axioms §15) + a call into `features/<domain>/server/*`.
- Cross-domain imports are not fixed by force; when a file is split, what is shared moves to `src/lib`.

## 6. Names

`PascalCase.tsx` component · `useX.ts` hook · `x.service.ts` · `x.utils.ts` / `x.ts` pure lib · `x.types.ts` · `x.data.ts` · `x.config.ts`.
A `V2` suffix only for the life of a flag; after the flag is removed, delete v1 rather than renaming.

## 7. Tests

`__tests__/` next to the code. Splitting a file does not delete tests; a test importing an old path is updated in the same PR.
