# gender-scan

These are the scripts that produced `../gender-inventory.csv` and the counts in `../GENDER-INVENTORY.md`. They only
read files, never write to the repo, and need nothing outside the Python 3 standard library. Rerun them after each
batch of fixes to see what is left.

```bash
REPO=~/Development/appout-1-copy-c1           # a fresh worktree on origin/main
git -C $REPO show origin/docs/architecture-audit:docs/architecture/dead-files.txt > /tmp/dead.txt   # or docs/architecture/dead-files.txt once it is merged
cd $REPO/docs/copy/gender-scan
python3 scan.py "$REPO" /tmp/dead.txt /tmp/gender-out.json         # code + src/messages/he catalogs
python3 assemble.py /tmp/gender-out.json /tmp/gender-inventory.csv # CSV + manual rows + the per-area table
REPO=$REPO DEAD=/tmp/dead.txt OUT=/tmp/mixed.json python3 mixed.py # female branch with masculine forms (or the reverse)
```

- `lexicon.py`: masculine second-person forms mapped to their feminine and plural forms (imperatives, future tense,
  adjectives and participles), plus the feminine forms used to find "feminine for everyone" text. Homographs (`עבור`,
  `שנה`, `ספר`, `עמוד`, `אשר`, `נוח`, `דחוף`…) are left out on purpose.
- `scan.py`: walks `git ls-files src functions/src` and skips admin, dead, test, debug and data files (see `excluded()`).
  It reads Hebrew string literals and JSX text one line at a time. Lines with a gender branch in the same line, or
  within 4 lines, are skipped (except for slash forms). Imperatives count only at the start of a clause.
- `assemble.py`: adds the notes (gender availability, button label → noun form, role noun, user voice, tone) and the
  manual rows (badge titles, persona labels, post-workout praise).
- `mixed.py`: `mixed.py` assumes a gender helper takes the masculine form first. `CommunitySessionBanner.tsx` defines
  `g(f, m)` the other way round, so its 8 hits are known false positives.

The scanner has known gaps; `GENDER-INVENTORY.md` §2 lists them.
