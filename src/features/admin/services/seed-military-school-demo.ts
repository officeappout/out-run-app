/**
 * Military + School Demo Seeds
 *
 * Populates Firestore with two self-contained leaderboard test datasets:
 *
 * MILITARY — גדוד 890
 *   - Authority doc (type: 'military') representing battalion-890
 *   - 3 child authority docs (type: 'military_unit') for company-a/b/c with parentAuthorityId
 *   - 10 soldiers per company (30 total)
 *   - Users: core.tenantId + core.unitId + core.authorityId stamped
 *   - feed_posts: last 30 days, ageGroup 'adult', tenantId + unitId stamped
 *
 * SCHOOL — בית ספר רבין
 *   - Authority doc (type: 'school') representing school-rabin
 *   - tenants/school-rabin/units subcollection: class-10a, class-10b, class-11a
 *   - 3 classes, 10 students per class (30 total)
 *   - Users: core.schoolId + core.unitId (was classId) + core.authorityId stamped
 *   - feed_posts: last 30 days, ageGroup 'minor', schoolId + classId stamped
 *   - Current admin user added to authority.managerIds so grades page loads
 *
 * NOTE: tenantId, unitId, and classId are written directly onto feed_posts
 * documents as extra scope fields even though they are not yet in the
 * TypeScript FeedPost interface — this mirrors the migration-script pattern.
 * Required indexes (add to firestore.indexes.json when enabling tenant/class
 * leaderboards):
 *   feed_posts: tenantId + createdAt DESC
 *   feed_posts: tenantId + unitId + createdAt DESC
 *   feed_posts: schoolId + classId + createdAt DESC
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
import { db, auth } from '@/lib/firebase';

// ── Shared helpers (mirror seed-sderot-demo.ts style) ─────────────────────────

function randInt(min: number, max: number): number {
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

const MALE_NAMES = [
  'דוד', 'משה', 'יוסף', 'אבי', 'שלמה', 'נתן', 'אריה', 'גדעון', 'חיים', 'יצחק',
  'לוי', 'מרדכי', 'צבי', 'ראובן', 'שמעון', 'תמיר', 'אלי', 'גל', 'דן', 'הרצל',
  'רועי', 'שחר', 'עידו', 'אורן', 'ניר', 'טל', 'בר', 'יונתן', 'עמית', 'אורי',
];
const FEMALE_NAMES = [
  'מיכל', 'שרה', 'רחל', 'לאה', 'נועה', 'ליאת', 'שירה', 'הדר', 'טל', 'ענת',
  'מיה', 'יעל', 'אביגיל', 'רונית', 'עדי', 'גלית', 'ורד', 'אורית', 'נילי', 'דפנה',
];
const LAST_NAMES = [
  'כהן', 'לוי', 'מזרחי', 'פרץ', 'ביטון', 'אברהם', 'דהן', 'אוחיון', 'שמש', 'אלמליח',
  'בן-דוד', 'חדד', 'גבאי', 'ממן', 'ספיר', 'עמר', 'פרידמן', 'גולן', 'שפירא', 'רוזן',
];

const ACTIVITY_CATEGORIES = ['strength', 'cardio', 'maintenance'] as const;
type ActivityCategory = typeof ACTIVITY_CATEGORIES[number];

const CREDIT_MULTIPLIER: Record<ActivityCategory, number> = {
  strength: 2,
  cardio: 1,
  maintenance: 1,
};

// ─────────────────────────────────────────────────────────────────────────────
// MILITARY SEED
// ─────────────────────────────────────────────────────────────────────────────

const MILITARY_TENANT_ID = 'battalion-890';
const MILITARY_AUTHORITY_ID = 'battalion-890'; // used as authorityId on user + feed_posts

const MILITARY_UNITS = [
  { unitId: 'company-a', label: 'פלוגה א׳' },
  { unitId: 'company-b', label: 'פלוגה ב׳' },
  { unitId: 'company-c', label: 'פלוגה ג׳' },
];

/** Upsert a placeholder authority doc for the battalion. */
async function upsertBattalionAuthority(adminUid?: string): Promise<string> {
  const q = query(
    collection(db, 'authorities'),
    where('tenantId', '==', MILITARY_TENANT_ID),
  );
  const snap = await getDocs(q);
  if (!snap.empty) {
    const existingId = snap.docs[0].id;
    console.log('[MilitarySeed] Battalion authority already exists:', existingId);
    if (adminUid) {
      await updateDoc(doc(db, 'authorities', existingId), { managerIds: arrayUnion(adminUid) });
    }
    return existingId;
  }

  // Use the stable ID directly so users can reference it
  await setDoc(doc(db, 'authorities', MILITARY_AUTHORITY_ID), {
    name: 'גדוד 890 (דמו)',
    type: 'military',
    tenantId: MILITARY_TENANT_ID,
    managerIds: adminUid ? [adminUid] : [],
    userCount: 0,
    status: 'active',
    isActiveClient: true,
    pipelineStatus: 'active',
    contacts: [],
    activityLog: [],
    tasks: [],
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  }, { merge: true });

  console.log('[MilitarySeed] Created battalion authority:', MILITARY_AUTHORITY_ID);
  return MILITARY_AUTHORITY_ID;
}

/** Create child authority docs for each company under the battalion. */
async function seedCompanyAuthorities(): Promise<void> {
  for (const unit of MILITARY_UNITS) {
    await setDoc(doc(db, 'authorities', unit.unitId), {
      name: unit.label,
      type: 'military_unit',
      parentAuthorityId: MILITARY_AUTHORITY_ID,
      tenantId: MILITARY_TENANT_ID,
      managerIds: [],
      userCount: 0,
      status: 'active',
      isActiveClient: false,
      pipelineStatus: 'active',
      contacts: [],
      activityLog: [],
      tasks: [],
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    }, { merge: true });
  }
  console.log('[MilitarySeed] Seeded', MILITARY_UNITS.length, 'company authority docs');
}

interface SeedUserRecord {
  uid: string;
  name: string;
  authorityId: string;
}

async function seedMilitaryUsers(): Promise<SeedUserRecord[]> {
  const users: SeedUserRecord[] = [];

  for (const unit of MILITARY_UNITS) {
    for (let i = 0; i < 10; i++) {
      // ~70% male in military dataset
      const isMale = i < 7;
      const gender = isMale ? 'male' : 'female';
      const firstName = isMale ? randItem(MALE_NAMES) : randItem(FEMALE_NAMES);
      const name = `${firstName} ${randItem(LAST_NAMES)}`;

      // Soldiers: ages 18-28
      const age = randInt(18, 28);
      const birthYear = new Date().getFullYear() - age;
      const birthDate = Timestamp.fromDate(new Date(birthYear, randInt(0, 11), randInt(1, 28)));

      const uid = `military-demo-${unit.unitId}-${String(i).padStart(2, '0')}`;

      await setDoc(doc(db, 'users', uid), {
        core: {
          name,
          email: `${uid}@military-demo.local`,
          authorityId: MILITARY_AUTHORITY_ID,
          tenantId: MILITARY_TENANT_ID,
          unitId: unit.unitId,
          unitPath: `${MILITARY_TENANT_ID}/${unit.unitId}`,
          tenantType: 'military',
          gender,
          birthDate,
          ageGroup: 'adult',
          isApproved: false,
          isSuperAdmin: false,
          joinDate: Timestamp.fromDate(randDate(90)),
          onboardingStatus: 'COMPLETED',
          accessLevel: 'free',
          loginCount: randInt(1, 30),
          lastLoginAt: Timestamp.fromDate(randDate(14)),
        },
        lifestyle: {
          trainingTime: randItem(['06:00', '07:00', '16:00', '17:00', '18:00']),
          interests: isMale
            ? randItem([['running', 'strength'], ['strength', 'calisthenics'], ['running']])
            : randItem([['running', 'health'], ['yoga', 'walking'], ['health']]),
          fitnessLevel: randItem(['intermediate', 'advanced']),
        },
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      users.push({ uid, name, authorityId: MILITARY_AUTHORITY_ID });
    }
  }

  console.log('[MilitarySeed] Seeded', users.length, 'soldiers');
  return users;
}

async function seedMilitaryFeedPosts(users: SeedUserRecord[]): Promise<void> {
  let count = 0;

  for (const user of users) {
    const { uid } = user;
    // Extract unitId from uid pattern: military-demo-{company}-{letter}-{index}
    const parts = uid.split('-');
    const unitId = parts.slice(2, parts.length - 1).join('-');

    // Each soldier gets 4-8 posts in the last 30 days
    const postCount = randInt(4, 8);
    for (let p = 0; p < postCount; p++) {
      const category = randItem(ACTIVITY_CATEGORIES);
      const durationMinutes = randInt(20, 75);
      const activityCredit = durationMinutes * CREDIT_MULTIPLIER[category];
      const postDate = randDate(30, 0);

      await addDoc(collection(db, 'feed_posts'), {
        authorUid: uid,
        authorName: `חייל ${uid.split('-').pop()}`,
        type: 'workout',
        activityCategory: category,
        durationMinutes,
        activityCredit,
        ageGroup: 'adult',
        gender: uid.includes('00') || uid.includes('01') || uid.includes('02') ||
                uid.includes('03') || uid.includes('04') || uid.includes('05') ||
                uid.includes('06') ? 'male' : 'female',
        // Standard scope fields
        authorityId: MILITARY_AUTHORITY_ID,
        // Military-specific extra scope fields (not yet in FeedPost TS interface)
        tenantId: MILITARY_TENANT_ID,
        unitId,
        // Empty groupIds (not in any community group yet)
        groupIds: [],
        audience: 'partners',
        createdAt: Timestamp.fromDate(postDate),
      });
      count++;
    }
  }

  console.log('[MilitarySeed] Seeded', count, 'feed_posts');
}

// ─────────────────────────────────────────────────────────────────────────────
// SCHOOL SEED
// ─────────────────────────────────────────────────────────────────────────────

const SCHOOL_ID = 'school-rabin';
const SCHOOL_AUTHORITY_ID = 'school-rabin'; // stable authority ID

const SCHOOL_CLASSES = [
  { classId: 'class-10a', label: 'י׳ א׳' },
  { classId: 'class-10b', label: 'י׳ ב׳' },
  { classId: 'class-11a', label: 'י״א א׳' },
];

async function upsertSchoolAuthority(adminUid?: string): Promise<string> {
  const q = query(
    collection(db, 'authorities'),
    where('schoolId', '==', SCHOOL_ID),
  );
  const snap = await getDocs(q);
  if (!snap.empty) {
    const existingId = snap.docs[0].id;
    console.log('[SchoolSeed] School authority already exists:', existingId);
    if (adminUid) {
      await updateDoc(doc(db, 'authorities', existingId), { managerIds: arrayUnion(adminUid) });
    }
    return existingId;
  }

  await setDoc(doc(db, 'authorities', SCHOOL_AUTHORITY_ID), {
    name: 'בית ספר רבין (דמו)',
    type: 'school',
    schoolId: SCHOOL_ID,
    managerIds: adminUid ? [adminUid] : [],
    userCount: 0,
    status: 'active',
    isActiveClient: true,
    pipelineStatus: 'active',
    contacts: [],
    activityLog: [],
    tasks: [],
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  }, { merge: true });

  console.log('[SchoolSeed] Created school authority:', SCHOOL_AUTHORITY_ID);
  return SCHOOL_AUTHORITY_ID;
}

/** Create tenants/{schoolId}/units subcollection docs for each class. */
async function seedSchoolTenantUnits(): Promise<void> {
  for (const cls of SCHOOL_CLASSES) {
    await setDoc(
      doc(db, 'tenants', SCHOOL_AUTHORITY_ID, 'units', cls.classId),
      {
        name: cls.label,
        classId: cls.classId,
        memberCount: 10,
        createdAt: serverTimestamp(),
      },
      { merge: true },
    );
  }
  console.log('[SchoolSeed] Seeded', SCHOOL_CLASSES.length, 'tenant unit docs');
}

async function seedSchoolUsers(): Promise<SeedUserRecord[]> {
  const users: SeedUserRecord[] = [];

  for (const cls of SCHOOL_CLASSES) {
    for (let i = 0; i < 10; i++) {
      // Balanced gender
      const isFemale = i >= 5;
      const gender = isFemale ? 'female' : 'male';
      const firstName = isFemale ? randItem(FEMALE_NAMES) : randItem(MALE_NAMES);
      const name = `${firstName} ${randItem(LAST_NAMES)}`;

      // Determine grade year from classId
      const gradeYear = cls.classId.includes('10') ? 10 : 11;
      // Students: age = ~16 for 10th grade, ~17 for 11th
      const age = gradeYear - 1 + 4; // 10→15/16, 11→16/17
      const birthYear = new Date().getFullYear() - age;
      const birthDate = Timestamp.fromDate(new Date(birthYear, randInt(0, 11), randInt(1, 28)));

      const uid = `school-demo-${cls.classId}-${String(i).padStart(2, '0')}`;

      await setDoc(doc(db, 'users', uid), {
        core: {
          name,
          email: `${uid}@school-demo.local`,
          authorityId: SCHOOL_AUTHORITY_ID,
          schoolId: SCHOOL_ID,
          unitId: cls.classId,
          affiliations: [
            {
              type: 'school',
              id: SCHOOL_AUTHORITY_ID,
              name: 'בית ספר רבין',
              tier: 3,
            },
          ],
          gender,
          birthDate,
          ageGroup: 'minor',
          isApproved: false,
          isSuperAdmin: false,
          joinDate: Timestamp.fromDate(randDate(90)),
          onboardingStatus: 'COMPLETED',
          accessLevel: 'free',
          loginCount: randInt(1, 20),
          lastLoginAt: Timestamp.fromDate(randDate(14)),
        },
        lifestyle: {
          trainingTime: randItem(['07:00', '15:00', '16:00', '17:00']),
          interests: isFemale
            ? randItem([['walking', 'health'], ['yoga'], ['running', 'health']])
            : randItem([['running', 'strength'], ['calisthenics'], ['running']]),
          fitnessLevel: randItem(['beginner', 'intermediate']),
        },
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      users.push({ uid, name, authorityId: SCHOOL_AUTHORITY_ID });
    }
  }

  console.log('[SchoolSeed] Seeded', users.length, 'students');
  return users;
}

async function seedSchoolFeedPosts(users: SeedUserRecord[]): Promise<void> {
  let count = 0;

  for (const user of users) {
    const { uid } = user;
    // uid format: school-demo-class-10a-00
    // Extract classId: everything between 'school-demo-' and the last '-XX'
    const parts = uid.split('-');
    const classId = parts.slice(2, parts.length - 1).join('-');

    // Each student gets 3-6 posts in the last 30 days
    const postCount = randInt(3, 6);
    for (let p = 0; p < postCount; p++) {
      const category = randItem(ACTIVITY_CATEGORIES);
      const durationMinutes = randInt(15, 60);
      const activityCredit = durationMinutes * CREDIT_MULTIPLIER[category];
      const postDate = randDate(30, 0);

      const idxStr = parts[parts.length - 1];
      const idx = parseInt(idxStr, 10);
      const gender = idx >= 5 ? 'female' : 'male';
      const authorName = gender === 'female'
        ? `${randItem(FEMALE_NAMES)} ${randItem(LAST_NAMES)}`
        : `${randItem(MALE_NAMES)} ${randItem(LAST_NAMES)}`;

      await addDoc(collection(db, 'feed_posts'), {
        authorUid: uid,
        authorName,
        type: 'workout',
        activityCategory: category,
        durationMinutes,
        activityCredit,
        ageGroup: 'minor',
        gender,
        // Standard scope fields
        schoolId: SCHOOL_AUTHORITY_ID,
        authorityId: SCHOOL_AUTHORITY_ID,
        // School-specific extra scope field (not yet in FeedPost TS interface)
        classId,
        // Empty groupIds
        groupIds: [],
        audience: 'partners',
        createdAt: Timestamp.fromDate(postDate),
      });
      count++;
    }
  }

  console.log('[SchoolSeed] Seeded', count, 'feed_posts');
}

// ─────────────────────────────────────────────────────────────────────────────
// SHARED: STREAK DOCS
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Creates a `streaks/{uid}` document for each seeded user so the streak
 * leaderboard has real data immediately without waiting for an actual
 * workout sync. The `displayName` field prevents the '???' fallback
 * in getStreakLeaderboard from firing for seed users.
 */
async function seedStreaks(users: SeedUserRecord[], label: string): Promise<void> {
  const today = new Date().toISOString().split('T')[0];
  for (const user of users) {
    const currentStreak = randInt(1, 15);
    const longestStreak = Math.max(currentStreak, randInt(5, 20));
    await setDoc(doc(db, 'streaks', user.uid), {
      userId: user.uid,
      currentStreak,
      longestStreak,
      lastActivityDate: today,
      authorityId: user.authorityId,
      displayName: user.name,
      updatedAt: serverTimestamp(),
    });
  }
  console.log(`[${label}] Seeded`, users.length, 'streak docs');
}

// ─────────────────────────────────────────────────────────────────────────────
// EXPORTS
// ─────────────────────────────────────────────────────────────────────────────

export async function seedMilitaryDemo(): Promise<{ success: boolean; message: string }> {
  try {
    console.log('[MilitarySeed] Starting military demo seed…');
    const adminUid = auth.currentUser?.uid;
    await upsertBattalionAuthority(adminUid);
    await seedCompanyAuthorities();
    const users = await seedMilitaryUsers();
    await seedMilitaryFeedPosts(users);
    await seedStreaks(users, 'MilitarySeed');
    console.log('[MilitarySeed] Done!');
    return { success: true, message: `Military demo seeded — ${users.length} soldiers, feed_posts + streaks for last 30 days.` };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    console.error('[MilitarySeed] Error:', err);
    return { success: false, message: msg };
  }
}

export async function seedSchoolDemo(): Promise<{ success: boolean; message: string }> {
  try {
    console.log('[SchoolSeed] Starting school demo seed…');
    const adminUid = auth.currentUser?.uid;
    await upsertSchoolAuthority(adminUid);
    await seedSchoolTenantUnits();
    const users = await seedSchoolUsers();
    await seedSchoolFeedPosts(users);
    await seedStreaks(users, 'SchoolSeed');
    console.log('[SchoolSeed] Done!');
    return { success: true, message: `School demo seeded — ${users.length} students, feed_posts + streaks for last 30 days.` };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    console.error('[SchoolSeed] Error:', err);
    return { success: false, message: msg };
  }
}

/** Run both seeds in sequence. */
export async function seedMilitaryAndSchoolDemo(): Promise<{ success: boolean; message: string }> {
  const mil = await seedMilitaryDemo();
  if (!mil.success) return mil;
  const sch = await seedSchoolDemo();
  return sch;
}
