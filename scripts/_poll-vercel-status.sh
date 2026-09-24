#!/bin/bash
for SHA in "f6be9e2c" "f9e6d18e" "357e3eef"; do
  echo "=== $SHA ==="
  for i in $(seq 1 40); do
    STATE=$(gh api "repos/officeappout/out-run-app/commits/${SHA}/status" --jq '.state' 2>/dev/null)
    echo "check $i: $STATE"
    if [ "$STATE" != "pending" ]; then
      break
    fi
    sleep 15
  done
  gh api "repos/officeappout/out-run-app/commits/${SHA}/status" --jq '.statuses[] | {state, description, target_url}'
done
