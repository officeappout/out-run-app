/**
 * The demo world's people — 33 clearly-fictional personas (pure data).
 *
 * Each one maps to a schedule-combos scenario (S01–S33, engine v2 fixtures) or to the
 * walking plan (WR), and to a signup journey (J1 strength, J2 run, J3 strength → add run,
 * J4 run → add strength, WR walking). Names are common Hebrew first names with a last
 * initial only — no real person is meant. Scenarios that are one-week events (S11 deload,
 * S12 travel, S16 add a day) are not base weeks and are not used.
 */
import { DEMO_UID_PREFIX } from './config';
import type { WalkAudience, WalkComfort, WalkGoal } from '@/features/schedule/walking/walkPlan.types';

export type Journey = 'J1' | 'J2' | 'J3' | 'J4' | 'WR';
export type PersonaKind = 'parent' | 'vatikim' | 'student' | 'office_worker' | 'military';

export interface WalkSetup {
  goal: WalkGoal;
  comfort: WalkComfort;
  audience: WalkAudience;
  days: number[];
  window: 'morning' | 'noon' | 'evening';
}

export interface Persona {
  key: string;
  name: string;
  gender: 'male' | 'female';
  age: number;
  tenantId: string;
  /** City: a neighborhood id. Unit: a company id. */
  subId: string;
  /** schedule-combos scenario id, or 'WR' (walking plan only). */
  scenario: string;
  journey: Journey;
  personaKind: PersonaKind;
  /** Probability of doing a planned session (0.45–0.9, design §3.2). */
  adherence: number;
  /** Probability of sharing a done workout to the feed. */
  shareRate: number;
  stepGoal: number;
  bio: string;
  walk?: WalkSetup;
  military?: { status: 'regular' | 'reserve' };
  /** A break in the history: `length` days ending `endDaysAgo` days ago (S15 sick, S30 away). */
  gap?: { endDaysAgo: number; length: number };
  /** Trains in the city's (real) parks — writes park check-ins. */
  parkUser?: boolean;
}

const P = (p: Persona) => p;

export const PERSONAS: Persona[] = [
  // ── דמו · תל אביב (10) ────────────────────────────────────────────────────
  P({ key: 'tlv01', name: 'עומר ש.', gender: 'male', age: 29, tenantId: 'demo-tlv', subId: 'demo-tlv-n1', scenario: 'S01', journey: 'J3', personaKind: 'office_worker', adherence: 0.85, shareRate: 0.7, stepGoal: 8000, bio: 'מתאמן על פלאנץ׳ ומתכונן ל-10 ק״מ', parkUser: true }),
  P({ key: 'tlv02', name: 'נועה ל.', gender: 'female', age: 34, tenantId: 'demo-tlv', subId: 'demo-tlv-n1', scenario: 'S04', journey: 'J2', personaKind: 'office_worker', adherence: 0.8, shareRate: 0.8, stepGoal: 9000, bio: 'רצה ארבע פעמים בשבוע, מטרה 10 ק״מ' }),
  P({ key: 'tlv03', name: 'איתי ב.', gender: 'male', age: 24, tenantId: 'demo-tlv', subId: 'demo-tlv-n2', scenario: 'S17', journey: 'J1', personaKind: 'student', adherence: 0.75, shareRate: 0.6, stepGoal: 7000, bio: 'סטודנט, פלאנץ׳ ודחיפות במתקנים', parkUser: true }),
  P({ key: 'tlv04', name: 'מאיה ג.', gender: 'female', age: 41, tenantId: 'demo-tlv', subId: 'demo-tlv-n3', scenario: 'S22', journey: 'J4', personaKind: 'parent', adherence: 0.7, shareRate: 0.5, stepGoal: 8000, bio: 'אמא לשניים, ריצה + ליבה וגמישות' }),
  P({ key: 'tlv05', name: 'יואב ק.', gender: 'male', age: 38, tenantId: 'demo-tlv', subId: 'demo-tlv-n1', scenario: 'S24', journey: 'J3', personaKind: 'office_worker', adherence: 0.8, shareRate: 0.6, stepGoal: 8000, bio: 'רץ עם הקבוצה בשלישי בערב' }),
  P({ key: 'tlv06', name: 'דניאל ר.', gender: 'male', age: 31, tenantId: 'demo-tlv', subId: 'demo-tlv-n2', scenario: 'S27', journey: 'J3', personaKind: 'office_worker', adherence: 0.9, shareRate: 0.8, stepGoal: 10000, bio: 'היברידי מתקדם: כוח וריצה כמעט כל יום', parkUser: true }),
  P({ key: 'tlv07', name: 'רונית א.', gender: 'female', age: 52, tenantId: 'demo-tlv', subId: 'demo-tlv-n3', scenario: 'WR', journey: 'WR', personaKind: 'parent', adherence: 0.7, shareRate: 0.4, stepGoal: 7000, bio: 'הליכות בוקר בפארק לירידה במשקל', walk: { goal: 'weight_loss', comfort: 'medium', audience: 'general', days: [0, 1, 2, 3, 4], window: 'morning' } }),
  P({ key: 'tlv08', name: 'שירה מ.', gender: 'female', age: 27, tenantId: 'demo-tlv', subId: 'demo-tlv-n2', scenario: 'S05', journey: 'J4', personaKind: 'student', adherence: 0.8, shareRate: 0.7, stepGoal: 9000, bio: 'חצי מרתון בדרך, פלאנץ׳ פעמיים בשבוע' }),
  P({ key: 'tlv09', name: 'אורי ד.', gender: 'male', age: 22, tenantId: 'demo-tlv', subId: 'demo-tlv-n3', scenario: 'S33', journey: 'J1', personaKind: 'student', adherence: 0.65, shareRate: 0.5, stepGoal: 7000, bio: 'דחיפה-משיכה-רגליים פעמיים בשבוע', parkUser: true }),
  P({ key: 'tlv10', name: 'טל נ.', gender: 'female', age: 36, tenantId: 'demo-tlv', subId: 'demo-tlv-n1', scenario: 'S13', journey: 'J3', personaKind: 'parent', adherence: 0.6, shareRate: 0.5, stepGoal: 8000, bio: 'ריצה ארוכה בשבת, משלימה כשמפספסת' }),

  // ── דמו · באר שבע (7) ─────────────────────────────────────────────────────
  P({ key: 'b701', name: 'אביב ח.', gender: 'male', age: 19, tenantId: 'demo-b7', subId: 'demo-b7-n1', scenario: 'S02', journey: 'J3', personaKind: 'student', adherence: 0.6, shareRate: 0.6, stepGoal: 8000, bio: 'מתחיל: כוח וריצה לקראת הגיוס', parkUser: true }),
  P({ key: 'b702', name: 'ליאת ס.', gender: 'female', age: 45, tenantId: 'demo-b7', subId: 'demo-b7-n2', scenario: 'S03', journey: 'J1', personaKind: 'parent', adherence: 0.7, shareRate: 0.4, stepGoal: 7000, bio: 'גוף מלא שלוש פעמים בשבוע', parkUser: true }),
  P({ key: 'b703', name: 'הדר פ.', gender: 'female', age: 36, tenantId: 'demo-b7', subId: 'demo-b7-n1', scenario: 'S25', journey: 'J3', personaKind: 'office_worker', adherence: 0.55, shareRate: 0.5, stepGoal: 7000, bio: 'חוזרת לכושר אחרי לידה' }),
  P({ key: 'b704', name: 'משה י.', gender: 'male', age: 68, tenantId: 'demo-b7', subId: 'demo-b7-n2', scenario: 'WR', journey: 'WR', personaKind: 'vatikim', adherence: 0.8, shareRate: 0.3, stepGoal: 6000, bio: 'גמלאי, הולך כל בוקר עם חברים', walk: { goal: 'health', comfort: 'medium', audience: 'senior', days: [0, 1, 2, 3, 4, 5], window: 'morning' } }),
  P({ key: 'b705', name: 'נתנאל ו.', gender: 'male', age: 33, tenantId: 'demo-b7', subId: 'demo-b7-n1', scenario: 'S31', journey: 'J3', personaKind: 'parent', adherence: 0.75, shareRate: 0.5, stepGoal: 8000, bio: 'שומר שבת, מתאמן ראשון עד חמישי' }),
  P({ key: 'b706', name: 'רחל צ.', gender: 'female', age: 57, tenantId: 'demo-b7', subId: 'demo-b7-n2', scenario: 'S28', journey: 'J2', personaKind: 'vatikim', adherence: 0.8, shareRate: 0.4, stepGoal: 8000, bio: 'רצה שלוש פעמים בשבוע לשמירה על כושר' }),
  P({ key: 'b707', name: 'גל ע.', gender: 'male', age: 28, tenantId: 'demo-b7', subId: 'demo-b7-n1', scenario: 'S14', journey: 'J1', personaKind: 'office_worker', adherence: 0.6, shareRate: 0.5, stepGoal: 7000, bio: 'כשמפספס אימון — מזיז אותו לסוף השבוע', parkUser: true }),

  // ── דמו · חיפה (7) ────────────────────────────────────────────────────────
  P({ key: 'hfa01', name: 'יעל ט.', gender: 'female', age: 61, tenantId: 'demo-haifa', subId: 'demo-haifa-n1', scenario: 'S23', journey: 'WR', personaKind: 'vatikim', adherence: 0.75, shareRate: 0.4, stepGoal: 8000, bio: 'גוף מלא פעמיים ו-8,000 צעדים ביום' }),
  P({ key: 'hfa02', name: 'עידו כ.', gender: 'male', age: 26, tenantId: 'demo-haifa', subId: 'demo-haifa-n2', scenario: 'S18', journey: 'J1', personaKind: 'student', adherence: 0.8, shareRate: 0.7, stepGoal: 8000, bio: 'מנוף קדמי, דחיפה, משיכה ורגליים', parkUser: true }),
  P({ key: 'hfa03', name: 'אלון ז.', gender: 'male', age: 44, tenantId: 'demo-haifa', subId: 'demo-haifa-n1', scenario: 'S06', journey: 'J3', personaKind: 'parent', adherence: 0.7, shareRate: 0.4, stepGoal: 7000, bio: 'מתאמן רק בשישי ושבת' }),
  P({ key: 'hfa04', name: 'פנינה ה.', gender: 'female', age: 73, tenantId: 'demo-haifa', subId: 'demo-haifa-n2', scenario: 'WR', journey: 'WR', personaKind: 'vatikim', adherence: 0.7, shareRate: 0.3, stepGoal: 5000, bio: 'הליכה קצרה כל יום בשכונה', walk: { goal: 'steps', comfort: 'short', audience: 'senior', days: [0, 1, 2, 3, 4], window: 'morning' } }),
  P({ key: 'hfa05', name: 'רועי א.', gender: 'male', age: 21, tenantId: 'demo-haifa', subId: 'demo-haifa-n1', scenario: 'S19', journey: 'J3', personaKind: 'student', adherence: 0.7, shareRate: 0.7, stepGoal: 9000, bio: 'עליית כוח, פלאנץ׳ ושתי ריצות', parkUser: true }),
  P({ key: 'hfa06', name: 'מיכל ב.', gender: 'female', age: 30, tenantId: 'demo-haifa', subId: 'demo-haifa-n2', scenario: 'S21', journey: 'J1', personaKind: 'office_worker', adherence: 0.75, shareRate: 0.6, stepGoal: 8000, bio: 'עמידת ידיים, פלאנץ׳ ומנוף' }),
  P({ key: 'hfa07', name: 'שחר ג.', gender: 'male', age: 35, tenantId: 'demo-haifa', subId: 'demo-haifa-n1', scenario: 'S15', journey: 'J3', personaKind: 'office_worker', adherence: 0.7, shareRate: 0.5, stepGoal: 8000, bio: 'היה חולה שבוע, חוזר בהדרגה', gap: { endDaysAgo: 9, length: 5 } }),

  // ── יחידת דמו א׳ (3) ──────────────────────────────────────────────────────
  P({ key: 'ua01', name: 'עמית ר.', gender: 'male', age: 20, tenantId: 'demo-unit-a', subId: 'demo-unit-a-c1', scenario: 'S26', journey: 'J4', personaKind: 'military', adherence: 0.8, shareRate: 0.5, stepGoal: 10000, bio: 'לוחם, כוח בעיקר ושתי ריצות', military: { status: 'regular' } }),
  P({ key: 'ua02', name: 'ספיר ל.', gender: 'female', age: 19, tenantId: 'demo-unit-a', subId: 'demo-unit-a-c2', scenario: 'S10', journey: 'J3', personaKind: 'military', adherence: 0.65, shareRate: 0.5, stepGoal: 9000, bio: 'מתאמנת בראשון, שלישי וחמישי', military: { status: 'regular' } }),
  P({ key: 'ua03', name: 'בן מ.', gender: 'male', age: 21, tenantId: 'demo-unit-a', subId: 'demo-unit-a-c1', scenario: 'S20', journey: 'J1', personaKind: 'military', adherence: 0.7, shareRate: 0.4, stepGoal: 9000, bio: 'מנוף ושכיבות סמיכה ביד אחת', military: { status: 'regular' } }),

  // ── יחידת דמו ב׳ (3) ──────────────────────────────────────────────────────
  P({ key: 'ub01', name: 'ניר ש.', gender: 'male', age: 20, tenantId: 'demo-unit-b', subId: 'demo-unit-b-c1', scenario: 'S08', journey: 'J3', personaKind: 'military', adherence: 0.75, shareRate: 0.5, stepGoal: 10000, bio: 'מתאמן רק בבוקר, פלג עליון וריצות', military: { status: 'regular' } }),
  P({ key: 'ub02', name: 'אביגיל ד.', gender: 'female', age: 22, tenantId: 'demo-unit-b', subId: 'demo-unit-b-c1', scenario: 'S09', journey: 'J3', personaKind: 'military', adherence: 0.7, shareRate: 0.6, stepGoal: 9000, bio: 'ערבים בלבד, שני אימונים ביום כשאפשר', military: { status: 'regular' } }),
  P({ key: 'ub03', name: 'יונתן פ.', gender: 'male', age: 23, tenantId: 'demo-unit-b', subId: 'demo-unit-b-c1', scenario: 'S29', journey: 'J4', personaKind: 'military', adherence: 0.85, shareRate: 0.7, stepGoal: 10000, bio: 'מתכונן למירוץ 10 ק״מ ביום שישי', military: { status: 'regular' } }),

  // ── גדוד מילואים דמו (3) ──────────────────────────────────────────────────
  P({ key: 'rs01', name: 'אריאל ק.', gender: 'male', age: 35, tenantId: 'demo-reserve', subId: 'demo-reserve-c1', scenario: 'S07', journey: 'J1', personaKind: 'military', adherence: 0.6, shareRate: 0.4, stepGoal: 8000, bio: 'מילואימניק, פנוי רק בשני ושלישי', military: { status: 'reserve' } }),
  P({ key: 'rs02', name: 'אסף נ.', gender: 'male', age: 39, tenantId: 'demo-reserve', subId: 'demo-reserve-c1', scenario: 'S30', journey: 'J3', personaKind: 'military', adherence: 0.6, shareRate: 0.4, stepGoal: 8000, bio: 'חזר עכשיו מעשרה ימי מילואים', military: { status: 'reserve' }, gap: { endDaysAgo: 3, length: 10 } }),
  P({ key: 'rs03', name: 'קרן ו.', gender: 'female', age: 42, tenantId: 'demo-reserve', subId: 'demo-reserve-c1', scenario: 'S32', journey: 'J2', personaKind: 'military', adherence: 0.65, shareRate: 0.5, stepGoal: 8000, bio: 'רצה, הורידה לשתי ריצות בשבוע', military: { status: 'reserve' } }),
];

export const personaUid = (p: Pick<Persona, 'key'>) => `${DEMO_UID_PREFIX}${p.key}`;
