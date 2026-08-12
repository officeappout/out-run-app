# Thermal-state diagnostic — 11.08.2026

David asked how a "heat improved a bit" claim could be verified objectively, since a JS
console log can't measure temperature directly — only infer it indirectly from workload
(log volume, operation timing). Offered to wire iOS's real `ProcessInfo.thermalState` API
through to the console instead of relying on inference. He said yes.

## What shipped (PUSHED to `main`, `acf4d1a6`)

- `ios/App/App/ViewController.swift` — mirrors the existing `didReceiveMemoryWarning() →
  bridge.triggerWindowJSEvent(eventName: "memoryWarning")` pattern already in this file.
  Registers a `NotificationCenter` observer for `ProcessInfo.thermalStateDidChangeNotification`
  in `viewDidLoad()`, forwards the real state (`nominal`/`fair`/`serious`/`critical` — the
  same tiers iOS itself uses to throttle CPU/GPU) via a new `thermalStateChanged` window
  event. Baseline seed deliberately placed in `onWebContentRecovered()` (fires on the first
  successful navigation finish), not `viewDidLoad` — at `viewDidLoad` time
  `window.Capacitor` doesn't exist yet in the WebView JS context, so an earlier attempt
  silently no-ops (caught by code-reviewer before commit).
- `src/lib/appForeground.ts` — listens for `thermalStateChanged`, logs
  `[thermal] state=<value>` to console. Diagnostic only — nothing sheds behavior on this
  signal (unlike memoryWarning's `_signalMemoryWarning` store wiring).

**Verified, not assumed:** Capacitor's `triggerWindowJSEvent(eventName:, data:)` does NOT
produce a `CustomEvent` with `.detail` — read `native-bridge.js`'s `createEvent` directly:
it spreads the data object's keys DIRECTLY onto the `Event` instance (`ev[key] = value`).
So the JS listener reads `(e as unknown as {state?:string}).state`, not `e.detail.state`.
Got this right the first time by checking the source before writing the listener, not by
assuming CustomEvent semantics.

## Real gotcha hit while shipping this — read before touching ViewController.swift again

`work/free-run-build`'s copy of `ViewController.swift` was STALE — missing an entire
feature (`notifyNativeBackInWorkout` / edge-swipe-back interception on active-workout
routes, commits `3367c778`+`9e34a943`) that shipped directly to `origin/main` from a
different concurrent session and was never merged back into this branch (this branch only
ever gets cherry-picked FROM, never rebased/merged FROM origin/main). My first edit,
applied against the stale base, silently would have DROPPED that feature if pushed via a
normal cherry-pick — a real, shipped safety feature, not a hypothetical.

**How it was caught:** re-reading the file after the edit and noticing the whole
"Workout exit-guard parity" MARK section was gone. **How it was fixed:** pulled
`origin/main`'s actual current file content, manually re-applied the same 3 additions
against THAT correct base (verified via `diff` that the result differs from origin/main
by exactly those 3 additions, nothing else), and pushed that — not the cherry-pick of the
commit built on the stale base.

**Lesson for any future native (ios/, android/) file edit specifically:** these files are
touched directly by other concurrent sessions' pushes more than most web/TS files (smaller
surface, less naturally conflict-avoidant than TS module boundaries) — always diff the
target file against `origin/main`'s CURRENT content before trusting a local branch's copy
as the real base, not just before pushing. This one nearly shipped a silent regression to
a safety feature (accidental exit during an active workout).

## Status

Native-only change — requires an actual new iOS build/TestFlight release to reach David's
device (not deployable via a web push alone, axioms.md §10). Not yet tested — waiting on
David's next native build.
