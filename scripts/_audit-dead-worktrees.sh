#!/bin/bash
# READ-ONLY: list every worktree + its branch, and whether that branch is
# already merged into origin/main (= safe to delete). No deletions.
set -u

git worktree list --porcelain | awk '
  /^worktree / { path=$2 }
  /^branch / { branch=$2; print path"\t"branch }
' | while IFS=$'\t' read -r path branchref; do
  branch="${branchref#refs/heads/}"
  if [ -z "$branch" ]; then
    echo "MERGED_STATUS=detached|${path}|(detached HEAD)"
    continue
  fi
  if git merge-base --is-ancestor "$branch" origin/main 2>/dev/null; then
    echo "MERGED_STATUS=yes|${path}|${branch}"
  else
    echo "MERGED_STATUS=no|${path}|${branch}"
  fi
done
