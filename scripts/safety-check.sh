#!/bin/bash
# scripts/safety-check.sh
# ── Static Pre-Commit Safety Check ─────────────────────────────────────────
#
# Catches 2 hard-block patterns on staged diffs (new lines only).
# Runs via Claude Code PreToolUse hook on Bash(git commit*).
#
# ⚠️  SCOPE LIMITATION: PreToolUse only intercepts agent-issued git commits
#     (those run by Claude Code). Manual commits in a terminal bypass this.
#     TODO: replicate as .githooks/pre-commit + `git config core.hooksPath .githooks`
#     for full coverage.
#
# What this checks (2 patterns only — everything else is AI-layer):
#   1. 'social.groupIds': as Firestore field key outside authorized routes
#   2. New get(/databases/.../documents/users/) in .rules files (1MiB read risk)
#
# What this does NOT check (AI reviewer's job):
#   - arrayRemove usage (legitimate uses exist)
#   - googleapis top-level imports (context-dependent)
#   - General axioms violations requiring reasoning

set -euo pipefail

# Authorized files allowed to write 'social.groupIds' as a Firestore field key
# Source: src/app/api/social/group-membership/route.ts line 61
#         src/app/api/social/reconcile-group-membership/route.ts line 67
AUTHORIZED_SOCIAL=(
  "src/app/api/social/group-membership/route.ts"
  "src/app/api/social/reconcile-group-membership/route.ts"
  "src/lib/joinEngine.ts"
)

VIOLATIONS=""

# ── Check 1: social.groupIds direct Firestore write outside authorized paths ──
STAGED_TS=$(git diff --cached --name-only 2>/dev/null | grep -E '\.(ts|tsx|js)$' || true)

if [ -n "$STAGED_TS" ]; then
  while IFS= read -r file; do
    [ -z "$file" ] && continue

    # Skip authorized files
    SKIP=false
    for auth in "${AUTHORIZED_SOCIAL[@]}"; do
      [ "$file" = "$auth" ] && SKIP=true && break
    done
    $SKIP && continue

    # New lines only (^+), excluding diff header (^+++), excluding comment lines
    DIFF_LINES=$(git diff --cached -- "$file" 2>/dev/null \
      | grep '^+[^+]' \
      | grep -vE '^\+\s*(//|\*|#)' \
      || true)

    if echo "$DIFF_LINES" | grep -qE "['\"](social\.groupIds)['\"]\\s*:"; then
      MATCHED=$(echo "$DIFF_LINES" | grep -E "['\"](social\.groupIds)['\"]\\s*:" | head -3 | sed 's/^/   /')
      VIOLATIONS="${VIOLATIONS}
❌ BLOCKED — social.groupIds direct write outside authorized path
   file: $file
${MATCHED}
   Allowed only in:
     src/app/api/social/group-membership/route.ts
     src/app/api/social/reconcile-group-membership/route.ts
   Use updateSocialGroupIds() from group.service — never write the field directly."
    fi
  done <<< "$STAGED_TS"
fi

# ── Check 2: new get(/databases/.../documents/users/ in Firestore rules ───────
STAGED_RULES=$(git diff --cached --name-only 2>/dev/null | grep -E '\.rules$' || true)

if [ -n "$STAGED_RULES" ]; then
  while IFS= read -r file; do
    [ -z "$file" ] && continue

    DIFF_LINES=$(git diff --cached -- "$file" 2>/dev/null | grep '^+[^+]' || true)

    if echo "$DIFF_LINES" | grep -qE 'get\(/databases/[^)]+/documents/users/'; then
      MATCHED=$(echo "$DIFF_LINES" | grep -E 'get\(/databases/[^)]+/documents/users/' | head -3 | sed 's/^/   /')
      VIOLATIONS="${VIOLATIONS}
❌ BLOCKED — new get(users/{...}) in Firestore rules (1MiB read risk)
   file: $file
${MATCHED}
   Use get(user_memberships/...) or a lighter collection — not users/.
   Existing get(users/...) lines in the file are pre-approved; only new additions are blocked."
    fi
  done <<< "$STAGED_RULES"
fi

# ── Result ────────────────────────────────────────────────────────────────────
if [ -n "$VIOLATIONS" ]; then
  printf "\n🚫 safety-check FAILED — commit blocked%s\n" "$VIOLATIONS"
  printf "\n──\nFix violations above, then re-commit.\nFor deeper AI review before merge: run /pre-commit\n\n"
  exit 1
fi

printf "✅ safety-check passed (2 static checks)\n"
exit 0
