"""Mixed-gender check: a female branch with masculine forms (or the reverse). Usage: REPO=<repo> DEAD=<dead-files.txt> python3 mixed.py"""
import json, os, re, subprocess, sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import scan as S
REPO = os.environ['REPO']
files = subprocess.run(['git', '-C', REPO, 'ls-files', 'src', 'functions/src'], capture_output=True, text=True).stdout.split()
LIT = r"(?:'((?:[^'\\\n]|\\.)*)'|`((?:[^`\\]|\\.)*)`|\"((?:[^\"\\\n]|\\.)*)\")"
PAIR_CALL = re.compile(r"\b(g|pick|t|gx|gendered|byGender|genderText)\(\s*(?:[\w.?]+\s*,\s*)?" + LIT + r"\s*,\s*" + LIT, re.S)
TERN_F = re.compile(r"(?:isFemale|isFem|===\s*'female'|==\s*'female')\s*\)?\s*\?\s*" + LIT + r"\s*:\s*" + LIT, re.S)
TERN_M = re.compile(r"(?:===\s*'male')\s*\)?\s*\?\s*" + LIT + r"\s*:\s*" + LIT, re.S)
def lit(m, i):
    g = m.groups()
    return next((x for x in g[i:i+3] if x is not None), None)
out = []
for f in files:
    if not re.search(r'\.(tsx?)$', f) or S.excluded(f):
        continue
    src = open(os.path.join(REPO, f), encoding='utf-8').read()
    if not S.HEB.search(src):
        continue
    pairs = []
    for m in PAIR_CALL.finditer(src):
        a, b = lit(m, 1), lit(m, 4)
        # g(gender, male, female) / t(male, female) / pick(g, male, female)
        pairs.append((m.start(), a, b))
    for m in TERN_F.finditer(src):
        pairs.append((m.start(), lit(m, 3), lit(m, 0)))
    for m in TERN_M.finditer(src):
        pairs.append((m.start(), lit(m, 0), lit(m, 3)))
    for pos, male, fem in pairs:
        if not male or not fem or not S.HEB.search(male + fem):
            continue
        rm, rf = S.analyse(male), S.analyse(fem)
        line = src[:pos].count('\n') + 1
        if rf and rf['masc']:
            out.append(dict(file=f, line=line, branch='female', text=fem, other=male, wrong=rf['masc']))
        if rm and rm['fem']:
            out.append(dict(file=f, line=line, branch='male', text=male, other=fem, wrong=rm['fem']))
# catalogs: select branches
cat = os.path.join(REPO, 'src/messages/he')
for fn in sorted(os.listdir(cat)):
    d = json.load(open(os.path.join(cat, fn), encoding='utf-8'))
    for k, v in d.items():
        if 'gender, select' not in v:
            continue
        fm = re.search(r'female \{((?:[^{}]|\{[^{}]*\})*)\}', v)
        ot = re.search(r'other \{((?:[^{}]|\{[^{}]*\})*)\}', v)
        if fm:
            r = S.analyse(fm.group(1))
            if r and r['masc']:
                out.append(dict(file=fn[:-5] + ':' + k, line=0, branch='female', text=fm.group(1), other=ot.group(1) if ot else '', wrong=r['masc']))
        if ot:
            r = S.analyse(ot.group(1))
            if r and r['fem']:
                out.append(dict(file=fn[:-5] + ':' + k, line=0, branch='other', text=ot.group(1), other=fm.group(1) if fm else '', wrong=r['fem']))
json.dump(out, open(os.environ.get('OUT', 'mixed.json'), 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
print(len(out))
for x in out:
    print(x['file'], x['line'], x['branch'], '|', x['text'][:90], '|', x['wrong'])
