# Loops prefer marked trails (`enable_loops_prefer_marked_trails`)

Owner idea 22.10.2026: OSM has many trails with no name (colour-marked hiking routes, singletrack, paths) that we do not present as named routes, but the loop generator may use them, favourably, outside cities. Flag default OFF; off = byte-identical.

## What the deployed graph can see (verified from `infra/graphhopper/config.yml`, not against the live service)

`graph.encoded_values` includes `road_class`, `surface`, `track_type`, `footway`, `foot_network`, `hike_rating`, `mtb_rating`, `foot_priority`, `foot_access`, `foot_road_access`, `average_slope`.

| Need | Visible? |
|---|---|
| Edge is a path / track / bridleway / footway | Yes (`road_class`) |
| Surface (paved / unpaved / ground) | Yes (`surface`, `track_type`) |
| Edge belongs to a hiking-route relation (`route=hiking/foot` with `network` iwn/nwn/rwn/lwn) | Yes, as `foot_network` (MISSING / INTERNATIONAL / NATIONAL / REGIONAL / LOCAL / OTHER) |
| SAC difficulty (`sac_scale`) | Yes (`hike_rating`) |
| Trail COLOUR (`osmc:symbol` red/blue/green/black) | **No.** GraphHopper has no encoded value for it. |
| Route relations that have no `network` tag | They map to `foot_network` OTHER or MISSING depending on tagging, so a marked trail with sloppy relation tags can look like "no network". |

Not verified (needs a live check by the owner): how many Israeli marked-trail edges actually carry a non-MISSING `foot_network` in the baked graph, and that the live GraphHopper 11.1 accepts the new expression (`foot_network == MISSING && (...)`). Compile-time validation happens on the first request; the app falls back to the plain recipe only on a server error, so check with one request first (below).

## What is implemented (app side only; no graph rebuild needed)

* `buildCustomModel` (`src/lib/routing/graphhopper/custom-model.ts`): with `preferMarkedTrails` on a foot profile, ONE extra priority statement: `multiply_by 0.85` on `TERTIARY / UNCLASSIFIED / RESIDENTIAL / SERVICE` edges whose `foot_network == MISSING`. Trail-like classes and anything inside a hiking-route relation are untouched, so they come out relatively better. GraphHopper rejects priority multipliers > 1, so this is a penalty on paved streets, not a boost. It never changes access (forbidden edges stay priority 0) and never changes the requested distance (round-trip/via calibration is untouched).
* `loops/scoring.ts`: bonus `0.3 x trailShare` (path/track/bridleway share from `road_class`) only when the flag is on. There was no surface penalty in the score before, so unpaved loops were never penalised; the bonus is only a tie-break, far below the 10 for failing a v1 bar and the 2x distance-error term.
* "Outside a dense city": the codebase has no density notion. The app (`src/lib/routing/prefer-trails.ts`) sends `preferTrails` only for running/walking and only when the resolved city is NOT one of the 13 big cities that have a Technion shade layer (no city = open country). Adjust that list if the owner wants a different cut.
* Wire: `POST /api/routes/generate` accepts `preferTrails: true` (running/walking only; ignored otherwise).

## Owner steps to make it effective

1. Merge, then turn the flag on in the admin panel (system settings). It already works on the current graph for the `road_class` part. Before enabling widely: call `/route` once with the new custom model (see `infra/graphhopper/README.md` smoke) and confirm HTTP 200, then compare loops in `/admin/routes/quality`.
2. To see trail colour or to rely on marked-trail membership reliably (optional, needs a graph rebuild + redeploy, see `infra/graphhopper/scripts/build.sh` / `deploy.sh`):
   * Add a custom GraphHopper encoded value / tag parser for `osmc:symbol` (a small Java plugin extending the import) or pre-filter the PBF with osmium to tag member ways, then add it to `graph.encoded_values`.
   * Rebuild the image (`IMPORT_XMX` 5g) and redeploy; then change the statement to use the new value and (only then) consider a different multiplier.
   * Do NOT deploy from this PR; rebuild/deploy is the owner's call.
