#!/bin/bash
# scripts/ci/file-size-advisory.sh
# ── File-size guideline report (ADVISORY — always exits 0) ────────────────
#
# Sizes are a guideline, not an iron rule (owner, 21.10.2026). This script
# only REPORTS; it never fails a build or a commit. It is deliberately NOT
# wired into scripts/safety-check.sh.
#
# For files ADDED or CHANGED between <base> and HEAD it flags:
#   • a NEW file over the guideline for its kind
#   • an EXISTING file over the guideline that grew by more than 25 lines
#   • (info only) an existing file over the guideline that was touched
#     without growing much — "while you're here, consider splitting"
#
# Guideline (docs/architecture/STANDARDS.md, from the A0 audit §3.2):
#   page.tsx / route.ts           300 lines
#   component (.tsx) / hook (use*) 500 lines
#   service / lib (other .ts/.js) 600 lines
#   exempt: *.data.ts, */data/**, src/lib/data/**, *.fixtures.ts, tests,
#           functions/src/shared/** (vendored mirror), *.d.ts, *.json
#
#   bash scripts/ci/file-size-advisory.sh                # base = merge-base with origin/main
#   bash scripts/ci/file-size-advisory.sh HEAD^1         # explicit base (CI: PR merge commit)
#   bash scripts/ci/file-size-advisory.sh --files a b c  # just measure these files (no growth check)
#
# In GitHub Actions each finding is also emitted as a ::warning / ::notice
# annotation on the file.
set -u
cd "$(dirname "$0")/../.." || exit 0

GROWTH_LIMIT=25

limit_for() {
  # echoes "<limit> <kind>" or "exempt"
  local f="$1" base
  base="$(basename "$f")"
  case "$f" in
    *__tests__/*|*.test.ts|*.test.tsx|*.spec.ts|*.spec.tsx|*.test.js|*.spec.js) echo exempt; return ;;
    *.d.ts|*.data.ts|*.data.tsx|*.fixtures.ts|*.fixture.ts) echo exempt; return ;;
    src/lib/data/*|*/data/*|functions/src/shared/*) echo exempt; return ;;
  esac
  case "$base" in
    page.tsx|page.ts|page.jsx|page.js|route.ts|route.js) echo "300 page/route"; return ;;
  esac
  case "$base" in
    use[A-Z]*.ts|use[A-Z]*.tsx|*.tsx|*.jsx) echo "500 component/hook"; return ;;
    *.ts|*.js|*.mjs) echo "600 service/lib"; return ;;
  esac
  echo exempt
}

annotate() {
  # $1 = warning|notice, $2 = file, $3 = message
  [ -n "${GITHUB_ACTIONS:-}" ] && echo "::$1 file=$2,line=1::$3"
  return 0
}

count_lines() { wc -l < "$1" 2>/dev/null | tr -d ' '; }

warned=0
noted=0

check_file() {
  # $1 = status (A/M/R/-), $2 = path now, $3 = path at base (may be empty)
  local status="$1" f="$2" old="${3:-}" spec limit kind now before grew msg
  [ -f "$f" ] || return 0
  spec="$(limit_for "$f")"
  [ "$spec" = exempt ] && return 0
  limit="${spec%% *}"; kind="${spec#* }"
  now="$(count_lines "$f")"
  [ "$now" -gt "$limit" ] || return 0

  if [ "$status" = A ] || [ -z "$old" ]; then
    if [ "$status" = "-" ]; then
      msg="$now lines, guideline for a $kind is $limit"
    else
      msg="NEW file, $now lines, guideline for a $kind is $limit — consider splitting before it grows"
    fi
    echo "⚠ $f: $msg"; annotate warning "$f" "size guideline: $msg"; warned=$((warned+1))
    return 0
  fi

  before="$(git show "$BASE:$old" 2>/dev/null | wc -l | tr -d ' ')"
  [ -n "$before" ] || before=0
  grew=$((now - before))
  if [ "$grew" -gt "$GROWTH_LIMIT" ]; then
    msg="$before → $now lines (+$grew), over the $limit guideline for a $kind and grew by more than $GROWTH_LIMIT — extract the part you touched"
    echo "⚠ $f: $msg"; annotate warning "$f" "size guideline: $msg"; warned=$((warned+1))
  else
    msg="$before → $now lines ($( [ "$grew" -ge 0 ] && echo "+$grew" || echo "$grew" )), already over the $limit guideline for a $kind — ok to touch, try not to grow it"
    echo "· $f: $msg"; annotate notice "$f" "size guideline: $msg"; noted=$((noted+1))
  fi
}

echo "File-size guideline report (advisory — never fails; see docs/architecture/STANDARDS.md)"

if [ "${1:-}" = "--files" ]; then
  shift
  BASE=""
  for f in "$@"; do check_file - "$f" ""; done
else
  BASE="${1:-}"
  if [ -z "$BASE" ]; then
    BASE="$(git merge-base origin/main HEAD 2>/dev/null)" || BASE=""
  fi
  if [ -z "$BASE" ] || ! git rev-parse -q --verify "$BASE^{commit}" >/dev/null 2>&1; then
    echo "No usable base ref — nothing to compare. (advisory, exiting 0)"
    exit 0
  fi
  CHANGES="$(git diff --name-status -M --diff-filter=ACMR "$BASE" HEAD -- \
    'src/*.ts' 'src/*.tsx' 'src/*.js' 'src/*.jsx' \
    'functions/src/*.ts' 'functions/src/*.js' 2>/dev/null)"
  if [ -z "$CHANGES" ]; then
    echo "✓ no source files changed"
    exit 0
  fi
  while IFS=$'\t' read -r st a b; do
    case "$st" in
      A*) check_file A "$a" "" ;;
      C*) check_file A "$b" "" ;;
      R*) check_file R "$b" "$a" ;;
      M*) check_file M "$a" "$a" ;;
    esac
  done <<EOF
$CHANGES
EOF
fi

if [ "$warned" -eq 0 ] && [ "$noted" -eq 0 ]; then
  echo "✓ every changed file is within the size guideline"
else
  echo "— $warned warning(s), $noted note(s). Guideline only; nothing is blocked."
fi
exit 0
