#!/usr/bin/env bash
# Runs the Firestore-emulator suites that vitest.ci.config.ts excludes from the
# unit-tests gate. Two emulator instances are needed because the suites are
# hard-coded to two ports (8080 = firebase.json, 8089 = firebase-audit.json).
#
# Each file runs ALONE in its own vitest process, inside its own freshly
# started emulator: the suites wipe the whole DB in beforeAll/afterEach, so
# they cannot run concurrently (see the readiness suites' own headers).
#
# NEVER stops at the first red file and NEVER silently skips one: every file's
# result is listed, and the script exits non-zero if any failed. Whether that
# blocks a merge is decided by the workflow (blocking since Stage C — see ci.yml), not here.
#
# Out of scope for now (listed so the gap is explicit, not silently dropped):
#   - tests/storage-fix-delete-rules.rules.test.ts  Storage emulator (:9199),
#     documented as unreliable in vitest.config.ts.
#   - create-unit-directory-sync.emulator.test.ts   needs the Functions
#     emulator + built functions/ (known env gap, 00-MASTER-PLAN §13.81).
#
# Usage:
#   run-emulator-suites.sh                      all suites
#   run-emulator-suites.sh --only <8080|8089> <file>...   just those files
set -uo pipefail

GROUP_8080=(
  tests/firestore-rules.test.ts
  src/app/api/units/create/__tests__/create-unit.emulator.test.ts
  src/features/readiness/core/services/__tests__/readiness-bulk-import-results.emulator.test.ts
  src/features/readiness/core/services/__tests__/readiness-match.emulator.test.ts
  src/features/readiness/core/services/__tests__/readiness-result-correction.emulator.test.ts
  src/features/readiness/core/services/__tests__/readiness-run-level.emulator.test.ts
  src/features/readiness/core/services/__tests__/readiness-strength-level.emulator.test.ts
  src/features/readiness/core/services/__tests__/readiness-trends.emulator.test.ts
  src/features/readiness/core/services/__tests__/readiness-unit-detail.emulator.test.ts
  src/features/readiness/core/services/__tests__/readiness-vertical-overview.emulator.test.ts
)

GROUP_8089=(
  tests/firestore-fix-chats-messages-fieldguard.rules.test.ts
  tests/firestore-fix-connections-selffollow.rules.test.ts
  tests/firestore-fix-feed-posts-scope-fields.rules.test.ts
  tests/firestore-fix-group-invitations-hostuid.rules.test.ts
  tests/firestore-fix-membercount-streaks-clamp.rules.test.ts
  tests/firestore-fix-planned-sessions-privacy.rules.test.ts
  tests/firestore-fix-write-layer2-batch-a.rules.test.ts
  tests/firestore-fix-write-layer2-batch-b-attendance.rules.test.ts
  tests/military-panel-adversarial-audit.rules.test.ts
  src/features/readiness/core/services/__tests__/military-panel-adversarial-audit.emulator.test.ts
  src/app/api/authority-manager/city-summary/__tests__/city-summary.emulator.test.ts
  src/app/api/social/promote-waitlist/__tests__/promote-waitlist.emulator.test.ts
  src/features/parks/core/hooks/__tests__/planned-sessions-query-shapes.test.ts
  src/lib/__tests__/joinEngine.hostuid-escalation.emulator.test.ts
  functions/src/__tests__/reminderSweepScheduler.emulator.test.ts
)

RESULTS=$(mktemp)

run_group() {
  local config="$1"; shift
  local f
  for f in "$@"; do
    echo "::group::$f"
    if firebase emulators:exec --only firestore --config "$config" --project appout-1 \
        "npx vitest run $f"; then
      echo "PASS $f" >> "$RESULTS"
    else
      echo "FAIL $f" >> "$RESULTS"
    fi
    echo "::endgroup::"
  done
}

if [ "${1:-}" = "--only" ]; then
  port="$2"; shift 2
  config=firebase.json
  [ "$port" = "8089" ] && config=firebase-audit.json
  run_group "$config" "$@"
else
  run_group firebase.json "${GROUP_8080[@]}"
  run_group firebase-audit.json "${GROUP_8089[@]}"
fi

echo
echo "===== Emulator suites summary ====="
cat "$RESULTS"
if [ -n "${GITHUB_STEP_SUMMARY:-}" ]; then
  { echo "### Emulator suites"; echo '```'; cat "$RESULTS"; echo '```'; } >> "$GITHUB_STEP_SUMMARY"
fi
! grep -q '^FAIL' "$RESULTS"
