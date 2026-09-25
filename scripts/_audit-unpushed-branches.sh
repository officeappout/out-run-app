#!/bin/bash
# READ-ONLY audit: for every local branch, count commits not reachable from
# any origin/* remote-tracking branch. No writes, no deletes.
set -u

echo "branch|commits_not_in_any_remote|last_commit_date|last_commit_subject"

git for-each-ref refs/heads --format='%(refname:short)' | while read -r branch; do
  count=$(git log "$branch" --not --remotes=origin --oneline 2>/dev/null | wc -l | tr -d ' ')
  if [ "$count" -gt 0 ]; then
    last_date=$(git log -1 --format='%ad' --date=short "$branch" 2>/dev/null)
    last_subject=$(git log -1 --format='%s' "$branch" 2>/dev/null)
    echo "${branch}|${count}|${last_date}|${last_subject}"
  fi
done
