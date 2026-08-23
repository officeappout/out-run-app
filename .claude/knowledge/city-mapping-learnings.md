# City Mapping — Learnings & Guardrails (Haifa first city)

Purpose: make the per-city route-discovery agent sharper each city. Read this before running discovery on a new city, and before touching park-loop logic in `scripts/geo-discovery-routes.ts`.

## 1. Park loops ("הקפת X") — the polygon-boundary trap
The bug (Haifa): `buildParkLoopCandidate()` used the `leisure=park|garden` area-polygon boundary as route geometry, with no `highway=*` query — loops drew straight lines across grass, ignoring real footpaths. All 21 Haifa park loops were fake (0/21 traced a continuous real path).
The fix (commit `ca67b5d3`, on origin/main): build the loop from a real walkable-way node graph — fetch walkable ways (`footway|path|track|pedestrian|cycleway|living_street|residential|service|tertiary|unclassified` + `steps`), downsample polygon to ~35m anchors, snap each to nearest graph node, Dijkstra between anchors, concatenate into a closed loop. Drop outright (no fallback, no synthetic geometry) if any anchor can't snap, any leg has no path, or the result is pathologically fragmented.

## 2. The gate corrections (non-obvious — the important part)
- Primary gate = **max-distance-from-polygon ≤ ~90m**, NOT ratio-to-perimeter. A real sidewalk ring runs outside the grass and is legitimately 1.3–1.7× the polygon perimeter; the ratio gate punished real loops.
- **Trim backtrack at construction** before measuring (Dijkstra snapping onto dead-end spurs makes literal out-and-back segments — present in 100% of the 7 recovered Haifa loops).
- Length ratio kept only as a loose backstop (~1.7× after trim).
- Snap tolerance ~42m, AND snap to nearest point on nearest **segment** (virtual-node split), not nearest existing node.
- Dijkstra bound ~850m.
- Per-leg detour check: reject a leg whose graph distance exceeds ~7× its straight-line gap, with an honest message. The graph is usually connected; the real issue is an absurd detour = no genuine local perimeter path.
Haifa result: 7/21 park loops recovered as real walkable loops; 14 correctly dropped.

## 3. Linear / coastal parks are NOT loops → out-and-back (TBD)
Coastal promenades (פארק הכט, חוף שקמונה, גן דניאל) have a great continuous path that runs linearly along the water, not as a ring. They correctly fail the loop gates — do NOT loosen gates to force them in. They need a separate linear / out-and-back route type. The loop audit's "no local perimeter path" bucket IS the out-and-back candidate list. Not built yet.

## 4. Core principle
Fewer but certainly-good. No synthetic geometry, no anonymous filler, no fake loops. Drop rather than fake.

## 5. git stash is SHARED across worktrees — never blind `stash pop`
The `git stash` stack is shared across all worktrees of the repo. A bare `git stash pop` in one session can grab another session's WIP (happened once — 8 home/activity-UI files pulled into the discovery worktree, recovered as a labeled stash entry). Rules: never bare `git stash`/`pop` in a multi-session repo; prefer committing WIP to your own branch; if you must stash, use `git stash push -m "label" -- <files>` and recover with `git stash apply stash@{n}` by name.

## 6. Deploy / push reminders
Push to `main` auto-deploys to prod via Vercel's GitHub-App integration (~minutes). Never `vercel --prod` / `npm run deploy` from CLI (local `.vercel` link points at the wrong project). `scripts/geo-discovery-routes.ts` is a discovery script, not app runtime — pushing versions it but deploys nothing; the panel changes only via a Firestore `--apply`. Standing discipline: isolated single-commit off latest `main`; serialize pushes; scripts default dry-run; `--apply` on prod Firestore and any prod deploy are HARD STOPS needing explicit go.
