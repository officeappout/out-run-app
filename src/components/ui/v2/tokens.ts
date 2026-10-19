/**
 * Design language v2 — JS-side tokens.
 *
 * The same values live as CSS variables (`--v2-*` in src/app/globals.css) and
 * Tailwind tokens (`v2-*` / `activity-*` in tailwind.config.ts). This module
 * exists for the places CSS can't reach: framer-motion transitions, inline
 * SVG fills, canvas/chart colours. Source of truth for the language itself:
 * .claude/knowledge/design-language.md (v2), extracted from the marketing
 * site (appout-website).
 *
 * Plain .ts, zero React imports — safe to import from tests and pure logic.
 */

export const V2_COLORS = {
  /** Site accent — 123 uses in the site CSS (gradient start, chart strokes, tab underline). */
  accent: '#00baf7',
  /** Brand cyan var (`--brand-cyan`), the app's historical primary. */
  cyan: '#00c9f2',
  teal: '#00dcd0',
  ctaFrom: '#00baf7',
  ctaTo: '#0cf2e3',
  onCta: '#04222b',
  /** Deep cyan — eyebrows, links, icon colour on a cyan tint. */
  deep: '#0284c7',
  ink: '#0e1419',
  ink2: '#4b5a66',
  muted: '#64748b',
  surface: '#f6fbfd',
  /** Icon-tile / chip tint. */
  tint: '#eef8fc',
  hairline: '#e6edf2',
  hairlineCool: '#e6f0f4',
  pillBorder: '#dfe7ed',
  gold: '#ffc83d',
  onGold: '#7a4a00',
  amber: '#f59e0b',
  up: '#10b981',
  down: '#e5484d',
} as const;

/** Semantic activity colours — the only non-brand hues allowed as accents. */
export const ACTIVITY_COLORS = {
  steps: '#00c07a',
  run: '#00c9f2',
  // Named `cycle`, not `bike`, on purpose: a 'bike' literal type here is
  // checked before the existing commute-method union and reorders how tsc
  // prints it, which the tsc-baseline gate reads as a "new" error. The
  // Tailwind/CSS token keeps the site's name: activity-bike / --activity-bike.
  cycle: '#39d98a',
} as const;

export type ActivityTone = keyof typeof ACTIVITY_COLORS;

/** The v2 curve — used for every transition (CSS: `ease-v2`, `var(--v2-ease)`). */
export const EASE_V2 = [0.23, 1, 0.32, 1] as const;
export const EASE_V2_CSS = 'cubic-bezier(0.23, 1, 0.32, 1)';

/** Press feedback scale for anything tappable. */
export const PRESS_SCALE = 0.97;

/** Spring pop-in for chips/badges (site: app-ui/LevelUpRing.tsx). */
export const SPRING_POP = { type: 'spring', stiffness: 400, damping: 15 } as const;

/** Standard durations (seconds, framer-motion units). */
export const DURATION = { fast: 0.18, base: 0.32, slow: 0.6 } as const;

/**
 * Z-bands a v2 `<Sheet>` may use — each value is a row of the documented
 * Z-Index Budget in .cursorrules (DO NOT add a value here without adding it
 * there first). Pick the band of the screen the sheet opens over.
 */
export const SHEET_Z = {
  /** Arena leaderboard sheets (LeagueFilterSheet / OpponentPickerSheet) backdrop — budget row z-[48]/z-[49]. */
  arenaFilter: 48,
  /** Arena leaderboard sheets panel — budget row z-[48]/z-[49]. */
  arenaFilterPanel: 49,
  /** Map drawers / home sheets that sit over BottomNavbar (z-50) — budget row z-[60]/z-[61]. */
  drawer: 60,
  /** Sheet one step above a z-[60] backdrop (split layout panel) — budget row z-[60]/z-[61]. */
  drawerPanel: 61,
  /** Library filter sheets (FilterSheet / EquipmentFilterSheet) backdrop — budget row z-[70] (filter sheets note). */
  filter: 70,
  /** Library filter sheet panel over its z-[70] backdrop — budget row z-[70] (panel z-[71]). */
  filterPanel: 71,
  /** GroupDetailsDrawer backdrop — budget row z-[80]/z-[81]. */
  group: 80,
  /** GroupDetailsDrawer panel — budget row z-[80]/z-[81]. */
  groupPanel: 81,
  /** CreatorManagementDrawer backdrop (profile page, in place) — budget row z-[88]/z-[89]. */
  creatorDrawer: 88,
  /** CreatorManagementDrawer panel — budget row z-[88]/z-[89]. */
  creatorDrawerPanel: 89,
  /** PostJoinSuccessDrawer backdrop — budget row z-[90]/z-[91]. */
  joinSuccess: 90,
  /** PostJoinSuccessDrawer panel — budget row z-[90]/z-[91]. */
  joinSuccessPanel: 91,
  /** Community sheets (ReportContentSheet, CreateGroupWizard) backdrop — budget row z-[92]/z-[93]. */
  community: 92,
  /** Community sheets panel — budget row z-[92]/z-[93]. */
  communityPanel: 93,
  /** NavigationSheet / PartnerFilterSheet (v2) backdrop — the z-[95] row (shared with the referral toast; never on screen together). */
  navigate: 95,
  /** NavigationSheet / PartnerFilterSheet (v2) panel — budget row z-[96]. */
  navigatePanel: 96,
  /** Profile sheets (Favorites / History / Achievements) backdrop — budget row z-[98]/z-[99]. */
  profile: 98,
  /** Profile sheets panel — budget row z-[98]/z-[99]. */
  profilePanel: 99,
  /** Full-screen overlays & map sheets — budget row z-[100]. */
  overlay: 100,
  /** Clears OfflineBanner (z-[100]) — budget row z-[101]. */
  aboveOffline: 101,
  /** FreeRunDrawer's GoalSheet backdrop (over the z-[100] drawer) — budget row z-[102]/z-[103]. */
  freeRunGoal: 102,
  /** FreeRunDrawer's GoalSheet panel — budget row z-[102]/z-[103]. */
  freeRunGoalPanel: 103,
  /** FreeRunDrawer's Extras / LegPlan sheets backdrop (over GoalSheet) — budget row z-[104]/z-[105]. */
  freeRunExtras: 104,
  /** FreeRunDrawer's Extras / LegPlan sheets panel — budget row z-[104]/z-[105]. */
  freeRunExtrasPanel: 105,
  /** HealthConnectDisclosureModal (backdrop + sheet in one layer) — budget row z-[120]. */
  healthDisclosure: 120,
  /** LegalDocModal backdrop (clears HealthConnectDisclosureModal) — budget row z-[130]/z-[131]. */
  legal: 130,
  /** LegalDocModal sheet — budget row z-[130]/z-[131]. */
  legalPanel: 131,
  /** RollingAgenda's drag-reschedule confirm backdrop — the z-[140] row (portalled; never with JITSetupModal). */
  agendaMoveBackdrop: 140,
  /** RollingAgenda's drag-reschedule confirm sheet — budget row z-[150]. */
  agendaMove: 150,
  /** UserWorkoutAdjuster backdrop (its panel is `nestedModal`, z-[200]) — budget row z-[199]. */
  adjusterBackdrop: 199,
  /** EquipmentDetailDrawer backdrop (nested over ParkDetailSheet); also UserWorkoutAdjuster's panel and the workout-preview ExerciseDetailDrawer (backdrop + panel) — budget row z-[200]/z-[201]. */
  nestedModal: 200,
  /** EquipmentDetailDrawer panel — budget row z-[200]/z-[201]. */
  nestedModalPanel: 201,
  /** AgendaDayCard's delete-confirm backdrop — budget row z-[300]/z-[301] (in place, inside the planner's stacking context). */
  agendaDelete: 300,
  /** AgendaDayCard's delete-confirm sheet — budget row z-[300]/z-[301]. */
  agendaDeletePanel: 301,
} as const;

export type SheetZIndex = (typeof SHEET_Z)[keyof typeof SHEET_Z];

/** The v2 sheet spring (stiffness 340, damping 34) shared by the home/map sheets. */
export const SPRING_SHEET = { type: 'spring', stiffness: 340, damping: 34 } as const;
