#!/bin/bash
# scripts/ci/v2-raw-style-grep.sh
# ── Design language v2: raw-style drift report (WARN-ONLY) ─────────────────
#
# Flags hand-rolled copies of v2 chrome that should come from the shared
# primitives in src/components/ui/v2/ instead:
#   • raw brand hex  #00baf7 / #00c9f2  → Tailwind v2-* tokens or V2_COLORS
#   • rounded-t-[28px]                   → <Sheet> (SHEET_SURFACE_CLASS)
#
# Scans src/ (ts/tsx/css), skipping src/components/ui/v2/ (where the tokens
# and primitives live), src/app/globals.css (CSS-var source of truth) and
# test files. Always exits 0 — it reports, it never gates; the counts are a
# ratchet to drive down as screens migrate.
#
#   bash scripts/ci/v2-raw-style-grep.sh            # summary + every hit
#   bash scripts/ci/v2-raw-style-grep.sh --summary  # counts only
#
# In GitHub Actions each hit is also emitted as a ::warning annotation
# (capped at 50 per pattern so the log stays readable).
set -u
cd "$(dirname "$0")/../.." || exit 0

SUMMARY_ONLY=0
[ "${1:-}" = "--summary" ] && SUMMARY_ONLY=1

scan() {
  # $1 = extended regex, case-insensitive
  grep -rniE "$1" src \
    --include='*.ts' --include='*.tsx' --include='*.css' 2>/dev/null \
    | grep -v '^src/components/ui/v2/' \
    | grep -v '^src/app/globals.css:' \
    | grep -vE '(__tests__/|\.test\.tsx?:)'
}

report() {
  # $1 = label, $2 = regex, $3 = hint
  local hits count files
  hits="$(scan "$2")"
  if [ -z "$hits" ]; then
    echo "✓ $1: 0"
    return
  fi
  count="$(printf '%s\n' "$hits" | wc -l | tr -d ' ')"
  files="$(printf '%s\n' "$hits" | cut -d: -f1 | sort -u | wc -l | tr -d ' ')"
  echo "⚠ $1: $count occurrence(s) in $files file(s) — $3"
  if [ "$SUMMARY_ONLY" -eq 0 ]; then
    printf '%s\n' "$hits" | cut -c1-200 | sed 's/^/    /'
  fi
  if [ -n "${GITHUB_ACTIONS:-}" ]; then
    printf '%s\n' "$hits" | head -50 | while IFS=: read -r f l _; do
      echo "::warning file=$f,line=$l::v2 drift ($1) — $3"
    done
  fi
}

echo "v2 raw-style drift report (warn-only, outside src/components/ui/v2)"
report 'raw #00baf7' '#00baf7' 'use text-v2-accent / bg-v2-cta / V2_COLORS.accent'
report 'raw #00c9f2' '#00c9f2' 'use the v2 tokens / V2_COLORS.cyan (or ACTIVITY_COLORS.run)'
report 'rounded-t-[28px]' 'rounded-t-\[28px\]' 'use <Sheet> from @/components/ui/v2'
exit 0
