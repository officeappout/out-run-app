"""Builds gender-inventory.csv from scan.py output (+ the manual rows below) and prints the per-area table. Usage: python3 assemble.py out.json gender-inventory.csv"""
import json, csv, re, collections, sys, os
sys.path.insert(0, '.')
import lexicon as L
d = json.load(open(sys.argv[1] if len(sys.argv) > 1 else 'out.json'))
HE = 'א-ת'
NOUN = {'שמור': 'שמירה', 'מחק': 'מחיקה', 'בטל': 'ביטול', 'ערוך': 'עריכה', 'שלח': 'שליחה', 'הוסף': 'הוספה',
        'שתף': 'שיתוף', 'חפש': 'חיפוש', 'נקה': 'ניקוי', 'הצג': 'הצגה', 'אשר': 'אישור', 'התחבר': 'התחברות',
        'הירשם': 'הרשמה', 'התנתק': 'התנתקות', 'רענן': 'רענון', 'דלג': 'דילוג', 'המשך': 'המשך', 'התחל': 'התחלה',
        'חזור': 'חזרה', 'פתח': 'פתיחה', 'צור': 'יצירה', 'בחר': 'בחירה', 'עדכן': 'עדכון', 'הזמן': 'הזמנה',
        'הורד': 'הורדה', 'הפעל': 'הפעלה', 'כבה': 'כיבוי', 'סיים': 'סיום', 'הצטרף': 'הצטרפות', 'גלה': 'גילוי',
        'נסה': 'ניסיון', 'בדוק': 'בדיקה', 'שמור': 'שמירה', 'קבע': 'קביעת', 'הגדר': 'הגדרה', 'סמן': 'סימון',
        'צלם': 'צילום', 'העלה': 'העלאה', 'נווט': 'ניווט', 'דרג': 'דירוג', 'בצע': 'ביצוע', 'השלם': 'השלמת',
        'הזן': 'הזנת', 'הקלד': 'הקלדת', 'עקוב': 'מעקב'}
TONE = re.compile(r'אלוף|תותח|חיה!|מפלצת|לוחם|להוציא את כל הכוח|שבירת שיאים|שברת את עצמך|מלך|גבר|אחי|קרב|להשמיד|לרסק|לכבוש|המורה ישמע|תן בראש|לחימה|התעלמת')
UNKNOWN = re.compile(r'^src/app/(gateway|intro|join|public|r|session/\[token\]|delete-data|privacy|accessibility)/|^src/app/page\.tsx|^src/app/api/|/onboarding/intro/|entry-intro|WelcomeDrawer|^src/app/onboarding-new/dynamic|DynamicQuestionRenderer|^src/components/ui/AccessCodeGate|^src/app/global-error|^src/app/ClientLayout|LinkAccountPrompt|legal')

def button_neutral(text):
    t = text.strip()
    ws = re.findall(f'[{HE}״׳"]+', t)
    if not ws or len(ws) > 1:
        return None
    first = ws[0]
    if first in NOUN:
        n = NOUN[first]
        rest = t[t.find(first) + len(first):]
        if first == 'נסה' and rest.strip().startswith('שוב'):
            return 'לנסות שוב' + rest.strip()[3:]
        return n + rest
    return None

rows = []
for x in d['items']:
    kinds = x['kinds']
    path = x['file'] if x['src'] == 'code' else (x.get('uses') or [''])[0].split(':')[0]
    notes = []
    kind = '+'.join(kinds)
    neutral = x['neutral']
    txt = x['text']
    first_person = re.search(f'(?<![{HE}])ו?אני\\s+(\\S+\\s+)?[{HE}]+/[{HE}]', txt) is not None
    if first_person:
        neutral = ''
        notes.append('first person (the user speaks) — needs a gender-free rewrite, not a plural')
    if re.match(r'^\s*(אני|אין לי)', txt):
        notes.append('user-voice line (the user speaks): an imperative inside addresses the app, not the user — rewrite gender-free (e.g. "אדלג להפעם")')
    bn = button_neutral(txt) if 'masc-only' in kinds else None
    if bn:
        neutral = bn
        notes.append('button label: noun/infinitive form is gender-free (standard Hebrew UI)')
    if x['src'] == 'catalog':
        notes.append('extracted: make it one {gender, select} key (useT injects gender)' + ('' if not x.get('uses') else ' — used at ' + ', '.join(x['uses'])))
    else:
        notes.append('not extracted yet: add the gender branch when extracting (or neutral)')
    if UNKNOWN.search(path):
        notes.insert(0, 'GENDER UNKNOWN here → use the neutral column')
    elif x['area'] == 'Onboarding & pre-signup':
        notes.insert(0, 'onboarding: gender may still be unknown (v2 asks identity at the end); if known it is only in sessionStorage onboarding_personal_gender, not in useT → pass {gender} explicitly or use neutral')
    if x['area'] == 'API routes (server)':
        notes.insert(0, 'server error text: request carries no gender → neutral')
    if 'readiness' in path:
        notes.append('readiness = unit/officer surface')
    if TONE.search(txt):
        notes.append('WOMEN: masculine-coded tone — see tone guide')
    if 'slash' in kinds:
        notes.append('slash form: ' + ', '.join(x['slash']))
    if x.get('role_nouns'):
        notes.append('role noun / third person (' + ', '.join(x['role_nouns']) + '): its gender is the OTHER person\'s (pass subjectGender) or a role title — male/female columns are that person\'s; prefer a gender-free noun')
    if 'fem-for-all' in kinds:
        notes.append('BUG: feminine shown to everyone')
    if not neutral:
        notes.append('neutral: rewrite by hand')
    fileref = f"{x['file']}:{x['line']}" if x['src'] == 'code' else x['file']
    rows.append(dict(area=x['area'], file_or_key=fileref, current=txt, male=x['male'], female=x['female'],
                     neutral=neutral, note='; '.join(notes), kind=kind,
                     gender_available='no' if UNKNOWN.search(path) or x['area'] == 'API routes (server)' else ('session-only' if x['area'] == 'Onboarding & pre-signup' else 'yes')))

# manual rows: badge titles (achievement-definitions.ts), masculine persona nouns
BADGES = [
 (52, 'רץ מרחקים', 'רץ מרחקים', 'רצת מרחקים', 'מרחקים ארוכים'),
 (94, 'מלך המתח', 'מלך המתח', 'מלכת המתח', 'שיא המתח'),
 (172, 'מכור לחדר הכושר', 'מכור לחדר הכושר', 'מכורה לחדר הכושר', 'חדר הכושר שלי בחוץ'),
 (186, 'מתחיל בפארק', 'מתחיל בפארק', 'מתחילה בפארק', 'צעדים ראשונים בפארק'),
 (197, 'לוחם אימונים', 'לוחם אימונים', 'לוחמת אימונים', 'אימון אחרי אימון'),
 (250, 'שותף אימון', 'שותף אימון', 'שותפה לאימון', 'אימון בשניים'),
 (264, 'עוקב פעיל', 'עוקב פעיל', 'עוקבת פעילה', 'במעקב אחרי חברים'),
 (292, 'חבר קבוצה', 'חבר קבוצה', 'חברת קבוצה', 'חלק מקבוצה'),
 (334, 'מנצח שבועי', 'מנצח שבועי', 'מנצחת שבועית', 'ניצחון שבועי'),
 (351, 'חוקר פארקים', 'חוקר פארקים', 'חוקרת פארקים', 'מסע בין פארקים'),
 (393, 'לוחם שישי', 'לוחם שישי', 'לוחמת שישי', 'אימון של שישי'),
 (404, 'לוחם הגשם', 'לוחם הגשם', 'לוחמת הגשם', 'מתאמנים גם בגשם'),
]
for line, cur, m, f, n in BADGES:
    note = 'badge title (masculine persona noun, earned by every user): name_he → {male,female} or a gender-free title; manual finding'
    if 'לוחם' in cur or 'מלך' in cur or 'מכור' in cur:
        note += '; WOMEN: masculine-coded tone — see tone guide'
    if 'חדר הכושר' in cur:
        note += '; brand: avoid "חדר כושר" (we are outdoors), description says 50 outdoor workouts'
    rows.append(dict(area='Profile, progress & settings', file_or_key=f'src/features/user/progression/config/achievement-definitions.ts:{line}',
                     current=cur, male=m, female=f, neutral=n, note=note, kind='masc-only', gender_available='yes'))
PERSONA = [
 ('src/lib/constants/userLifestyles.ts:23', 'סטודנט', 'סטודנט', 'סטודנטית', 'לימודים'),
 ('src/lib/constants/userLifestyles.ts:25', 'עובד מהבית', 'עובד מהבית', 'עובדת מהבית', 'עבודה מהבית'),
 ('src/lib/constants/userLifestyles.ts:26', 'עובד משרד', 'עובד משרד', 'עובדת משרד', 'עבודה במשרד'),
 ('src/lib/constants/userLifestyles.ts:28', 'ספורטאי', 'ספורטאי', 'ספורטאית', 'ספורט תחרותי'),
 ('src/features/workout-engine/logic/contextual-engine.types.ts:311', 'סטודנט', 'סטודנט', 'סטודנטית', 'לימודים'),
 ('src/features/workout-engine/logic/contextual-engine.types.ts:312', 'תלמיד', 'תלמיד', 'תלמידה', 'בית ספר'),
 ('src/features/workout-engine/logic/contextual-engine.types.ts:313', 'עובד משרד', 'עובד משרד', 'עובדת משרד', 'עבודה במשרד'),
 ('src/features/workout-engine/logic/contextual-engine.types.ts:316', 'ספורטאי קצה', 'ספורטאי קצה', 'ספורטאית קצה', 'ספורט קצה'),
]
for ref, cur, m, f, n in PERSONA:
    rows.append(dict(area='Profile, progress & settings', file_or_key=ref, current=cur, male=m, female=f, neutral=n,
                     note='persona label (lifestyle chips; also composed into "אימון מותאם ל${personaLabel}. מוכן?") — label map needs {male,female}; the description lines (לומד, עובד) too; manual finding',
                     kind='masc-only', gender_available='yes'))
# manual rows: tone (post-workout praise in MessageService)
TONE_ROWS = [
 ('src/features/messages/services/MessageService.ts:151', 'איזה חיה!', 'איזה חיה!', 'איזו אלופה!', 'איזה אימון!', 'WOMEN: "חיה" reads as gym-bro slang; neutral praise of the workout lands for everyone'),
 ('src/features/messages/services/MessageService.ts:222', 'מפלצת!', 'מפלצת!', 'מפלצת!', 'שיא חדש!', 'WOMEN: aggressive praise; praise the result instead'),
 ('src/features/messages/services/MessageService.ts:222', 'שבירת שיאים זה הדבר שלך', 'שבירת שיאים זה הדבר שלך', 'שבירת שיאים זה הדבר שלך', 'עוד שיא אישי, ככה בונים כוח', 'WOMEN: competitive framing; growth framing invites more'),
 ('src/features/messages/services/MessageService.ts:153', 'אלוף!', 'אלוף!', 'אלופה!', 'כל הכבוד!', 'shown to everyone (no targetGender); masculine noun'),
]
for ref, cur, m, f, n, note in TONE_ROWS:
    if any(r['file_or_key'] == ref and r['current'] == cur for r in rows):
        continue
    rows.append(dict(area='Social, arena & community', file_or_key=ref, current=cur, male=m, female=f, neutral=n,
                     note=note + '; manual finding', kind='masc-only' if cur in ('אלוף!',) else 'tone', gender_available='yes'))

rows.sort(key=lambda r: (r['area'], r['file_or_key']))
cols = ['area', 'file_or_key', 'current', 'male', 'female', 'neutral', 'note', 'kind', 'gender_available']
with open(sys.argv[2] if len(sys.argv) > 2 else 'gender-inventory.csv', 'w', encoding='utf-8', newline='') as fh:
    w = csv.DictWriter(fh, fieldnames=cols)
    w.writeheader()
    for r in rows:
        w.writerow(r)
c = collections.Counter()
for r in rows:
    for k in r['kind'].split('+'):
        c[(r['area'], k)] += 1
areas = sorted(set(r['area'] for r in rows), key=lambda a: -sum(1 for r in rows if r['area'] == a))
kinds = ['masc-only', 'slash', 'fem-for-all', 'tone']
print('| Area | Items | Masculine-only | Slash | Feminine-for-all | Tone | Catalog keys | Code lines | Gender unknown |')
print('|---|---:|---:|---:|---:|---:|---:|---:|---:|')
tot = collections.Counter()
for a in areas:
    rs = [r for r in rows if r['area'] == a]
    vals = [len(rs)] + [c[(a, k)] for k in kinds] + [sum(1 for r in rs if ':' in r['file_or_key'] and not r['file_or_key'].startswith('src') and not r['file_or_key'].startswith('functions')),
            sum(1 for r in rs if r['file_or_key'].startswith(('src', 'functions'))), sum(1 for r in rs if r['gender_available'] == 'no')]
    for i, v in enumerate(vals): tot[i] += v
    print(f'| {a} | ' + ' | '.join(str(v) for v in vals) + ' |')
print('| **Total** | ' + ' | '.join(f'**{tot[i]}**' for i in range(8)) + ' |')
print(len(rows), sum(1 for r in rows if not r['neutral']))
print(collections.Counter(r['gender_available'] for r in rows))
