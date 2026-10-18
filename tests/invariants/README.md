# Workout Invariants Gate

Automated check that **every generated workout is valid** — duration, muscle,
equipment, sets/reps/rest, structure, difficulty-coherence — across a
representative matrix of user profiles and contexts.

Runs `generateHomeWorkoutTrio()` **hermetically** (no live Firestore) against a
frozen data corpus, so it catches **logic regressions** — e.g. a change that
silently pushes a 15-min request to 30 min — not one-off data problems.

## Run

```bash
npm run test:invariants      # runner.ts (groups A–F + H report) + the hermetic vitest ratchet
npm run snapshot:corpus      # refresh the frozen provider fixture (Admin SDK, see below)
npx tsx scripts/generator-qa.ts --ci     # the 40-scenario hard-invariant subset (+ ratchet)
npx tsx scripts/generator-qa.ts --full   # every entry point, ~330 scenarios + coach references
```

Wired into `/pre-commit` when a diff touches `src/features/workout-engine/**`; the vitest
part (`src/features/workout-engine/__tests__/invariants-gate.hermetic.test.ts`) also runs in
CI (`vitest.ci.config.ts`).

### Hermetic — no `.env.local`, no production (2026-10-18)

`src/lib/firebase.ts` is hardcoded to the PRODUCTION project. The gate no longer touches it:

- `tests/invariants/tsconfig.json` (and `hermetic/tsconfig.json`) redirect `@/lib/firebase` and
  `firebase/firestore` to `hermetic/firebase.stub.ts` / `hermetic/firestore.stub.ts`.
- `hermetic/guard.ts` (imported first by every hermetic entry point) also catches RELATIVE imports
  of the real module (`src/lib/firestore.service.ts` → `./firebase`), makes `fetch` throw, and
  no-ops CSS imports pulled in by the map stack.
- The Firestore stub replays `hermetic/corpus/*.json` (raw docs, `{ id, ...fields }`), logs every
  read, and turns every write into a logged no-op; runners fail if a write was attempted.
- Vitest uses `vi.mock` on the same two stubs (matched by resolved file, so relative imports are
  covered too).

`preflight.mjs` / `.env.local` are no longer needed by `npm run test:invariants`.

**Corpus gap:** `hermetic/corpus` is a public REST dump (17.10.2026). `programLevelSettings` is
auth-only, so it is absent: protocol probability falls back to 0 (no antagonist pairs) and the
weekly budget to `max(tier default 8/12/16, level×2)` (was `max(4, level×2)` before generator QA round 1). To close it, drop a `programLevelSettings.json` (raw docs) into
the corpus dir — read it with the Admin SDK, read-only.

## Hard invariants (group H) — `hard-invariants.ts`

H1 gear truth · H2 body-area focus (strict domains) · H3 min main exercises for the duration
(≤15→3, ≤30→4, ≤45→5, >45→6 — the owner's table; trio bolts judged by their own 30/45/60 cap) · H4 no main exercise above user level +3 · H5 no test items. Checked on
every entry point in `entry-points.ts` (home trio, builder chips, AI chat `generate_workout`
mapping, park machines; route stops in the full bench). Main does not satisfy them today, so the
vitest suite is a **ratchet**: it fails only on violations missing from
`hard-invariants.baseline.json`, and logs the ones that disappeared — after a fix, shrink it:

```bash
UPDATE_HARD_BASELINE=1 npx vitest run src/features/workout-engine/__tests__/invariants-gate.hermetic.test.ts
```

Full numbers and root causes: `docs/workout-engine/05-BENCHMARK.md` part 6.

## The fixture is a FROZEN SNAPSHOT — refresh it periodically

`tests/invariants/fixtures/*.json` is a point-in-time snapshot of the Firestore
content collections (`exercises`, `programs`, `gym_equipment`,
`program_level_settings`), captured by `scripts/snapshot-workout-corpus.ts` via
the Admin SDK and normalized through the **real** providers' mappers.

**What this means:**
- ✅ The gate catches **engine LOGIC** bugs (selection, volume, duration, ordering)
  because the data is held constant — any output change is a code change.
- ❌ The gate does **not** catch **DATA** bugs (a mis-tagged exercise, a wrong level
  in Firestore). Those are a separate concern.
- 🔄 When content changes materially (exercises added/retagged, programs reworked,
  level settings edited), **re-run `npm run snapshot:corpus`** and commit the
  updated JSON. A stale snapshot means the gate is validating against a corpus that
  no longer matches production.

> ⚠️ Known thin spot at capture time (09.07.2026): `program_level_settings` had
> only 1 doc — per-level protocol/rest tuning falls back to defaults. Verify this
> collection on each refresh; if it's still ~empty that's a data signal, not a bug.

## How injection works (no source changes)

`tests/invariants/tsconfig.json` uses TS `paths` to redirect the three
Firestore-reading providers to `mocks/*.ts`, which re-export the real module and
override only the fetch fn to replay the fixture:

| Redirected module | Mock |
|---|---|
| `…/exercises/core/exercise.service` | `mocks/exercise.service.ts` |
| `…/programs/core/program.service` | `mocks/program.service.ts` |
| `…/equipment/gym/core/gym-equipment.service` | `mocks/gym-equipment.service.ts` |

Secondary reads (app_config, gear_definitions, workoutMetadata, parks …) go through the
hermetic Firestore stub (corpus replay) — see "Hermetic" above.

> ⚠️ `fixtures/program_level_settings.json` was captured from the legacy
> `program_level_settings` collection (1 orphan doc). The engine reads
> `programLevelSettings` (auth-only, ~97 docs) — so per-level protocol/rest tuning has
> never been exercised by this gate. Fix the snapshot script's collection name on the
> next refresh.

`Math.random` is seeded (`runner.ts`) so runs are deterministic; invariants are
nonetheless written as **ranges** — the engine's randomness is a feature, and the
gate must not become a brittle golden-snapshot.

## Files

- `runner.ts` — the gate: builds the matrix, runs the trio, asserts invariants (A–F) + reports H.
- `hard-invariants.ts` / `entry-points.ts` / `hard-invariants.baseline.json` — group H (see above).
- `hermetic/` — Firebase/Firestore stubs, resolver guard, tsconfig, frozen raw corpus.
- `profile-factory.ts` — `buildMockProfile()`, ported from the QA simulator (keep in sync).
- `fixtures.ts` — loads the frozen corpus JSON.
- `mocks/` — provider redirects.
- `fixtures/*.json` — the frozen corpus (regenerate with `snapshot:corpus`).
- `../../scripts/snapshot-workout-corpus.ts` — the snapshot generator.
