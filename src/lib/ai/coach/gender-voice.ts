/**
 * AI coach — Kelly's grammatical gender about HIMSELF. Pure. Shared by the reply guard
 * (reply-guards.ts → turn-engine.ts) and the review agent's deterministic checks
 * (src/lib/ai/review/checks.ts), so the two can never disagree.
 *
 * Kelly is a male coach (product decision 18.10.2026). Owner thread after #434: "אני מניח
 * שאתה מתכוון… אבל לא בטוחה שהבנתי" — the subject "אני" was dropped, so a detector that
 * only looks right after "אני" misses it.
 *
 * Two patterns:
 *   explicit    "אני" (+ up to two adverbs: לא, גם, רק, ממש…) + a feminine form
 *               ("אני בודקת", "אני לא יודעת").
 *   subjectless a clause that STARTS with (adverbs +) a feminine form ("אבל לא בטוחה
 *               שהבנתי", "שמחה לעזור."). A female user is addressed with exactly the same
 *               words ("בטוחה?", "את לא בטוחה?"), so a subjectless match counts only when
 *               the clause is not a question and, unless the user is known not to be
 *               female, it also carries a first-person marker (שהבנתי, בניתי, לי, שלי…).
 *               A clause with an explicit second-person subject (את, אתה, אתם) never counts.
 *
 * Forms whose masculine and feminine spelling are identical (רוצה, בונה, רואה, מנסה,
 * מקווה, מחכה, עונה) are deliberately NOT listed: they can't be wrong. Quoted text ("…",
 * ״…״, “…”) is ignored.
 */
import type { CoachGender } from './persona';

/** Feminine first-person forms Kelly must not use → the masculine form. */
export const FEMININE_TO_MASCULINE: Readonly<Record<string, string>> = {
  בטוחה: 'בטוח',
  צריכה: 'צריך',
  בודקת: 'בודק',
  מבינה: 'מבין',
  יודעת: 'יודע',
  יכולה: 'יכול',
  מציעה: 'מציע',
  מניחה: 'מניח',
  שמחה: 'שמח',
  מוכנה: 'מוכן',
  ממליצה: 'ממליץ',
  חושבת: 'חושב',
  זוכרת: 'זוכר',
  מכינה: 'מכין',
  שומרת: 'שומר',
  מסכימה: 'מסכים',
  מתנצלת: 'מתנצל',
  מקשיבה: 'מקשיב',
  זמינה: 'זמין',
  עוצרת: 'עוצר',
  מאמנת: 'מאמן',
  רופאה: 'רופא',
  מצטערת: 'מצטער',
  מרגישה: 'מרגיש',
  מתכוונת: 'מתכוון',
  משתדלת: 'משתדל',
  אוהבת: 'אוהב',
  מעדיפה: 'מעדיף',
  מכירה: 'מכיר',
  ממשיכה: 'ממשיך',
  מתחילה: 'מתחיל',
  שולחת: 'שולח',
  מסבירה: 'מסביר',
  מבקשת: 'מבקש',
  מחפשת: 'מחפש',
  הולכת: 'הולך',
  כותבת: 'כותב',
  מוסיפה: 'מוסיף',
  מבטיחה: 'מבטיח',
  סקרנית: 'סקרן',
  נשארת: 'נשאר',
  מתאימה: 'מתאים',
  בוחרת: 'בוחר',
  מעבירה: 'מעביר',
  מסדרת: 'מסדר',
  שואלת: 'שואל',
};

/**
 * Fixed feminine self-descriptions ("המאמנת הדיגיטלית", "אני קלי, המאמנת"). Group 1 is the
 * feminine noun; masculinizing rewrites it (מאמנת → מאמן) and the adjective after it.
 */
const FEMININE_PHRASES: ReadonlyArray<RegExp> = [/(?<![\u05D0-\u05EA])ה?(מאמנת)\s+ה?דיגיטלית/g, /אני\s+קלי,?\s+ה(מאמנת)/g];

const FORMS = Object.keys(FEMININE_TO_MASCULINE).join('|');
const ADVERBS = '(?:(?:לא|גם|רק|כן|עדיין|ממש|די|פשוט|באמת|כבר|תמיד|ממש\\s+לא|בכלל\\s+לא)\\s+){0,2}';
const HE = '\\u05D0-\\u05EA';

/** "אני" + adverbs + form. Group 1 = the form. */
const EXPLICIT_RE = new RegExp(`(?<![${HE}])אני\\s+${ADVERBS}(${FORMS})(?![${HE}])`, 'g');

/**
 * Clause start + optional connector + adverbs + form. The clause start is the beginning of
 * the text or a sentence / clause boundary.
 */
const SUBJECTLESS_RE = new RegExp(
  `(^|[.!?,:;\\n…]\\s*|\\s[-–]\\s*)((?:(?:אבל|אז|ו|וגם|גם|רק|ועדיין|האמת)\\s*)?)(${ADVERBS}(${FORMS}))(?![${HE}])`,
  'g',
);

/** Words that make the clause about the user, not about Kelly. */
const SECOND_PERSON = /(?<![א-ת])(את|אתה|אתם|אתן)(?![א-ת])/;

/** First-person markers: a past-tense "‑תי" verb, or לי / שלי / אותי / אצלי. */
const FIRST_PERSON = /[א-ת]{2,}תי(?![א-ת])|(?<![א-ת])(לי|שלי|אותי|אצלי|ממני|עליי)(?![א-ת])/;

export interface FeminineHit {
  /** The matched words, as written ("אני לא זוכרת", "לא בטוחה"). */
  text: string;
  /** The feminine form inside it. */
  form: string;
  /** Index of the form in the original text. */
  formIndex: number;
}

/** Blank out quoted spans (same length, so indexes stay valid). */
function maskQuotes(s: string): string {
  return s.replace(/"[^"\n]*"|״[^״\n]*״|“[^”\n]*”|„[^“”\n]*[“”]/g, (m) => ' '.repeat(m.length));
}

/** The clause from `start` to the next clause boundary, and whether that clause is a question. */
function clauseFrom(s: string, start: number): { text: string; endsWithQuestion: boolean } {
  let b = start;
  while (b < s.length && !/[.!?,;:\n…]/.test(s[b])) b++;
  // A question about the user ("בטוחה?") ends its own clause with "?"; a later question
  // in the same sentence ("…לא בטוחה שהבנתי, תוכל לכתוב שוב?") doesn't make this one a question.
  return { text: s.slice(start, b), endsWithQuestion: s[b] === '?' };
}

/**
 * Kelly's feminine self-references in `text`. `userGender` relaxes the subjectless rule
 * when the user is known not to be female (no feminine "you" is expected at all).
 */
export function findFeminineSelfReferences(text: string, userGender?: CoachGender | null): FeminineHit[] {
  const raw = (text ?? '').normalize('NFC');
  const s = maskQuotes(raw);
  const hits: FeminineHit[] = [];
  const seen = new Set<number>();

  for (const m of Array.from(s.matchAll(EXPLICIT_RE))) {
    const form = m[1];
    const formIndex = (m.index ?? 0) + m[0].lastIndexOf(form);
    seen.add(formIndex);
    hits.push({ text: m[0], form, formIndex });
  }

  for (const m of Array.from(s.matchAll(SUBJECTLESS_RE))) {
    const form = m[4];
    const matchStart = (m.index ?? 0) + m[1].length;
    const formIndex = (m.index ?? 0) + m[0].lastIndexOf(form);
    if (seen.has(formIndex)) continue;
    const clause = clauseFrom(s, matchStart);
    if (clause.endsWithQuestion) continue;
    if (SECOND_PERSON.test(clause.text)) continue;
    const userMayBeFemale = userGender !== 'male' && userGender !== 'other';
    if (userMayBeFemale && !FIRST_PERSON.test(clause.text)) continue;
    seen.add(formIndex);
    hits.push({ text: m[3].trim(), form, formIndex });
  }

  for (const re of FEMININE_PHRASES) {
    for (const m of Array.from(s.matchAll(new RegExp(re.source, 'g')))) {
      const formIndex = (m.index ?? 0) + m[0].indexOf(m[1]);
      if (seen.has(formIndex)) continue;
      seen.add(formIndex);
      hits.push({ text: m[0], form: m[1], formIndex });
    }
  }
  return hits.sort((a, b) => a.formIndex - b.formIndex);
}

/** The first feminine self-reference, as written, or null (the review agent's check). */
export function firstFeminineSelfReference(text: string, userGender?: CoachGender | null): string | null {
  return findFeminineSelfReferences(text, userGender)[0]?.text ?? null;
}

/**
 * Deterministic last resort after the one re-prompt: rewrite exactly the detected forms to
 * the masculine. Words the detector did not flag (e.g. "את בטוחה?" to a female user) are
 * never touched.
 */
export function masculinizeSelfReferences(text: string, userGender?: CoachGender | null): { text: string; changed: string[] } {
  const raw = (text ?? '').normalize('NFC');
  const hits = findFeminineSelfReferences(raw, userGender);
  if (hits.length === 0) return { text: raw, changed: [] };
  let out = raw;
  const changed: string[] = [];
  // Right to left, so earlier indexes stay valid.
  for (const h of [...hits].sort((a, b) => b.formIndex - a.formIndex)) {
    const masc = FEMININE_TO_MASCULINE[h.form];
    if (!masc) continue;
    out = out.slice(0, h.formIndex) + masc + out.slice(h.formIndex + h.form.length);
    changed.push(`${h.form}→${masc}`);
  }
  // The adjective that agrees with a rewritten "מאמנת".
  out = out.replace(/(מאמן\s+ה?)דיגיטלית/g, '$1דיגיטלי');
  return { text: out, changed: changed.reverse() };
}
