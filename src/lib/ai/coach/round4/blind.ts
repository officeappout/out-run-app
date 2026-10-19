/**
 * Kelly round 4 — "I can't do that here" when a round 4 tool can (owner chat 19.10.2026:
 * "אני לא יכול להמליץ על פארקים באזור או לבדוק מזג אוויר בצ׳אט הזה", "כרגע אני לא יכול לבנות
 * אימוני אירובי"). Pure. Only consulted while the flag is on (BlindContext.round4).
 */
const CANT =
  /(?:לא\s+(?:יכול|יכולה|מסוגל)\s+(?:להמליץ|לבדוק|לבנות|למצוא|להסביר|לתת|לראות|לדעת)|(?:לא|אינם|אינן|אינו)\s+זמינ(?:ים|ות|ה)?|אין\s+לי\s+(?:אפשרות|גישה|מידע))[^.!?\n]{0,60}/;

const TOPICS: Array<{ tool: string; user: RegExp }> = [
  { tool: 'find_nearby_parks', user: /פארק|גינ(?:ת|ות)\s*כושר|גינה\s+ציבורית|מתקני\s*כושר|איפה\s+(?:יש\s+)?(?:להתאמן|מתקנים)/ },
  { tool: 'get_weather', user: /מזג\s*(?:ה)?אוויר|גשם|טמפרטורה|כמה\s+מעלות|שרב|חמסין/ },
  { tool: 'plan_aerobic_session', user: /ריצ|לרוץ|הליכ|ללכת|אירובי|קרדיו/ },
  { tool: 'start_tutorial', user: /איך\s+משתמשים|טוטוריאל|הדרכה|מדריך|סיור\s+ב|לימוד\s+(?:ה)?ממשק|תראה\s+לי\s+איך/ },
];

export function findRound4BlindClaim(reply: string, userText: string, toolNames: string[]): { claim: string; tools: string[] } | null {
  const m = (reply ?? '').normalize('NFC').match(CANT);
  if (!m) return null;
  const u = (userText ?? '').normalize('NFC');
  const tools = TOPICS.filter((t) => t.user.test(u) && !toolNames.includes(t.tool)).map((t) => t.tool);
  return tools.length ? { claim: m[0].trim(), tools } : null;
}
