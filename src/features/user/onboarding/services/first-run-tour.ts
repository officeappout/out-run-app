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
import type { AppGender } from '@/lib/utils/gendered-text';
import { makeLiveT } from '@/lib/i18n/live-t';
import { onboarding } from '@/messages/ns/onboarding';
import { weekdayLabel } from '@/lib/i18n/units';
import { isMapTutorialTour, mapTutorialSteps } from './map-tutorial-tour';

const t = makeLiveT(onboarding);

export type FirstRunTourId = 'home' | 'map' | 'community' | 'player' | 'route' | 'route-player' | 'plan';

/** Every tour FirstRunTour can run: + enable_map_tutorial_v1's workout-drawer tour (not replayable until it graduates). */
export type AnyFirstRunTourId = FirstRunTourId | 'route-drawer';

/** The WelcomeDrawer's choices (v2 adds the quiet "סתם בא לי להסתכל באפליקציה" link). */
export type WelcomeChoice = 'strength' | 'nearby' | 'browse' | 'skip-to-map';

/** Coach-mark target ids (`data-coach="…"` — inert attributes on the real elements). */
export const FIRST_RUN_COACH = {
  homeWorkout: 'home-today-workout',
  homePlus: 'home-plus',
  homeWeek: 'home-week',
  /** enable_schedule_tutorial_v1: the home "היום שלך" cards section (board HomeToday). */
  homeToday: 'home-today-cards',
  /** Its steps card (the rest-day step's bubble). */
  homeTodaySteps: 'home-today-steps',
  /** Its "להתאמן עכשיו" (a strength day not done yet). */
  homeTodayTrain: 'home-today-train',
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
  /** The corner "הסבר" chip over the video — the how-to step's fallback while the drawer is collapsed
   *  (the how-to block below the card is only rendered when the drawer is expanded). */
  playerExplain: 'player-explain',
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
export function firstRunTourSeenKey(tour: AnyFirstRunTourId, uid: string | null | undefined): string {
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

/**
 * enable_schedule_tutorial_v1: what today holds, so the home tour starts from today's cards
 * (decisions/schedule-tutorial.md, 27.10). Absent = the tour as before.
 */
export interface HomeTourToday {
  strengthToday: boolean;
  /** Minutes of the rest day's short session ("8 דק׳ בטן"). */
  optionalMinutes: number;
  /** The next strength day: 0 = Sunday; time "HH:MM" or null. */
  next: { dow: number; time: string | null } | null;
}

/** The home tour from today's cards; then "+" and the map, as before. */
export function homeTourFromTodaySteps(today: HomeTourToday): FirstRunTourStep[] {
  const plus: FirstRunTourStep = { target: FIRST_RUN_COACH.homePlus, title: t('tour.home.plus.title'), text: t('tour.home.plus.text') };
  const map: FirstRunTourStep = { target: FIRST_RUN_COACH.homeNavMap, title: t('tour.home.weekAlt.title'), text: t('tour.home.weekAlt.text') };
  const rest: FirstRunTourStep = {
    target: FIRST_RUN_COACH.homeTodaySteps,
    title: t('tour.home.rest.title'),
    text: t('tour.home.rest.text', { n: today.optionalMinutes }),
    alt: { target: FIRST_RUN_COACH.homeToday, title: t('tour.home.rest.title'), text: t('tour.home.rest.text', { n: today.optionalMinutes }) },
  };
  if (today.strengthToday) {
    return [
      // The workout is already done (no "להתאמן עכשיו"): the bubble sits on the cards instead.
      {
        target: FIRST_RUN_COACH.homeTodayTrain,
        title: t('tour.home.today.title'),
        text: t('tour.home.today.text'),
        finger: true,
        alt: { target: FIRST_RUN_COACH.homeToday, title: t('tour.home.today.title'), text: t('tour.home.today.text') },
      },
      plus,
      map,
    ];
  }
  const steps: FirstRunTourStep[] = [rest];
  if (today.next) {
    steps.push({
      target: FIRST_RUN_COACH.homeWeek,
      title: t('tour.home.next.title'),
      text: t('tour.home.next.text', { day: weekdayLabel(today.next.dow, 'long'), time: today.next.time ?? 'none' }),
    });
  }
  return [...steps, plus, map];
}

export function firstRunTourSteps(
  tour: AnyFirstRunTourId,
  gender: AppGender | null | undefined,
  opts?: { homeToday?: HomeTourToday | null; mapTutorialV1?: boolean; parkLiveV2?: boolean; unifiedPlayerV1?: boolean; afterWorkout?: boolean },
): FirstRunTourStep[] {
  // g(): null / undefined gender -> the male form (the old convention); 'other' -> the neutral branch.
  const gd = { gender: gender ?? 'male' };
  // enable_map_tutorial_v1 (boards M3/M6/M7): the map tutorial's own steps. 'route-drawer' exists only there.
  if (opts?.mapTutorialV1 && isMapTutorialTour(tour)) {
    return mapTutorialSteps(tour, { title: t('tour.map.layers.title'), text: t('tour.map.layers.text', gd) });
  }
  switch (tour) {
    case 'home':
      if (opts?.homeToday) return homeTourFromTodaySteps(opts.homeToday);
      return [
        // enable_home_after_v1: today's workout is done, so the first step points at the after-workout carousel
        // (what is left today, swipe) instead of "tap to start".
        opts?.afterWorkout
          ? { target: FIRST_RUN_COACH.homeWorkout, title: t('tour.home.after.title'), text: t('tour.home.after.text') }
          : { target: FIRST_RUN_COACH.homeWorkout, title: t('tour.home.workout.title'), text: t('tour.home.workout.text'), finger: true },
        { target: FIRST_RUN_COACH.homePlus, title: t('tour.home.plus.title'), text: t('tour.home.plus.text') },
        // No week strip yet (no program — most new users): point at the map instead of dropping.
        {
          target: FIRST_RUN_COACH.homeWeek,
          title: t('tour.home.week.title'),
          text: t('tour.home.week.text'),
          alt: { target: FIRST_RUN_COACH.homeNavMap, title: t('tour.home.weekAlt.title'), text: t('tour.home.weekAlt.text') },
        },
      ];
    case 'map':
      return [
        { target: FIRST_RUN_COACH.mapSearch, title: t('tour.map.search.title'), text: t('tour.map.search.text') },
        {
          target: FIRST_RUN_COACH.mapLayers,
          title: t('tour.map.layers.title'),
          text: t('tour.map.layers.text', gd),
        },
        // Anchored to the nearest park pin (ParkCoachAnchor); no pin in view → the step drops.
        { target: FIRST_RUN_COACH.mapPark, title: t('tour.map.park.title'), text: t('tour.map.park.text') },
      ];
    case 'community':
      return [
        { target: FIRST_RUN_COACH.communityLeague, title: t('tour.community.league.title'), text: t('tour.community.league.text') },
        // The leagues open on the personal tab; the invite card exists only under the neighborhoods tab (city scope).
        // Invite card on screen → point at it; otherwise the neighborhoods tab (always there).
        {
          target: FIRST_RUN_COACH.communityInvite,
          title: t('tour.community.invite.title'),
          text: t('tour.community.invite.text'),
          alt: { target: FIRST_RUN_COACH.communityHoodsTab, title: t('tour.community.hoodsTab.title'), text: t('tour.community.hoodsTab.text') },
        },
      ];
    case 'player':
      return [
        {
          target: FIRST_RUN_COACH.playerProgress,
          title: t('tour.player.progress.title'),
          text: t('tour.player.progress.text', gd),
        },
        // how-to before done: the instructions sit below the fold of the reps card, so the
        // last step scrolls the done button back into view.
        // Drawer collapsed -> the how-to block is not rendered; point at the video's explain chip instead.
        {
          target: FIRST_RUN_COACH.playerHowTo,
          title: t('tour.player.howTo.title'),
          text: t('tour.player.howTo.text'),
          alt: { target: FIRST_RUN_COACH.playerExplain, title: t('tour.player.explain.title'), text: t('tour.player.explain.text') },
        },
        { target: FIRST_RUN_COACH.playerDone, title: t('tour.player.done.title'), text: t('tour.player.done.text'), finger: true },
      ];
    // enable_entry_whatnow_v1 (entry flow v2, designs R1–R3): the first floating route card.
    // Owner note 21.10 #6: one idea per step (title + one line), every step anchored to the
    // real element — the strength-stop step is dropped when no stop marker is on the map
    // instead of floating a centred bubble over a dimmed map.
    case 'route':
      return [
        { target: FIRST_RUN_COACH.routeCard, title: t('tour.route.card.title'), text: t('tour.route.card.text'), finger: 'swipe' },
        {
          target: FIRST_RUN_COACH.routeStop,
          title: t('tour.route.stop.title'),
          text: t('tour.route.stop.text'),
          finger: true,
        },
        {
          target: FIRST_RUN_COACH.routeStart,
          title: t('tour.route.start.title'),
          text: t('tour.route.start.text'),
          ring: true,
        },
      ];
    // enable_entry_whatnow_v1 (design R6): one tip the first time the route player runs.
    case 'route-player':
      // enable_park_live_v2 (board Park 4, pilot M4): the live park workout opens on the data, the story
      // bars and the list, and ends on "follow the route" (never on the finish button first). A missing
      // target drops its step, so a run without the park player still gets the one controls tip.
      if (opts?.parkLiveV2) return parkLiveTourSteps({ unifiedPlayerV1: opts.unifiedPlayerV1 });
      return [
        {
          target: FIRST_RUN_COACH.routePlayerControls,
          title: t('tour.routePlayer.controls.title'),
          text: t('tour.routePlayer.controls.text'),
        },
      ];
    // enable_entry_whatnow_v1: the plan card in the what-now drawer → home, pointing at the start cards
    // (instead of a second "what first?" drawer).
    case 'plan':
      return [
        {
          target: FIRST_RUN_COACH.homeWorkout,
          title: t('tour.plan.pick.title'),
          text: t('tour.plan.pick.text', gd),
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

/**
 * enable_park_live_v2 (board Park 4, pilot M4): the live park workout tour, in the approved order.
 * enable_unified_player_v1: no cart icon; the list step points at the header, which pulls down
 * for the workout timeline.
 */
export function parkLiveTourSteps(opts?: { unifiedPlayerV1?: boolean }): FirstRunTourStep[] {
  const list: FirstRunTourStep = opts?.unifiedPlayerV1
    ? { target: 'park-live-header', title: t('tour.parkLive.pull.title'), text: t('tour.parkLive.pull.text') }
    : { target: 'park-live-list', title: t('tour.parkLive.list.title'), text: t('tour.parkLive.list.text') };
  return [
    { target: 'park-live-data', title: t('tour.parkLive.data.title'), text: t('tour.parkLive.data.text') },
    { target: 'park-live-bars', title: t('tour.parkLive.bars.title'), text: t('tour.parkLive.bars.text') },
    list,
    { target: FIRST_RUN_COACH.routePlayerControls, title: t('tour.parkLive.follow.title'), text: t('tour.parkLive.follow.text') },
  ];
}
