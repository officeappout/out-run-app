#!/bin/bash
# READ-ONLY audit: remote branches not merged into origin/main and with no
# open PR. No writes, no deletes, no PR/branch actions.
set -u

echo "Fetching PR list (open, all states for cross-ref)..."
gh pr list --state all --json headRefName,number,state,title --limit 500 > /tmp/_all_prs.json 2>&1

echo "branch|ahead_of_main|last_commit_date|last_commit_subject|pr_status"

git branch -r --format='%(refname:short)' | grep -v 'origin/HEAD\|origin/main$' | while read -r branch; do
  short="${branch#origin/}"
  merged=$(git merge-base --is-ancestor "$branch" origin/main && echo yes || echo no)
  if [ "$merged" = "yes" ]; then
    continue
  fi
  ahead=$(git rev-list --count origin/main.."$branch" 2>/dev/null)
  last_date=$(git log -1 --format='%ad' --date=short "$branch" 2>/dev/null)
  last_subject=$(git log -1 --format='%s' "$branch" 2>/dev/null)
  pr_line=$(python3 -c "
import json
try:
    prs = json.load(open('/tmp/_all_prs.json'))
except Exception:
    prs = []
matches = [p for p in prs if p.get('headRefName') == '$short']
if not matches:
    print('NO_PR')
else:
    p = matches[0]
    print(f\"#{p['number']} ({p['state']})\")
" 2>/dev/null)
  echo "${short}|${ahead}|${last_date}|${last_subject}|${pr_line}"
done
