'use client';

/**
 * useDemoPresence — 40 deterministic fake partner positions for booth demo mode.
 *
 * Scattered around central Tel Aviv (Rabin Square). Never writes to Firestore.
 * Stable across renders (const data, no Math.random). uid: "demo_0"..."demo_39".
 *
 * Used by MapShell when ?demo=1 is present in the URL.
 */

// Colors from GROUP_COLORS in useGroupPresence.ts
const COLORS = [
  '#8B9DC3', '#7BA898', '#C9A96E', '#A090B8', '#B08A9A',
  '#7EA88A', '#C49A7A', '#7E9DB0', '#B898A8', '#A4B87A',
  '#7AAEC0', '#B0AC84',
];

// Mix of Hebrew and international Maccabiah names
const NAMES = [
  'דן',    'מיכל', 'יואב',  'אורית', 'נמרוד',
  'Alex',  'תמר',  'עמית',  'Sarah', 'שירה',
  'Jake',  'נועה', 'גל',    'Emma',  'רון',
  'לי',    'Lior', 'אסף',   'הדר',   'Maya',
  'מאיה',  'David','עודד',  'יעל',   'Rachel',
  'איתי',  'Jordan','לירון','Sam',   'ניר',
  'ענת',   'Mia',  'אריאל', 'Noah',  'ריבי',
  'Ethan', 'עמוס', 'Olivia','Lucas', 'הדר',
];

// Deterministic offsets (degrees) from center 32.0806, 34.7806 (Rabin Square)
// Spread within ~1.5 km radius. 1° lat ≈ 111 km, 1° lng ≈ 86 km at lat 32.
const OFFSETS: [number, number][] = [
  [ 0.000,  0.000], [ 0.005,  0.006], [-0.004,  0.008], [ 0.008, -0.005],
  [-0.003, -0.007], [ 0.010,  0.003], [ 0.001,  0.012], [-0.009,  0.004],
  [-0.001, -0.010], [ 0.007,  0.009], [-0.006,  0.010], [ 0.009, -0.009],
  [-0.008, -0.006], [ 0.012,  0.007], [ 0.004,  0.013], [-0.011,  0.002],
  [ 0.002, -0.012], [ 0.006, -0.003], [-0.002,  0.007], [ 0.011, -0.001],
  [-0.007, -0.009], [ 0.003,  0.010], [-0.005,  0.005], [ 0.008,  0.011],
  [-0.010,  0.001], [ 0.001, -0.008], [-0.004, -0.011], [ 0.009,  0.000],
  [-0.001,  0.011], [ 0.006, -0.007], [-0.009,  0.008], [ 0.004,  0.004],
  [-0.003, -0.003], [ 0.012, -0.004], [-0.006,  0.012], [ 0.002, -0.013],
  [ 0.010,  0.008], [-0.011, -0.001], [ 0.007, -0.011], [-0.008,  0.003],
];

const CENTER_LAT = 32.0806;
const CENTER_LNG = 34.7806;

const ACTIVITIES = ['strength', 'running', 'walking'];
const LEMUR_STAGES = [1, 2, 3, 4, 5, 6, 7, 8, 3, 5, 2, 6, 4, 7, 1, 8, 3, 5, 2, 6,
                      4, 7, 1, 8, 3, 5, 2, 6, 4, 7, 1, 8, 3, 5, 2, 6, 4, 7, 1, 8];

export interface DemoPartnerPosition {
  uid: string;
  name: string;
  lat: number;
  lng: number;
  color: string;
  activityStatus?: string;
  lemurStage?: number;
  personaImageUrl?: string;
}

// Built once at module level — stable reference, zero re-computation
const DEMO_PARTNERS: DemoPartnerPosition[] = OFFSETS.map(([dLat, dLng], i) => ({
  uid: `demo_${i}`,
  name: NAMES[i % NAMES.length],
  lat: CENTER_LAT + dLat,
  lng: CENTER_LNG + dLng,
  color: COLORS[i % COLORS.length],
  activityStatus: ACTIVITIES[i % ACTIVITIES.length],
  lemurStage: LEMUR_STAGES[i],
}));

export function useDemoPresence(): DemoPartnerPosition[] {
  return DEMO_PARTNERS;
}
