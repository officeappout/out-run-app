/**
 * first-run-tour — the first-run coach-mark tours (onboarding tutorial, slice 2, 17.10.2026).
 *
 * After the WelcomeDrawer choice a new user gets short coach-mark tours (max 3 steps each),
 * each shown ONCE PER USER, rendered with the reusable CoachMarks component by FirstRunTour.
 * Pure decisions + copy live here (same split as hybrid/station-tutorial.ts); the seen-once
 * flag lives in onboardingPrefs (survives a hard close on native), keyed by tour + uid.
 *
 * Gated behind BOTH enable_onboarding_tutorial_v1 AND enable_home_v2 — either off → no tour.
 */
import { g, type AppGender } from '@/lib/utils/gendered-text';

export type FirstRunTourId = 'home' | 'map' | 'community' | 'player' | 'route' | 'route-player';

/** The WelcomeDrawer's choices (v2 adds the quiet "סתם בא לי להסתכל באפליקציה" link). */
export type WelcomeChoice = 'strength' | 'nearby' | 'browse' | 'skip-to-map';

/** Coach-mark target ids (`data-coach="…"` — inert attributes on the real elements). */
export const FIRST_RUN_COACH = {
  homeWorkout: 'home-today-workout',
  homePlus: 'home-plus',
  homeWeek: 'home-week',
  mapSearch: 'map-search',
  mapLayers: 'map-layers',
  /** Park pins are WebGL symbols (no DOM node) — this step's bubble is centered. */
  mapPark: 'map-park',
  communityLeague: 'community-league',
  communityInvite: 'community-invite',
  playerProgress: 'player-progress',
  playerDone: 'player-done',
  playerHowTo: 'player-how-to',
  /** enable_entry_whatnow_v1 — the first floating route card (the focused one in either carousel). */
  routeCard: 'route-card',
  /** The focused route card's start CTA. */
  routeStart: 'route-start',
  /** The first strength-stop marker drawn on the map (a DOM <Marker>, AppMap hybrid stops). */
  routeStop: 'route-strength-stop',
  /** The running player's pause / stop controls. */
  routePlayerControls: 'route-player-controls',
} as const;

export interface FirstRunTourStep {
  target: string;
  text: string;
  /** true = the tapping finger; 'swipe' = a sideways swipe finger (CoachMarks). */
  finger?: boolean | 'swipe';
  /** A pulse ring around the target (CoachMarks). */
  ring?: boolean;
  /** Keep the step (bubble centered) even when its target isn't in the DOM. */
  allowCentered?: boolean;
}

/** onboardingPrefs key for "this user has seen (or skipped) this tour". */
export function firstRunTourSeenKey(tour: FirstRunTourId, uid: string | null | undefined): string {
  return `first_run_tour_seen:${tour}:${uid || 'anon'}`;
}

/** Both flags on (and loaded) → the tours exist at all. */
export function firstRunToursEnabled(flags: { enableOnboardingTutorialV1?: boolean; enableHomeV2?: boolean }): boolean {
  return !!flags.enableOnboardingTutorialV1 && !!flags.enableHomeV2;
}

/** Show a tour? Only when enabled, not blocked by another surface, and not seen (or skipped). */
export function shouldShowFirstRunTour(input: {
  enabled: boolean;
  seenValue: string | null | undefined;
  blocked?: boolean;
}): boolean {
  return input.enabled && !input.blocked && !input.seenValue;
}

/**
 * Which tour starts right after the WelcomeDrawer choice. Only "סתם להסתכל" opens one on the
 * spot (home); the other choices route into existing flows whose own first-visit tours (map /
 * player) fire when the user gets there.
 */
export function tourAfterWelcomeChoice(choice: WelcomeChoice): FirstRunTourId | null {
  return choice === 'browse' ? 'home' : null;
}

/** Map URL params that open a drawer / flow on arrival — the map tour waits for a plain visit. */
export const MAP_DEEP_LINK_PARAMS = [
  'openRun', 'targetSteps', 'openHybridSlots', 'openDiscover', 'openPark', 'openRoute',
  'demo', 'context', 'fromExplorer',
] as const;

export function hasMapDeepLink(params: { get(key: string): string | null } | null | undefined): boolean {
  if (!params) return false;
  return MAP_DEEP_LINK_PARAMS.some((k) => {
    const v = params.get(k);
    return v != null && v !== '';
  });
}

/** The map tour never interrupts a workout/run and never opens over a deep-linked drawer. */
export function isMapTourBlocked(input: {
  workoutActive: boolean;
  openedByDeepLink: boolean;
  /** Any sheet / drawer / non-idle map mode currently up. */
  surfaceOpen: boolean;
}): boolean {
  return input.workoutActive || input.openedByDeepLink || input.surfaceOpen;
}

/** Drop steps whose target isn't on screen (unless they may center). Order is kept. */
export function presentSteps(steps: FirstRunTourStep[], isPresent: (target: string) => boolean): FirstRunTourStep[] {
  return steps.filter((s) => s.allowCentered || isPresent(s.target));
}

export function firstRunTourSteps(tour: FirstRunTourId, gender: AppGender | null | undefined): FirstRunTourStep[] {
  switch (tour) {
    case 'home':
      return [
        { target: FIRST_RUN_COACH.homeWorkout, text: 'כאן האימון של היום — לחיצה ומתחילים', finger: true },
        { target: FIRST_RUN_COACH.homePlus, text: 'ה־+ מוסיף אימון, יציאה לאימון או הזמנת חבר' },
        { target: FIRST_RUN_COACH.homeWeek, text: 'כאן הלו״ז השבועי שלך' },
      ];
    case 'map':
      return [
        { target: FIRST_RUN_COACH.mapSearch, text: 'חיפוש פארק או כתובת' },
        {
          target: FIRST_RUN_COACH.mapLayers,
          text: g(
            gender,
            'כאן אתה בוחר מה רואים במפה: מתקני כושר, ברזיות ושירותים',
            'כאן את בוחרת מה רואים במפה: מתקני כושר, ברזיות ושירותים',
            'כאן בוחרים מה רואים במפה: מתקני כושר, ברזיות ושירותים',
          ),
        },
        { target: FIRST_RUN_COACH.mapPark, text: 'לחיצה על פארק מראה מתקנים ומי מתאמן שם', allowCentered: true },
      ];
    case 'community':
      return [
        { target: FIRST_RUN_COACH.communityLeague, text: 'כאן הליגה של השכונה והעיר שלך' },
        { target: FIRST_RUN_COACH.communityInvite, text: 'הזמנת חבר מוסיפה +50 לשכונה' },
      ];
    case 'player':
      return [
        {
          target: FIRST_RUN_COACH.playerProgress,
          text: g(
            gender,
            'הפסים למעלה מראים איפה אתה באימון ומה עוד נשאר',
            'הפסים למעלה מראים איפה את באימון ומה עוד נשאר',
            'הפסים למעלה מראים איפה עומדים באימון ומה עוד נשאר',
          ),
        },
        // how-to before done: the instructions sit below the fold of the reps card, so the
        // last step scrolls the "סיימתי" button back into view.
        { target: FIRST_RUN_COACH.playerHowTo, text: 'כאן ההסבר איך מבצעים את התרגיל' },
        { target: FIRST_RUN_COACH.playerDone, text: 'סיימת סט? לחיצה על "סיימתי" ועוברים לתרגיל הבא', finger: true },
      ];
    // enable_entry_whatnow_v1 (entry flow v2, designs R1–R3): the first floating route card.
    case 'route':
      return [
        { target: FIRST_RUN_COACH.routeCard, text: 'זה המסלול שלך. מחליקים הצידה כדי לראות עוד מסלולים באזור.', finger: 'swipe' },
        {
          target: FIRST_RUN_COACH.routeStop,
          text: 'בעצירות האלה עוצרים לכמה דקות כוח על המתקנים בגינה. הנגן יגיד לך מתי.',
          finger: true,
          allowCentered: true,
        },
        { target: FIRST_RUN_COACH.routeStart, text: 'מוכנים? לוחצים כאן ויוצאים. באימון הראשון נבקש 3 פרטים והצהרת בריאות קצרה.', ring: true },
      ];
    // enable_entry_whatnow_v1 (design R6): one tip the first time the route player runs.
    case 'route-player':
      return [
        { target: FIRST_RUN_COACH.routePlayerControls, text: 'לסיום האימון לוחצים לחיצה ארוכה, כדי שלא ייגמר בטעות בכיס.' },
      ];
    default:
      return [];
  }
}

/** Bubble chrome per tour. The entry-flow tours use the dark bubble (designs R1–R6); the
 *  original tours keep CoachMarks' defaults (undefined → byte-identical). */
export interface FirstRunTourChrome {
  variant: 'dark';
  counterLabel: (index: number, total: number) => string;
}

export function firstRunTourChrome(tour: FirstRunTourId): FirstRunTourChrome | undefined {
  if (tour === 'route') return { variant: 'dark', counterLabel: (i, n) => `${i + 1} מתוך ${n}` };
  if (tour === 'route-player') return { variant: 'dark', counterLabel: () => 'טיפ אחד' };
  return undefined;
}

/**
 * Player tour: only for a fresh (non-resumed) strength session's FIRST set, before it starts —
 * never mid-exercise, never over the guided station layer's own gates.
 */
export function shouldArmPlayerTour(input: {
  eligible: boolean;
  workoutState: string;
  segmentIndex: number;
  exerciseIndex: number;
  resumed: boolean;
  guidedGates: boolean;
}): boolean {
  return (
    input.eligible &&
    !input.resumed &&
    !input.guidedGates &&
    input.workoutState === 'PREPARING' &&
    input.segmentIndex === 0 &&
    input.exerciseIndex === 0
  );
}

// ── Who gets the tours: NEW users only (owner, 18.10.2026) ──────────────────────────────────
/** "New" = the account was created within this many days. */
export const FIRST_RUN_NEW_USER_DAYS = 14;
const DAY_MS = 24 * 60 * 60 * 1000;

/** Parse a creation time (Firebase Auth `metadata.creationTime` is an RFC-2822 string; Date /
 *  epoch ms / Firestore Timestamp also accepted). Unparseable → null. */
export function toCreationMs(v: unknown): number | null {
  if (v == null || v === '') return null;
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (v instanceof Date) return Number.isFinite(v.getTime()) ? v.getTime() : null;
  if (typeof v === 'string') {
    const t = Date.parse(v);
    return Number.isFinite(t) ? t : null;
  }
  const o = v as { toMillis?: () => number; seconds?: number };
  if (typeof o.toMillis === 'function') {
    const t = o.toMillis();
    return Number.isFinite(t) ? t : null;
  }
  if (typeof o.seconds === 'number') return o.seconds * 1000;
  return null;
}

/**
 * New user for the first-run tours? Primary signal: the Firebase Auth account creation time
 * (immutable — unlike users/{uid}.createdAt, which onboarding-sync backfills for old docs that
 * lack it). Within FIRST_RUN_NEW_USER_DAYS → new; older → never. Only when the date is missing
 * do we fall back to Gate 1 ("never trained"); `everTrained` null = still unknown → null.
 */
export function isNewUserForTours(input: {
  createdAtMs: number | null;
  nowMs: number;
  everTrained: boolean | null;
}): boolean | null {
  if (input.createdAtMs != null) {
    const age = input.nowMs - input.createdAtMs;
    return age >= -DAY_MS && age <= FIRST_RUN_NEW_USER_DAYS * DAY_MS;
  }
  if (input.everTrained == null) return null;
  return !input.everTrained;
}
