/**
 * Demo world — fixed ids, names and phrases (PR 3 of agent-briefs/demo-users-design.md).
 * Owner-approved 20.10.2026: three demo cities + three demo units. Pure data, no Firebase.
 *
 * Every id here carries the demo prefix (tenants/groups `demo-`, users `demo_`) — the
 * scripts refuse to write or delete anything that does not (assertDemoWrite).
 */
import { DEMO_TENANT_PREFIX, DEMO_UID_PREFIX } from '../../../src/lib/demo';

export { DEMO_TENANT_PREFIX, DEMO_UID_PREFIX };

/** Bump when the shape of seeded docs changes (core.demo.v). */
export const DEMO_SEED_VERSION = 1;

/** Typed by the owner on the command line — the scripts never run a real write without it. */
export const SEED_CONFIRM_PHRASE = 'צור את עולם הדמו';
export const PURGE_CONFIRM_PHRASE = 'מחק את עולם הדמו';

export const REGISTRY_COLLECTION = 'demo_registry';
export const REGISTRY_DOCS = { personas: 'personas', tenants: 'tenants', viewers: 'viewers', testers: 'testers' } as const;

/** AI tester accounts (scripts/qa, roster demo_registry/testers) — same shape mintDemoTesterToken signs. */
export const TESTER_UID_RE = /^demo_qa_[a-z0-9_]{3,40}$/;
export function isTesterUid(uid: unknown): uid is string {
  return typeof uid === 'string' && TESTER_UID_RE.test(uid);
}

export interface DemoCity {
  kind: 'city';
  id: string;
  name: string;
  /** The real city whose parks the demo world references read-only. */
  realCityNames: string[];
  center: { lat: number; lng: number };
  neighborhoods: Array<{ id: string; name: string; offset: [number, number] }>;
}

export interface DemoUnit {
  kind: 'unit';
  id: string;
  name: string;
  reserve: boolean;
  companies: Array<{ id: string; name: string }>;
  center: { lat: number; lng: number };
}

export type DemoTenant = DemoCity | DemoUnit;

export const DEMO_CITIES: DemoCity[] = [
  {
    kind: 'city',
    id: 'demo-tlv',
    name: 'דמו · תל אביב',
    realCityNames: ['תל אביב-יפו', 'תל אביב - יפו', 'תל אביב יפו', 'תל אביב'],
    center: { lat: 32.0853, lng: 34.7818 },
    neighborhoods: [
      { id: 'demo-tlv-n1', name: 'דמו · הצפון הישן', offset: [0.012, 0.002] },
      { id: 'demo-tlv-n2', name: 'דמו · פלורנטין', offset: [-0.026, -0.012] },
      { id: 'demo-tlv-n3', name: 'דמו · רמת אביב', offset: [0.03, 0.012] },
    ],
  },
  {
    kind: 'city',
    id: 'demo-b7',
    name: 'דמו · באר שבע',
    realCityNames: ['באר שבע'],
    center: { lat: 31.2518, lng: 34.7913 },
    neighborhoods: [
      { id: 'demo-b7-n1', name: 'דמו · רמות', offset: [0.012, 0.018] },
      { id: 'demo-b7-n2', name: 'דמו · נווה זאב', offset: [-0.008, -0.012] },
    ],
  },
  {
    kind: 'city',
    id: 'demo-haifa',
    name: 'דמו · חיפה',
    realCityNames: ['חיפה'],
    center: { lat: 32.794, lng: 34.9896 },
    neighborhoods: [
      { id: 'demo-haifa-n1', name: 'דמו · כרמל מרכזי', offset: [-0.01, 0.002] },
      { id: 'demo-haifa-n2', name: 'דמו · נווה שאנן', offset: [-0.012, 0.03] },
    ],
  },
];

export const DEMO_UNITS: DemoUnit[] = [
  {
    kind: 'unit',
    id: 'demo-unit-a',
    name: 'יחידת דמו א׳',
    reserve: false,
    companies: [
      { id: 'demo-unit-a-c1', name: 'פלוגה א׳ (דמו)' },
      { id: 'demo-unit-a-c2', name: 'פלוגה ב׳ (דמו)' },
    ],
    center: { lat: 31.2, lng: 34.65 },
  },
  {
    kind: 'unit',
    id: 'demo-unit-b',
    name: 'יחידת דמו ב׳',
    reserve: false,
    companies: [{ id: 'demo-unit-b-c1', name: 'פלוגה ג׳ (דמו)' }],
    center: { lat: 32.45, lng: 35.0 },
  },
  {
    kind: 'unit',
    id: 'demo-reserve',
    name: 'גדוד מילואים דמו',
    reserve: true,
    companies: [{ id: 'demo-reserve-c1', name: 'פלוגת מילואים (דמו)' }],
    center: { lat: 32.0, lng: 34.9 },
  },
];

export const DEMO_TENANTS: DemoTenant[] = [...DEMO_CITIES, ...DEMO_UNITS];

export function tenantById(id: string): DemoTenant {
  const t = DEMO_TENANTS.find((x) => x.id === id);
  if (!t) throw new Error(`unknown demo tenant ${id}`);
  return t;
}

/** Every authority-level id the demo world owns (cities, neighborhoods, units). */
export function demoAuthorityIds(): string[] {
  return [
    ...DEMO_CITIES.flatMap((c) => [c.id, ...c.neighborhoods.map((n) => n.id)]),
    ...DEMO_UNITS.map((u) => u.id),
  ];
}

/** How many days of history the seed backfills (owner: 60). */
export const HISTORY_DAYS = 60;
/** How many days ahead the schedule is written. */
export const SCHEDULE_AHEAD_DAYS = 14;
