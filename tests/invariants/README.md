# Workout Invariants Gate

Automated check that **every generated workout is valid** — duration, muscle,
equipment, sets/reps/rest, structure, difficulty-coherence — across a
representative matrix of user profiles and contexts.

Runs `generateHomeWorkoutTrio()` **hermetically** (no live Firestore) against a
frozen data corpus, so it catches **logic regressions** — e.g. a change that
silently pushes a 15-min request to 30 min — not one-off data problems.

## Run

```bash
npm run test:invariants      # run the gate (needs .env.local for firebase init)
npm run snapshot:corpus      # refresh the frozen corpus (see below)
```

Wired into `/pre-commit` when a diff touches `src/features/workout-engine/**`.

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

Secondary reads (level-settings, trio-labels, workout-metadata) are **not** mocked
yet — they fast-fail to their own fallbacks. Hardening them (so the gate needs
neither `.env.local` nor network) is a follow-up.

`Math.random` is seeded (`runner.ts`) so runs are deterministic; invariants are
nonetheless written as **ranges** — the engine's randomness is a feature, and the
gate must not become a brittle golden-snapshot.

## Files

- `runner.ts` — the gate: builds the matrix, runs the trio, asserts invariants.
- `profile-factory.ts` — `buildMockProfile()`, ported from the QA simulator (keep in sync).
- `fixtures.ts` — loads the frozen corpus JSON.
- `mocks/` — provider redirects.
- `fixtures/*.json` — the frozen corpus (regenerate with `snapshot:corpus`).
- `../../scripts/snapshot-workout-corpus.ts` — the snapshot generator.
