/**
 * scenario-sweep.ts — Notification/Content Coherence Sweep.
 *
 * The notification/content analog of the Workout Invariants Gate
 * (tests/invariants/runner.ts) — same structure (deterministic seed, a
 * matrix of cells, run-the-real-engine, structured findings report), but
 * auditing COHERENCE of resolved copy across a grid instead of asserting
 * structural workout invariants.
 *
 * Calls the REAL production resolvers directly, headless — no deploy, no
 * App Check, no Firestore writes, no FCM sends:
 *   - Home content: generateHomeWorkoutTrio (src/features/workout-engine),
 *     which internally calls resolveWorkoutMetadata (real scoreContentRow
 *     scoring against live workoutMetadata/{workoutTitles,smartDescriptions}).
 *   - Push content: selectNotificationContent + personaliseNotificationText,
 *     imported DIRECTLY from functions/src/services/notification-content.
 *     service.ts (the exact file stepGoalNudgeScheduler.ts and
 *     onPlannedActivityCreated.ts call in production) — not a port, not a
 *     re-implementation. Reads live workoutMetadata/notifications/
 *     notifications via the Admin SDK (same credential path as
 *     scripts/snapshot-workout-corpus.ts).
 *
 * Exercises/programs/gym-equipment are FROZEN (via tests/invariants/
 * tsconfig.json's path redirect to its mocks/, run with this SAME tsconfig)
 * — that layer isn't what's under audit here and re-fetching it live 560×
 * would be slow and wasteful. workoutMetadata and the notification library
 * are read LIVE and UNMOCKED, on purpose — freshness there is the entire
 * point of this sweep.
 *
 * IMPORTANT: `functions/node_modules` must NOT exist as a symlink/directory
 * when running this — Node would then resolve `firebase-admin` for
 * notification-content.service.ts from a SEPARATE package instance than
 * this script's own `admin.initializeApp()` call, and `admin.firestore()`
 * inside it throws "the default Firebase app does not exist" (confirmed by
 * hitting this directly while building the harness). Both must resolve to
 * the SAME `firebase-admin` singleton — i.e. functions/src's Admin SDK
 * import must fall through to the root node_modules.
 *
 * Run:
 *   node --env-file=.env.local ./node_modules/.bin/tsx \
 *     --tsconfig tests/invariants/tsconfig.json scripts/scenario-sweep.ts
 *
 * Output: docs/research/notification-content-scenario-sweep.md
 *   (single file — methodology, gap summary, then the full per-persona grid)
 */

// ── Seed Math.random BEFORE importing the engine graph (same convention as
// tests/invariants/runner.ts — deterministic protocol/tie-break rolls) ──────
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
Math.random = mulberry32(0xc0ffee);

import { writeFileSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { initializeApp, cert, getApps } from 'firebase-admin/app';

import { generateHomeWorkoutTrio } from '@/features/workout-engine/services/home-workout.service';
import type { HomeWorkoutOptions } from '@/features/workout-engine/services/home-workout.types';
import type { ExecutionLocation } from '@/features/content/exercises/core/exercise.types';
import { setLocalContentOverlay, type TimeOfDay } from '@/features/workout-engine/services/workout-metadata.service';
import type { LifestylePersona } from '@/features/workout-engine/logic/ContextualEngine';
import { buildMockProfile } from '@/features/workout-engine/shared/utils/mock-profile.utils';
import type { PersonaId } from '@/types/persona.types';

/**
 * Load a draft content batch (David's authoring-reference JSON shape — see
 * scripts/fixtures/batch1-persona-content.json) and inject it into
 * workout-metadata.service.ts's in-memory local overlay (setLocalContentOverlay),
 * so it scores alongside the REAL live workoutTitles/smartDescriptions/logicCues
 * data for every subsequent resolveWorkoutMetadata call in this process.
 * Maps each bundle's authoring field names (title/description/logicCue) to
 * the real Firestore row shape each collection actually uses (text/description/
 * text respectively) — pure in-memory, zero Firestore writes, zero effect on
 * any other process. Exported so other scripts (e.g. parent-bleed-audit.ts)
 * can apply the same overlay before reusing this file's runHomeCell.
 */
export function loadAndApplyContentOverlay(filePathOrPaths: string | string[]): void {
  const filePaths = Array.isArray(filePathOrPaths) ? filePathOrPaths : [filePathOrPaths];

  const workoutTitles: any[] = [];
  const smartDescriptions: any[] = [];
  const logicCues: any[] = [];
  let bundleCount = 0;

  for (const filePath of filePaths) {
    const parsed = JSON.parse(readFileSync(filePath, 'utf-8')) as {
      bundles: Array<{
        bundleId: string; persona: string; gender?: string; timeOfDay?: string;
        location?: string; variant?: string; title: string; description: string; logicCue?: string;
      }>;
    };
    bundleCount += parsed.bundles.length;
    for (const b of parsed.bundles) {
      workoutTitles.push({ text: b.title, persona: b.persona, gender: b.gender, timeOfDay: b.timeOfDay, location: b.location, bundleId: b.bundleId });
      smartDescriptions.push({ description: b.description, persona: b.persona, gender: b.gender, timeOfDay: b.timeOfDay, location: b.location, bundleId: b.bundleId });
      // logicCue is OPTIONAL per bundle (e.g. Batch 2 — "rides the dynamic
      // level-aware fallback"). Do NOT push a row with an empty/undefined
      // text for these — an empty-but-high-scoring row could still WIN the
      // bestRows tie-break and make fetchLogicCue return null in place of a
      // real, lower-scoring Firestore logicCue that would otherwise have
      // been picked, which is a different (wrong) outcome than "no override,
      // fall through to whatever already exists."
      if (b.logicCue) {
        logicCues.push({ text: b.logicCue, persona: b.persona, gender: b.gender, timeOfDay: b.timeOfDay, location: b.location, variant: b.variant, bundleId: b.bundleId });
      }
    }
  }

  setLocalContentOverlay({ workoutTitles, smartDescriptions, logicCues });
  console.log(`[overlay] loaded ${bundleCount} bundles from ${filePaths.length} file(s) [${filePaths.join(', ')}] (${workoutTitles.length} titles, ${smartDescriptions.length} descriptions, ${logicCues.length} logicCues) — in-memory only, no Firestore write`);
}

// ── Admin SDK init (before importing functions/src — see file header) ──────
function initAdmin() {
  if (getApps().length) return;
  const parsed = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY!);
  initializeApp({
    credential: cert({
      projectId: parsed.project_id,
      clientEmail: parsed.client_email,
      privateKey: String(parsed.private_key).replace(/\\n/g, '\n'),
    }),
    projectId: parsed.project_id,
  });
}
initAdmin();

// ── Grid axes ────────────────────────────────────────────────────────────────
// Every real PersonaId (src/types/persona.types.ts) — the canonical model.
const PERSONAS: PersonaId[] = ['parent', 'student', 'pupil', 'office_worker', 'military', 'vatikim', 'pro_athlete'];

// Representative hour per named bucket, chosen to land inside real time-gated
// bonus windows where one exists (documented per-row, not exhaustive — see
// methodology in the report header):
//   morning (08:30) → within Parent Time-Window Boost's post-dropoff window (08:00-09:00)
//   lunch   (13:00) → within Desk Reset Boost's window (12:00-14:00)
//   evening (19:00) → TimeOfDay='evening' (Evening/Night short-workout bonus)
//   night   (22:00) → TimeOfDay='night'
// Parent Time-Window Boost's OTHER window (16:00-17:30, park/pickup) is not
// separately covered — the user asked for exactly 4 buckets, and 13:00
// already exercises the "time-gated bonus" mechanism once; a 5th bucket
// would double the grid for marginal additional signal.
export const TIME_PRESETS: { key: string; hour: number; timeOfDay: TimeOfDay }[] = [
  { key: 'morning', hour: 8, timeOfDay: 'morning' },
  { key: 'lunch', hour: 13, timeOfDay: 'afternoon' },
  { key: 'evening', hour: 19, timeOfDay: 'evening' },
  { key: 'night', hour: 22, timeOfDay: 'night' },
];

const LOCATIONS: ExecutionLocation[] = ['park', 'home', 'street', 'gym', 'office'];

// The 4 generic trigger buckets already exposed in the admin simulator's
// push panel (src/app/admin/workout-simulator/page.tsx PUSH_TRIGGER_OPTIONS)
// — the ones with real content in workoutMetadata/notifications/notifications
// as of this sweep. League_Overtake/Community_Group_New/Social_Matchmaking
// exist as trigger-type strings in the resolver's vocabulary but (per the
// 06.09.2026 push audit) have zero live senders — included would only ever
// show "0 candidates," not a coherence signal, so left out.
const TRIGGER_TYPES = ['Daily_Goal', 'Inactivity', 'Location_Based', 'Habit_Maintenance'] as const;

// Representative interpolation vars — rich on purpose, so a template tag
// with NO corresponding var (the exact class of gap that produced the real
// @זמן_אימון bug found in the 06.09.2026 push audit) shows up as a literal
// unresolved token in the output instead of being accidentally masked by an
// empty-vars object.
const PUSH_VARS = { name: 'משתמש', streakDays: 5, stepsLeft: 1500, distanceMeters: 800, walkMinutes: 10 };

// ── Coherence-check keyword maps — lifted VERBATIM from the real production
// guards they check against (workout-metadata.service.ts's scoreContentRow),
// not re-derived — so a flag here means "the real engine's own location/
// theme vocabulary appeared somewhere it self-evidently shouldn't," not a
// second opinion from different rules. ──────────────────────────────────────
const AIRPORT_KEYWORDS = ['טיסה', 'טרמינל', 'שדה תעופה', 'נחיתה', 'מטוס'];
const DESK_KEYWORDS = ['כיסא', 'שולחן', 'ספרייה', 'מתיחות', 'עיניים']; // 'משרד' excluded — legitimately appears in "office" context copy
const HOME_ONLY_KEYWORDS = ['living room', 'bedroom', 'ביתי', 'בבית', 'סלון', 'חדר שינה'];
const PARK_ONLY_KEYWORDS = ['בפארק', 'מגרש'];
const UNRESOLVED_TOKEN_RE = /@[֐-׿_A-Za-z]+/;

export interface Row {
  personaId: PersonaId;
  timeKey: string;
  location: ExecutionLocation;
  triggerType: string;
  homeTitle: string;
  homeDescription: string;
  category: string;
  pushText: string;
  pushCandidateCount: number;
  pushMatched: boolean;
  flags: string[];
}

export function checkCoherence(row: Omit<Row, 'flags'>): string[] {
  const flags: string[] = [];
  const homeText = `${row.homeTitle} ${row.homeDescription}`;
  const allText = `${homeText} ${row.pushText}`;

  if (!row.homeTitle) flags.push('empty home title');
  if (!row.homeDescription) flags.push('empty home description');
  if (!row.pushMatched) flags.push('0 push candidates matched');

  if (UNRESOLVED_TOKEN_RE.test(allText)) {
    const m = allText.match(UNRESOLVED_TOKEN_RE);
    flags.push(`unresolved token literal: "${m?.[0]}"`);
  }

  if (row.location !== 'airport' && AIRPORT_KEYWORDS.some(kw => homeText.includes(kw))) {
    flags.push('airport-theme content at a non-airport location');
  }
  if (row.location !== 'office' && row.location !== 'home' && DESK_KEYWORDS.some(kw => homeText.includes(kw))) {
    flags.push('desk-theme content at a non-desk location');
  }
  if (row.location !== 'home' && HOME_ONLY_KEYWORDS.some(kw => homeText.toLowerCase().includes(kw))) {
    flags.push('home-only content at a non-home location');
  }
  if (row.location !== 'park' && PARK_ONLY_KEYWORDS.some(kw => homeText.toLowerCase().includes(kw))) {
    flags.push('park-only content at a non-park location');
  }

  if (row.timeKey !== 'morning' && homeText.includes('בוקר')) flags.push('"morning" wording outside the morning slot');
  if (row.timeKey !== 'evening' && homeText.includes('ערב') && !homeText.includes('ערבים')) flags.push('"evening" wording outside the evening slot');
  if (row.timeKey !== 'night' && homeText.includes('לילה')) flags.push('"night" wording outside the night slot');

  return flags;
}

// ── One representative profile shape, held constant — only persona/location/
// time vary across the grid, so those are the isolated variables under test,
// not conflated with exercise-selection edge cases (which is what tests/
// invariants/runner.ts's OWN, separate matrix already covers). ─────────────
function buildProfile() {
  return buildMockProfile({
    level: 12,
    persona: '',
    injuries: [],
    domainLevels: { pull: 15, push: 12, legs: 10, core: 8 },
    coldStart: false,
    gear: ['pullup_bar', 'dip_bar'],
    activePrograms: [],
  });
}

export async function runHomeCell(personaId: PersonaId, time: typeof TIME_PRESETS[number], location: ExecutionLocation) {
  const previewNow = new Date();
  previewNow.setHours(time.hour, 0, 0, 0);

  const options: HomeWorkoutOptions = {
    userProfile: buildProfile(),
    location,
    testLocation: location,
    availableTime: 30,
    difficulty: 2,
    personaOverride: personaId as unknown as LifestylePersona,
    timeOfDay: time.timeOfDay,
    previewNow,
    generateSingleOption: true,
    targetOptionIndex: 1,
  };

  const result = await generateHomeWorkoutTrio(options);
  const workout = result.options[1]?.result?.workout ?? result.options.find(o => o?.result?.workout)?.result.workout;
  const mainExercises = (workout?.exercises ?? []).filter(e => e.exerciseRole !== 'warmup' && e.exerciseRole !== 'cooldown');
  return {
    homeTitle: workout?.title ?? '',
    homeDescription: workout?.description ?? '',
    category: workout?.metadataCtx?.categoryLabel || workout?.structure || '(unknown)',
    // Additive — only consumed by scenario-sweep-sample.ts's curated pull;
    // the main sweep's Row/report shape ignores it (unused, harmless).
    exerciseNames: mainExercises.map(e => (e.exercise?.name as any)?.he || (e.exercise?.name as any) || '?'),
    // Additive — the REAL context this exact resolve used (persona/gender/
    // category/etc, stamped by generateHomeWorkoutTrio itself), for
    // scripts/parent-bleed-audit.ts's post-hoc candidate-transparency
    // re-query. Not consumed by the main sweep's Row/report.
    metadataCtx: workout?.metadataCtx,
    // Additive — for scripts/parent-bleed-audit.ts's overlay-verification
    // report (shows the full winning bundle, not just the title).
    logicCue: workout?.logicCue ?? '',
  };
}

// Imported ONCE (below, in main(), after initAdmin()) — dynamic import() is
// itself a singleton regardless of call count, so this alone doesn't change
// caching behavior. The module's own in-process 10-min cache (getAllNotifications)
// still refreshes once per concurrent BATCH (runBatched below) rather than
// once total: the first wave of ~20 parallel calls all check the cache
// before any of them has populated it (a lazy-cache race, not something
// this script should paper over — it's the real module's real behavior).
// Confirmed empirically: exactly 20 "cache refreshed" logs on a 32-cell/
// 2-batch run, all from batch 1; batch 2 read the warm cache with zero
// additional fetches. Bounded, cheap, and left as-is rather than "fixed" —
// this file audits the real production module, it doesn't patch it.
let notificationContentApi: typeof import('../functions/src/services/notification-content.service');

/** Call once before runPushCell — importers (e.g. scenario-sweep-sample.ts) must call this themselves too. */
export async function initNotificationApi() {
  notificationContentApi = await import('../functions/src/services/notification-content.service');
}

export async function runPushCell(personaId: PersonaId, timeKey: string, location: ExecutionLocation, triggerType: string) {
  const { selectNotificationContent, personaliseNotificationText, resolveCanonicalPersona } = notificationContentApi;

  const resolvedPersona = resolveCanonicalPersona(null, personaId);
  const uid = `sweep-${personaId}-${timeKey}-${location}-${triggerType}`;

  const selected = await selectNotificationContent({
    triggerType,
    persona: resolvedPersona,
    dailyGoalBucket: triggerType === 'Daily_Goal' ? 'mid' : undefined,
    uid,
  });

  if (!selected) {
    return { pushText: '', pushCandidateCount: 0, pushMatched: false };
  }
  return {
    pushText: personaliseNotificationText(selected.text, PUSH_VARS),
    pushCandidateCount: selected.candidates.length,
    pushMatched: true,
  };
}

async function runCell(personaId: PersonaId, time: typeof TIME_PRESETS[number], location: ExecutionLocation, triggerType: string): Promise<Row> {
  const [home, push] = await Promise.all([
    runHomeCell(personaId, time, location).catch(e => ({
      homeTitle: '', homeDescription: '', category: `(generation error: ${(e as Error).message})`,
    })),
    runPushCell(personaId, time.key, location, triggerType).catch(e => ({
      pushText: `(push error: ${(e as Error).message})`, pushCandidateCount: 0, pushMatched: false,
    })),
  ]);

  const base = { personaId, timeKey: time.key, location, triggerType, ...home, ...push };
  return { ...base, flags: checkCoherence(base) };
}

// ── Run (batched — metadata reads are live/uncached, unlike the push
// library's 10min in-process cache, so don't fire all 560 at once) ─────────
async function runBatched<T>(items: T[], size: number, fn: (item: T, i: number) => Promise<Row>): Promise<Row[]> {
  const out: Row[] = [];
  for (let i = 0; i < items.length; i += size) {
    const batch = items.slice(i, i + size);
    const results = await Promise.all(batch.map((item, j) => fn(item, i + j)));
    out.push(...results);
    console.log(`  ... ${Math.min(i + size, items.length)}/${items.length} cells done`);
  }
  return out;
}

function mdEscape(s: string): string {
  return (s || '').replace(/\|/g, '\\|').replace(/\n/g, ' ');
}
function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, n) + '…' : s;
}

export async function main(outFileName = 'notification-content-scenario-sweep.md') {
  const t0 = Date.now();
  await initNotificationApi();
  interface CellSpec { personaId: PersonaId; time: typeof TIME_PRESETS[number]; location: ExecutionLocation; triggerType: string }
  const cells: CellSpec[] = [];
  for (const personaId of PERSONAS) {
    for (const time of TIME_PRESETS) {
      for (const location of LOCATIONS) {
        for (const triggerType of TRIGGER_TYPES) {
          cells.push({ personaId, time, location, triggerType });
        }
      }
    }
  }
  console.log(`[sweep] ${cells.length} cells (${PERSONAS.length} personas × ${TIME_PRESETS.length} times × ${LOCATIONS.length} locations × ${TRIGGER_TYPES.length} triggers)`);

  const rows = await runBatched(cells, 20, (c) => runCell(c.personaId, c.time, c.location, c.triggerType));
  console.log(`[sweep] done in ${Date.now() - t0}ms`);

  // ── Gap analysis ───────────────────────────────────────────────────────────
  const flagged = rows.filter(r => r.flags.length > 0);
  const flagCounts = new Map<string, number>();
  for (const r of rows) for (const f of r.flags) {
    // Bucket unresolved-token flags by the token itself, not the whole message.
    const key = f.startsWith('unresolved token literal') ? f : f;
    flagCounts.set(key, (flagCounts.get(key) ?? 0) + 1);
  }
  const topPatterns = Array.from(flagCounts.entries()).sort((a, b) => b[1] - a[1]);

  const byCluster = new Map<string, { total: number; flagged: number }>();
  for (const r of rows) {
    const key = `${r.personaId} × ${r.timeKey}`;
    const c = byCluster.get(key) ?? { total: 0, flagged: 0 };
    c.total++;
    if (r.flags.length > 0) c.flagged++;
    byCluster.set(key, c);
  }
  const worstClusters = Array.from(byCluster.entries())
    .map(([k, v]) => ({ key: k, ...v, rate: v.flagged / v.total }))
    .sort((a, b) => b.rate - a.rate || b.flagged - a.flagged)
    .slice(0, 15);

  const byLocation = new Map<string, { total: number; flagged: number }>();
  for (const r of rows) {
    const c = byLocation.get(r.location) ?? { total: 0, flagged: 0 };
    c.total++;
    if (r.flags.length > 0) c.flagged++;
    byLocation.set(r.location, c);
  }

  const byTrigger = new Map<string, { total: number; noMatch: number }>();
  for (const r of rows) {
    const c = byTrigger.get(r.triggerType) ?? { total: 0, noMatch: 0 };
    c.total++;
    if (!r.pushMatched) c.noMatch++;
    byTrigger.set(r.triggerType, c);
  }
  const zeroCoverageTriggers = Array.from(byTrigger.entries()).filter(([, c]) => c.noMatch === c.total);

  // ── Report ───────────────────────────────────────────────────────────────
  const lines: string[] = [];
  lines.push('# Notification/Content Coherence Sweep');
  lines.push('');
  lines.push(`Generated ${new Date().toISOString().slice(0, 10)} · ${rows.length} scenarios (${PERSONAS.length} personas × ${TIME_PRESETS.length} times × ${LOCATIONS.length} locations × ${TRIGGER_TYPES.length} push triggers) in ${Date.now() - t0}ms.`);
  lines.push('');
  lines.push('**Read-only. No Firestore writes, no FCM sends, no deploy.** Home content via the real `generateHomeWorkoutTrio` → `resolveWorkoutMetadata` (live `workoutMetadata/{workoutTitles,smartDescriptions}` reads). Push content via the real `selectNotificationContent`/`personaliseNotificationText`, imported directly from `functions/src/services/notification-content.service.ts` (live `workoutMetadata/notifications/notifications` reads via Admin SDK) — the exact functions `stepGoalNudgeScheduler.ts`/`onPlannedActivityCreated.ts` call in production, not a re-implementation.');
  lines.push('');
  lines.push('## Methodology & honest limitations');
  lines.push('');
  lines.push('- Exercises/programs/gym-equipment are read from the **frozen** invariants-gate fixture (`tests/invariants/fixtures/`), not live — that layer isn\'t under audit here and re-fetching it 560× would be slow. `workoutMetadata` and the notification library ARE live, on purpose.');
  lines.push('- One fixed representative user profile (level 12, balanced domain levels, home gear) — only persona/time/location/trigger vary, so those are the isolated variables. Exercise-selection correctness is the invariants gate\'s job, not this sweep\'s.');
  lines.push('- Time buckets map to representative hours: morning=08:30, lunch=13:00 (inside the real Desk Reset Boost window), evening=19:00, night=22:00. The Parent Time-Window Boost\'s second window (16:00-17:30, park/pickup) isn\'t separately covered — only 4 buckets were requested.');
  lines.push('- `Daily_Goal` push queries use `dailyGoalBucket: \'mid\'`; `activityType` is left unset. A different bucket choice would surface different candidates for that trigger.');
  lines.push('- **Coherence flags are mechanical keyword checks lifted directly from the real production guards** (workout-metadata.service.ts\'s own location/airport/desk keyword lists) — not semantic/NLP judgment. A flag means a real production keyword-vocabulary term showed up somewhere it self-evidently shouldn\'t (e.g. an airport word outside `location=airport`). Absence of a flag is NOT proof of coherence — it only means these specific mechanical checks found nothing.');
  lines.push('- **Push vs. home-title "match" is deliberately NOT auto-flagged.** Per the earlier push-infrastructure audit, push and home content are architecturally unrelated systems today (no live push reads the workout-generation pipeline) — so push and title routinely being about different things is the *expected*, structural state, not a per-row bug. Both are shown side by side in the table below for a human to judge case-by-case; treat the whole "push has nothing to do with the workout" finding as one systemic gap (already reported separately), not 560 individual ones.');
  lines.push('');

  lines.push('## Gap summary');
  lines.push('');
  lines.push(`**${flagged.length}/${rows.length} scenarios (${((flagged.length / rows.length) * 100).toFixed(0)}%) tripped at least one mechanical flag.**`);
  lines.push('');
  if (zeroCoverageTriggers.length > 0) {
    lines.push(
      `**Single biggest driver:** ${zeroCoverageTriggers.map(([t]) => `\`${t}\``).join(', ')} ` +
      `matched **0 candidates in every single scenario** (${zeroCoverageTriggers.reduce((s, [, c]) => s + c.total, 0)} rows) — ` +
      'this is a content-authoring gap (no rows in `workoutMetadata/notifications/notifications` for these trigger types, for any tested persona), ' +
      'not a per-scenario logic bug. It alone accounts for the majority of "0 push candidates matched" flags below.',
    );
    lines.push('');
  }
  lines.push('### By push trigger type (match rate)');
  lines.push('');
  lines.push('| Trigger | Matched / Total | Match rate |');
  lines.push('|---|---|---|');
  for (const [trigger, c] of Array.from(byTrigger.entries())) {
    lines.push(`| ${trigger} | ${c.total - c.noMatch}/${c.total} | ${(((c.total - c.noMatch) / c.total) * 100).toFixed(0)}% |`);
  }
  lines.push('');
  lines.push('### Top recurring gap patterns');
  lines.push('');
  lines.push('| Pattern | Count | Share |');
  lines.push('|---|---|---|');
  for (const [pattern, count] of topPatterns.slice(0, 20)) {
    lines.push(`| ${mdEscape(pattern)} | ${count} | ${((count / rows.length) * 100).toFixed(0)}% |`);
  }
  lines.push('');
  lines.push('### Worst persona × time clusters (highest flagged-row rate)');
  lines.push('');
  lines.push('| Persona × time | Flagged / Total | Rate |');
  lines.push('|---|---|---|');
  for (const c of worstClusters) {
    lines.push(`| ${c.key} | ${c.flagged}/${c.total} | ${(c.rate * 100).toFixed(0)}% |`);
  }
  lines.push('');
  lines.push('### By location');
  lines.push('');
  lines.push('| Location | Flagged / Total | Rate |');
  lines.push('|---|---|---|');
  for (const [loc, c] of Array.from(byLocation.entries())) {
    lines.push(`| ${loc} | ${c.flagged}/${c.total} | ${((c.flagged / c.total) * 100).toFixed(0)}% |`);
  }
  lines.push('');

  lines.push('## Full grid (grouped by persona)');
  lines.push('');
  for (const personaId of PERSONAS) {
    const personaRows = rows.filter(r => r.personaId === personaId);
    lines.push(`### ${personaId} (${personaRows.filter(r => r.flags.length > 0).length}/${personaRows.length} flagged)`);
    lines.push('');
    lines.push('| Time | Location | Trigger | Home Title | Home Desc | Category | Push Text | Push Cand. | Flags |');
    lines.push('|---|---|---|---|---|---|---|---|---|');
    for (const r of personaRows) {
      lines.push(
        `| ${r.timeKey} | ${r.location} | ${r.triggerType} | ${mdEscape(r.homeTitle) || '_(empty)_'} | ` +
        `${mdEscape(truncate(r.homeDescription, 50)) || '_(empty)_'} | ${mdEscape(r.category)} | ` +
        `${mdEscape(truncate(r.pushText, 60)) || '_(no match)_'} | ${r.pushCandidateCount} | ` +
        `${r.flags.length ? mdEscape(r.flags.join('; ')) : ''} |`,
      );
    }
    lines.push('');
  }

  const outPath = join(process.cwd(), 'docs/research', outFileName);
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, lines.join('\n'));
  console.log(`[sweep] report written → ${outPath}`);
  console.log(`[sweep] ${flagged.length}/${rows.length} scenarios flagged (${((flagged.length / rows.length) * 100).toFixed(0)}%)`);
  return { flagged: flagged.length, total: rows.length };
}

// Only auto-run the full 560-cell sweep when this file is executed directly
// (`tsx scripts/scenario-sweep.ts`) — NOT when imported as a module for its
// exported pieces (e.g. scripts/scenario-sweep-sample.ts reusing runHomeCell/
// runPushCell/checkCoherence for a smaller, curated pull).
//
// CONTENT_OVERLAY_FILE (optional env var): comma-separated path(s) to a
// draft-content JSON (scripts/fixtures/batch1-persona-content.json shape) to
// inject via loadAndApplyContentOverlay before running — e.g. to verify one
// or more unshipped batches together against real live data with zero
// Firestore writes. When set, the report is written to a `-content-overlay`
// suffixed file instead of the production path, so a verification run never
// overwrites the real report.
const isMain = process.argv[1] && import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  const overlayFile = process.env.CONTENT_OVERLAY_FILE;
  if (overlayFile) loadAndApplyContentOverlay(overlayFile.split(',').map(p => p.trim()));
  const outFileName = overlayFile
    ? 'notification-content-scenario-sweep-content-overlay.md'
    : 'notification-content-scenario-sweep.md';
  main(outFileName)
    .then(() => process.exit(0))
    .catch(e => { console.error('[sweep] CRASHED:', (e as Error)?.stack || e); process.exit(1); });
}
