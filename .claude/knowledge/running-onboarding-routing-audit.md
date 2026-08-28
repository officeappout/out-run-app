# Running-Onboarding Routing Audit — 21.08.2026

Read-only audit, requested before touching `ConsistencyWidget.tsx`'s "+ ריצה" button.
Nothing built. All three suspicions in the request were confirmed as real, code-verified bugs.

---

## א. gateway_track: localStorage/sessionStorage split — breaks the CANONICAL Gateway path too

`ConsistencyWidget.tsx:27-28` — `STRENGTH_ONBOARDING_HREF` and `RUN_ONBOARDING_HREF` are both
`/onboarding-new/profile`, and the "+ ריצה" button (line 185) doesn't pass any track signal.
That's bug #1, but it's not the blocking one.

**The real blocker:** `gateway_track` is written in exactly one place —
`src/app/gateway/page.tsx:410`, `setOnboardingPref('gateway_track', track)` — which writes to
`localStorage` (+ `@capacitor/preferences` on native). Every downstream reader reads it from
**`sessionStorage`** instead:
- `src/app/onboarding-new/program-path/page.tsx:98`
- `src/app/onboarding-new/dynamic/page.tsx:82,126,437`
- `src/app/onboarding-new/health/page.tsx:21`
- `src/app/onboarding-new/health-connect/page.tsx:14`

Grep confirms **zero** `sessionStorage.setItem('gateway_track', ...)` calls anywhere in the
codebase — no bridge, no hydration step copies the two stores for this key.

**Consequence:** `profile/page.tsx`'s `handleContinue` (full-onboarding branch, line 318-324)
routes unconditionally to `/onboarding-new/program-path` regardless of track — it never reads
`gateway_track` itself. `program-path/page.tsx:98` then checks
`sessionStorage.getItem('gateway_track') === 'RUNNING'` to decide whether to redirect into the
running tree (`dynamic`) — this read is always `null`, so **the redirect never fires**, even for
a user who tapped "קבל תוכנית ריצה" at Gateway and went through the intended Path B/C flow.
Every user, strength or running, currently lands in the STRENGTH-only muscle/skills picker.

**Implication for the requested fix:** the split must be fixed first (either write
`gateway_track` to `sessionStorage` too at the point `setOnboardingPref` is called, or change
all four readers to use `getOnboardingPref`/`getOnboardingPrefAsync`). Fixing only the
`ConsistencyWidget` button href/track-param would still dead-end at the same broken read — the
button isn't a special case, it's exercising an already-broken canonical path.

Side note, not asked but same shape: `assessment-visual/page.tsx:90` reads `gateway_uid` via
`sessionStorage.getItem` while `profile/page.tsx:28` correctly uses `getOnboardingPref` — worth a
follow-up look if `gateway_uid` resolution is ever suspected on that screen, but out of scope
here.

---

## ב. runningPlan / runningPace have no `step` → no JIT path exists for them at all

`profile-completion.service.ts:198-212` — `runningPlan` and `runningPace` items have no `step`
field (unlike every strength item, which sets `step: 'PERSONA'|'SCHEDULE'|'EQUIPMENT'`).
`ProfileCompletionWidget.tsx:121` — `{!item.completed && item.step && (<button onClick={() =>
handleGoToStep(item.step!)}>השלם</button>)}` — no `step` ⇒ no button renders. Confirmed exactly
as suspected.

**This isn't a missing field — the JIT surface has no running concept at all.**
`OnboardingWizard.tsx` (mounted by `/onboarding-new/setup/page.tsx`) drives its step machine off
`OnboardingStepId` (`src/features/user/onboarding/types.ts:197-214`):
```
PERSONA | PERSONAL_STATS | LOCATION | EQUIPMENT | SCHEDULE | HEALTH_DECLARATION |
ACCOUNT_SECURE | PROCESSING | ACCESS_CODE | HISTORY | SOCIAL_MAP | COMMUNITY | COMPLETED | SUMMARY
```
Zero running-related values. `?step=...` on `/onboarding-new/setup` cannot express "collect a
running plan" — there's nothing to route the JIT wizard to even if a step id existed for these
two items, since the wizard itself has no running screens wired into its sequence
(`useEffect`/`renderStep` switch only cases `PERSONA|EQUIPMENT|SCHEDULE|...`, no running case).

**Confirms your alternative:** a real fix needs a different target entirely — e.g. `handleGoToStep`
for these two items pushing to `/onboarding-new/dynamic` with a running-track signal set, the same
mechanism the button in (א) needs once that mechanism is actually fixed. Two different UI entry
points (ConsistencyWidget button, ProfileCompletionWidget "השלם" button) converge on the same
underlying gap: no working way today to hand a user into the running question tree from outside
the original Gateway flow, and the Gateway flow itself doesn't work either per (א).

---

## ג. enable_running_programs flag — hard stop at running-schedule, not fixable in code

`src/hooks/useFeatureFlags.ts:32-37` — `SAFE_DEFAULTS.enableRunningPrograms = false`; live value
comes from `system_config/feature_flags.enable_running_programs` (Firestore, currently off per
David).

`src/app/onboarding-new/running-schedule/page.tsx:21,28-31` — route guard:
```
// Route guard: when enable_running_programs is false, immediately redirects to /home.
if (!loading && !flags.enableRunningPrograms) {
  router.replace('/home');
}
```
Grep confirms `running-schedule/page.tsx` is the **only** onboarding-new page that checks this
flag — `dynamic`, `running-plan-length`, `running-summary` don't gate on it themselves, so a user
can get all the way through the running questionnaire and only get bounced at this one checkpoint,
right after `dynamic/page.tsx`'s `handleComplete()` pushes to `/onboarding-new/running-schedule`
(line 542) on the running branch.

**No code change needed or suggested here** — this is purely "the flag must be flipped true in
the admin panel before any manual on-device test can reach past this screen," exactly as you
flagged. Leaving as a pre-test checklist item, not a bug.

---

## Fix-order implication (for when we do write code)

1. (א) `gateway_track` storage-layer bridge — this alone unblocks the *existing* canonical
   Gateway → RUNNING flow, independently of anything about ConsistencyWidget.
2. Only after (1): decide how ConsistencyWidget's "+ ריצה" button and ProfileCompletionWidget's
   runningPlan/runningPace "השלם" buttons each seed the same track signal before navigating —
   likely both converging on `/onboarding-new/dynamic` with the track set via whatever mechanism
   (1) settles on.
3. (ג) is not a code task — flip the Firestore flag before any device verification of (1)/(2).
