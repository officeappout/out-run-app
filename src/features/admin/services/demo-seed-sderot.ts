/**
 * Sderot Demo Seed Tool
 *
 * Creates 10 realistic mock users (tagged [דמו] with isMockData: true) with
 * full data across 9 Firestore collections per authority, making every metric
 * in the admin dashboard show non-zero values.
 *
 * Doc-ID convention: every mock document either uses an explicit
 * `sderot-mock-...` prefix or stores the user reference in a field
 * (`userId`, `authorUid`, etc.) starting with `sderot-mock-`. This
 * makes cleanup deterministic.
 */

import {
  collection,
  doc,
  getDocs,
  orderBy,
  query,
  where,
  writeBatch,
  serverTimestamp,
  Timestamp,
  deleteField,
  type WriteBatch,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';

// ── Constants ────────────────────────────────────────────────────────────────

const NEIGHBORHOOD_IDS = {
  shikma:    'HfPYNONzqDzJB2sJnKg9', // נאות השקמה
  bapark:    'J8W9GFXcyuv2LkYduGai', // שדרות בפארק
  dekel:     'HXzhmDzRK1m7aiTffzyG', // נאות הדקל
  meysadim:  'kpabjs6amyKKLaLN0ebk', // שכונת המייסדים
} as const;

const SDEROT_CENTER = { lat: 31.525, lng: 34.5955 };

const NEIGHBORHOODS: Array<{ id: string; lat: number; lng: number }> = [
  { id: NEIGHBORHOOD_IDS.shikma,   lat: 31.525 + 0.005,  lng: 34.5955 + 0.005  },
  { id: NEIGHBORHOOD_IDS.bapark,   lat: 31.525 - 0.004,  lng: 34.5955 + 0.008  },
  { id: NEIGHBORHOOD_IDS.dekel,    lat: 31.525 - 0.008,  lng: 34.5955 - 0.006  },
  { id: NEIGHBORHOOD_IDS.meysadim, lat: 31.525 + 0.006,  lng: 34.5955 - 0.005  },
];

const POPULAR_PARK_IDS = [
  'HHb31XrYHXxXydkUvxsu', // מתקני כושר פתוחים
  'wLoqnYzQx5jApVLbVLJZ', // גן הספורט נאות הנביאים
  'MMrrLVFaWzxS6Vs9S6C1', // park in center
];

const COMMUNITY_GROUPS_TO_FIX = [
  { id: 'j4w7AtRldy93c6dtECQx', activityType: 'walking' as const, addAttendance: true },
  { id: '3oifYn7CEa24iQmivgUx', activityType: 'walking' as const, addAttendance: false },
  { id: 'mTPMFfjzXKdG8hQr4xft', activityType: 'running' as const, addAttendance: false },
];

const FEMALE_FIRST_NAMES = [
  'מיכל', 'שרה', 'רחל', 'לאה', 'דינה', 'אביגיל', 'יעל', 'נועה', 'ליאת', 'רונית',
  'עדי', 'שירה', 'הדר', 'אריאלה', 'גלית', 'ורד', 'טל', 'ענת', 'אורית', 'חוה',
  'נילי', 'דפנה', 'יונית', 'כרמית', 'לימור', 'מורן', 'נגה', 'ספיר', 'עינב', 'פנינה',
  'צילה', 'קרן', 'ריקי', 'שושנה', 'תמר', 'אביבה',
];

const MALE_FIRST_NAMES = [
  'דוד', 'משה', 'יוסף', 'אבי', 'שלמה', 'יוחנן', 'מנחם', 'ברוך', 'נתן', 'אריה',
  'גדעון', 'זאב', 'חיים', 'טוביה', 'יצחק', 'לוי', 'מרדכי', 'נחום', 'עמי',
  'פנחס', 'צבי', 'ראובן', 'שמעון', 'תמיר', 'אלי', 'בן', 'גל', 'דן',
];

const LAST_NAMES = [
  'כהן', 'לוי', 'מזרחי', 'פרץ', 'ביטון', 'אברהם', 'דהן', 'אוחיון', 'שמש', 'אלמליח',
  'בן-דוד', 'חדד', 'גבאי', 'ממן', 'עמר', 'פרידמן', 'גולן', 'שפירא', 'רוזן',
];

const HEBREW_WORKOUT_TITLES: Record<'strength' | 'running' | 'walking', string[]> = {
  strength: ['אימון כוח', 'בטן וגב', 'פלג גוף עליון', 'רגליים וישבן', 'אימון Push'],
  running:  ['ריצה קלה', 'אימון סף', 'אינטרוולים', 'ריצת התאוששות', 'ריצת בוקר'],
  walking:  ['הליכה במסלול הירוק', 'הליכה משפחתית', 'הליכה מהירה', 'הליכת ערב'],
};

const PROGRAM_TEMPLATE_IDS = ['full_body', 'push', 'pull'] as const;

// Doc-ID prefix used by older `seed-sderot` tool (Step 1 cleans these too).
const LEGACY_USER_PREFIX = 'sderot-demo-user-';
const LEGACY_PRESENCE_PREFIX = 'mock_lemur_';

// New tool's prefix.
const MOCK_PREFIX = 'sderot-mock-';

// Firestore writeBatch limit is 500. Stay safely under.
const BATCH_LIMIT = 490;

// ── Types ────────────────────────────────────────────────────────────────────

export type StepName =
  | 'cleanup'
  | 'users'
  | 'workouts'
  | 'presence'
  | 'active_workouts'
  | 'sessions'
  | 'feed_posts'
  | 'community_groups'
  | 'manager_notifications'
  | 'route_analytics';

export interface ProgressUpdate {
  step: StepName;
  status: 'running' | 'done' | 'error';
  message: string;
  count?: number;
}

export type ProgressFn = (update: ProgressUpdate) => void;

export interface SeedResult {
  success: boolean;
  counts: Record<string, number>;
  errors: string[];
}

export interface CleanResult {
  success: boolean;
  deleted: Record<string, number>;
  errors: string[];
}

interface MockUser {
  id: string;
  displayName: string;
  gender: 'female' | 'male';
  birthDate: Date;
  authorityId: string;            // neighborhood ID (coordinate jitter only)
  cityAuthorityId: string;        // the active authority passed at seed time
  neighborhoodCenter: { lat: number; lng: number };
  onboardingPath: 'FULL_PROGRAM' | 'RUNNING' | 'MAP_ONLY';
  personaId: string;
  trainingTime: '07:00' | '18:30';
  primaryActivity: 'strength' | 'running' | 'walking';
  programTemplateId: typeof PROGRAM_TEMPLATE_IDS[number] | null;
  runningTarget: '3k' | '5k' | '10k' | 'maintenance' | null;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function randInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function randItem<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function jitter(value: number, range: number): number {
  return value + (Math.random() * 2 - 1) * range;
}

function pad3(n: number): string {
  return String(n).padStart(3, '0');
}

function birthDateForAge(age: number): Date {
  const now = new Date();
  const year = now.getFullYear() - age;
  return new Date(year, randInt(0, 11), randInt(1, 28));
}

function ageFromBirthDate(d: Date): number {
  return new Date().getFullYear() - d.getFullYear();
}

function ageGroupBucket(d: Date): string {
  const age = ageFromBirthDate(d);
  if (age <= 25) return '18-25';
  if (age <= 35) return '26-35';
  if (age <= 45) return '36-45';
  if (age <= 55) return '46-55';
  return '56+';
}

function pickWorkoutHour(trainingTime: '07:00' | '18:30'): number {
  if (trainingTime === '07:00') return randInt(6, 8);     // 06:00–08:30 morning
  return randInt(17, 19);                                  // 17:00–20:00 evening
}

function setDateTime(base: Date, hour: number, minute: number): Date {
  const d = new Date(base);
  d.setHours(hour, minute, 0, 0);
  return d;
}

/** Random Date between `minDays` and `maxDays` ago, with random time-of-day. */
function dateDaysAgo(minDays: number, maxDays: number): Date {
  const days = randInt(minDays, maxDays);
  const d = new Date();
  d.setDate(d.getDate() - days);
  d.setHours(randInt(6, 21), randInt(0, 59), 0, 0);
  return d;
}

/** Returns an array of 8 {lat, lng} points forming a small loop around `center`. */
function makeRoutePath(center: { lat: number; lng: number }): Array<{ lat: number; lng: number }> {
  const radius = 0.002;
  const points: Array<{ lat: number; lng: number }> = [];
  for (let i = 0; i < 8; i++) {
    const angle = (i / 8) * Math.PI * 2;
    points.push({
      lat: center.lat + radius * Math.cos(angle),
      lng: center.lng + radius * Math.sin(angle),
    });
  }
  return points;
}

/** Commits an array of (batch) -> writes in chunks of BATCH_LIMIT. */
async function commitBatched(writes: Array<(b: WriteBatch) => void>): Promise<void> {
  for (let i = 0; i < writes.length; i += BATCH_LIMIT) {
    const slice = writes.slice(i, i + BATCH_LIMIT);
    const batch = writeBatch(db);
    slice.forEach((fn) => fn(batch));
    await batch.commit();
  }
}

/** Returns the current ISO week (Mon=0…Sun=6) range as Date objects. */
function currentWeekDates(): { mondayMidnight: Date; today: Date } {
  const today = new Date();
  today.setHours(12, 0, 0, 0);
  const dow = today.getDay(); // 0=Sun…6=Sat
  // Treat Monday as start-of-week; Sun (0) → 6 days back.
  const daysSinceMonday = (dow + 6) % 7;
  const monday = new Date(today);
  monday.setDate(today.getDate() - daysSinceMonday);
  monday.setHours(0, 0, 0, 0);
  return { mondayMidnight: monday, today };
}

/** Returns next Tuesday's date in YYYY-MM-DD (or today if today is Tuesday). */
function nextTuesdayString(): string {
  const today = new Date();
  const dow = today.getDay(); // 0=Sun…6=Sat; Tuesday = 2
  const delta = (2 - dow + 7) % 7; // 0 if today is Tuesday
  const d = new Date(today);
  d.setDate(today.getDate() + delta);
  return d.toISOString().slice(0, 10);
}

// ── Step 1: Cleanup old mock data ────────────────────────────────────────────

async function step1_cleanupOld(progress: ProgressFn): Promise<number> {
  progress({ step: 'cleanup', status: 'running', message: 'מנקה נתוני דמו ישנים…' });
  let deleted = 0;

  // Legacy users: doc IDs `sderot-demo-user-*` (range query on doc ID via collection list).
  const legacyUserSnap = await getDocs(
    query(
      collection(db, 'users'),
      where('__name__', '>=', LEGACY_USER_PREFIX),
      where('__name__', '<', LEGACY_USER_PREFIX + '\uf8ff'),
    ),
  );
  if (!legacyUserSnap.empty) {
    const writes = legacyUserSnap.docs.map((d) => (b: WriteBatch) => b.delete(d.ref));
    await commitBatched(writes);
    deleted += legacyUserSnap.size;
  }

  // Legacy workouts: where userId starts with `sderot-demo-user-`.
  const legacyWorkoutSnap = await getDocs(
    query(
      collection(db, 'workouts'),
      where('userId', '>=', LEGACY_USER_PREFIX),
      where('userId', '<', LEGACY_USER_PREFIX + '\uf8ff'),
    ),
  );
  if (!legacyWorkoutSnap.empty) {
    const writes = legacyWorkoutSnap.docs.map((d) => (b: WriteBatch) => b.delete(d.ref));
    await commitBatched(writes);
    deleted += legacyWorkoutSnap.size;
  }

  // Legacy feed_posts: where authorUid starts with `sderot-demo-user-`.
  const legacyFeedSnap = await getDocs(
    query(
      collection(db, 'feed_posts'),
      where('authorUid', '>=', LEGACY_USER_PREFIX),
      where('authorUid', '<', LEGACY_USER_PREFIX + '\uf8ff'),
    ),
  );
  if (!legacyFeedSnap.empty) {
    const writes = legacyFeedSnap.docs.map((d) => (b: WriteBatch) => b.delete(d.ref));
    await commitBatched(writes);
    deleted += legacyFeedSnap.size;
  }

  // Legacy presence by doc-ID prefix (`sderot-demo-user-*` and `mock_lemur_*`).
  for (const prefix of [LEGACY_USER_PREFIX, LEGACY_PRESENCE_PREFIX]) {
    const snap = await getDocs(
      query(
        collection(db, 'presence'),
        where('__name__', '>=', prefix),
        where('__name__', '<', prefix + '\uf8ff'),
      ),
    );
    if (!snap.empty) {
      const writes = snap.docs.map((d) => (b: WriteBatch) => b.delete(d.ref));
      await commitBatched(writes);
      deleted += snap.size;
    }
  }

  // Also clean any prior `sderot-mock-*` docs from this tool itself, so reruns are idempotent.
  await deleteByDocIdPrefix('users', MOCK_PREFIX, (n) => (deleted += n));
  await deleteByFieldPrefix('workouts', 'userId', MOCK_PREFIX, (n) => (deleted += n));
  await deleteByDocIdPrefix('presence', MOCK_PREFIX, (n) => (deleted += n));
  await deleteByDocIdPrefix('active_workouts', MOCK_PREFIX, (n) => (deleted += n));
  await deleteByFieldPrefix('sessions', 'userId', MOCK_PREFIX, (n) => (deleted += n));
  await deleteByFieldPrefix('feed_posts', 'authorUid', MOCK_PREFIX, (n) => (deleted += n));
  await deleteByDocIdPrefix('manager_notifications', MOCK_PREFIX, (n) => (deleted += n));

  progress({ step: 'cleanup', status: 'done', message: `נמחקו ${deleted} מסמכים`, count: deleted });
  return deleted;
}

async function deleteByDocIdPrefix(
  collectionName: string,
  prefix: string,
  bump: (n: number) => void,
): Promise<void> {
  const snap = await getDocs(
    query(
      collection(db, collectionName),
      where('__name__', '>=', prefix),
      where('__name__', '<', prefix + '\uf8ff'),
    ),
  );
  if (snap.empty) return;
  const writes = snap.docs.map((d) => (b: WriteBatch) => b.delete(d.ref));
  await commitBatched(writes);
  bump(snap.size);
}

async function deleteByFieldPrefix(
  collectionName: string,
  field: string,
  prefix: string,
  bump: (n: number) => void,
): Promise<void> {
  const snap = await getDocs(
    query(
      collection(db, collectionName),
      where(field, '>=', prefix),
      where(field, '<', prefix + '\uf8ff'),
    ),
  );
  if (snap.empty) return;
  const writes = snap.docs.map((d) => (b: WriteBatch) => b.delete(d.ref));
  await commitBatched(writes);
  bump(snap.size);
}

// ── Step 2: Create 60 users ──────────────────────────────────────────────────

interface PlannedAssignment {
  index: number;
  gender: 'female' | 'male';
  age: number;
  authorityId: string;
  onboardingPath: 'FULL_PROGRAM' | 'RUNNING' | 'MAP_ONLY';
  personaId: string;
  programTemplateId: typeof PROGRAM_TEMPLATE_IDS[number] | null;
  runningTarget: '3k' | '5k' | '10k' | 'maintenance' | null;
  trainingTime: '07:00' | '18:30';
}

// ── Mock user count per authority ────────────────────────────────────────────
// Keeping this at 10 balances a competitive leaderboard spread against
// Firestore write quota across many authorities in the same run.
const MOCK_USER_COUNT = 10;

function buildAssignments(): PlannedAssignment[] {
  const TOTAL = MOCK_USER_COUNT;

  // Gender: 60% female / 40% male (rounded to TOTAL)
  const genders: Array<'female' | 'male'> = [
    ...Array<'female'>(6).fill('female'),
    ...Array<'male'>(4).fill('male'),
  ];

  // Age buckets — one representative from each important bracket keeps the
  // leaderboard filter realistic across ageGroup 'adult' / 'minor'.
  const ages: number[] = [
    randInt(36, 45), randInt(36, 45), randInt(36, 45), // 3 mid-career (peak bracket)
    randInt(26, 35), randInt(26, 35),                  // 2 young adult
    randInt(46, 55), randInt(46, 55),                  // 2 pre-senior
    randInt(18, 25),                                    // 1 young
    randInt(56, 65), randInt(56, 65),                  // 2 senior (total = TOTAL)
  ];

  // Neighborhoods — spread across all 4 for coordinate diversity.
  const authorities: string[] = [
    NEIGHBORHOOD_IDS.shikma,   NEIGHBORHOOD_IDS.shikma,   NEIGHBORHOOD_IDS.shikma,
    NEIGHBORHOOD_IDS.bapark,   NEIGHBORHOOD_IDS.bapark,   NEIGHBORHOOD_IDS.bapark,
    NEIGHBORHOOD_IDS.dekel,    NEIGHBORHOOD_IDS.dekel,
    NEIGHBORHOOD_IDS.meysadim, NEIGHBORHOOD_IDS.meysadim,
  ];

  // Onboarding paths — 6 FULL_PROGRAM keeps strength leaderboard populated,
  // 2 RUNNING and 2 MAP_ONLY keep cardio competitive.
  const paths: Array<'FULL_PROGRAM' | 'RUNNING' | 'MAP_ONLY'> = [
    ...Array<'FULL_PROGRAM'>(6).fill('FULL_PROGRAM'),
    ...Array<'RUNNING'>(2).fill('RUNNING'),
    ...Array<'MAP_ONLY'>(2).fill('MAP_ONLY'),
  ];

  // Personas — 5 of the 7 canonical PersonaId values, for dashboard metric
  // variety (01.09.2026: was a bespoke demo-only vocabulary — mothers/
  // wellness_seekers/runners/gym_goers/seniors — that doesn't exist in any
  // real code anymore; these seeded users would show "no persona" in the
  // actual app. See docs/research/military-persona-unified-architecture.md).
  const personas: string[] = [
    'parent', 'parent', 'parent',
    'vatikim', 'vatikim',
    'student', 'student',
    'office_worker',
    'military', 'military',
  ];

  // Training times — 60% morning / 40% evening.
  const trainingTimes: Array<'07:00' | '18:30'> = [
    ...Array<'07:00'>(6).fill('07:00'),
    ...Array<'18:30'>(4).fill('18:30'),
  ];

  // Fisher-Yates shuffle.
  const shuffle = <T,>(arr: T[]): T[] => {
    const out = arr.slice();
    for (let i = out.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [out[i], out[j]] = [out[j], out[i]];
    }
    return out;
  };

  const sGenders = shuffle(genders);
  const sAges    = shuffle(ages);
  const sAuth    = shuffle(authorities);
  const sPaths   = shuffle(paths);
  const sPersonas = shuffle(personas);
  const sTimes   = shuffle(trainingTimes);

  // Program templates for FULL_PROGRAM users (6 total) — 2 per template.
  const fullProgramTemplates: typeof PROGRAM_TEMPLATE_IDS[number][] = [
    'full_body', 'full_body', 'push', 'push', 'pull', 'pull',
  ];
  const sFullProgramTemplates = shuffle(fullProgramTemplates);

  // Running targets for RUNNING users (2 total).
  const runningTargets: Array<'3k' | '5k' | '10k' | 'maintenance'> = ['5k', '3k'];
  const sRunningTargets = shuffle(runningTargets);

  let fpIdx = 0;
  let rnIdx = 0;
  const out: PlannedAssignment[] = [];
  for (let i = 0; i < TOTAL; i++) {
    const path = sPaths[i];
    out.push({
      index: i,
      gender: sGenders[i],
      age: sAges[i],
      authorityId: sAuth[i],
      onboardingPath: path,
      personaId: sPersonas[i],
      programTemplateId: path === 'FULL_PROGRAM' ? sFullProgramTemplates[fpIdx++] : null,
      runningTarget: path === 'RUNNING' ? sRunningTargets[rnIdx++] : null,
      trainingTime: sTimes[i],
    });
  }
  return out;
}

async function step2_createUsers(progress: ProgressFn, currentAuthorityId: string): Promise<MockUser[]> {
  progress({ step: 'users', status: 'running', message: `יוצר ${MOCK_USER_COUNT} משתמשי דמו…` });

  const assignments = buildAssignments();
  const users: MockUser[] = [];
  const writes: Array<(b: WriteBatch) => void> = [];

  for (const a of assignments) {
    const id = `${MOCK_PREFIX}${pad3(a.index + 1)}`;
    const firstName = a.gender === 'female'
      ? randItem(FEMALE_FIRST_NAMES)
      : randItem(MALE_FIRST_NAMES);
    const lastName = randItem(LAST_NAMES);
    const displayName = `${firstName} ${lastName} [דמו]`;
    const birthDate = birthDateForAge(a.age);
    const neighborhoodCenter = NEIGHBORHOODS.find((n) => n.id === a.authorityId)!;

    let primaryActivity: 'strength' | 'running' | 'walking';
    if (a.onboardingPath === 'RUNNING') primaryActivity = 'running';
    else if (a.onboardingPath === 'MAP_ONLY') primaryActivity = 'walking';
    else primaryActivity = Math.random() < 0.7 ? 'strength' : 'walking';

    users.push({
      id,
      displayName,
      gender: a.gender,
      birthDate,
      authorityId: a.authorityId,
      cityAuthorityId: currentAuthorityId,
      neighborhoodCenter: { lat: neighborhoodCenter.lat, lng: neighborhoodCenter.lng },
      onboardingPath: a.onboardingPath,
      personaId: a.personaId,
      trainingTime: a.trainingTime,
      primaryActivity,
      programTemplateId: a.programTemplateId,
      runningTarget: a.runningTarget,
    });

    // Build the user document.
    const docData: Record<string, unknown> = {
      isMockData: true,
      core: {
        displayName,
        name: displayName,
        email: `${id}@demo.local`,
        gender: a.gender,
        birthDate: Timestamp.fromDate(birthDate),
        authorityId: currentAuthorityId,
        isApproved: false,
        isSuperAdmin: false,
        isMockData: true,
        onboardingStatus: 'COMPLETED',
        accessLevel: 'free',
        loginCount: randInt(5, 60),
        ageGroup: ageGroupBucket(birthDate),
      },
      onboardingPath: a.onboardingPath,
      personas: [{ id: a.personaId, answers: {}, updatedAt: Timestamp.now() }],
      lifestyle: {
        trainingTime: a.trainingTime,
        scheduleDays: [0, 2, 4],
      },
      createdAt: Timestamp.fromDate(new Date(Date.now() - randInt(30, 300) * 86_400_000)),
      updatedAt: serverTimestamp(),
      lastActive: Timestamp.fromDate(new Date(Date.now() - randInt(0, 3) * 86_400_000)),
    };

    if (a.onboardingPath === 'RUNNING') {
      const td = a.runningTarget ?? '5k';
      const goalMap: Record<string, string> = {
        '3k': 'couch_to_5k',
        '5k': 'improve_speed_5k',
        '10k': 'improve_speed_10k',
        'maintenance': 'maintain_fitness',
      };
      docData.running = {
        isUnlocked: true,
        currentGoal: goalMap[td],
        paceProfile: { basePace: randInt(300, 480) },
        onboardingData: {
          targetDistance: td,
          weeklyFrequency: randItem([2, 3, 4]),
          runningHistoryMonths: randInt(0, 24),
          hasInjuries: Math.random() < 0.15,
        },
      };
    }

    if (a.onboardingPath === 'FULL_PROGRAM') {
      const tpl = a.programTemplateId ?? 'full_body';
      const currentLevel = randInt(1, 12);
      docData.progression = {
        activePrograms: [
          {
            templateId: tpl,
            startedAt: Timestamp.fromDate(new Date(Date.now() - randInt(7, 90) * 86_400_000)),
          },
        ],
        domains: {
          strength: {
            currentLevel,
            maxLevel: 15,
          },
        },
      };
    }

    writes.push((b) => b.set(doc(db, 'users', id), docData));
  }

  // Update authority userCount to the actual number of seeded bots.
  writes.push((b) =>
    b.update(doc(db, 'authorities', currentAuthorityId), {
      userCount: users.length,
      updatedAt: serverTimestamp(),
    }),
  );

  await commitBatched(writes);
  progress({ step: 'users', status: 'done', message: `נוצרו ${users.length} משתמשים`, count: users.length });
  return users;
}

// ── Step 3: Create workouts ──────────────────────────────────────────────────

function pickActivityForUser(user: MockUser): 'strength' | 'running' | 'walking' {
  if (user.onboardingPath === 'RUNNING') return 'running';
  if (user.onboardingPath === 'MAP_ONLY') return Math.random() < 0.7 ? 'walking' : 'running';
  // FULL_PROGRAM
  return Math.random() < 0.75 ? 'strength' : 'walking';
}

function buildWorkoutDoc(
  user: MockUser,
  date: Date,
  activity: 'strength' | 'running' | 'walking',
): Record<string, unknown> {
  let duration: number;
  if (activity === 'strength') duration = randInt(1800, 3600);
  else if (activity === 'running') duration = randInt(1800, 3000);
  else duration = randInt(2700, 4500);

  let distance = 0;
  if (activity === 'running') distance = Math.round((duration / 3600) * 9 * 10) / 10;
  else if (activity === 'walking') distance = Math.round((duration / 3600) * 5 * 10) / 10;

  const calories = Math.round(duration * 0.1);
  const category = activity === 'strength' ? 'strength' : 'cardio';

  const doc: Record<string, unknown> = {
    userId: user.id,
    date: Timestamp.fromDate(date),
    duration,
    distance,
    calories,
    activityType: activity,
    workoutType: activity,
    activityCategory: category,
    category, // dual-write for compatibility with WorkoutHistoryEntry
    hour: date.getHours(),
    dayOfWeek: date.getDay(),
    authorityId: user.cityAuthorityId,
    createdAt: Timestamp.fromDate(date),
  };

  if (activity === 'running' || activity === 'walking') {
    doc.routePath = makeRoutePath({
      lat: jitter(user.neighborhoodCenter.lat, 0.001),
      lng: jitter(user.neighborhoodCenter.lng, 0.001),
    });
  }

  return doc;
}

async function step3_createWorkouts(users: MockUser[], progress: ProgressFn): Promise<number> {
  progress({ step: 'workouts', status: 'running', message: 'יוצר היסטוריית אימונים…' });

  const now = new Date();
  const { mondayMidnight } = currentWeekDates();

  const writes: Array<(b: WriteBatch) => void> = [];
  let count = 0;

  // Pick 18 users to have a workout TODAY.
  const todayUserSet = new Set<string>();
  const shuffledUsers = [...users].sort(() => Math.random() - 0.5);
  for (let i = 0; i < 18 && i < shuffledUsers.length; i++) {
    todayUserSet.add(shuffledUsers[i].id);
  }

  for (const user of users) {
    // ── Phase A: months 2–12 history (2–4 per month for 11 months) ───────
    for (let monthOffset = 1; monthOffset <= 11; monthOffset++) {
      const perMonth = randInt(2, 4);
      for (let m = 0; m < perMonth; m++) {
        const monthStart = new Date(now);
        monthStart.setMonth(now.getMonth() - (monthOffset + 1));
        const dayInMonth = randInt(1, 28);
        const d = new Date(monthStart);
        d.setDate(dayInMonth);
        const hour = pickWorkoutHour(user.trainingTime);
        const date = setDateTime(d, hour, randInt(0, 59));
        const activity = pickActivityForUser(user);
        const docData = buildWorkoutDoc(user, date, activity);
        writes.push((b) => b.set(doc(collection(db, 'workouts')), docData));
        count++;
      }
    }

    // ── Phase B: last 30 days (3–5 per week × 4 weeks) ───────────────────
    // We schedule per-week so we can guarantee at least 3 in the current week.
    for (let weekOffset = 0; weekOffset < 4; weekOffset++) {
      const perWeek = weekOffset === 0 ? Math.max(3, randInt(3, 5)) : randInt(3, 5);
      for (let w = 0; w < perWeek; w++) {
        let date: Date;
        if (weekOffset === 0) {
          // Current week: only days from Monday up to (and including) today.
          const daysSinceMon = Math.floor((now.getTime() - mondayMidnight.getTime()) / 86_400_000);
          const dayOffset = randInt(0, Math.max(0, daysSinceMon));
          const d = new Date(mondayMidnight);
          d.setDate(mondayMidnight.getDate() + dayOffset);
          const hour = pickWorkoutHour(user.trainingTime);
          date = setDateTime(d, hour, randInt(0, 59));
          // Don't generate a future timestamp for today.
          if (date.getTime() > now.getTime()) date = new Date(now.getTime() - randInt(60_000, 3_600_000));
        } else {
          const daysAgo = weekOffset * 7 + randInt(0, 6);
          const d = new Date(now.getTime() - daysAgo * 86_400_000);
          const hour = pickWorkoutHour(user.trainingTime);
          date = setDateTime(d, hour, randInt(0, 59));
        }
        const activity = pickActivityForUser(user);
        const docData = buildWorkoutDoc(user, date, activity);
        writes.push((b) => b.set(doc(collection(db, 'workouts')), docData));
        count++;
      }
    }

    // ── Phase C: 18 users get an explicit "today" workout ────────────────
    if (todayUserSet.has(user.id)) {
      const hour = pickWorkoutHour(user.trainingTime);
      let date = setDateTime(new Date(now), hour, randInt(0, 59));
      if (date.getTime() > now.getTime()) {
        date = new Date(now.getTime() - randInt(60_000, 3_600_000));
      }
      const activity = pickActivityForUser(user);
      const docData = buildWorkoutDoc(user, date, activity);
      writes.push((b) => b.set(doc(collection(db, 'workouts')), docData));
      count++;
    }
  }

  await commitBatched(writes);
  progress({ step: 'workouts', status: 'done', message: `נוצרו ${count} אימונים`, count });
  return count;
}

// ── Step 4: Create presence docs (20 active now) ─────────────────────────────

interface PresenceUser {
  user: MockUser;
  status: 'strength' | 'running' | 'walking';
  lat: number;
  lng: number;
}

async function step4_createPresence(users: MockUser[], progress: ProgressFn, currentAuthorityId: string): Promise<PresenceUser[]> {
  // Cap presence at 70 % of users (floor 1) so the "active right now" ratio is realistic.
  const presenceCount = Math.max(1, Math.floor(users.length * 0.7));
  progress({ step: 'presence', status: 'running', message: `יוצר ${presenceCount} נוכחויות חיות…` });

  const shuffled = [...users].sort(() => Math.random() - 0.5);
  const selected = shuffled.slice(0, presenceCount);

  // Activity mix: ~50% strength, ~30% running, ~20% walking
  const strengthCount = Math.max(1, Math.round(presenceCount * 0.5));
  const runningCount  = Math.max(1, Math.round(presenceCount * 0.3));
  const walkingCount  = Math.max(0, presenceCount - strengthCount - runningCount);
  const statuses: Array<'strength' | 'running' | 'walking'> = [
    ...Array<'strength'>(strengthCount).fill('strength'),
    ...Array<'running'>(runningCount).fill('running'),
    ...Array<'walking'>(walkingCount).fill('walking'),
  ];
  for (let i = statuses.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [statuses[i], statuses[j]] = [statuses[j], statuses[i]];
  }

  const presenceUsers: PresenceUser[] = [];
  const writes: Array<(b: WriteBatch) => void> = [];

  for (let i = 0; i < selected.length; i++) {
    const user = selected[i];
    const status = statuses[i];
    const lat = jitter(user.neighborhoodCenter.lat, 0.002);
    const lng = jitter(user.neighborhoodCenter.lng, 0.002);

    presenceUsers.push({ user, status, lat, lng });

    const presenceDoc: Record<string, unknown> = {
      uid: user.id,
      name: user.displayName,
      lat,
      lng,
      authorityId: currentAuthorityId,
      mode: 'verified_global',
      activity: {
        status,
        workoutTitle: randItem(HEBREW_WORKOUT_TITLES[status]),
        startedAt: Date.now() - randInt(0, 3_600_000),
      },
      lemurStage: randInt(1, 8),
      programLevel: randInt(1, 12),
      programName: randItem(PROGRAM_TEMPLATE_IDS),
      currentStreak: randInt(1, 30),
      gender: user.gender,
      personaId: user.personaId,
      ageGroup: ageGroupBucket(user.birthDate),
      isVerified: true,
      updatedAt: serverTimestamp(),
    };

    if (status === 'running') {
      const minutes = randInt(5, 8);
      const seconds = randInt(0, 59);
      presenceDoc.mockPace = `${minutes}:${String(seconds).padStart(2, '0')}`;
    }

    writes.push((b) => b.set(doc(db, 'presence', user.id), presenceDoc));
  }

  await commitBatched(writes);
  progress({ step: 'presence', status: 'done', message: `נוצרו ${presenceUsers.length} נוכחויות`, count: presenceUsers.length });
  return presenceUsers;
}

// ── Step 5: Create active_workouts ───────────────────────────────────────────

async function step5_createActiveWorkouts(presenceUsers: PresenceUser[], progress: ProgressFn, currentAuthorityId: string): Promise<number> {
  // Active workouts = half of presence users (min 1).
  const activeCount = Math.max(1, Math.floor(presenceUsers.length / 2));
  progress({ step: 'active_workouts', status: 'running', message: `יוצר ${activeCount} אימונים פעילים…` });

  const selected = presenceUsers.slice(0, activeCount);
  const writes: Array<(b: WriteBatch) => void> = [];

  for (const p of selected) {
    const birthYear = p.user.birthDate.getFullYear();
    const ageGroup = ageGroupBucket(p.user.birthDate);
    const docData: Record<string, unknown> = {
      authorityId: currentAuthorityId,
      neighborhoodId: p.user.authorityId,
      workoutType: p.status,
      location: { lat: p.lat, lng: p.lng },
      demographics: {
        gender: p.user.gender,
        ageGroup,
        birthYear,
      },
      routeId: null,
      lastUpdate: serverTimestamp(),
    };
    writes.push((b) => b.set(doc(db, 'active_workouts', p.user.id), docData));
  }

  await commitBatched(writes);
  progress({ step: 'active_workouts', status: 'done', message: `נוצרו ${selected.length} אימונים פעילים`, count: selected.length });
  return selected.length;
}

// ── Step 6: Create sessions (popular parks) ──────────────────────────────────

/**
 * Per-park visit volume tiers. Tier ordering matches `POPULAR_PARK_IDS` so
 * the first park is always the busiest hotspot in the overlay (drives the
 * red 31+ tier in the LiveHeatMap parks layer).
 *
 *   • HHb31XrYHXxXydkUvxsu — מתקני כושר פתוחים     → 40–60 visits/month (red)
 *   • wLoqnYzQx5jApVLbVLJZ — גן הספורט נאות הנביאים → 25–45 visits/month (orange)
 *   • MMrrLVFaWzxS6Vs9S6C1 — פארק מרכז              → 15–30 visits/month (orange/blue)
 */
const PARK_SESSION_TIERS: Record<string, { min: number; max: number }> = {
  'HHb31XrYHXxXydkUvxsu': { min: 40, max: 60 },
  'wLoqnYzQx5jApVLbVLJZ': { min: 25, max: 45 },
  'MMrrLVFaWzxS6Vs9S6C1': { min: 15, max: 30 },
};

async function step6_createSessions(users: MockUser[], progress: ProgressFn, currentAuthorityId: string): Promise<number> {
  progress({ step: 'sessions', status: 'running', message: 'יוצר ביקורים בפארקים…' });

  const writes: Array<(b: WriteBatch) => void> = [];
  let count = 0;

  for (const parkId of POPULAR_PARK_IDS) {
    const tier = PARK_SESSION_TIERS[parkId] ?? { min: 30, max: 50 };
    const sessionCount = randInt(tier.min, tier.max);
    for (let i = 0; i < sessionCount; i++) {
      const user = randItem(users);
      const daysAgo = randInt(0, 30);
      const date = new Date(Date.now() - daysAgo * 86_400_000);
      date.setHours(randInt(6, 21), randInt(0, 59), 0, 0);
      const docData: Record<string, unknown> = {
        authorityId: currentAuthorityId,
        parkId,
        userId: user.id,
        date: Timestamp.fromDate(date),
      };
      writes.push((b) => b.set(doc(collection(db, 'sessions')), docData));
      count++;
    }
  }

  await commitBatched(writes);
  progress({ step: 'sessions', status: 'done', message: `נוצרו ${count} ביקורים`, count });
  return count;
}

// ── Step 7: Create feed_posts (leaderboard) ──────────────────────────────────

async function step7_createFeedPosts(users: MockUser[], progress: ProgressFn, currentAuthorityId: string): Promise<number> {
  progress({ step: 'feed_posts', status: 'running', message: 'יוצר פוסטים בפיד…' });

  const writes: Array<(b: WriteBatch) => void> = [];
  let count = 0;

  for (const user of users) {
    const postCount = randInt(3, 8);
    const baseCategory: 'strength' | 'cardio' =
      user.primaryActivity === 'strength' ? 'strength' : 'cardio';
    const isMinor = ageFromBirthDate(user.birthDate) < 18;
    const ageGroup: 'minor' | 'adult' = isMinor ? 'minor' : 'adult';

    for (let i = 0; i < postCount; i++) {
      const daysAgo = randInt(0, 30);
      const date = new Date(Date.now() - daysAgo * 86_400_000);
      date.setHours(randInt(6, 22), randInt(0, 59), 0, 0);

      // 15 % chance to cross-category so both cardio + strength appear in the leaderboard
      const postCategory: 'strength' | 'cardio' =
        Math.random() < 0.15
          ? baseCategory === 'strength' ? 'cardio' : 'strength'
          : baseCategory;

      const activityCredit = randInt(50, 500);

      // Realistic XP scaled to category difficulty (mirrors xp.service ranges)
      const durationMinutes = randInt(30, 75);
      const xpAwarded = postCategory === 'strength'
        ? Math.round(durationMinutes * randItem([1.2, 1.5, 1.8]) + randInt(0, 50))
        : Math.round(durationMinutes * randItem([1.0, 1.2]) + randInt(0, 30));

      const docData: Record<string, unknown> = {
        authorUid: user.id,
        authorName: user.displayName,
        authorityId: currentAuthorityId,
        ageGroup,
        gender: user.gender,
        activityCredit,
        activityCategory: postCategory,
        xpAwarded,
        type: 'workout',
        createdAt: Timestamp.fromDate(date),
      };
      writes.push((b) => b.set(doc(collection(db, 'feed_posts')), docData));
      count++;
    }
  }

  await commitBatched(writes);
  progress({ step: 'feed_posts', status: 'done', message: `נוצרו ${count} פוסטים`, count });
  return count;
}

// ── Step 8: Fix community groups ─────────────────────────────────────────────

async function step8_fixCommunityGroups(progress: ProgressFn): Promise<number> {
  progress({ step: 'community_groups', status: 'running', message: 'מעדכן קבוצות קהילה…' });

  const writes: Array<(b: WriteBatch) => void> = [];

  for (const g of COMMUNITY_GROUPS_TO_FIX) {
    writes.push((b) =>
      b.update(doc(db, 'community_groups', g.id), {
        activityType: g.activityType,
        updatedAt: serverTimestamp(),
      }),
    );
  }

  // Attendance subcollection doc on the first group.
  const attendanceTarget = COMMUNITY_GROUPS_TO_FIX.find((g) => g.addAttendance)!;
  const dateStr = nextTuesdayString();
  const attendanceId = `${MOCK_PREFIX}${dateStr}_18-00`;
  writes.push((b) =>
    b.set(doc(db, 'community_groups', attendanceTarget.id, 'attendance', attendanceId), {
      groupId: attendanceTarget.id,
      currentCount: 8,
      date: dateStr,
      time: '18:00',
      attendees: [],
      attendeeProfiles: [],
      createdAt: serverTimestamp(),
    }),
  );

  await commitBatched(writes);
  progress({
    step: 'community_groups',
    status: 'done',
    message: `עודכנו ${COMMUNITY_GROUPS_TO_FIX.length} קבוצות + נוכחות`,
    count: COMMUNITY_GROUPS_TO_FIX.length + 1,
  });
  return COMMUNITY_GROUPS_TO_FIX.length + 1;
}

// ── Step 9: Manager notifications (3 docs) ───────────────────────────────────

async function step9_managerNotifications(progress: ProgressFn, currentAuthorityId: string): Promise<number> {
  progress({ step: 'manager_notifications', status: 'running', message: 'יוצר התראות מנהל…' });

  const notifications: Array<{ title: string; message: string; savings: number }> = [
    {
      title: '20 תושבים עמדו ביעד WHO השבוע! 🎉',
      message: 'שדרות מובילה באזור עם 33% מהתושבים פעילים',
      savings: 10000,
    },
    {
      title: '60 משתמשים פעילים בעיר',
      message: 'שדרות מציגה צמיחה משמעותית בשימוש באפליקציה',
      savings: 8500,
    },
    {
      title: '120 ביקורים בפארקים השבוע',
      message: 'שלושת הפארקים המובילים בשדרות זוכים לעלייה משמעותית בשימוש',
      savings: 6200,
    },
  ];

  const writes: Array<(b: WriteBatch) => void> = [];
  notifications.forEach((n, i) => {
    const id = `${MOCK_PREFIX}notif-${pad3(i + 1)}`;
    writes.push((b) =>
      b.set(doc(db, 'manager_notifications', id), {
        authorityId: currentAuthorityId,
        type: 'health_milestone',
        title: n.title,
        message: n.message,
        savingsAmount: n.savings,
        createdAt: serverTimestamp(),
        isRead: false,
        actionTaken: false,
      }),
    );
  });

  await commitBatched(writes);
  progress({ step: 'manager_notifications', status: 'done', message: `נוצרו 3 התראות`, count: 3 });
  return 3;
}

// ── Step 10: Update route analytics (mock usage on official_routes) ──────────

/**
 * Tier-based mock analytics applied to every Sderot `official_routes` doc.
 * Top 3 (by docId order) get the heaviest usage, the next 4 are mid-tier,
 * everything else gets a light/cold tier. Re-running the seed simply
 * overwrites the previous values with fresh randoms in the same tier.
 */
async function step10_updateRouteAnalytics(progress: ProgressFn, currentAuthorityId: string): Promise<number> {
  progress({ step: 'route_analytics', status: 'running', message: 'מעדכן נתוני שימוש למסלולים…' });

  const snap = await getDocs(
    query(
      collection(db, 'official_routes'),
      where('authorityId', '==', currentAuthorityId),
      orderBy('__name__'),
    ),
  );

  if (snap.empty) {
    progress({
      step: 'route_analytics',
      status: 'done',
      message: 'אין מסלולים רשמיים לשדרות לעדכון',
      count: 0,
    });
    return 0;
  }

  const writes: Array<(b: WriteBatch) => void> = [];

  snap.docs.forEach((d, idx) => {
    let usageCount: number;
    let lastUsed: Date;
    let rating: number;
    let heatMapScore: number;

    if (idx < 3) {
      // Top tier
      usageCount = randInt(40, 85);
      lastUsed = dateDaysAgo(1, 3);
      rating = 4.5;
      heatMapScore = 0.8;
    } else if (idx < 7) {
      // Mid tier
      usageCount = randInt(15, 35);
      lastUsed = dateDaysAgo(3, 7);
      rating = 4.2;
      heatMapScore = 0.5;
    } else {
      // Cold tier
      usageCount = randInt(2, 12);
      lastUsed = dateDaysAgo(7, 30);
      rating = 3.8;
      heatMapScore = 0.2;
    }

    writes.push((b) =>
      b.update(d.ref, {
        analytics: {
          usageCount,
          lastUsed: Timestamp.fromDate(lastUsed),
          rating,
          heatMapScore,
        },
      }),
    );
  });

  await commitBatched(writes);

  progress({
    step: 'route_analytics',
    status: 'done',
    message: `עודכנו נתוני שימוש ל-${snap.size} מסלולים`,
    count: snap.size,
  });
  return snap.size;
}

// ── Main runner ──────────────────────────────────────────────────────────────

export async function runSderotDemoSeed(progress: ProgressFn, currentAuthorityId: string): Promise<SeedResult> {
  const counts: Record<string, number> = {};
  const errors: string[] = [];

  try {
    counts['cleanup_legacy'] = await step1_cleanupOld(progress);
    const users = await step2_createUsers(progress, currentAuthorityId);
    counts['users'] = users.length;

    counts['workouts'] = await step3_createWorkouts(users, progress);

    const presenceUsers = await step4_createPresence(users, progress, currentAuthorityId);
    counts['presence'] = presenceUsers.length;

    counts['active_workouts'] = await step5_createActiveWorkouts(presenceUsers, progress, currentAuthorityId);
    counts['sessions'] = await step6_createSessions(users, progress, currentAuthorityId);
    counts['feed_posts'] = await step7_createFeedPosts(users, progress, currentAuthorityId);
    counts['community_groups'] = await step8_fixCommunityGroups(progress);
    counts['manager_notifications'] = await step9_managerNotifications(progress, currentAuthorityId);
    counts['route_analytics'] = await step10_updateRouteAnalytics(progress, currentAuthorityId);

    return { success: true, counts, errors };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    errors.push(message);
    return { success: false, counts, errors };
  }
}

// ── Cleanup runner ───────────────────────────────────────────────────────────

export async function cleanSderotMockData(progress: ProgressFn, currentAuthorityId: string): Promise<CleanResult> {
  const deleted: Record<string, number> = {};
  const errors: string[] = [];

  const safeDelete = async (
    label: string,
    fn: () => Promise<number>,
  ): Promise<void> => {
    try {
      progress({ step: 'cleanup', status: 'running', message: `מנקה ${label}…` });
      const n = await fn();
      deleted[label] = n;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      errors.push(`${label}: ${message}`);
    }
  };

  // 1. Users (legacy + new)
  await safeDelete('users', async () => {
    let n = 0;
    await deleteByDocIdPrefix('users', LEGACY_USER_PREFIX, (k) => (n += k));
    await deleteByDocIdPrefix('users', MOCK_PREFIX, (k) => (n += k));
    return n;
  });

  // 2. Workouts
  await safeDelete('workouts', async () => {
    let n = 0;
    await deleteByFieldPrefix('workouts', 'userId', LEGACY_USER_PREFIX, (k) => (n += k));
    await deleteByFieldPrefix('workouts', 'userId', MOCK_PREFIX, (k) => (n += k));
    return n;
  });

  // 3. Presence
  await safeDelete('presence', async () => {
    let n = 0;
    await deleteByDocIdPrefix('presence', LEGACY_USER_PREFIX, (k) => (n += k));
    await deleteByDocIdPrefix('presence', LEGACY_PRESENCE_PREFIX, (k) => (n += k));
    await deleteByDocIdPrefix('presence', MOCK_PREFIX, (k) => (n += k));
    return n;
  });

  // 4. Active workouts
  await safeDelete('active_workouts', async () => {
    let n = 0;
    await deleteByDocIdPrefix('active_workouts', MOCK_PREFIX, (k) => (n += k));
    return n;
  });

  // 5. Sessions
  await safeDelete('sessions', async () => {
    let n = 0;
    await deleteByFieldPrefix('sessions', 'userId', MOCK_PREFIX, (k) => (n += k));
    return n;
  });

  // 6. Feed posts
  await safeDelete('feed_posts', async () => {
    let n = 0;
    await deleteByFieldPrefix('feed_posts', 'authorUid', LEGACY_USER_PREFIX, (k) => (n += k));
    await deleteByFieldPrefix('feed_posts', 'authorUid', MOCK_PREFIX, (k) => (n += k));
    return n;
  });

  // 7. Manager notifications
  await safeDelete('manager_notifications', async () => {
    let n = 0;
    await deleteByDocIdPrefix('manager_notifications', MOCK_PREFIX, (k) => (n += k));
    return n;
  });

  // 8. Community groups: remove activityType + delete attendance subdoc.
  await safeDelete('community_groups', async () => {
    const writes: Array<(b: WriteBatch) => void> = [];
    for (const g of COMMUNITY_GROUPS_TO_FIX) {
      writes.push((b) =>
        b.update(doc(db, 'community_groups', g.id), {
          activityType: deleteField(),
          updatedAt: serverTimestamp(),
        }),
      );
    }
    // Delete any attendance docs we created (prefix `sderot-mock-`).
    const attendanceTarget = COMMUNITY_GROUPS_TO_FIX.find((g) => g.addAttendance)!;
    const attSnap = await getDocs(
      query(
        collection(db, 'community_groups', attendanceTarget.id, 'attendance'),
        where('__name__', '>=', MOCK_PREFIX),
        where('__name__', '<', MOCK_PREFIX + '\uf8ff'),
      ),
    );
    for (const d of attSnap.docs) {
      writes.push((b) => b.delete(d.ref));
    }
    await commitBatched(writes);
    return COMMUNITY_GROUPS_TO_FIX.length + attSnap.size;
  });

  // 9. Reset authority userCount.
  await safeDelete('authority_userCount_reset', async () => {
    const batch = writeBatch(db);
    batch.update(doc(db, 'authorities', currentAuthorityId), {
      userCount: 0,
      updatedAt: serverTimestamp(),
    });
    await batch.commit();
    return 1;
  });

  // 10. Reset analytics on every official route for this authority to a zero baseline.
  //     We re-write the full `analytics` object (rather than deleteField) so the
  //     schema remains consistent with the route-overlay/PopularRoutes consumers.
  await safeDelete('route_analytics_reset', async () => {
    const snap = await getDocs(
      query(
        collection(db, 'official_routes'),
        where('authorityId', '==', currentAuthorityId),
      ),
    );
    if (snap.empty) return 0;
    const writes = snap.docs.map((d) => (b: WriteBatch) =>
      b.update(d.ref, {
        analytics: {
          usageCount: 0,
          lastUsed: null,
          rating: 0,
          heatMapScore: 0,
        },
      }),
    );
    await commitBatched(writes);
    return snap.size;
  });

  progress({
    step: 'cleanup',
    status: 'done',
    message: 'ניקוי הושלם',
  });

  return { success: errors.length === 0, deleted, errors };
}
