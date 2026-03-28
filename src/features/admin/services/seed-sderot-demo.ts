/**
 * Sderot Municipality Demo Seed
 *
 * Populates Firestore with a full high-fidelity demo dataset:
 *  - Sderot city authority (coordinates + logo)
 *  - 14 neighborhood child authorities
 *  - 150 fake users distributed across neighborhoods
 *  - 500+ workout logs (6 months of history)
 *  - 4 parks with neighborhood assignments
 *  - 3 routes (including "המסלול הירוק - נאות השקמה")
 *  - 2 community groups + 2 official events (with registrations)
 *  - demo-sderot@outrun.co.il (city admin)
 *  - coordinator-shikma@outrun.co.il (neighborhood coordinator for נאות השקמה only)
 */

import {
  collection,
  doc,
  addDoc,
  setDoc,
  updateDoc,
  arrayUnion,
  getDocs,
  query,
  where,
  serverTimestamp,
  Timestamp,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { createAuthority, getChildrenByParent, syncUserCount } from './authority.service';

// ── Constants ────────────────────────────────────────────────────────────────

const SDEROT_LOGO =
  'https://upload.wikimedia.org/wikipedia/he/thumb/1/1a/Sderot_Logo.svg/1200px-Sderot_Logo.svg.png';
const SDEROT_COORDS = { lat: 31.525, lng: 34.5955 };

const NEIGHBORHOOD_DEFS = [
  { localId: 'sderot-naot-hanasi',  name: 'נאות הנשיא (הוורד)',      offset: { dlat: 0.005,  dlng: 0.003  } },
  { localId: 'sderot-naot-aviv',    name: 'נאות אביב (ניר עם)',      offset: { dlat: -0.003, dlng: 0.006  } },
  { localId: 'sderot-kalaniyot',    name: 'שכונת הכלניות',           offset: { dlat: 0.007,  dlng: -0.002 } },
  { localId: 'sderot-naot-neviim',  name: 'נאות הנביאים',            offset: { dlat: -0.005, dlng: -0.004 } },
  { localId: 'sderot-naot-rabin',   name: "נאות רבין (מ'3)",        offset: { dlat: 0.002,  dlng: -0.007 } },
  { localId: 'sderot-achuzah',      name: 'שכונת האחוזה',            offset: { dlat: -0.007, dlng: 0.001  } },
  { localId: 'sderot-naot-shikma',  name: 'נאות השקמה',              offset: { dlat: 0.009,  dlng: 0.005  } },
  { localId: 'sderot-musica',       name: 'שכונת המוזיקה',           offset: { dlat: -0.001, dlng: -0.009 } },
  { localId: 'sderot-naot-eshkol',  name: 'נאות אשכול',              offset: { dlat: 0.004,  dlng: 0.009  } },
  { localId: 'sderot-naot-dekel',   name: 'נאות הדקל',               offset: { dlat: -0.008, dlng: -0.006 } },
  { localId: 'sderot-meysadim',     name: 'שכונת המייסדים',          offset: { dlat: 0.006,  dlng: -0.005 } },
  { localId: 'sderot-bapark',       name: 'שכונת שדרות בפארק',       offset: { dlat: -0.004, dlng: 0.008  } },
  { localId: 'sderot-bostanaim',    name: 'שכונת הבוסתנים',          offset: { dlat: 0.010,  dlng: -0.003 } },
  { localId: 'sderot-bengurion',    name: 'בן גוריון (קסדור)',        offset: { dlat: -0.009, dlng: 0.004  } },
];

// Hebrew first names split by gender for realistic demographics
const FEMALE_NAMES = [
  'מיכל', 'שרה', 'רחל', 'לאה', 'דינה', 'אביגיל', 'יעל', 'נועה', 'ליאת', 'רונית',
  'עדי', 'שירה', 'הדר', 'אריאלה', 'גלית', 'ורד', 'טל', 'ענת', 'אורית', 'חוה',
  'נילי', 'דפנה', 'יונית', 'כרמית', 'לימור', 'מורן', 'נגה', 'ספיר', 'עינב', 'פנינה',
  'צילה', 'קרן', 'ריקי', 'שושנה', 'תמר', 'אביבה', 'בתיה', 'גאולה', 'דבורה', 'הילה',
  'ורדית', 'זהבה', 'חיה', 'טובה', 'יפה', 'כוכבית', 'לובה', 'מאיה', 'נאוה', 'סיגל',
];
const MALE_NAMES = [
  'דוד', 'משה', 'יוסף', 'אבי', 'שלמה', 'יוחנן', 'מנחם', 'ברוך', 'נתן', 'אריה',
  'גדעון', 'זאב', 'חיים', 'טוביה', 'יצחק', 'כלב', 'לוי', 'מרדכי', 'נחום', 'עמי',
  'פנחס', 'צבי', 'ראובן', 'שמעון', 'תמיר', 'אלי', 'בן', 'גל', 'דן', 'הרצל',
];
const LAST_NAMES = [
  'כהן', 'לוי', 'מזרחי', 'פרץ', 'ביטון', 'אברהם', 'דהן', 'אוחיון', 'שמש', 'אלמליח',
  'בן-דוד', 'חדד', 'גבאי', 'ממן', 'ספיר', 'עמר', 'פרידמן', 'גולן', 'שפירא', 'רוזן',
];

// ── Helpers ──────────────────────────────────────────────────────────────────

function randInt(min: number, max: number) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}
function randItem<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}
function randDate(daysAgoMax: number, daysAgoMin = 0): Date {
  const d = new Date();
  d.setDate(d.getDate() - randInt(daysAgoMin, daysAgoMax));
  d.setHours(randInt(5, 22), randInt(0, 59), 0, 0);
  return d;
}

// ── Phase 1: Sderot City + Neighborhoods ─────────────────────────────────────

async function upsertSderotCity(): Promise<string> {
  // Find existing Sderot doc
  const q = query(collection(db, 'authorities'), where('name', '==', 'שדרות'));
  const snap = await getDocs(q);

  if (!snap.empty) {
    const cityId = snap.docs[0].id;
    await updateDoc(doc(db, 'authorities', cityId), {
      coordinates: SDEROT_COORDS,
      logoUrl: SDEROT_LOGO,
      isActiveClient: true,
      pipelineStatus: 'active',
      status: 'active',
      updatedAt: serverTimestamp(),
    });
    console.log('[SderotSeed] Updated existing Sderot city:', cityId);
    return cityId;
  }

  const cityId = await createAuthority({
    name: 'שדרות',
    type: 'city',
    parentAuthorityId: undefined,
    logoUrl: SDEROT_LOGO,
    managerIds: [],
    userCount: 0,
    status: 'active',
    isActiveClient: true,
    coordinates: SDEROT_COORDS,
    contacts: [],
    pipelineStatus: 'active',
    activityLog: [],
    tasks: [],
  });
  console.log('[SderotSeed] Created Sderot city:', cityId);
  return cityId;
}

async function seedNeighborhoods(cityId: string): Promise<Record<string, string>> {
  // Check existing children
  const existing = await getChildrenByParent(cityId);
  const existingByName = new Map(existing.map(a => [a.name, a.id]));

  const neighborhoodIds: Record<string, string> = {};

  for (const nd of NEIGHBORHOOD_DEFS) {
    if (existingByName.has(nd.name)) {
      neighborhoodIds[nd.localId] = existingByName.get(nd.name)!;
      console.log('[SderotSeed] Neighborhood already exists:', nd.name);
      continue;
    }
    const coords = {
      lat: SDEROT_COORDS.lat + nd.offset.dlat,
      lng: SDEROT_COORDS.lng + nd.offset.dlng,
    };
    const nId = await createAuthority({
      name: nd.name,
      type: 'neighborhood',
      parentAuthorityId: cityId,
      logoUrl: undefined,
      managerIds: [],
      userCount: 0,
      status: 'active',
      isActiveClient: false,
      coordinates: coords,
      contacts: [],
      pipelineStatus: 'lead',
      activityLog: [],
      tasks: [],
    });
    neighborhoodIds[nd.localId] = nId;
    console.log('[SderotSeed] Created neighborhood:', nd.name, nId);
  }
  return neighborhoodIds;
}

// ── Phase 2a: Fake Users ─────────────────────────────────────────────────────

async function seedUsers(
  neighborhoodIds: Record<string, string>
): Promise<string[]> {
  const neighborhoodList = Object.values(neighborhoodIds);
  const userIds: string[] = [];
  const TOTAL = 150;

  // 60% female (ages 35-55), 40% male (ages 20-65)
  for (let i = 0; i < TOTAL; i++) {
    const isFemale = i < Math.floor(TOTAL * 0.6);
    const gender = isFemale ? 'female' : 'male';
    const firstName = isFemale ? randItem(FEMALE_NAMES) : randItem(MALE_NAMES);
    const lastName = randItem(LAST_NAMES);
    const name = `${firstName} ${lastName}`;
    const authorityId = randItem(neighborhoodList);

    // Female bias: ages 35-55; male: 20-65
    const ageMin = isFemale ? 35 : 20;
    const ageMax = isFemale ? 55 : 65;
    const age = randInt(ageMin, ageMax);
    const birthYear = new Date().getFullYear() - age;
    const birthDate = Timestamp.fromDate(new Date(birthYear, randInt(0, 11), randInt(1, 28)));

    // Join date spread over last 6 months
    const joinDate = Timestamp.fromDate(randDate(180));

    const trainingTimes = ['06:00', '07:00', '08:00', '16:00', '17:00', '18:00', '19:00', '20:00'];
    const interests = isFemale
      ? randItem([['walking', 'health'], ['yoga', 'walking'], ['walking'], ['health', 'walking', 'running']])
      : randItem([['running', 'strength'], ['calisthenics'], ['running'], ['cycling', 'running']]);

    const uid = `sderot-demo-user-${String(i).padStart(3, '0')}`;

    await setDoc(doc(db, 'users', uid), {
      core: {
        name,
        email: `${uid}@sderot-demo.local`,
        authorityId,
        gender,
        birthDate,
        isApproved: false,
        isSuperAdmin: false,
        joinDate,
        onboardingStatus: 'COMPLETED',
        accessLevel: 'free',
        loginCount: randInt(1, 40),
        lastLoginAt: Timestamp.fromDate(randDate(30)),
      },
      lifestyle: {
        trainingTime: randItem(trainingTimes),
        interests,
        fitnessLevel: randItem(['beginner', 'intermediate', 'advanced']),
      },
      createdAt: joinDate,
      updatedAt: serverTimestamp(),
    });
    userIds.push(uid);
  }

  console.log('[SderotSeed] Seeded', userIds.length, 'users');
  return userIds;
}

// ── Phase 2b: Workout Logs (500+) ────────────────────────────────────────────

async function seedWorkouts(userIds: string[]): Promise<void> {
  let count = 0;
  const activityTypes = ['strength', 'walking', 'running'];

  // Phase A: historical workouts (4-6 per user, spread over last 2-180 days)
  for (const userId of userIds) {
    const workoutCount = randInt(4, 6);
    for (let w = 0; w < workoutCount; w++) {
      const workoutDate = randDate(180, 2); // 2-180 days ago
      const duration = randInt(1800, 5400);
      const activityType = randItem(activityTypes);

      await addDoc(collection(db, 'workouts'), {
        userId,
        date: Timestamp.fromDate(workoutDate),
        duration,
        activityType,
        workoutType: activityType === 'strength' ? 'strength' : activityType,
        setsCompleted: randInt(6, 24),
        setsPlanned: 20,
        calories: Math.round(duration / 60 * randInt(5, 9)),
        createdAt: Timestamp.fromDate(workoutDate),
      });
      count++;
    }
  }

  // Phase B: guaranteed recent activity — 40 users had a workout TODAY (ensures DAU > 0)
  const todayUsers = userIds.slice(0, 40);
  const now = new Date();
  for (const userId of todayUsers) {
    const todayDate = new Date(now);
    todayDate.setHours(randInt(6, 21), randInt(0, 59), 0, 0);
    const duration = randInt(1800, 3600);
    const activityType = randItem(activityTypes);

    await addDoc(collection(db, 'workouts'), {
      userId,
      date: Timestamp.fromDate(todayDate),
      duration,
      activityType,
      workoutType: activityType === 'strength' ? 'strength' : activityType,
      setsCompleted: randInt(6, 20),
      setsPlanned: 20,
      calories: Math.round(duration / 60 * randInt(5, 9)),
      createdAt: Timestamp.fromDate(todayDate),
    });
    count++;
  }

  // Phase C: 80 users had a workout this month (ensures strong MAU)
  const thisMonthUsers = userIds.slice(0, 80);
  for (const userId of thisMonthUsers) {
    const daysAgoThisMonth = randInt(1, 20); // within last 20 days = same calendar month
    const monthDate = randDate(daysAgoThisMonth, daysAgoThisMonth);
    const duration = randInt(1800, 4200);
    const activityType = randItem(activityTypes);

    await addDoc(collection(db, 'workouts'), {
      userId,
      date: Timestamp.fromDate(monthDate),
      duration,
      activityType,
      workoutType: activityType === 'strength' ? 'strength' : activityType,
      setsCompleted: randInt(6, 20),
      setsPlanned: 20,
      calories: Math.round(duration / 60 * randInt(5, 9)),
      createdAt: Timestamp.fromDate(monthDate),
    });
    count++;
  }

  console.log('[SderotSeed] Seeded', count, 'workout logs');
}

// ── Phase 2c: Parks ──────────────────────────────────────────────────────────

async function seedParks(
  cityId: string,
  neighborhoodIds: Record<string, string>
): Promise<void> {
  const parksData = [
    {
      name: 'פארק הבריאות - נאות השקמה',
      description: 'פארק כושר פתוח הממוקם בלב שכונת נאות השקמה, עם מכשירי כושר מתקדמים ומסלול הליכה מוגן.',
      authorityId: neighborhoodIds['sderot-naot-shikma'],
      location: { lat: SDEROT_COORDS.lat + 0.009, lng: SDEROT_COORDS.lng + 0.005 },
      featureTags: ['night_lighting', 'safe_zone', 'wheelchair_accessible'],
    },
    {
      name: 'גן הספורט - נאות הנביאים',
      description: 'מתקן ספורט קהילתי מרכזי עם מגרשי כדורסל ואזור כושר חיצוני.',
      authorityId: neighborhoodIds['sderot-naot-neviim'],
      location: { lat: SDEROT_COORDS.lat - 0.005, lng: SDEROT_COORDS.lng - 0.004 },
      featureTags: ['shaded'],
    },
    {
      name: 'מרכז ספורט - שדרות בפארק',
      description: 'פארק ספורט נרחב הכולל שבילי ריצה, ציוד כושר ואזורי ישיבה מוצלים.',
      authorityId: neighborhoodIds['sderot-bapark'],
      location: { lat: SDEROT_COORDS.lat - 0.004, lng: SDEROT_COORDS.lng + 0.008 },
      featureTags: ['night_lighting', 'shaded'],
    },
    {
      name: 'פינת הכושר - נאות אביב',
      description: 'פינת כושר שכונתית קטנה ונעימה לאימונים בוקר וערב.',
      authorityId: neighborhoodIds['sderot-naot-aviv'],
      location: { lat: SDEROT_COORDS.lat - 0.003, lng: SDEROT_COORDS.lng + 0.006 },
      featureTags: ['night_lighting'],
    },
  ];

  for (const park of parksData) {
    await addDoc(collection(db, 'parks'), {
      name: park.name,
      description: park.description,
      city: 'שדרות',
      authorityId: park.authorityId,
      location: park.location,
      facilityType: 'gym_park',
      sportTypes: ['fitness', 'walking'],
      featureTags: park.featureTags,
      gymEquipment: [],
      facilities: [],
      amenities: null,
      image: null,
      hasWaterFountain: true,
      isDogFriendly: false,
      status: 'open',
      contentStatus: 'published',
      published: true,
      publishedAt: serverTimestamp(),
      isVerified: true,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  }
  console.log('[SderotSeed] Seeded', parksData.length, 'parks');
}

// ── Phase 2d: Routes ─────────────────────────────────────────────────────────

async function seedRoutes(
  cityId: string,
  neighborhoodIds: Record<string, string>
): Promise<void> {
  const routes = [
    {
      name: 'המסלול הירוק - נאות השקמה',
      description:
        'מסלול הליכה ייחודי בשכונת נאות השקמה. מואר לאורך כל הדרך ומוגן עם מצלמות אבטחה. ' +
        'מתאים לכל הגילאים ובעיקר לנשים המעדיפות לצאת לאימון בשעות הערב. ' +
        'נקודת מפגש: פארק הבריאות, כניסה ראשית, נאות השקמה. ' +
        'שעות פעילות מומלצות: 06:00-09:00 ו-17:00-21:00.',
      authorityId: neighborhoodIds['sderot-naot-shikma'],
      distance: 3.2,
      estimatedTime: 40,
      difficulty: 'easy',
      tags: ['מואר', 'מוגן', 'שביל הליכה', 'מתאים למשפחות', 'בטוח', 'נגיש'],
      featureTags: ['lit', 'safe', 'accessible', 'family_friendly'],
      meetingPoints: [
        {
          name: 'כניסה ראשית - פארק הבריאות',
          location: { lat: SDEROT_COORDS.lat + 0.009, lng: SDEROT_COORDS.lng + 0.005 },
          description: 'נקודת ההתחלה והסיום של המסלול',
        },
        {
          name: 'עמדת המנוחה המרכזית',
          location: { lat: SDEROT_COORDS.lat + 0.010, lng: SDEROT_COORDS.lng + 0.0065 },
          description: 'ספסלים, שתייה ותאורה - נקודת מנוחה באמצע המסלול',
        },
      ],
      path: [
        { lat: SDEROT_COORDS.lat + 0.009,  lng: SDEROT_COORDS.lng + 0.005 },
        { lat: SDEROT_COORDS.lat + 0.010,  lng: SDEROT_COORDS.lng + 0.006 },
        { lat: SDEROT_COORDS.lat + 0.011,  lng: SDEROT_COORDS.lng + 0.007 },
        { lat: SDEROT_COORDS.lat + 0.010,  lng: SDEROT_COORDS.lng + 0.008 },
        { lat: SDEROT_COORDS.lat + 0.009,  lng: SDEROT_COORDS.lng + 0.007 },
      ],
    },
    {
      name: 'מסלול הבוקר - שדרות בפארק',
      description: 'מסלול ריצה קלה לאנשי בוקר. מתחיל בפארק ועובר דרך שבילי הצמחיה. אור שמש ונוף נפלא לאורך כל הדרך.',
      authorityId: neighborhoodIds['sderot-bapark'],
      distance: 4.5,
      estimatedTime: 55,
      difficulty: 'easy',
      tags: ['ריצה', 'שביל טבע', 'נוף'],
      featureTags: ['shaded', 'nature'],
      path: [
        { lat: SDEROT_COORDS.lat - 0.004, lng: SDEROT_COORDS.lng + 0.008 },
        { lat: SDEROT_COORDS.lat - 0.005, lng: SDEROT_COORDS.lng + 0.009 },
        { lat: SDEROT_COORDS.lat - 0.006, lng: SDEROT_COORDS.lng + 0.010 },
        { lat: SDEROT_COORDS.lat - 0.005, lng: SDEROT_COORDS.lng + 0.011 },
        { lat: SDEROT_COORDS.lat - 0.004, lng: SDEROT_COORDS.lng + 0.010 },
      ],
    },
    {
      name: 'מסלול העיר - שדרות מרכז',
      description: 'מסלול הליכה עירוני המחבר בין שכונות שדרות דרך מרכז העיר. מתאים לכל אחד בכל שעה.',
      authorityId: cityId,
      distance: 5.1,
      estimatedTime: 65,
      difficulty: 'moderate',
      tags: ['הליכה עירונית', 'כל הגילאים'],
      featureTags: ['lit', 'urban'],
      path: [
        { lat: SDEROT_COORDS.lat, lng: SDEROT_COORDS.lng },
        { lat: SDEROT_COORDS.lat + 0.003, lng: SDEROT_COORDS.lng + 0.003 },
        { lat: SDEROT_COORDS.lat + 0.005, lng: SDEROT_COORDS.lng },
        { lat: SDEROT_COORDS.lat + 0.003, lng: SDEROT_COORDS.lng - 0.003 },
        { lat: SDEROT_COORDS.lat, lng: SDEROT_COORDS.lng - 0.002 },
      ],
    },
  ];

  for (const route of routes) {
    await addDoc(collection(db, 'official_routes'), {
      name: route.name,
      description: route.description,
      authorityId: route.authorityId,
      city: 'שדרות',
      distance: route.distance,
      estimatedTime: route.estimatedTime,
      difficulty: route.difficulty,
      tags: route.tags,
      featureTags: route.featureTags,
      // Correct field name: 'path' (not 'routePath'), format: {lng, lat}[]
      path: route.path.map((p: { lat: number; lng: number }) => ({ lng: p.lng, lat: p.lat })),
      meetingPoints: (route as any).meetingPoints ?? [],
      activityType: 'walking',
      type: 'walking',
      // Approval workflow fields
      status: 'published',
      published: true,
      // Batch tracking so routes appear in Admin Imports tab
      importBatchId: 'sderot-seed-v1',
      importSourceName: 'Sderot Demo Seed',
      isInfrastructure: false,
      source: { type: 'system', name: 'Sderot Demo Seed' },
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  }
  console.log('[SderotSeed] Seeded', routes.length, 'routes');
}

// ── Phase 2e: Community ──────────────────────────────────────────────────────

async function seedCommunity(
  cityId: string,
  neighborhoodIds: Record<string, string>,
  userIds: string[],
): Promise<void> {
  // Group 1: Walking group in Neot Shikma
  await addDoc(collection(db, 'community_groups'), {
    authorityId: cityId,
    name: 'קבוצת הליכה - נאות השקמה',
    description: 'קבוצת הליכה שכונתית לנשים ובני משפחה. יוצאים ביחד פעמיים בשבוע למסלול הירוק.',
    category: 'walking',
    schedule: [
      { dayOfWeek: 2, time: '18:00', frequency: 'weekly' },
      { dayOfWeek: 5, time: '07:30', frequency: 'weekly' },
    ],
    meetingLocation: {
      address: 'כניסה לפארק הבריאות, נאות השקמה, שדרות',
      location: { lat: SDEROT_COORDS.lat + 0.009, lng: SDEROT_COORDS.lng + 0.005 },
    },
    maxParticipants: 30,
    currentParticipants: randInt(8, 22),
    memberCount: randInt(8, 22),
    isActive: true,
    isPublic: true,
    groupType: 'neighborhood',
    scopeId: neighborhoodIds['sderot-naot-shikma'],
    ageRestriction: 'all',
    createdBy: 'coordinator-shikma-demo-uid',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  // Group 2: Morning sport group city-wide
  await addDoc(collection(db, 'community_groups'), {
    authorityId: cityId,
    name: 'ספורט בוקר שדרות',
    description: 'קבוצת ספורט בוקר עירונית עם מפגשים בפארקים שונים ברחבי שדרות.',
    category: 'other',
    schedule: [
      { dayOfWeek: 0, time: '07:00', frequency: 'weekly' },
      { dayOfWeek: 3, time: '07:00', frequency: 'weekly' },
    ],
    meetingLocation: {
      address: 'פארק מרכז שדרות',
      location: SDEROT_COORDS,
    },
    maxParticipants: 50,
    currentParticipants: randInt(15, 35),
    memberCount: randInt(15, 35),
    isActive: true,
    isPublic: true,
    groupType: 'neighborhood',
    scopeId: cityId,
    ageRestriction: 'all',
    createdBy: 'demo-sderot-uid',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  // ── Official Events with registrations subcollection ────────────────────────

  const fakeNames = [...FEMALE_NAMES, ...MALE_NAMES];

  // Official Event 1: City Sports Day
  const event1Date = new Date();
  event1Date.setDate(event1Date.getDate() + 14);
  event1Date.setHours(9, 0, 0, 0);

  const event1Ref = await addDoc(collection(db, 'community_events'), {
    authorityId: cityId,
    name: 'יום ספורט לכל - שדרות 2026',
    description: 'אירוע ספורט קהילתי עירוני הפתוח לכל תושבי שדרות. פעילויות לכל הגילאים, מוזיקה ואוירה חגיגית.',
    category: 'fitness_day',
    date: Timestamp.fromDate(event1Date),
    startTime: '09:00',
    endTime: '14:00',
    location: {
      address: 'פארק מרכזי שדרות',
      location: SDEROT_COORDS,
    },
    registrationRequired: true,
    maxParticipants: 500,
    currentRegistrations: 0,
    isActive: true,
    ageRestriction: 'all',
    isOfficial: true,
    authorityLogoUrl: SDEROT_LOGO,
    createdBy: 'demo-sderot-uid',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  // Official Event 2: Night Run
  const event2Date = new Date();
  event2Date.setDate(event2Date.getDate() + 21);
  event2Date.setHours(20, 0, 0, 0);

  const event2Ref = await addDoc(collection(db, 'community_events'), {
    authorityId: cityId,
    name: 'ריצת ערב קהילתית - שדרות בלילה',
    description: 'ריצת ערב מוארת לכל הרמות. מסלול של 5 ק"מ דרך רחובות שדרות עם תאורה מלאה ואבטחה.',
    category: 'race',
    date: Timestamp.fromDate(event2Date),
    startTime: '20:00',
    endTime: '22:00',
    location: {
      address: 'כיכר העיר, שדרות',
      location: { lat: SDEROT_COORDS.lat + 0.002, lng: SDEROT_COORDS.lng - 0.001 },
    },
    registrationRequired: true,
    maxParticipants: 200,
    currentRegistrations: 0,
    isActive: true,
    ageRestriction: 'all',
    isOfficial: true,
    authorityLogoUrl: SDEROT_LOGO,
    createdBy: 'demo-sderot-uid',
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  // Seed fake registrations for both official events
  const event1Attendees = userIds.slice(0, randInt(25, 45));
  const event2Attendees = userIds.slice(10, 10 + randInt(15, 30));

  const eventEntries: [typeof event1Ref, string[], string][] = [
    [event1Ref, event1Attendees, 'יום ספורט לכל - שדרות 2026'],
    [event2Ref, event2Attendees, 'ריצת ערב קהילתית - שדרות בלילה'],
  ];

  for (const [eventRef, attendees, eventName] of eventEntries) {
    const participantNames: Record<string, string> = {};

    for (const uid of attendees) {
      const fakeName = randItem(fakeNames) + ' ' + randItem(['כהן', 'לוי', 'דהן', 'מזרחי', 'ביטון', 'אזולאי', 'פרץ', 'אברהם', 'חדד', 'עמר']);
      participantNames[uid] = fakeName;
      await setDoc(doc(db, 'community_events', eventRef.id, 'registrations', uid), {
        uid,
        name: fakeName,
        photoURL: null,
        joinedAt: Timestamp.fromDate(randDate(10, 1)),
      });
    }

    await updateDoc(doc(db, 'community_events', eventRef.id), {
      currentRegistrations: attendees.length,
    });

    // Pre-create the event's group chat thread with all attendees
    const chatId = `group_${eventRef.id}`;
    await setDoc(doc(db, 'chats', chatId), {
      participants: attendees,
      participantNames,
      lastMessage: `${Object.values(participantNames)[0] ?? 'משתמש'} הצטרף/ה לאירוע`,
      lastMessageAt: serverTimestamp(),
      lastSenderId: attendees[0] ?? '',
      unreadCount: {},
      createdAt: serverTimestamp(),
      type: 'group',
      groupId: eventRef.id,
      groupName: eventName,
    });
  }

  console.log('[SderotSeed] Seeded 2 groups + 2 official events + registrations + chats');
}

// ── Phase 2f: Manager Accounts ───────────────────────────────────────────────

async function seedManagerAccounts(
  cityId: string,
  neighborhoodIds: Record<string, string>
): Promise<void> {
  const shikmaId = neighborhoodIds['sderot-naot-shikma'];

  // City Admin
  const cityAdminUid = 'demo-sderot-uid';
  await setDoc(doc(db, 'users', cityAdminUid), {
    core: {
      name: 'מנהל שדרות (דמו)',
      email: 'demo-sderot@outrun.co.il',
      authorityId: cityId,
      isApproved: true,
      isSuperAdmin: false,
      onboardingStatus: 'COMPLETED',
      joinDate: Timestamp.fromDate(new Date()),
      loginCount: 1,
    },
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  }, { merge: true });

  // Add to city managerIds
  await updateDoc(doc(db, 'authorities', cityId), {
    managerIds: arrayUnion(cityAdminUid),
    updatedAt: serverTimestamp(),
  });

  // Neighborhood Coordinator (only linked to Neot Shikma)
  const coordUid = 'coordinator-shikma-demo-uid';
  await setDoc(doc(db, 'users', coordUid), {
    core: {
      name: 'רכז נאות השקמה (דמו)',
      email: 'coordinator-shikma@outrun.co.il',
      authorityId: shikmaId,
      isApproved: true,
      isSuperAdmin: false,
      onboardingStatus: 'COMPLETED',
      joinDate: Timestamp.fromDate(new Date()),
      loginCount: 1,
    },
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  }, { merge: true });

  await updateDoc(doc(db, 'authorities', shikmaId), {
    managerIds: arrayUnion(coordUid),
    updatedAt: serverTimestamp(),
  });

  console.log('[SderotSeed] Manager accounts created/updated');
}

// ── Phase 2g: Sync User Counts ────────────────────────────────────────────────

async function syncAllCounts(
  cityId: string,
  neighborhoodIds: Record<string, string>
): Promise<void> {
  for (const nId of Object.values(neighborhoodIds)) {
    await syncUserCount(nId);
  }
  // City-level count = users in city itself + all neighborhoods (matches rollup query)
  const allIds = [cityId, ...Object.values(neighborhoodIds)];
  let total = 0;
  for (const id of allIds) {
    const q = query(collection(db, 'users'), where('core.authorityId', '==', id));
    const s = await getDocs(q);
    total += s.size;
  }
  await updateDoc(doc(db, 'authorities', cityId), {
    userCount: total,
    updatedAt: serverTimestamp(),
  });
  console.log('[SderotSeed] Synced user counts. City total:', total);
}

// ── Enrichment: assign Personas, Entry Routes, Running profiles to demo users ─

const PERSONA_DEFS = [
  { id: 'mothers',          label: 'אמהות פעילות' },
  { id: 'seniors',          label: 'גיל הזהב' },
  { id: 'soldiers',         label: 'חיילים/משוחררים' },
  { id: 'students',         label: 'סטודנטים' },
  { id: 'runners',          label: 'רצים' },
  { id: 'gym_goers',        label: 'מתאמנים בחדר כושר' },
  { id: 'wellness_seekers', label: 'מחפשי בריאות' },
  { id: 'dog_walkers',      label: 'מטיילי כלבים' },
];

const TARGET_DISTANCES = ['3k', '5k', '10k', 'maintenance'] as const;

export async function enrichSderotUsers(): Promise<{ success: boolean; enriched: number }> {
  try {
    console.log('[EnrichUsers] Fetching Sderot demo users...');

    const snap = await getDocs(
      query(collection(db, 'users'), where('core.email', '>=', 'sderot-demo-user-'), where('core.email', '<', 'sderot-demo-user-z'))
    );
    const total = snap.size;
    console.log(`[EnrichUsers] Found ${total} demo users.`);
    let enriched = 0;

    for (const d of snap.docs) {
      const data = d.data();
      const core = (data.core ?? {}) as Record<string, unknown>;
      const lifestyle = (data.lifestyle ?? {}) as Record<string, unknown>;
      const gender = (core.gender as string) ?? 'other';
      const interests = (lifestyle.interests as string[]) ?? [];

      // ── Determine entry route based on gender + interests ──────────
      let onboardingPath: string;
      if (gender === 'male' && interests.includes('running')) {
        onboardingPath = 'RUNNING';
      } else if (gender === 'female' && !interests.includes('running') && !interests.includes('strength') && Math.random() < 0.35) {
        onboardingPath = 'MAP_ONLY';
      } else {
        onboardingPath = 'FULL_PROGRAM';
      }

      // ── Assign personas based on gender + interests ────────────────
      const personas: string[] = [];
      if (gender === 'female') {
        personas.push('mothers');
        if (interests.includes('yoga') || interests.includes('health')) personas.push('wellness_seekers');
        if (interests.includes('walking')) personas.push('dog_walkers');
      } else {
        if (interests.includes('running')) personas.push('runners');
        if (interests.includes('strength') || interests.includes('calisthenics')) personas.push('gym_goers');
        if (interests.includes('cycling')) personas.push('wellness_seekers');
      }
      // Age-based personas
      const birthDate = core.birthDate as Timestamp | undefined;
      if (birthDate) {
        const age = new Date().getFullYear() - birthDate.toDate().getFullYear();
        if (age >= 56) personas.push('seniors');
        if (age >= 18 && age <= 25) personas.push(Math.random() < 0.5 ? 'soldiers' : 'students');
      }
      if (personas.length === 0) personas.push('wellness_seekers');
      const personaId = personas[0];

      // ── Running profile (only for RUNNING entry-route users) ───────
      const runningPayload: Record<string, unknown> = {};
      if (onboardingPath === 'RUNNING') {
        const td = randItem([...TARGET_DISTANCES]);
        runningPayload['running'] = {
          isUnlocked: true,
          currentGoal: td === 'maintenance' ? 'maintain_fitness' : td === '3k' ? 'couch_to_5k' : td === '5k' ? 'improve_speed_5k' : 'improve_speed_10k',
          onboardingData: {
            targetDistance: td,
            weeklyFrequency: randItem([2, 3, 4]),
            runningHistoryMonths: randInt(0, 24),
            hasInjuries: Math.random() < 0.15,
            currentAbility: { canRunContinuous: true, continuousTimeMinutes: randInt(10, 45) },
          },
        };
      }

      // ── Build update payload (merge-safe, never overwrites) ────────
      const payload: Record<string, unknown> = {
        onboardingPath,
        personaId,
        onboardingAnswers: { persona: personaId, personas },
        ...runningPayload,
        updatedAt: serverTimestamp(),
      };

      await updateDoc(doc(db, 'users', d.id), payload);
      enriched++;
    }

    // ── Enrich workout docs with distance field ──────────────────────
    console.log('[EnrichUsers] Adding distance to running/walking workout docs...');
    const workoutSnap = await getDocs(collection(db, 'workouts'));
    let wEnriched = 0;

    const BATCH = 50;
    const wDocs = workoutSnap.docs;
    for (let i = 0; i < wDocs.length; i += BATCH) {
      const slice = wDocs.slice(i, i + BATCH);
      await Promise.all(slice.map(async (wd) => {
        const wData = wd.data();
        if (wData.distance !== undefined) return;
        const type = (wData.activityType ?? wData.workoutType ?? 'strength') as string;
        if (type !== 'running' && type !== 'walking') return;

        const durationSec = (wData.duration ?? 0) as number;
        const speedKmH = type === 'running' ? 9 : 5;
        const distance = Math.round((durationSec / 3600) * speedKmH * 10) / 10;

        await updateDoc(doc(db, 'workouts', wd.id), { distance });
        wEnriched++;
      }));
    }

    console.log(`[EnrichUsers] Done — ${enriched} users enriched, ${wEnriched} workouts got distance.`);
    return { success: true, enriched };
  } catch (error: unknown) {
    console.error('[EnrichUsers] Error:', error);
    return { success: false, enriched: 0 };
  }
}

// ── Enrichment: add hour + dayOfWeek to existing workout docs ────────────────

export async function enrichWorkoutMetadata(): Promise<{ success: boolean; enriched: number }> {
  try {
    console.log('[Enrich] Fetching all workout documents...');

    const snap = await getDocs(collection(db, 'workouts'));
    const total = snap.size;
    let enriched = 0;

    const BATCH_SIZE = 50;
    const docs = snap.docs;

    for (let i = 0; i < docs.length; i += BATCH_SIZE) {
      const slice = docs.slice(i, i + BATCH_SIZE);

      await Promise.all(slice.map(async (d) => {
        const data = d.data();
        if (data.hour !== undefined && data.dayOfWeek !== undefined) return;

        const rawDate = data.date;
        if (!rawDate) return;

        const jsDate: Date = rawDate instanceof Timestamp ? rawDate.toDate() : rawDate;
        const hour = jsDate.getHours();
        const dayOfWeek = jsDate.getDay(); // 0=Sun…6=Sat

        await updateDoc(doc(db, 'workouts', d.id), { hour, dayOfWeek });
        enriched++;
      }));

      console.log(`[Enrich] Processed ${Math.min(i + BATCH_SIZE, total)}/${total}`);
    }

    console.log(`[Enrich] Done — enriched ${enriched} workout docs with hour/dayOfWeek.`);
    return { success: true, enriched };
  } catch (error: unknown) {
    console.error('[Enrich] Error:', error);
    return { success: false, enriched: 0 };
  }
}

// ── Main Export ───────────────────────────────────────────────────────────────

export async function seedSderotDemo(): Promise<{ success: boolean; message: string }> {
  try {
    console.log('[SderotSeed] Starting Sderot demo seed...');

    const cityId = await upsertSderotCity();
    const neighborhoodIds = await seedNeighborhoods(cityId);

    const userIds = await seedUsers(neighborhoodIds);
    await seedWorkouts(userIds);
    await seedParks(cityId, neighborhoodIds);
    await seedRoutes(cityId, neighborhoodIds);
    await seedCommunity(cityId, neighborhoodIds, userIds);
    await seedManagerAccounts(cityId, neighborhoodIds);
    await syncAllCounts(cityId, neighborhoodIds);

    console.log('[SderotSeed] Done!');
    return { success: true, message: 'Sderot demo seeded successfully.' };
  } catch (error: any) {
    console.error('[SderotSeed] Error:', error);
    return { success: false, message: error?.message ?? 'Unknown error' };
  }
}
