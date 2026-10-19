# Workout engines (pure)

Two framework-free state machines + thin hooks. No React / Firebase / clock
reads inside the machines: every event carries `atMs`. Not wired into any
screen yet — a caller mounts the hooks behind `enable_home_v2`.

## How it fits the existing model

| Existing piece | Role here |
|---|---|
| `hybrid/compose-hybrid-session.service` → `HybridPlannedSegment[]` | input of the hybrid sequencer |
| `hybrid/hybrid-orchestrator` (`hybridReduce`, `finalizeHybridRun`) | driven underneath; still the only producer of `SessionSegmentRecord[]` |
| `core/types/protocol.types` (`TabataProtocolConfig`, `EmomProtocolConfig`, `AmrapProtocolConfig`, `RoundItem`, `AerobicLegResult`) | configs / results of the timed engine |
| `players/strength/protocols/tabata.advance` (`tabataIntervalInfo`) | tabata member order (cycle- / exercise-major, unilateral = 2 intervals) |
| `players/running/lib/planned-rep-results` (`SHORT_LEG_METERS`) | the "no pace under 400 m" rule (`leg-pace.ts`) |
| `SegmentExerciseDetail` (storage.service) | per-set / per-round output → `stationRows` / `ExerciseSetsTable` |

## Hybrid sequencer (`hybrid/`) — F-2*, F-3*, U-D1..D4

`idle → run → transition → station → run|cooldown → … → done`

- **Arrival** (`arrival-detector.ts`): geofence around the station's lat/lng —
  enter 40 m, exit 65 m (hysteresis), 2 consecutive inside fixes, fixes with
  accuracy worse than 50 m ignored, armed only after one fix outside the exit
  radius (a park at the start never auto-arrives). No coordinates → the
  orchestrator's route-km threshold. Manual `ARRIVE_MANUAL` ("הגעתי") always works.
- **Transition**: 20 s countdown, `EXTEND_TRANSITION` +20 s, `START_STATION`
  now, auto-start on `TICK` (back-dated to the countdown end), pause/resume.
- **Station**: `SET_DONE` per set (reps, optional side) builds the exercise log;
  `STATION_DONE` (a strength-player log wins), `SKIP_STATION` from transition
  or station. Station time starts with the strength work, not at arrival.
- **Cool-down** = the aerobic leg after the last station.
- **Results**: `legResults` (run: distance / time / pace — null under 400 m;
  station: sets, exercise log, transition seconds, how it arrived);
  `finalizeSequencer` = `finalizeHybridRun` → `hybridRings` / `hybridStationTables`.

## Timed engine (`timed/`) — A-1 tabata, A-2 AMRAP, A-4 EMOM, A-5 mixed, U-E3

Position = f(start, pauses, now): `activeMs = now − start − paused`. Nothing is
accumulated per tick, so background / resume is exact (`clock.ts` explains why
wall time, clamped monotonic, is the source).

- **Tabata**: n×work + (n−1)×rest (no trailing rest, like the player); optional
  reps per interval; otherwise seconds worked.
- **EMOM**: per minute `pending → done | partial | missed`. Done early → rest of
  the minute. A tap ≤ 1 s after rollover counts for the minute that ended.
  `LOG_REPS` turns a missed minute into partial (or done at target).
- **AMRAP**: items in order, no rest between rounds; at the cap the clock
  freezes and the engine waits for the CURRENT item's reps (`awaiting_partial`),
  then done. Score = full rounds + reps of the unfinished round.
- **Run inside a round**: completes by GPS distance (or time); cut by the cap →
  recorded with the distance covered. Pace only for legs ≥ 400 m.
- **Mixed (A-5)**: `timedSpecFromSegment` per segment — block-scoped protocols
  come here, the rest stay with the strength player.
- **Cues**: `cuesBetween` (countdown 3-2-1, phase / minute start, cap, end);
  stale countdowns dropped after a background gap. `isLastSeconds` = ≤ 5 s.
- **Result**: `buildTimedResult` → `exerciseLog` (one value per round / minute /
  interval) + `toStrengthSegmentRecord` for a session's `segments[]`.

## Preview / live strips

- `preview-strips.ts`: `hybridJourneyItems` / `timedJourneyItem` → `JourneyStrip`;
  `hybridProfileStrip` / `timedProfileStrip` → `ProfileStrip` (from
  `intensity-profile.ts`: relative duration + level + colour key per block).
- `hybrid/sequencer.strip.ts`, `timed/timed.strip.ts` → live cart ring
  (`CartProgressIcon`) and `StoryBars` via `toCartItems` / `toStorySegments`.

## Hooks (`hooks/`)

`useTimedBlock(spec, { enabled })`, `useHybridSequencer(plan, { enabled })` —
stamp `atMs`, refresh the display, resync on `visibilitychange`. Pass
`enabled: enableHomeV2`; disabled = inert.
