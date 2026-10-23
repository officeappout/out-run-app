# TV mode (enable_tv_mode_v1)

Show a strength workout on a big screen. Owner-approved design: canvas page "10 · מסך רחב / טלוויזיה", boards W-13 … W-20.
Default OFF. With the flag off nothing changes anywhere: no ⋯ button, `/tv` says "not available", the phone layer renders nothing and loads no code.

## How it works

1. The TV opens `outrun.co.il/tv`. One big "OK" button (needed for `requestFullscreen`), then `POST /api/tv/session` creates `tvSessions/{code}` with the Admin SDK: 6 random digits (crypto), collision-safe, valid 4 hours, rate-limited per IP (`RL_TV_SESSION_IP_*`).
2. The TV shows one QR (`/tv?code=…`) + the same code. The code is both the join code and the control code.
3. The first real (non-guest) user that enters the code claims `hostUid` in one transaction and is the **host**: the phone is the remote and the source of truth. The TV only mirrors.
4. Every later phone is a **participant**: it writes only its own `participants/{uid}` and shows in the TV room / friends row. Equal list, host tagged.
5. Entry is ONLY before the workout starts: workout overview → ⋯ → "הצגה על מסך גדול" → sheet (W-18) → connect (W-14) → host panel (W-20) → "התחלת אימון".
6. The host phone stamps `hostBeatAt` (server time) every 5 s. No beat for 20 s while live → the TV shows the reconnect state (W-16) and keeps counting on its local clock; the phone offers retry / continue on phone only.
7. Timers: the mirror holds `{dir, baseMs, running}` and the server stamps `timerAnchorAt` only when the clock changes (pause / resume / new interval). The TV reads `baseMs ∓ (serverNow − anchor)`; `serverNow` comes from the heartbeat stamps (lowest-latency sample).

## Code map (`src/features/tv-mode`)

| Folder | What |
|---|---|
| `core/` | pure logic, no Firebase: code generation, expiry, mirror reducer + timer maths, host commands, screen state, participants, clock |
| `services/` | `TvSessionRepo` seam, Firestore + in-memory implementations, defensive doc parsers |
| `hooks/` | `useTvSessionView` (TV), `useTvJoin`, heartbeat / mirror publisher, presence, `useTvRunnerBridge`, fullscreen, QR scan |
| `tv/` `adapter/` `ui/` | the `/tv` screens; `adapter/` is the seam to the wide player |
| `phone/` | ⋯ menu + sheet, connect screen, host panel, participant panel, remote, lost bar, layer mounted in `ClientLayout` |

i18n: namespace `wide` (`pair.* remote.* lost.* lobby.* stage.* joined.* download.*`), ICU plurals for counts, gender via `hostGender` select, Intl numbers; the folders are in `migrated-paths.txt`.

## Not wired yet (on purpose)

- **Wide player (#768, `enable_wide_player_v1`)** — `adapter/TvStageAdapter.tsx` draws a `WideStageModel` with a stand-in light layout. After #768 lands, map the model onto `WideHeroClock` / `WideSplit` / `WideNextUp` there; nothing else changes.
- **StrengthRunner** — one call connects a player: `useTvRunnerBridge({ mirror, controls, progress })` (see `hooks/useTvRunnerBridge.ts`). Build `mirror` with `mirrorReducer`. Host: publishes + shows the remote. Participant: `progress` feeds the TV friends row. Not added because StrengthRunner is being reworked (#768 / #712).
- **Volume** is sent (`cmd` + `volume`) and applied to `useTvSessionView().local`; the TV has no audio element yet to apply it to.
- **Cast / AirPlay / tvOS** — out of scope.

## Owner actions (nothing here is deployed by the PRs)

1. **Rules**: review `docs/tv-mode/tv-sessions.rules.proposal`, paste into `firestore.rules`, run `tests/firestore-tv-sessions.rules.test.ts` against the emulator, deploy from main. Until then the feature cannot work (reads are denied) — keep the flag off.
2. **TTL policy** on field `expiresAt` for collection group `tvSessions` and for `participants` (Firestore console → TTL). Without it expired docs stay (they are unreadable, just not deleted).
3. **Universal links** for `outrun.co.il/tv`: iOS associated-domains/AASA path and `AndroidManifest.xml` `pathPrefix="/tv"` (needs a store release). Without it the QR opens the browser landing (store links) instead of the app; typing the code works either way.
4. **Flag** `enable_tv_mode_v1` in system settings (super admins preview it).
