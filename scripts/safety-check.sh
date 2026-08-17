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
# What this checks (3 patterns only — everything else is AI-layer):
#   1. 'social.groupIds': as Firestore field key outside authorized routes
#   2. New get(/databases/.../documents/users/) in .rules files (1MiB read risk)
#   3. New route-collection writes outside authorized files; and for the
#      subset of those files already migrated to the Stage 1B chokepoint,
#      a new write-verb line without a matching buildValidatedDoc( call
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

# ── Check 3: route-collection writes must be authorized; migrated files ───────
# must go through buildValidatedDoc() ── route-enrichment-pipeline plan Stage 1B
#
# Source: .claude/plans/route-enrichment-pipeline-kickoff-vast-pelican.md,
#         src/lib/route-collections/validate.ts
#
# Two tiers, deliberately not one flat allowlist:
#   AUTHORIZED_ROUTE_WRITERS  — every file known (as of this check's writing)
#     to legitimately touch one of the 5 route collections. A file NOT on
#     this list that starts writing to one of these collections is almost
#     always either a genuinely new write path (needs review + likely
#     migration to the chokepoint) or a rename/move of an existing one
#     (just needs adding here) — either way, a human should look at it.
#   MIGRATED_CHOKEPOINT_WRITERS — the subset already wired through
#     buildValidatedDoc() (Stage 1B: InventoryService.saveRoutes/
#     saveCuratedRoutes/updateRoute, geo-discovery-routes.ts; surface-type
#     phase: osm-segment-importer.ts's commitSegmentsToFirestore). New write-verb
#     lines added to one of THESE files must co-occur with a
#     buildValidatedDoc( call in the same diff — a regression here means an
#     edit bypassed the chokepoint entirely, which is exactly how the
#     'moderate' bug happened twice independently before this existed.
#   Everything else on AUTHORIZED_ROUTE_WRITERS but not yet migrated
#     (official-route-broadcaster.ts, the climb/segment scripts, etc.) is
#     legitimate today and gets no positive requirement — Stage 3 migrates
#     the rest as each script is generalized for multi-city use.
AUTHORIZED_ROUTE_WRITERS=(
  "src/lib/route-collections/validate.ts"
  "src/lib/route-collections/schemas.ts"
  "src/lib/route-collections/authority-resolution.ts"
  "src/lib/route-collections/index.ts"
  "src/features/parks/core/services/inventory.service.ts"
  "src/features/parks/core/services/official-route-broadcaster.ts"
  "src/features/parks/core/services/route-generator.service.ts"
  "src/features/parks/core/services/route-stitching.service.ts"
  "src/features/admin/services/osm-segment-importer.ts"
  "src/features/admin/services/moderation.service.ts"
  "src/features/admin/services/edit-requests.service.ts"
  "src/features/admin/services/seed-sderot-demo.ts"
  "src/features/admin/components/routes/RouteEditor.tsx"
  "src/app/admin/segments/page.tsx"
  "src/scripts/import-osm-segments.ts"
  "scripts/geo-discovery-routes.ts"
  "scripts/import-osm-routes-tlv.ts"
  "scripts/write-climb-segments-tlv.ts"
  "scripts/backfill-route-adjacency.ts"
  "scripts/backfill-street-segments-geohash.ts"
  "scripts/recalc-route-distances.ts"
  "scripts/backfill-difficulty-moderate.ts"
  "scripts/backfill-route-shape.ts"
  "scripts/backfill-route-enrichment-tlv.ts"
  "scripts/backfill-corrupted-timestamps.ts"
)
MIGRATED_CHOKEPOINT_WRITERS=(
  "src/features/parks/core/services/inventory.service.ts"
  "scripts/geo-discovery-routes.ts"
  # commitSegmentsToFirestore migrated in the surface-type phase — the CLI's
  # separate REST-based writer (src/scripts/import-osm-segments.ts) is NOT
  # migrated yet (flagged, not fixed — see that file's own header comment).
  "src/features/admin/services/osm-segment-importer.ts"
  # Stage 3 Phases 3.2/3.3 (route-enrichment-pipeline plan, 17.08.2026) —
  # both chokepoint-migrated from birth, not retrofitted.
  "scripts/backfill-route-shape.ts"
  "scripts/backfill-route-enrichment-tlv.ts"
  # stripUndefined-corruption recovery script (17.08.2026) — chokepoint-
  # migrated from birth (which is exactly why it's safe to run AFTER the fix
  # lands, not before — see the script's own header comment).
  "scripts/backfill-corrupted-timestamps.ts"
)

ROUTE_COLLECTION_PATTERN="\.collection\([^)]*['\"](official_routes|curated_routes|climb_segments|street_segments|route_adjacency)['\"]"
WRITE_VERB_PATTERN='\.(add|set|update)\(|writeBatch\(|batch\.(set|update)\('

STAGED_ALL=$(git diff --cached --name-only 2>/dev/null | grep -E '\.(ts|tsx)$' || true)

if [ -n "$STAGED_ALL" ]; then
  while IFS= read -r file; do
    [ -z "$file" ] && continue

    DIFF_LINES=$(git diff --cached -- "$file" 2>/dev/null \
      | grep '^+[^+]' \
      | grep -vE '^\+\s*(//|\*|#)' \
      || true)
    [ -z "$DIFF_LINES" ] && continue

    IS_AUTHORIZED=false
    for auth in "${AUTHORIZED_ROUTE_WRITERS[@]}"; do
      [ "$file" = "$auth" ] && IS_AUTHORIZED=true && break
    done

    if echo "$DIFF_LINES" | grep -qE "$ROUTE_COLLECTION_PATTERN"; then
      if ! $IS_AUTHORIZED; then
        MATCHED=$(echo "$DIFF_LINES" | grep -E "$ROUTE_COLLECTION_PATTERN" | head -3 | sed 's/^/   /')
        VIOLATIONS="${VIOLATIONS}
❌ BLOCKED — new route-collection write from an unauthorized file
   file: $file
${MATCHED}
   If this is a legitimate new writer, add it to AUTHORIZED_ROUTE_WRITERS in
   scripts/safety-check.sh AND route it through buildValidatedDoc() in
   src/lib/route-collections/validate.ts — don't build a parallel write path."
      fi
    fi

    IS_MIGRATED=false
    for mig in "${MIGRATED_CHOKEPOINT_WRITERS[@]}"; do
      [ "$file" = "$mig" ] && IS_MIGRATED=true && break
    done

    if $IS_MIGRATED && echo "$DIFF_LINES" | grep -qE "$WRITE_VERB_PATTERN"; then
      # Check the FULL staged file content (the blob about to be committed),
      # not just this diff's new lines — buildValidatedDoc( may already be
      # present from an earlier commit (e.g. a later, unrelated function
      # added to an already-migrated file legitimately doesn't need to
      # reintroduce the call). A diff-only check here would false-positive-
      # block exactly that case.
      STAGED_FILE_CONTENT=$(git show ":$file" 2>/dev/null || true)
      if ! echo "$STAGED_FILE_CONTENT" | grep -q 'buildValidatedDoc('; then
        MATCHED=$(echo "$DIFF_LINES" | grep -E "$WRITE_VERB_PATTERN" | head -3 | sed 's/^/   /')
        VIOLATIONS="${VIOLATIONS}
❌ BLOCKED — new write in a chokepoint-migrated file, and buildValidatedDoc(
   is not called ANYWHERE in the file
   file: $file
${MATCHED}
   This file is already wired through the Stage 1B chokepoint — route new
   writes through buildValidatedDoc() too, don't bypass it. (If this write
   is a fixed-shape payload with no arbitrary caller fields — e.g.
   bulkApproveRoutes' hardcoded {published,status,...} — that's a legitimate
   reason to skip the chokepoint; this check only verifies the call exists
   SOMEWHERE in the file, not that every write-site uses it.)"
      fi
    fi
  done <<< "$STAGED_ALL"
fi

# ── Result ────────────────────────────────────────────────────────────────────
if [ -n "$VIOLATIONS" ]; then
  printf "\n🚫 safety-check FAILED — commit blocked%s\n" "$VIOLATIONS"
  printf "\n──\nFix violations above, then re-commit.\nFor deeper AI review before merge: run /pre-commit\n\n"
  exit 1
fi

printf "✅ safety-check passed (3 static checks)\n"
exit 0
