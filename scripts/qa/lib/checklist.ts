/**
 * Design + behaviour rules the testers check, each with a stable id so a finding cites a rule
 * instead of "looks off" (agent-briefs/ai-testers-design.md appendix C; sources v2-brief.md and
 * run-ui-brief.md). `lint: true` = also checked deterministically from the DOM (./lint/rules.ts).
 * `area` groups the rules in the design checklist the model gets (./design/checklist-builder.ts).
 * Ids must match /^[A-Z0-9-]{2,30}$/ (the qaRunnerReport sanitiser drops anything else).
 */

export type RuleArea =
  | 'surfaces'
  | 'cta'
  | 'selection'
  | 'type'
  | 'touch'
  | 'sheets'
  | 'layout'
  | 'rtl'
  | 'mobile'
  | 'states'
  | 'icons'
  | 'consistency'
  | 'run'
  | 'behaviour';

export interface Rule {
  id: string;
  text: string;
  source: 'v2-brief' | 'run-ui-brief' | 'general';
  lint: boolean;
  area: RuleArea;
}

export const RULES: readonly Rule[] = [
  // Surfaces + tokens
  { id: 'V2-TOKENS', text: 'Colours come from the v2 palette: light blue-grey page, white cards with a soft shadow (no gray borders), dark-ink text, brand blue for accents. No stray greys, pure-black blocks or off-brand colours.', source: 'v2-brief', lint: false, area: 'surfaces' },
  { id: 'V2-CARD', text: 'Cards are white, rounded (~20px) with a soft shadow or ring; the same kind of card looks the same everywhere on the screen.', source: 'v2-brief', lint: false, area: 'surfaces' },
  { id: 'V2-ACTIVITY-COLOR', text: 'Activity colours are consistent: strength cyan #00baf7, cardio/run lime #84cc16, steps/walk amber #f59e0b, maintenance violet #8b5cf6.', source: 'v2-brief', lint: false, area: 'surfaces' },
  // CTA + buttons
  { id: 'V2-CTA-1', text: 'One filled gradient per screen: the main CTA only (pill, ~48px high, bold). Secondary buttons are white pills.', source: 'v2-brief', lint: true, area: 'cta' },
  { id: 'V2-SECONDARY', text: 'Secondary buttons are white pills with a soft ring; round icon buttons are 40px white circles. No second competing primary button.', source: 'v2-brief', lint: false, area: 'cta' },
  { id: 'V2-PRESS', text: 'Tappable elements give press feedback (slight scale).', source: 'v2-brief', lint: false, area: 'cta' },
  // Selection
  { id: 'V2-SELECTED-TINT', text: 'Selected chips/toggles/cards use the brand tint (light blue fill + blue ring), never black or very dark fills.', source: 'v2-brief', lint: true, area: 'selection' },
  // Typography
  { id: 'V2-FONT-11', text: 'No text smaller than 11px.', source: 'v2-brief', lint: true, area: 'type' },
  { id: 'V2-NOWRAP', text: 'Button / chip labels never wrap to two lines and are never cut without an ellipsis.', source: 'v2-brief', lint: true, area: 'type' },
  { id: 'V2-TYPE-SCALE', text: 'Clear hierarchy: sheet titles ~22px black weight, section titles 15–17px black, body 14–15px, hints 12–12.5px muted. No screen where everything is the same size or weight.', source: 'v2-brief', lint: false, area: 'type' },
  { id: 'LAY-CUT-TEXT', text: 'No cut text or numbers: nothing clipped mid-letter, half-hidden lines, values cut on the small phone, or "…" hiding the important part.', source: 'general', lint: false, area: 'type' },
  // Touch
  { id: 'MOB-TARGET-44', text: 'Touch targets are at least 44×44 CSS px.', source: 'general', lint: true, area: 'touch' },
  // Sheets
  { id: 'V2-SHEET', text: 'Sheets: rounded top (28px), a grab handle (40×6 pill), a round close button (36px, light surface) in the top corner; content never sits under the handle; the backdrop dims the page.', source: 'v2-brief', lint: false, area: 'sheets' },
  // Layout
  { id: 'LAY-SPACING', text: 'Spacing is consistent: the same side gutter (~16px) on every block, even gaps between cards, edges aligned to one grid. No block that hugs the screen edge while its neighbours do not.', source: 'general', lint: false, area: 'layout' },
  { id: 'LAY-OVERLAP', text: 'Nothing overlaps: floating buttons, the bottom nav or a mini-player never cover content or the last list item; text over images stays readable; badges do not collide.', source: 'general', lint: false, area: 'layout' },
  { id: 'LAY-DENSITY', text: 'Density fits a phone: not a wall of numbers and chips, not a half-empty screen with one tiny card. The most important thing is visible without scrolling.', source: 'general', lint: false, area: 'layout' },
  // RTL
  { id: 'RTL-1', text: 'Hebrew screens are RTL: back arrows and chevrons point the right way, text aligns right.', source: 'general', lint: false, area: 'rtl' },
  { id: 'RTL-ALIGN', text: 'RTL details: lists start at the right, leading icons on the right, progress bars and sliders fill from the right, numbers with units read naturally ("5 ק״מ"), mixed Hebrew/English text keeps its order.', source: 'general', lint: false, area: 'rtl' },
  // Mobile
  { id: 'MOB-SAFE-AREA', text: 'Nothing tappable or important under the notch / status bar or the home indicator.', source: 'general', lint: false, area: 'mobile' },
  { id: 'MOB-KEYBOARD', text: 'When the keyboard is open, the focused input and its continue button stay visible (the sheet lifts above the keyboard); nothing important hides behind it.', source: 'general', lint: false, area: 'mobile' },
  { id: 'MOB-NO-HSCROLL', text: 'The page never scrolls horizontally.', source: 'general', lint: true, area: 'mobile' },
  { id: 'A11Y-CONTRAST', text: 'Text is readable: enough contrast (light text on light images, muted text on tint, white on lime are typical failures).', source: 'general', lint: false, area: 'mobile' },
  // States
  { id: 'STATE-EMPTY', text: 'Empty states explain what is missing and offer one action — never a blank area, "undefined", "NaN", "0/0" or a lonely title.', source: 'general', lint: false, area: 'states' },
  { id: 'STATE-LOADING', text: 'Loading uses skeletons shaped like the content; no endless spinner, no layout jump when data arrives, no flash of the wrong state.', source: 'general', lint: false, area: 'states' },
  // Icons
  { id: 'V2-NO-EMOJI', text: 'No emoji in UI text — icons only.', source: 'v2-brief', lint: true, area: 'icons' },
  { id: 'V2-ICONS', text: 'Icons come from one family (thin line icons or the app\'s own SVGs) with the same stroke and size; no mix of filled/outline sets, clip-art or generic placeholders.', source: 'v2-brief', lint: false, area: 'icons' },
  // Consistency between design generations
  { id: 'V2-MIXED-GEN', text: 'One design generation per screen: no old (v1) blocks — gray borders, square corners, black selected chips, old headers or fonts — next to v2 cards on the same screen.', source: 'v2-brief', lint: false, area: 'consistency' },
  // Run UI (run-ui-brief)
  { id: 'RUN-NO-PACE-400', text: 'No live pace shown for run legs shorter than 400 m.', source: 'run-ui-brief', lint: false, area: 'run' },
  { id: 'RUN-MINI-PLAYER', text: 'Dragging the player down shrinks it to a mini-player; the session list is the layer behind it.', source: 'run-ui-brief', lint: false, area: 'run' },
  { id: 'RUN-CART-ICON', text: 'Session progress uses the cart icon with a segmented ring + count, not numbered circles.', source: 'run-ui-brief', lint: false, area: 'run' },
  { id: 'RUN-SETS-TABLE', text: 'Strength inside any workout uses exercise cards (image, name, reps) and the per-set boxes table; a run leg sits in the same boxes.', source: 'run-ui-brief', lint: false, area: 'run' },
  { id: 'SUM-MAP-BEHIND', text: 'Summary: map behind, content in tabs, program ring without XP, flame-dots streak, "שיפור מהפעם הקודמת" big and green, metric rings, no "פירוט התקדמות".', source: 'run-ui-brief', lint: false, area: 'run' },
  { id: 'PREV-HEADER', text: 'Run / interval / hybrid workout preview: existing header + journey strip + intensity chart, no duplicate 3-stat row. Does NOT apply to a pure strength workout preview (it has its own design without a journey strip or intensity chart) — never report a missing strip/chart there.', source: 'run-ui-brief', lint: false, area: 'run' },
  // Behaviour
  { id: 'HEALTH-ONCE', text: 'The health declaration appears once per user, never again after it was accepted.', source: 'run-ui-brief', lint: false, area: 'behaviour' },
  { id: 'STAB-CONSOLE', text: 'No console errors, failed requests (4xx/5xx) or permission-denied while using the app.', source: 'general', lint: true, area: 'behaviour' },
];

export const RULE_IDS: ReadonlySet<string> = new Set(RULES.map((r) => r.id));

/** Rules about how a screen looks (everything but behaviour) — the overseer's "design findings". */
export const DESIGN_RULE_IDS: ReadonlySet<string> = new Set(RULES.filter((r) => r.area !== 'behaviour').map((r) => r.id));

export function ruleText(id: string): string | null {
  return RULES.find((r) => r.id === id)?.text ?? null;
}

/** Preview kinds the PREV-HEADER rule (journey strip + intensity chart) applies to. */
export const PREV_HEADER_PREVIEW_KINDS: ReadonlySet<string> = new Set(['run', 'interval', 'hybrid']);

/**
 * Whether PREV-HEADER applies to a workout preview of this kind (owner 21.10.2026: only
 * run / interval / hybrid previews; a pure strength preview has its own design and is exempt).
 */
export function prevHeaderApplies(previewKind: string | null | undefined): boolean {
  return !!previewKind && PREV_HEADER_PREVIEW_KINDS.has(previewKind.toLowerCase());
}
