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

export type FirstRunTourId = 'home' | 'map' | 'community' | 'player' | 'route' | 'route-player' | 'plan';

/** The WelcomeDrawer's choices (v2 adds the quiet "סתם בא לי להסתכל באפליקציה" link). */
export type WelcomeChoice = 'strength' | 'nearby' | 'browse' | 'skip-to-map';

/** Coach-mark target ids (`data-coach="…"` — inert attributes on the real elements). */
export const FIRST_RUN_COACH = {
  homeWorkout: 'home-today-workout',
  homePlus: 'home-plus',
  homeWeek: 'home-week',
  /** The v2 nav bar's raised map circle — the home tour's 3rd step when there is no week strip. */
  homeNavMap: 'nav-map',
  mapSearch: 'map-search',
  mapLayers: 'map-layers',
  /** Park pins are WebGL symbols — ParkCoachAnchor drops an invisible DOM marker on the park
   *  pin nearest the screen centre while a map tour may run (no pin in view → step dropped). */
  mapPark: 'map-park',
  communityLeague: 'community-league',
  communityInvite: 'community-invite',
  /** The leagues "שכונות" tab — community step 2 on the default "אישי" tab (no invite card there). */
  communityHoodsTab: 'community-hoods-tab',
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
  /** Short title (entry-flow tours: one idea per step — a title + one line). */
  title?: string;
  text: string;
  /** true = the tapping finger; 'swipe' = a sideways swipe finger (CoachMarks). */
  finger?: boolean | 'swipe';
  /** A pulse ring around the target (CoachMarks). */
  ring?: boolean;
  /** Keep the step (bubble centered) even when its target isn't in the DOM. */
  allowCentered?: boolean;
  /** When `target` isn't on screen, point at this instead (e.g. no week strip yet). */
  alt?: { target: string; title?: string; text: string };
}

/**
 * The week strip's coach target — only when a REAL week is shown. A user without a program
 * gets the blurred "pick a program" strip in the same slot; no target there, so the home
 * tour's 3rd step falls back to the map (its `alt`).
 */
export function homeWeekCoachTarget(input: { pickProgramStrip: boolean }): string | undefined {
  return input.pickProgramStrip ? undefined : FIRST_RUN_COACH.homeWeek;
}

/** Leagues tab coach target: the "שכונות" tab carries community step 2's fallback target. */
export function leagueTabCoachTarget(tabId: string): string | undefined {
  return tabId === 'neighborhoods' ? FIRST_RUN_COACH.communityHoodsTab : undefined;
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
 * player) fire when the user gets there. (Since 21.10 the home tour also starts by itself on a
 * new user's first calm home visit — see shouldArmHomeTour.)
 */
export function tourAfterWelcomeChoice(choice: WelcomeChoice): FirstRunTourId | null {
  return choice === 'browse' ? 'home' : null;
}

/**
 * Home tour arming (owner 21.10): on a new user's first calm home visit, not only after
 * "סתם בא לי להסתכל". Never while the WelcomeDrawer is up / the entry router is still deciding,
 * never on the visit the 'plan' tour points at the start cards, and only once the "today"
 * card is on screen (so the tour never measures a loading skeleton). New-user + seen-once
 * checks stay in FirstRunTour.
 */
export function shouldArmHomeTour(input: {
  toursOn: boolean;
  requestedByWelcome: boolean;
  entryKind: 'loading' | 'inactive' | 'new';
  planArrival: boolean;
  todayCardPresent: boolean;
  surfaceOpen: boolean;
}): boolean {
  if (!input.toursOn || input.surfaceOpen || !input.todayCardPresent) return false;
  if (input.entryKind === 'new') return false; // the WelcomeDrawer is up
  if (input.requestedByWelcome) return true;
  return input.entryKind === 'inactive' && !input.planArrival;
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

/**
 * The steps to show, in order: a step whose target is on screen stays; otherwise its `alt`
 * target is used when that one is on screen; otherwise it is dropped (unless it may center).
 */
export function presentSteps(steps: FirstRunTourStep[], isPresent: (target: string) => boolean): FirstRunTourStep[] {
  const out: FirstRunTourStep[] = [];
  for (const s of steps) {
    if (isPresent(s.target)) out.push(s);
    else if (s.alt && isPresent(s.alt.target)) {
      const { alt, ...rest } = s;
      out.push({ ...rest, target: alt.target, title: alt.title ?? rest.title, text: alt.text });
    } else if (s.allowCentered) out.push(s);
  }
  return out;
}

export function firstRunTourSteps(tour: FirstRunTourId, gender: AppGender | null | undefined): FirstRunTourStep[] {
  switch (tour) {
    case 'home':
      return [
        { target: FIRST_RUN_COACH.homeWorkout, title: 'האימון של היום', text: 'כאן האימון של היום — לחיצה ומתחילים', finger: true },
        { target: FIRST_RUN_COACH.homePlus, title: 'הכפתור +', text: 'ה־+ מוסיף אימון, יציאה לאימון או הזמנת חבר' },
        // No week strip yet (no program — most new users): point at the map instead of dropping.
        {
          target: FIRST_RUN_COACH.homeWeek,
          title: 'השבוע שלך',
          text: 'כאן הלו״ז השבועי שלך',
          alt: { target: FIRST_RUN_COACH.homeNavMap, title: 'המפה', text: 'כאן מוצאים גינות כושר ומסלולים קרובים' },
        },
      ];
    case 'map':
      return [
        { target: FIRST_RUN_COACH.mapSearch, title: 'חיפוש', text: 'חיפוש פארק או כתובת' },
        {
          target: FIRST_RUN_COACH.mapLayers,
          title: 'מה רואים במפה',
          text: g(
            gender,
            'כאן אתה בוחר מה רואים במפה: מתקני כושר, ברזיות ושירותים',
            'כאן את בוחרת מה רואים במפה: מתקני כושר, ברזיות ושירותים',
            'כאן בוחרים מה רואים במפה: מתקני כושר, ברזיות ושירותים',
          ),
        },
        // Anchored to the nearest park pin (ParkCoachAnchor); no pin in view → the step drops.
        { target: FIRST_RUN_COACH.mapPark, title: 'פארקים', text: 'לחיצה על פארק מראה מתקנים ומי מתאמן שם' },
      ];
    case 'community':
      return [
        { target: FIRST_RUN_COACH.communityLeague, title: 'הליגה של השכונה', text: 'כאן הליגה של השכונה והעיר שלך' },
        // The leagues open on "אישי"; the invite card exists only under "שכונות" (city scope).
        // Invite card on screen → point at it; otherwise the "שכונות" tab (always there).
        {
          target: FIRST_RUN_COACH.communityInvite,
          title: 'הזמנת חבר',
          text: 'הזמנת חבר מוסיפה +50 לשכונה',
          alt: { target: FIRST_RUN_COACH.communityHoodsTab, title: 'ליגת השכונות', text: 'כאן השכונה שלך מול השכונות בעיר. הזמנת חבר מוסיפה לה +50' },
        },
      ];
    case 'player':
      return [
        {
          target: FIRST_RUN_COACH.playerProgress,
          title: 'הפסים למעלה',
          text: g(
            gender,
            'הפסים למעלה מראים איפה אתה באימון ומה עוד נשאר',
            'הפסים למעלה מראים איפה את באימון ומה עוד נשאר',
            'הפסים למעלה מראים איפה עומדים באימון ומה עוד נשאר',
          ),
        },
        // how-to before done: the instructions sit below the fold of the reps card, so the
        // last step scrolls the "סיימתי" button back into view.
        { target: FIRST_RUN_COACH.playerHowTo, title: 'איך מבצעים', text: 'כאן ההסבר איך מבצעים את התרגיל' },
        { target: FIRST_RUN_COACH.playerDone, title: 'סיימתי', text: 'סיימת סט? לחיצה על "סיימתי" ועוברים לתרגיל הבא', finger: true },
      ];
    // enable_entry_whatnow_v1 (entry flow v2, designs R1–R3): the first floating route card.
    // Owner note 21.10 #6: one idea per step (title + one line), every step anchored to the
    // real element — the strength-stop step is dropped when no stop marker is on the map
    // instead of floating a centred bubble over a dimmed map.
    case 'route':
      return [
        { target: FIRST_RUN_COACH.routeCard, title: 'המסלול שלך', text: 'מחליקים הצידה כדי לראות עוד מסלולים באזור.', finger: 'swipe' },
        {
          target: FIRST_RUN_COACH.routeStop,
          title: 'עצירות כוח',
          text: 'בכל עצירה כמה דקות כוח על המתקנים. הנגן יגיד לך מתי.',
          finger: true,
        },
        {
          target: FIRST_RUN_COACH.routeStart,
          title: 'יוצאים לדרך',
          text: 'לחיצה כאן מתחילה. בפעם הראשונה נבקש 3 פרטים והצהרת בריאות קצרה.',
          ring: true,
        },
      ];
    // enable_entry_whatnow_v1 (design R6): one tip the first time the route player runs.
    case 'route-player':
      return [
        {
          target: FIRST_RUN_COACH.routePlayerControls,
          title: 'סיום האימון',
          text: 'לחיצה ארוכה מסיימת, כדי שלא ייגמר בטעות בכיס.',
        },
      ];
    // enable_entry_whatnow_v1: "תוכנית" in "מה בא לך עכשיו?" → home, pointing at the start cards
    // (instead of a second "what first?" drawer).
    case 'plan':
      return [
        {
          target: FIRST_RUN_COACH.homeWorkout,
          title: 'בוחרים תוכנית',
          text: g(
            gender,
            'כוח או ריצה: לוחץ על כרטיס, עונה על כמה שאלות קצרות, והתוכנית מוכנה.',
            'כוח או ריצה: לוחצת על כרטיס, עונה על כמה שאלות קצרות, והתוכנית מוכנה.',
            'כוח או ריצה: לוחצים על כרטיס, עונים על כמה שאלות קצרות, והתוכנית מוכנה.',
          ),
          finger: true,
        },
      ];
    default:
      return [];
  }
}

/** Bubble chrome: ONE style for every tour (owner 21.10) — the v2 'entry' bubble (title + one
 *  line, progress dots, caret, דלג, read-first dwell). The first-run tours only run under
 *  enable_onboarding_tutorial_v1 + enable_home_v2, replays only under ai_coach_round4. */
export interface FirstRunTourChrome {
  variant: 'entry';
}

export function firstRunTourChrome(_tour?: string): FirstRunTourChrome {
  return { variant: 'entry' };
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
