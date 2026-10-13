#!/usr/bin/env bash
# Mutation check for the emulator gate: proves the rules suites actually FAIL
# when firestore.rules is deliberately made wrong. A green emulator job only
# means something if a planted regression turns it red.
#
# For each mutation: (1) run the target suite UNMUTATED and require PASS (so a
# later failure is attributable to the mutation, not to a flaky/red suite),
# (2) apply the mutation to firestore.rules, (3) run the same suite and require
# FAIL ("killed"). A mutation that leaves the suite green "survived" = a hole in
# the gate. firestore.rules is restored from a backup on exit (trap) and the
# script verifies the working tree is clean for that file afterwards.
#
# Local/CI use only — it rewrites firestore.rules in the working tree for a few
# minutes. Never run it in a checkout with uncommitted rules edits (it refuses).
#
# Usage: bash scripts/ci/mutation-check-rules.sh
set -uo pipefail

RULES=firestore.rules

if ! git diff --quiet -- "$RULES"; then
  echo "Refusing to run: $RULES has uncommitted changes."
  exit 2
fi

LOG=$(mktemp)
BACKUP=$(mktemp)
cp "$RULES" "$BACKUP"
restore() { cp "$BACKUP" "$RULES"; }
trap restore EXIT

# name | config | suite | perl -0 substitution
MUTATIONS=(
  "catch-all widened (isRootAdmin -> isAuthenticated)|firebase.json|tests/firestore-rules.test.ts|s{(match /\{document=\*\*\} \{\s*allow read, write: if )isRootAdmin\(\);}{\$1isAuthenticated();}"
  "admin_invitations read opened to any signed-in user|firebase.json|tests/firestore-rules.test.ts|s{allow read: if isRootAdmin\(\);}{allow read: if isAuthenticated();}"
  "persona gate removed from group-member create|firebase.json|tests/firestore-rules.test.ts|s{\n\s*&& !blockedByGroupPersonaGate\(docId\)}{}"
  "connections self-follow re-opened|firebase-audit.json|tests/firestore-fix-connections-selffollow.rules.test.ts|s{resource\.data\.get\('followers', \[\]\)\.hasAny\(\[request\.auth\.uid\]\) &&.*?removeAll\(\[request\.auth\.uid\]\)\);}{true;}s"
)

run_suite() { # config suite -> exit code of the suite
  firebase emulators:exec --only firestore --config "$1" --project appout-1 \
    "npx vitest run $2" > "$LOG" 2>&1
}

BASELINE_DONE=" "
RESULTS=()
SURVIVED=0

for m in "${MUTATIONS[@]}"; do
  IFS='|' read -r name config suite expr <<< "$m"
  echo "=== $name"

  restore
  case "$BASELINE_DONE" in *" $suite "*) ;; *)
    if run_suite "$config" "$suite"; then
      BASELINE_DONE="$BASELINE_DONE$suite "
    else
      echo "  BASELINE RED for $suite — cannot attribute a failure to the mutation"
      tail -20 "$LOG"
      RESULTS+=("INVALID  $name (unmutated suite already red)")
      SURVIVED=1
      continue
    fi
  ;; esac

  perl -0pi -e "$expr" "$RULES"
  if cmp -s "$RULES" "$BACKUP"; then
    echo "  MUTATION DID NOT APPLY (anchor not found)"
    RESULTS+=("INVALID  $name (anchor not found)")
    SURVIVED=1
    continue
  fi

  if run_suite "$config" "$suite"; then
    echo "  SURVIVED — suite stayed green with a broken rule"
    RESULTS+=("SURVIVED $name  [$suite]")
    SURVIVED=1
  else
    # A mutation that merely breaks rules COMPILATION would also turn the suite
    # red without proving anything about the assertions. Require real failing
    # cases, and show them.
    if grep -qiE "compil|syntax error|invalid.*rules|Could not load rules" "$LOG" && ! grep -qE '✗|×' "$LOG"; then
      echo "  INVALID — red because of a rules compile/load error, not an assertion"
      RESULTS+=("INVALID  $name (rules did not compile)")
      SURVIVED=1
    else
      echo "  killed by:"
      sed 's/\x1b\[[0-9;]*m//g' "$LOG" | grep -E '✗|×' | sort -u | sed 's/^/    /' | cut -c1-150
      RESULTS+=("KILLED   $name  [$suite]")
    fi
  fi
  restore
done

restore
if ! git diff --quiet -- "$RULES"; then
  echo "ERROR: $RULES not restored cleanly"
  exit 3
fi

echo
echo "===== Mutation check summary ====="
printf '%s\n' "${RESULTS[@]}"
exit $SURVIVED
