/**
 * Help entries added with Kelly round 4 (flag ai_coach_round4). Same rules as
 * src/lib/ai/coach/app-help/entries.ts: accurate only, the app's own labels in quotes,
 * impersonal wording. Kept apart so Kelly's get_app_help topic list (part of the cached tool
 * definitions) stays byte-identical while the flag is off.
 */
import type { AppHelpEntry } from '@/lib/ai/coach/app-help/entries';

export const ROUND4_HELP_ENTRIES: readonly AppHelpEntry[] = [
  {
    id: 'running',
    title: 'ריצה והליכה',
    keywords: ['ריצה', 'הליכה', 'לרוץ', 'ללכת', 'תוכנית ריצה', 'שאלון ריצה', 'קצב', 'קצבים', 'ריצה חופשית', 'הליכה חופשית', 'אירובי'],
    answer:
      'בלשונית "מפה" אפשר לצאת ל"ריצה חופשית" או "הליכה חופשית" ולבחור יעד של זמן או מרחק, וגם לבקש מסלול מוצע. לתוכנית ריצה עם קצבים אישיים עונים על שאלון הריצה ("הוסף תוכנית ריצה" בכרטיס העקביות במסך הבית). אפשר גם לבקש מקלי לבנות הליכה או ריצה, וגם ריצה ובסוף בטן.',
  },
  {
    id: 'kelly',
    title: 'מה קלי יודע לעשות',
    keywords: ['קלי', 'מאמן', 'מה אתה יודע', 'מה אתה יכול', 'צ׳אט', 'בינה מלאכותית', 'AI', 'עוזר'],
    answer:
      'קלי בונה אימוני כוח, הליכה וריצה, עונה על הלו״ז וההתקדמות, מוצא גינות כושר קרובות, יודע את מזג האוויר כשהוא זמין, מכין שינוי בלו״ז שנשמר רק אחרי "אשר", ומעביר שאלות לצוות. נכנסים אליו מ"הודעות" בראש המסך.',
  },
  {
    id: 'tutorial',
    title: 'סיור באפליקציה ושאלות נפוצות',
    keywords: ['איך משתמשים', 'הדרכה', 'מדריך', 'טוטוריאל', 'סיור', 'שאלות נפוצות', 'לימוד', 'הסבר על האפליקציה'],
    answer:
      'בהגדרות (פרופיל ואז גלגל השיניים), באזור "כללי", יש "איך משתמשים ושאלות נפוצות": שם אפשר להפעיל שוב את הסיור באפליקציה לפי נושא (מפה ופארקים, אימונים, לו״ז) ולחפש תשובות. אפשר גם לבקש מקלי "תראה לי איך משתמשים".',
  },
];
