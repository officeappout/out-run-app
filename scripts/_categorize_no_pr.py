import re

rows = []
with open('/tmp/_pushed_no_pr_raw.txt') as f:
    for line in f:
        line = line.rstrip('\n')
        if '|' not in line or line.startswith('branch|') or line.startswith('Fetching'):
            continue
        parts = line.split('|')
        if len(parts) != 5:
            continue
        branch, ahead, date, subject, pr = parts
        if pr != 'NO_PR':
            continue
        m = re.match(r'^(docs|diag|chore|refactor|WIP|test|perf)\b', subject, re.IGNORECASE)
        if subject.startswith('WIP: preserve uncommitted work'):
            cat = 'safety-commit'
        elif m:
            cat = m.group(1).lower()
        elif subject.startswith('fix(') or subject.startswith('feat('):
            cat = 'real-code'
        else:
            cat = 'other'
        rows.append((date, branch, ahead, subject, cat))

rows.sort(key=lambda r: r[0], reverse=True)

print(f"{'date':<10} | {'branch':<55} | {'ahead':<5} | {'cat':<14} | subject")
for date, branch, ahead, subject, cat in rows:
    print(f"{date:<10} | {branch:<55} | {ahead:<5} | {cat:<14} | {subject[:90]}")

print(f"\ntotal: {len(rows)}")
from collections import Counter
print(Counter(r[4] for r in rows))
