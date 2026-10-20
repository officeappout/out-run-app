/**
 * Design + behaviour rules the testers check, each with a stable id so a finding cites a rule
 * instead of "looks off" (agent-briefs/ai-testers-design.md appendix C; sources v2-brief.md and
 * run-ui-brief.md). `lint: true` = also checked deterministically from the DOM (./lint/rules.ts).
 */

export interface Rule {
  id: string;
  text: string;
  source: 'v2-brief' | 'run-ui-brief' | 'general';
  lint: boolean;
}

export const RULES: readonly Rule[] = [
  { id: 'V2-CTA-1', text: 'One filled gradient per screen: the main CTA only. Secondary buttons are white pills.', source: 'v2-brief', lint: true },
  { id: 'V2-SELECTED-TINT', text: 'Selected chips/toggles/cards use the brand tint, never black or very dark fills.', source: 'v2-brief', lint: true },
  { id: 'V2-FONT-11', text: 'No text smaller than 11px.', source: 'v2-brief', lint: true },
  { id: 'V2-NOWRAP', text: 'Button / chip labels never wrap to two lines and are never cut without an ellipsis.', source: 'v2-brief', lint: true },
  { id: 'V2-NO-EMOJI', text: 'No emoji in UI text — icons only.', source: 'v2-brief', lint: true },
  { id: 'V2-SHEET', text: 'Sheets: rounded top (28px), a handle, a round close button.', source: 'v2-brief', lint: false },
  { id: 'V2-PRESS', text: 'Tappable elements give press feedback (slight scale).', source: 'v2-brief', lint: false },
  { id: 'RUN-NO-PACE-400', text: 'No live pace shown for run legs shorter than 400 m.', source: 'run-ui-brief', lint: false },
  { id: 'RUN-MINI-PLAYER', text: 'Dragging the player down shrinks it to a mini-player; the session list is the layer behind it.', source: 'run-ui-brief', lint: false },
  { id: 'RUN-CART-ICON', text: 'Session progress uses the cart icon with a segmented ring + count, not numbered circles.', source: 'run-ui-brief', lint: false },
  { id: 'SUM-MAP-BEHIND', text: 'Summary: map behind, content in tabs, program ring without XP, "שיפור מהפעם הקודמת" big and green, no "פירוט התקדמות".', source: 'run-ui-brief', lint: false },
  { id: 'PREV-HEADER', text: 'Workout preview: existing header + journey strip + intensity chart, no duplicate 3-stat row.', source: 'run-ui-brief', lint: false },
  { id: 'HEALTH-ONCE', text: 'The health declaration appears once per user, never again after it was accepted.', source: 'run-ui-brief', lint: false },
  { id: 'MOB-TARGET-44', text: 'Touch targets are at least 44×44 CSS px.', source: 'general', lint: true },
  { id: 'MOB-SAFE-AREA', text: 'Nothing tappable under the notch or the home indicator.', source: 'general', lint: false },
  { id: 'MOB-NO-HSCROLL', text: 'The page never scrolls horizontally.', source: 'general', lint: true },
  { id: 'RTL-1', text: 'Hebrew screens are RTL: back arrows and chevrons point the right way, text aligns right.', source: 'general', lint: false },
  { id: 'STAB-CONSOLE', text: 'No console errors, failed requests (4xx/5xx) or permission-denied while using the app.', source: 'general', lint: true },
];

export const RULE_IDS: ReadonlySet<string> = new Set(RULES.map((r) => r.id));

export function ruleText(id: string): string | null {
  return RULES.find((r) => r.id === id)?.text ?? null;
}
