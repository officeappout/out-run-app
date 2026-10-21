# -*- coding: utf-8 -*-
"""Gender copy inventory scanner (docs/copy/GENDER-INVENTORY.md). Usage: python3 scan.py <repo> <dead-files.txt> <out.json>"""
import json, os, re, subprocess, sys
sys.path.insert(0, os.path.dirname(__file__))
import lexicon as L

REPO = sys.argv[1] if __name__ == '__main__' else os.environ['REPO']
DEAD = sys.argv[2] if __name__ == '__main__' else os.environ['DEAD']
OUT = sys.argv[3] if __name__ == '__main__' else ''
HE = 'א-ת'
HEB = re.compile(f'[{HE}]')
dead = set()
for line in open(DEAD, encoding='utf-8'):
    if line.startswith('#') or not line.strip():
        continue
    dead.add(line.split('\t')[0].strip())

FINAL = {'ן': 'נ', 'ם': 'מ', 'ך': 'כ', 'ף': 'פ', 'ץ': 'צ'}
SLASH_SUFFIX = {'ה', 'ת', 'י', 'ית', 'ים', 'ות', 'ני', 'יה'}
SLASH_RE = re.compile(f'(?<![{HE}])([{HE}]{{1,}})/([{HE}]{{1,3}})(?![{HE}])')
DOT_RE = re.compile(f'(?<![{HE}])([{HE}]{{2,}})\\.(ת|ה|ית)(?![{HE}])')
PAREN_RE = re.compile(f'(?<![{HE}])([{HE}]{{2,}})\\((ה|ת|י|ית)\\)')

GENDER_CTX = re.compile(r"isFemale|isFem\b|===\s*'female'|==\s*'female'|'female'\s*\?|female\s*:|\bmale\s*:|gender\s*===|gender\s*==|genderize|copyGenderOf|getGendered|GenderedText|resolveGendered|pickGender|\bg\(|byGender|gendered\(|\bfem\b|\bgender:\s*'(?:male|female)'|subjectGender:\s*'(?:male|female)'|\{gender, select|Gender\s*\?|forGender|genderText|gText\(|\bgx\(|\bgv\(|\bpick\(|\bt\(\s*'[^']*',\s*'|\bt\(\s*$|FEMALE|_MALE\b|Female\b|\bg\(\s*$|\bgender,\s*$|myGender|userGender|targetGender:\s*'|\bG\.")
SKIP_LINE = re.compile(r"console\.|new RegExp|\.test\(|\.match\(|\.replace\(|i18n-allow-hebrew: data|^\s*(//|\*|/\*)|^\s*case\s|logger\.|log\(|\bimport\b")

def area_of(path):
    p = path
    rules = [
        (r'^functions/src/.*(push|Push|notif|Notif|Reminder|reminder|Nudge|retention|Retention|dropoff|Dropoff|kudos|Kudos|chat|Chat|LevelUp|referral|Proactive|Scheduler)', 'Push & server senders'),
        (r'^functions/src/', 'Cloud Functions (other)'),
        (r'^src/features/notifications|^src/lib/notifications|push', 'Push & server senders'),
        (r'^src/lib/ai|^src/features/ai-coach|^src/app/ai-coach', 'Kelly (AI coach)'),
        (r'^src/app/api/', 'API routes (server)'),
        (r'^src/app/(gateway|intro|join|r)/|^src/features/(user/)?(onboarding|auth|gateway|intro)|^src/app/onboarding|^src/features/user/onboarding|entry-intro|^src/features/auth', 'Onboarding & pre-signup'),
        (r'^src/features/home|^src/app/home|^src/app/page\.tsx', 'Home'),
        (r'workout-engine/summary|/summary/', 'Workout summary'),
        (r'workout-engine|^src/app/(run|session|active-workout-ui)|^src/features/(hybrid|running)', 'Workout player & engine'),
        (r'^src/features/(parks|safecity|heatmap|weather|navigation|partners|map)|^src/app/map', 'Map, parks & partners'),
        (r'^src/features/schedule', 'Schedule'),
        (r'^src/features/(profile|user|progression|progression-hub|progression-map|activity|readiness)|^src/app/(profile|progress|progression|progression-map|activity|settings)', 'Profile, progress & settings'),
        (r'^src/features/(social|arena|challenge|messages|community|league|feed|wedding)|^src/app/(arena|community|chat|league|feed|challenge)', 'Social, arena & community'),
        (r'^src/features/(search|content|workouts|favorites|library)|^src/app/(library|search|workouts|workout-builder|explorer)', 'Library, search & content'),
        (r'^src/features/(legal|help)|^src/app/(privacy|accessibility|delete-data|help)', 'Legal & help'),
        (r'^src/components|^src/lib|^src/hooks', 'Shared UI & lib'),
    ]
    for rx, name in rules:
        if re.search(rx, p):
            return name
    return 'Other'

def excluded(path):
    if path in dead:
        return 'dead'
    if re.search(r'(^|/)admin(/|-)|/app/admin|authority-portal|/__tests__/|\.test\.|\.spec\.|/debug/|/qa/|/features/dev/|AdminCard|^src/types/|functions/src/demo-life/|/wedding/|/demo-control/|/fixtures?/|\.stories\.|/scripts/|/mocks?/|seed', path):
        return 'skip'
    # data-only / pattern files
    if re.search(r'israel-locations|stop-?words|/intent\.ts$|gender-voice\.ts$|reply-guards|review/checks|hebrew-normalize|/lib/ai/review/|flex-guard|/coach/persona\.ts$|unified-thread\.ts$|app-help/retrieve\.ts$|push-library\.core\.ts$|/coach/safety\.ts$|synonyms|/catalog-he|\.d\.ts$', path):
        return 'data'
    return None

def strip_comment(line):
    # remove trailing // comment that is not inside a string or url (rough)
    out, q = [], None
    i = 0
    while i < len(line):
        c = line[i]
        if q:
            out.append(c)
            if c == '\\' and i + 1 < len(line):
                out.append(line[i + 1]); i += 2; continue
            if c == q:
                q = None
        else:
            if c in '\'"`':
                q = c
            elif line.startswith('//', i) and (i == 0 or line[i - 1] != ':'):
                break
            elif line.startswith('{/*', i):
                j = line.find('*/}', i)
                if j > 0:
                    i = j + 3; continue
            out.append(c)
        i += 1
    return ''.join(out)

STR_RE = re.compile(r"'((?:[^'\\]|\\.)*)'|\"((?:[^\"\\]|\\.)*)\"|`((?:[^`\\]|\\.)*)`")

def segments(line):
    segs = []
    for m in STR_RE.finditer(line):
        s = next(g for g in m.groups() if g is not None)
        if HEB.search(s):
            segs.append(s)
    rest = STR_RE.sub(' ', line)
    rest = re.sub(r'<[^>]*>', ' ', rest)
    if HEB.search(rest):
        # JSX text: keep only the hebrew-ish run
        m = re.search(f'[{HE}][^<>]*', rest)
        if m:
            segs.append(m.group(0).strip())
    return segs

WORD = re.compile(f'[{HE}\'׳״"]+')

def words(s):
    return [(m.group(0), m.start()) for m in re.finditer(f'[{HE}]+', s)]

def strip_prefix(w):
    """return list of (prefix, stem)"""
    out = [('', w)]
    if len(w) > 2 and w[0] == 'ו':
        out.append(('ו', w[1:]))
    return out

def fem_suffix(left, suf):
    base = left[:-1] + FINAL.get(left[-1], left[-1]) if left[-1] in FINAL else left
    if left.endswith('את') and len(left) <= 4 and suf == 'ה':
        return left
    if left.endswith('מישהו') and suf == 'י':
        return left[:-1] + 'י'
    if left.endswith('ה') and suf in ('י',):  # תרצה/י -> תרצי
        return left[:-1] + 'י'
    if left.endswith('ה') and suf == 'ית':
        return left[:-1] + 'ית'
    return base + suf

def masc_of_slash(left, suf):
    if left.endswith('את') and len(left) <= 4 and suf == 'ה':
        return left + 'ה'
    return left

PUNCT_BEFORE = re.compile(r'(^|[.!?,:;\n…\-–—)]\s*|\}\s*,?\s*|@[^\s,]+,?\s*)$')

def analyse(text, slash_only=False):
    """Return dict(kind, hits, male, female, neutral) or None."""
    t = text
    hits_m, hits_f, slash = [], [], []
    # slash forms
    for m in SLASH_RE.finditer(t):
        left, suf = m.group(1), m.group(2)
        is_g = suf in SLASH_SUFFIX or (left.endswith('את') and suf == 'ה')
        if is_g and not re.search(r'[\w/]/' + re.escape(m.group(0)), t):
            slash.append(m)
    for m in DOT_RE.finditer(t):
        slash.append(m)
    for m in PAREN_RE.finditer(t):
        slash.append(m)
    ws = words(t)
    OPENERS = {'אז', 'עכשיו', 'פשוט', 'רק', 'בוא', 'בואו', 'יאללה', 'אנא', 'נא', 'קדימה', 'ואז', 'כאן', 'פה',
               'שוב', 'עוד', 'תמיד', 'אל', 'אם', 'לא', 'גם', 'אולי', 'בבקשה', 'היום', 'מחר', 'עכשיו', 'כבר', 'אחר', 'כך',
               'אתה', 'מתי', 'איך', 'מה', 'למה', 'איפה', 'בקרוב', 'כשתסיים', 'מעכשיו', 'הפעם', 'לפני', 'אחרי',
               'כדי', 'שלב', 'בינתיים', 'תמיד', 'או'}
    def clause_start(idx):
        pos = ws[idx][1]
        k = idx - 1
        while k >= 0:
            pw, pp = ws[k]
            between = t[pp + len(pw):pos]
            if re.search(r'[.!?,:;\n…\-–—•|(\]/·]', between) and not between.endswith('-') or re.search(r'[.!?,:;\n…–—•|(\]/·]', between):
                return True
            if pw not in OPENERS:
                return False
            pos = pp
            k -= 1
        return True
    def prefixes(w, allow):
        out = [('', w)]
        for p in allow:
            if len(w) > len(p) + 1 and w.startswith(p):
                out.append((p, w[len(p):]))
        return out
    for idx, (w, pos) in enumerate(ws):
        cs = clause_start(idx)
        for pre, stem in prefixes(w, ('ו', 'וש', 'ש', 'כש', 'וכש')):
            if stem in ('פתח',) and t[pos:pos + 8].startswith('פתח תקו'):
                break
            if stem in L.IMPERATIVE and (pre == 'ו' or (pre == '' and cs)):
                if stem == 'לחץ' and not re.match(r'\s*(על|כאן|פה|שוב|פעמיים|כדי|להמשך|והחזק|ארוכה)', t[pos + len(w):]) and t.strip() != 'לחץ':
                    break
                if stem == 'הזמן' and not re.match(r'\s*(את|חברים|חבר|שכנים|מישהו|אנשים|עוד|לקבוצה)', t[pos + len(w):]):
                    break
                hits_m.append((pos + len(pre), stem, 'imp'))
                break
            if stem in L.FUTURE and (pre or cs):
                hits_m.append((pos + len(pre), stem, 'fut'))
                break
            if stem in L.ADJ and pre in ('', 'ו'):
                before = t[:pos]
                prev = [x for x, _ in ws[max(0, idx - 2):idx]]
                if (stem in ('אלוף', 'תותח', 'גיבור') and cs) or any(p in ('אתה', 'שאתה', 'ואתה', 'כשאתה') for p in prev) or PUNCT_BEFORE.search(before) and (t.rstrip().endswith('?') or '?' in t[pos:pos + 40]):
                    hits_m.append((pos + len(pre), stem, 'adj'))
                break
            if stem == 'אתה' or (pre == '' and stem in ('שאתה', 'ואתה', 'כשאתה', 'אחי')):
                hits_m.append((pos, w, 'pron'))
                break
            if stem in L.FEM_FORMS and (pre or cs or (idx > 0 and ws[idx - 1][0] in ('את', 'ואת', 'שאת'))):
                hits_f.append((pos + len(pre), stem))
                break
    for ph in ('ברוך הבא', 'ברוך שובך', 'שים לב', 'אל תדאג ', 'אל תשכח '):
        i = t.find(ph)
        if i >= 0 and not any(h[0] == i or h[0] == i + 4 for h in hits_m):
            hits_m.append((i, ph.strip(), 'phrase'))
    for ph in L.FEM_PHRASES:
        if ph in t:
            hits_f.append((t.find(ph), ph))
    # dedupe masc hits that overlap slash forms
    slash_spans = [(m.start(), m.end()) for m in slash]
    hits_m = [h for h in hits_m if not any(a <= h[0] < b for a, b in slash_spans)]
    hits_f = [h for h in hits_f if not any(a <= h[0] < b for a, b in slash_spans)]
    if slash_only:
        hits_m, hits_f = [], []
    if not (hits_m or hits_f or slash):
        return None
    kinds = []
    if slash: kinds.append('slash')
    if hits_m and hits_f: kinds.append('mixed')
    elif hits_m: kinds.append('masc-only')
    elif hits_f: kinds.append('fem-for-all')
    return dict(kinds=kinds, masc=[h[1] for h in hits_m], fem=[h[1] for h in hits_f],
                slash=[m.group(0) for m in slash], proposals=propose(t, hits_m, hits_f, slash))

def replace_spans(t, reps):
    for start, end, new in sorted(reps, key=lambda r: -r[0]):
        t = t[:start] + new + t[end:]
    return t

def propose(t, hits_m, hits_f, slash):
    male, female, neutral = [], [], []
    role_nouns = []
    ok_neutral = True
    for m in slash:
        a, b = m.start(), m.end()
        if m.re is SLASH_RE:
            left, suf = m.group(1), m.group(2)
        else:
            left, suf = m.group(1), m.group(2)
        mw = masc_of_slash(left, suf)
        fw = fem_suffix(left, suf)
        male.append((a, b, mw)); female.append((a, b, fw))
        pre = ''
        stem = mw
        if stem[0] in 'וש' and stem[1:] in ('אתה',):
            pre, stem = stem[0], stem[1:]
        if stem in L.IMPERATIVE:
            neutral.append((a, b, pre + L.IMPERATIVE[stem][1]))
        elif stem in L.FUTURE:
            neutral.append((a, b, pre + L.future_plural(L.FUTURE[stem])))
        elif stem in L.ADJ:
            neutral.append((a, b, pre + L.ADJ[stem][1]))
        elif stem == 'אתה':
            neutral.append((a, b, pre + 'אתם'))
        elif stem == 'בוא':
            neutral.append((a, b, pre + 'בואו'))
        else:
            ok_neutral = False
            role_nouns.append(m.group(0))
            neutral.append((a, b, m.group(0)))
    for pos, stem, kind in hits_m:
        end = pos + len(stem)
        if kind == 'imp':
            f, p = L.IMPERATIVE[stem]
        elif kind == 'fut':
            f = L.FUTURE[stem]; p = L.future_plural(f)
        elif kind == 'adj':
            f, p = L.ADJ[stem]
        elif kind == 'pron':
            f, p = {'אתה': ('את', 'אתם'), 'שאתה': ('שאת', 'שאתם'), 'ואתה': ('ואת', 'ואתם'),
                    'כשאתה': ('כשאת', 'כשאתם'), 'אחי': ('אחותי', 'חברים')}[stem]
        else:
            f, p = L.PHRASES.get(stem, (None, None))
            if not f:
                continue
        female.append((pos, end, f)); neutral.append((pos, end, p))
    for pos, stem in hits_f:
        end = pos + len(stem)
        # reverse lookup
        masc = None
        for k, v in L.IMPERATIVE.items():
            if v[0] == stem: masc, plur = k, v[1]
        for k, v in L.FUTURE.items():
            if v == stem: masc, plur = k, L.future_plural(v)
        for k, v in L.ADJ.items():
            if v[0] == stem: masc, plur = k, v[1]
        if stem == 'ברוכה הבאה': masc, plur = 'ברוך הבא', 'ברוכים הבאים'
        if stem == 'שימי לב': masc, plur = 'שים לב', 'שימו לב'
        if masc:
            male.append((pos, end, masc)); neutral.append((pos, end, plur))
    return dict(male=replace_spans(t, male), female=replace_spans(t, female),
                neutral=replace_spans(t, neutral) if ok_neutral else '', role_nouns=role_nouns)

def main():
    global items
    items = []

    # ---- code ----
    files = subprocess.run(['git', '-C', REPO, 'ls-files', 'src', 'functions/src'], capture_output=True, text=True).stdout.split()
    skipped = {'dead': 0, 'skip': 0, 'data': 0}
    for f in files:
        if not re.search(r'\.(tsx?|jsx?)$', f):
            continue
        ex = excluded(f)
        if ex:
            skipped[ex] += 1
            continue
        try:
            lines = open(os.path.join(REPO, f), encoding='utf-8').read().split('\n')
        except Exception:
            continue
        in_block = False
        for i, raw in enumerate(lines):
            if in_block:
                if '*/' in raw:
                    in_block = False
                continue
            st = raw.strip()
            if (st.startswith('/*') or st.startswith('{/*')) and '*/' not in st:
                in_block = True
                continue
            if not HEB.search(raw) or SKIP_LINE.search(raw):
                continue
            line = strip_comment(raw)
            if not HEB.search(line):
                continue
            ctx_same = GENDER_CTX.search(line) is not None
            ctx_near = any(GENDER_CTX.search(lines[j]) for j in range(max(0, i - 4), min(len(lines), i + 5)) if j != i)
            for seg in segments(line):
                if re.search(r'\\[sdwb]|\(\?|\|[^|]*\|', seg) or '(נקבה)' in seg:
                    continue
                if len(re.findall('[A-Za-z]', seg)) > 1.5 * len(re.findall(f'[{HE}]', seg)):
                    continue
                if f.startswith('src/lib/ai/coach/') and re.search(f'(?<![{HE}])ת[{HE}]+ לי(?![{HE}])', seg):
                    continue
                r = analyse(seg)
                if not r:
                    continue
                branched = ctx_same or (ctx_near and 'push-library' not in f)
                # slash forms are reported even when near a branch; masc/fem only if unbranched
                kinds = list(r['kinds'])
                if branched:
                    kinds = [k for k in kinds if k == 'slash']
                    if not kinds:
                        continue
                    r = analyse(seg, slash_only=True)
                items.append(dict(src='code', file=f, line=i + 1, area=area_of(f), text=seg, kinds=kinds,
                                  branched=branched, masc=r['masc'], fem=r['fem'], slash=r['slash'],
                                  **r['proposals']))

    # ---- catalogs ----
    cat_dir = os.path.join(REPO, 'src/messages/he')
    grep_cache = {}
    for fn in sorted(os.listdir(cat_dir)):
        ns = fn[:-5]
        d = json.load(open(os.path.join(cat_dir, fn), encoding='utf-8'))
        for k, v in d.items():
            branched = 'gender, select' in v or 'gender,select' in v
            r = analyse(v)
            if not r:
                continue
            kinds = list(r['kinds'])
            if branched:
                # check each branch separately: other branch masc is the documented default
                kinds = [x for x in kinds if x == 'slash']
                if not kinds:
                    continue
            out = subprocess.run(['git', '-C', REPO, 'grep', '-n', '-F', f"'{k}'", '--', 'src'], capture_output=True, text=True).stdout
            uses = [l.split(':')[0] + ':' + l.split(':')[1] for l in out.splitlines() if '/__tests__/' not in l][:3]
            area = area_of(uses[0].split(':')[0]) if uses else area_of('src/features/' + ns)
            items.append(dict(src='catalog', file=f'{ns}:{k}', line=0, area=area, text=v, kinds=kinds, branched=branched,
                              masc=r['masc'], fem=r['fem'], slash=r['slash'], uses=uses, **r['proposals']))

    json.dump(dict(items=items, skipped=skipped), open(OUT, 'w', encoding='utf-8'), ensure_ascii=False, indent=1)
    from collections import Counter
    print(len(items), skipped)
    print(Counter(i['area'] for i in items).most_common())
    print(Counter(k for i in items for k in i['kinds']).most_common())


if __name__ == '__main__':
    main()
