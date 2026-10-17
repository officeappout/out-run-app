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
#
# Union member order is ignored (17.10.2026): tsc prints union members in
# internal type-id order, which shifts with module load order, so an unchanged
# error could read '"a" | "b"' in the baseline and '"b" | "a"' today. Both sides
# go through scripts/ci/tsc-normalize.mjs (sorts top-level union members inside
# quoted types) before the compare. Nothing else is normalized — a genuinely new
# error (new file / code / message / member set) still fails.
#
#   scripts/ci/tsc-baseline.sh compare <baseline> <current>   # tests: no tsc run

set -euo pipefail
export LC_ALL=C

MODE="${1:-check}"
BASELINE=".github/tsc-baseline.txt"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
RAW="$(mktemp)"
CURRENT="$(mktemp)"
BASE_N="$(mktemp)"
CUR_N="$(mktemp)"
trap 'rm -f "$RAW" "$CURRENT" "$BASE_N" "$CUR_N"' EXIT

normalize() { node "$SCRIPT_DIR/tsc-normalize.mjs" < "$1" | sort > "$2"; }

if [ "$MODE" = "compare" ]; then
  BASELINE="$2"
  cp "$3" "$CURRENT"
else

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
fi

if [ "$MODE" = "update" ]; then
  cp "$CURRENT" "$BASELINE"
  echo "Baseline rewritten: $(wc -l < "$BASELINE" | tr -d ' ') errors -> $BASELINE"
  exit 0
fi

normalize "$BASELINE" "$BASE_N"
normalize "$CURRENT" "$CUR_N"
NEW="$(comm -13 "$BASE_N" "$CUR_N" || true)"
FIXED="$(comm -23 "$BASE_N" "$CUR_N" || true)"

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
