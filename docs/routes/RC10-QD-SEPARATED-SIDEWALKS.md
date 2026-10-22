# RC10 — Q-D: sidewalks along main roads count (routeScore v1.4)

Owner decision 22.10.2026 (answer to Q-D in `NATIONWIDE-RUN-2026-10.md`): in cities short of routes
"there's no choice, the route has to run next to the main road" (e.g. Petah Tikva). A walkway
**separated** from a major road is acceptable for walking / running.

## What changed

- `src/lib/urban-measure` — new measurement `separatedMajorPct` (part of `crossings`): the share of the
  route that is "on" a tertiary+ road (route-quality's on-road test: ≤ 10 m, parallel within 25°) while
  the walker is on a separated walkway — any of:
  - a walkway way (`footway` incl. OSM `footway=sidewalk`, `path`, `pedestrian`, `cycleway`, `steps`;
    `foot` not `no`) running parallel within **15 m** (`SEPARATED_WALKWAY_M`);
  - the major road itself tagged `sidewalk` / `sidewalk:both|left|right` = `both|left|right|separate|yes`.
  Always ≤ `majorRoadPct`.
- `src/lib/route-score` **v1.4** (walking / running only — `SEPARATED_WALKWAY_ACTIVITIES`; bike unchanged):
  - **safety**: the separated part of the major-road share keeps `SEPARATED_WALKWAY_SAFETY_SHARE = 0.5`
    of the points (a route entirely on such a walkway: 7.5 / 15 instead of 0); the on-road rest costs the
    v1.3 rate; unmarked major-road crossings are still penalised (−6 per crossing/km, max −6);
  - **surface**: that sidewalk counts at full weight (`SEPARATED_WALKWAY_SURFACE_WEIGHT = 1`, v1.3: ¼),
    capped at the composition's own sidewalk share.
  - Inputs without `separatedMajorPct` (stored docs, non-urban candidates) score exactly as in v1.3.

The scoring is per route, not per city: the urban floor (62) still only fills authorities below their
quota minimum.

## Dry-run — 7 short cities (production read-only, 22.10.2026)

Same environment both sides (`origin/main` at `d2067a02` = RC9 merged, vs. that + this change), same OSM
PBF, datasets (ofneidan, bicycle_jer_2019, bph_infra_exist) and GraphHopper answers (RC9 cache only — 0
live calls). The "before" column equals the RC9 nationwide run (`NATIONWIDE-RUN-2026-10.md`, floor 62).

| authority | quota min | selected before (RC9, v1.3) | after (Q-D, v1.4) | via urban floor |
|---|---|---|---|---|
| פתח תקווה | 25 | 3 | **5** | 1 → 3 |
| ראשון לציון | 25 | 3 | **10** | 2 → 3 |
| בני ברק | 25 | 3 | 3 | 0 → 0 |
| נתניה | 25 | 7 | 7 | 2 → 1 |
| אשדוד | 25 | 6 | **7** | 1 → 1 |
| אשקלון | 15 | 4 | **6** | 1 → 3 |
| קרית ים | 8 | 2 | 2 | 1 → 1 |
| **total** | | **28** | **40** | |

Newly selected (before → after score):
- **פתח תקווה**: שביל אופניים רבין 46 → 65; לאורך שלמה שמלצר 48 → 67
- **ראשון לציון**: אופנידן 57 → 71; לאורך המכבים 47 → 72; לאורך יעקב פריימן 46 → 71; לאורך חיים הרצוג 40 → 66;
  לאורך לוי אשכול 47 → 63; לאורך שדרות ההסתדרות 59 → 62; לולאת המלחים (קריית כרמים) 69 → 71
- **אשדוד**: טיילת הספורט 52 → 75; הקפת פארק בן גוריון 49 → 63 (טיילת פארק נחל לכיש, 66 unchanged, drops to candidate)
- **אשקלון**: לאורך אריה תגר 39 → 64; לאורך אריאל שרון 37 → 62
- **נתניה**: same count; one urban-floor pick replaced by a route now ≥ 70 on its own.

Bnei Brak and Kiryat Yam: no change — what is left there are generated / GraphHopper neighbourhood loops
(source tier "generated", 3 points, never urban-floor eligible) at 52–60, and in Kiryat Yam one MoT bike
route (cycling — Q-D does not apply to bike routes). The major-road rule is not what holds them back.
