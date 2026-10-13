#!/bin/bash
# scripts/ci/tsc-baseline.sh
# ── TypeScript "no NEW errors" gate ────────────────────────────────────────
#
# The repo carries a large pre-existing tsc error backlog, so `tsc` cannot be
# a plain pass/fail gate. This compares the current error set against a
# committed baseline (.github/tsc-baseline.txt) and fails ONLY on errors that
# are not in it.
#
#   scripts/ci/tsc-baseline.sh check    # CI mode: exit 1 if any NEW error
#   scripts/ci/tsc-baseline.sh update   # rewrite the baseline from current tsc
#
# Matching key = "<file>: TSxxxx: <message>" — the (line,col) is deliberately
# dropped so an unrelated edit that shifts a legacy error down 3 lines is not
# reported as "new". Compared as a multiset (comm), so a SECOND identical
# error in the same file is still caught. Fixing legacy errors never fails
# the gate; the script prints a reminder to run `update` so the baseline only
# ratchets down. Run `update` from a clean main-based tree, never to absorb a
# PR's own new errors.

set -euo pipefail
export LC_ALL=C

MODE="${1:-check}"
BASELINE=".github/tsc-baseline.txt"
RAW="$(mktemp)"
CURRENT="$(mktemp)"
trap 'rm -f "$RAW" "$CURRENT"' EXIT

# `tsc` exits non-zero whenever it reports errors — the normal case here.
npx tsc --noEmit --incremental false > "$RAW" 2>&1 || true

# Only top-level "error TS" lines (continuation lines are indented; ignored).
grep -E '^[^ ].*\([0-9]+,[0-9]+\): error TS[0-9]+:' "$RAW" \
  | sed -E 's/\([0-9]+,[0-9]+\): error /: /' \
  | sort > "$CURRENT" || true

# Guard: if tsc printed output but nothing parseable as an error (crash, bad
# config, missing module), an empty list would silently PASS the gate.
if [ ! -s "$CURRENT" ] && [ -s "$RAW" ]; then
  echo "tsc produced output but no parseable errors — refusing to treat as clean:"
  head -20 "$RAW"
  exit 2
fi

if [ "$MODE" = "update" ]; then
  cp "$CURRENT" "$BASELINE"
  echo "Baseline rewritten: $(wc -l < "$BASELINE" | tr -d ' ') errors -> $BASELINE"
  exit 0
fi

NEW="$(comm -13 "$BASELINE" "$CURRENT" || true)"
FIXED="$(comm -23 "$BASELINE" "$CURRENT" || true)"

echo "tsc errors: current=$(wc -l < "$CURRENT" | tr -d ' ') baseline=$(wc -l < "$BASELINE" | tr -d ' ')"

if [ -n "$FIXED" ]; then
  echo "ℹ️  $(echo "$FIXED" | wc -l | tr -d ' ') baseline error(s) no longer occur — run 'scripts/ci/tsc-baseline.sh update' on main to ratchet the baseline down."
fi

if [ -n "$NEW" ]; then
  echo ""
  echo "🚫 $(echo "$NEW" | wc -l | tr -d ' ') NEW TypeScript error(s) not in the baseline:"
  echo "$NEW" | sed 's/^/  /'
  echo ""
  echo "Fix them (do not 'update' the baseline to absorb them)."
  exit 1
fi

echo "✅ no new TypeScript errors"
