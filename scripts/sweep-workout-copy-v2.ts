/**
 * sweep-workout-copy-v2.ts — preview which title/description wins in key
 * "moments" once the titles-v2 import is applied, WITHOUT writing anything.
 *
 * How: the live workoutMetadata rows are read as usual (read-only), then
 * setLocalContentOverlay() (workout-metadata.service.ts, sweep-only) adds the
 * 205 + 272 v2 rows in memory and patches the live rows the import would touch
 * (293 archived → archived:true, 16 field fixes). Strength scenarios run the
 * real generateHomeWorkoutTrio via scenario-sweep.ts's runHomeCell (so the
 * session situation really comes from the periodization policy, the weather
 * from HomeWorkoutOptions.weather); the running scenario calls the shared
 * resolver with the running context the app builds.
 *
 * Writes: none to Firestore. generateHomeWorkoutTrio's only write path is the
 * 21+ day cycle restart (_persistCycleRestart) — every scenario passes
 * skipCycleRestart and none uses a 21+ day gap. Output is printed (markdown).
 *
 * Run:
 *   node --env-file=../appout-1/.env.local ./node_modules/.bin/tsx \
 *     --tsconfig tests/invariants/tsconfig.json scripts/sweep-workout-copy-v2.ts
 */
import { runHomeCell, TIME_PRESETS } from './scenario-sweep';
import {
  setLocalContentOverlay,
  resolveWorkoutMetadataWithCandidates,
  type WorkoutMetadataContext,
} from '@/features/workout-engine/services/workout-metadata.service';
import type { HomeWorkoutOptions } from '@/features/workout-engine/services/home-workout.types';
import type { ExecutionLocation } from '@/features/content/exercises/core/exercise.types';
import type { PersonaId } from '@/types/persona.types';
import { getFirestore } from 'firebase-admin/firestore';
import { loadV2Rows, loadV2DocPatches, DEFAULT_CONTENT_DIR } from './lib/workout-copy-v2';

const RUNS_PER_SCENARIO = 4;

const { titles, descriptions, problems } = loadV2Rows(DEFAULT_CONTENT_DIR);
if (problems.length) {
  console.error('content problems:', problems);
  process.exit(1);
}
setLocalContentOverlay(
  { workoutTitles: titles.map(t => t.data), smartDescriptions: descriptions.map(d => d.data) },
  loadV2DocPatches(DEFAULT_CONTENT_DIR),
);
const v2TitleByText = new Map(titles.map(t => [String(t.data.text), t.item]));
console.log(`[overlay] ${titles.length} v2 titles + ${descriptions.length} v2 descriptions, live rows patched per archive_list.csv — in memory only`);

const time = (key: string) => TIME_PRESETS.find(t => t.key === key)!;
const daysAgoIso = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString();

interface Scenario {
  name: string;
  persona: PersonaId | null;
  timeKey: string;
  hour?: number;
  location: ExecutionLocation;
  options?: Partial<HomeWorkoutOptions>;
  mutateProfile?: (p: any) => void;
  /** What the winning title row must look like to count as "right". */
  expect: { persona?: string; situation?: string; weather?: string; location?: string };
}

const SCENARIOS: Scenario[] = [
  { name: 'Home, evening, parent', persona: 'parent', timeKey: 'evening', location: 'home', expect: { persona: 'parent', location: 'home' } },
  { name: 'Park, morning, heat', persona: null, timeKey: 'morning', location: 'park', options: { weather: { flag: 'heat' } }, expect: { weather: 'heat', location: 'park' } },
  { name: 'Home, returning after 10 days', persona: null, timeKey: 'evening', location: 'home', options: { daysInactiveOverride: 10 }, expect: { situation: 'returning', location: 'home' } },
  {
    name: 'Home, deload week (cycle week 5)', persona: null, timeKey: 'evening', location: 'home',
    mutateProfile: (p) => {
      p.progression.activePrograms = [{
        id: 'full_body', templateId: 'full_body', name: 'Full Body',
        startDate: daysAgoIso(29), durationWeeks: 52, currentWeek: 5, focusDomains: [],
      }];
    },
    expect: { situation: 'deload', location: 'home' },
  },
  { name: 'Home, rain', persona: null, timeKey: 'evening', location: 'home', options: { weather: { flag: 'rain' } }, expect: { weather: 'rain', location: 'home' } },
];

// Live (kept) title rows by resolved-text prefix, to describe a winning live row.
// Read-only (Admin SDK, initialized by scenario-sweep.ts).
let liveTitles: Array<Record<string, any>> = [];
function findLive(text: string): Record<string, any> | undefined {
  // Tags (@זמן_אימון …) are resolved in the output, so compare on the static tail.
  return liveTitles.find(r => {
    const raw = String(r.text ?? '');
    const tail = raw.replace(/@[^\s]+/g, '').trim();
    return raw === text || (tail.length > 4 && text.includes(tail));
  });
}

function describeRow(text: string): string {
  const v2 = v2TitleByText.get(text);
  if (!v2) {
    const live = findLive(text);
    return live
      ? `live kept ${live.bundleId} (persona=${live.persona || '-'} loc=${live.location || '-'} time=${live.timeOfDay || '-'} gender=${live.gender || '-'})`
      : 'live (kept) row';
  }
  const tags = [
    `persona=${v2.persona}`, `loc=${v2.location}`, `time=${v2.timeOfDay}`,
    v2.situation && `situation=${v2.situation}`, v2.weather && `weather=${v2.weather}`,
  ].filter(Boolean).join(' ');
  return `v2 ${v2.bundleId} (${tags})`;
}

function matchesExpect(text: string, expect: Scenario['expect']): boolean {
  const v2 = v2TitleByText.get(text) ?? findLive(text);
  if (!v2) return false;
  if (v2.archived) return false;
  if (expect.persona && v2.persona !== expect.persona) return false;
  if (expect.situation && v2.situation !== expect.situation) return false;
  if (expect.weather && v2.weather !== expect.weather) return false;
  if (expect.location && v2.location && v2.location !== expect.location && v2.location !== 'any') return false;
  return true;
}

async function main() {
  const patches = loadV2DocPatches(DEFAULT_CONTENT_DIR).workoutTitles;
  const snap = await getFirestore().collection('workoutMetadata/workoutTitles/titles').get();
  liveTitles = snap.docs.map(d => ({ ...d.data(), ...(patches[d.id] ?? {}) })).filter(r => !r.archived);
  const out: string[] = [];
  out.push('| Scenario | Session | Winning title → description | Winning row | OK |');
  out.push('|---|---|---|---|---|');
  let ok = 0; let total = 0;

  for (const sc of SCENARIOS) {
    for (let i = 0; i < RUNS_PER_SCENARIO; i++) {
      const r = await runHomeCell(sc.persona, time(sc.timeKey), sc.location, {
        options: { skipCycleRestart: true, ...sc.options },
        mutateProfile: sc.mutateProfile,
      });
      const good = matchesExpect(r.homeTitle, sc.expect);
      total++; if (good) ok++;
      const session = `${r.metadataCtx?.persona ?? 'general'} · ${sc.location} · ${r.metadataCtx?.timeOfDay} · situation=${r.metadataCtx?.situation ?? '-'}${sc.options?.weather ? ` · weather=${sc.options.weather.flag}` : ''}`;
      out.push(`| ${i === 0 ? sc.name : ''} | ${session} | ${r.homeTitle} → ${r.homeDescription} | ${describeRow(r.homeTitle)} | ${good ? 'yes' : 'NO'} |`);
    }
  }

  // Running: easy run, evening, general user — the context NextRunWorkoutCard /
  // PlannedPreviewLayer build (location 'park', sportType 'running').
  const evening = new Date(); evening.setHours(19, 0, 0, 0);
  for (const [label, situation] of [['Running, easy, evening', undefined], ['Running, easy, evening, 9 days since last run', 'returning']] as const) {
    const ctx: WorkoutMetadataContext = {
      persona: null, location: 'park', timeOfDay: 'evening', sportType: 'running',
      runningBasePace: 360, runningCategory: 'easy_run', category: 'running', categoryLabel: 'ריצה קלה',
      durationMinutes: 30, isAbroad: false, previewNow: evening, situation,
    };
    for (let i = 0; i < RUNS_PER_SCENARIO; i++) {
      const r = await resolveWorkoutMetadataWithCandidates(ctx);
      const v2 = r.title ? v2TitleByText.get(r.title) : undefined;
      const good = !!v2 && v2.sportType === 'running' && (situation ? v2.situation === situation : (!v2.situation && (v2.timeOfDay === 'evening' || v2.timeOfDay === 'any')));
      total++; if (good) ok++;
      const top = r.titleCandidates.filter(c => c.tiedForFirst).length;
      out.push(`| ${i === 0 ? label : ''} | general · run easy_run · evening · situation=${situation ?? '-'} | ${r.title} → ${r.description} | ${r.title ? describeRow(r.title) : '-'} (${top} tied) | ${good ? 'yes' : 'NO'} |`);
    }
  }

  console.log('\n' + out.join('\n'));
  console.log(`\n${ok}/${total} runs picked a row of the expected moment.`);
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
