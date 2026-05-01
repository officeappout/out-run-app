/**
 * UnifiedLocation — Static Constants & Configuration
 * All static data arrays, sport classification sets, and training program constants.
 */

import type { LifestyleOption } from './location-types';

// ── Mapbox Config ────────────────────────────────────────

export const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN || '';
export const MAPBOX_STYLE = 'mapbox://styles/mapbox/streets-v12';

// ── Lifestyle Persona Options ────────────────────────────

export const LIFESTYLE_OPTIONS: LifestyleOption[] = [
  { id: 'parent',        labelHeMale: 'אבא שרוצה לחזור לכושר',           labelHeFemale: 'אמא שרוצה לחזור לכושר',           labelEn: 'Parent' },
  { id: 'student',       labelHeMale: 'סטודנט שצריך הפסקה',              labelHeFemale: 'סטודנטית שצריכה הפסקה',             labelEn: 'Student' },
  { id: 'pupil',         labelHeMale: 'תלמיד שרוצה להשתפר',              labelHeFemale: 'תלמידה שרוצה להשתפר',               labelEn: 'Pupil' },
  { id: 'office_worker', labelHeMale: 'עובד משרד שרוצה לזוז',            labelHeFemale: 'עובדת משרד שרוצה לזוז',             labelEn: 'Office Worker' },
  { id: 'reservist',     labelHeMale: 'מילואימניק שרוצה לשמור על כושר', labelHeFemale: 'מילואימניקית שרוצה לשמור על כושר', labelEn: 'Reservist' },
  { id: 'athlete',       labelHeMale: 'ספורטאי שרוצה להתקדם',            labelHeFemale: 'ספורטאית שרוצה להתקדם',             labelEn: 'Athlete' },
  { id: 'senior',        labelHeMale: 'גמלאי שרוצה לשמור על בריאות',    labelHeFemale: 'גמלאית שרוצה לשמור על בריאות',     labelEn: 'Senior' },
  { id: 'vatikim',       labelHeMale: 'גיל הזהב',                        labelHeFemale: 'גיל הזהב',                          labelEn: 'Golden Age' },
  { id: 'pro_athlete',   labelHeMale: 'ספורטאי קצה',                     labelHeFemale: 'ספורטאית קצה',                      labelEn: 'Pro Athlete' },
  { id: 'soldier',       labelHeMale: 'חייל שרוצה לשמור על כושר',       labelHeFemale: 'חיילת שרוצה לשמור על כושר',        labelEn: 'Soldier' },
  { id: 'young_pro',     labelHeMale: 'צעיר שרוצה לזוז',                labelHeFemale: 'צעירה שרוצה לזוז',                  labelEn: 'Young Professional' },
];

// ── Sport Classification Sets ────────────────────────────

export const CARDIO_SPORTS     = new Set(['running', 'walking', 'cycling', 'swimming']);
export const STRENGTH_SPORTS   = new Set(['calisthenics', 'crossfit', 'functional', 'movement', 'gym']);
export const BODY_MIND_SPORTS  = new Set(['yoga', 'pilates', 'stretching']);
export const BALL_GAME_SPORTS  = new Set(['basketball', 'football', 'tennis', 'padel']);

/** Spot-based sports MUST NOT see routes as their #1 recommendation. */
export const SPOT_BASED_SPORTS = new Set([
  'yoga', 'pilates', 'stretching',
  'climbing',
  'calisthenics', 'crossfit', 'functional',
  'basketball', 'football', 'tennis', 'padel',
  'boxing', 'mma', 'self_defense',
]);

export const ROUTE_BASED_SPORTS = new Set([
  'running', 'cycling', 'walking',
]);

export const CLIMBING_SPORTS = new Set(['climbing']);

export const STATIC_SPORTS = new Set([
  'basketball', 'football', 'tennis', 'padel',
  'boxing', 'mma', 'self_defense',
  'climbing', 'skateboard',
]);

// ── Training Program Constants (Smart Bench Filter) ──────

/** Specialized programs that NEVER get bench fallback (Tier 3 → Pioneer) */
export const SPECIALIZED_PROGRAMS = new Set([
  'planche', 'front_lever', 'handstand', 'one_arm_pull', 'muscle_up',
]);

/** Bench-eligible programs & max level thresholds (Tier 2 → Plan B) */
export const BENCH_ELIGIBLE_PROGRAMS: Record<string, number> = {
  push:       10,
  push_up:    10,
  lower_body:  8,
  full_body:  10,
  upper_body: 10,
};

/** Programs where stairs are a valid Plan B (legs-involved training). */
export const STAIRS_ELIGIBLE_PROGRAMS = new Set([
  'lower_body',
  'full_body',
]);

// ── Default Coordinates ──────────────────────────────────
// AUTO-GENERATED — all coordinates verified from OpenStreetMap
// Keys match the static `id` fields in israel-locations.ts

export const DEFAULT_COORDINATES: Record<string, { lat: number; lng: number }> = {
  // ─── CITIES ────────────────────────────────────────────────
  jerusalem:        { lat: 31.7683, lng: 35.2137 },
  'tel-aviv':       { lat: 32.0853, lng: 34.7818 },
  haifa:            { lat: 32.7940, lng: 34.9896 },
  'rishon-lezion':  { lat: 31.9730, lng: 34.7925 },
  'petah-tikva':    { lat: 32.0841, lng: 34.8878 },
  ashdod:           { lat: 31.8044, lng: 34.6553 },
  netanya:          { lat: 32.3226, lng: 34.8533 },
  'beer-sheva':     { lat: 31.2518, lng: 34.7913 },
  holon:            { lat: 32.0108, lng: 34.7799 },
  'bnei-brak':      { lat: 32.0838, lng: 34.8339 },
  'ramat-gan':      { lat: 32.0707, lng: 34.8238 },
  ashkelon:         { lat: 31.6688, lng: 34.5743 },
  rehovot:          { lat: 31.8928, lng: 34.8113 },
  'bat-yam':        { lat: 32.0233, lng: 34.7503 },
  'beit-shemesh':   { lat: 31.7469, lng: 34.9908 },
  'kfar-saba':      { lat: 32.1789, lng: 34.9077 },
  herzliya:         { lat: 32.1663, lng: 34.8439 },
  hadera:           { lat: 32.4369, lng: 34.9189 },
  modiin:           { lat: 31.8966, lng: 35.0091 },
  lod:              { lat: 31.9516, lng: 34.8953 },
  raanana:          { lat: 32.1840, lng: 34.8706 },
  ramla:            { lat: 31.9295, lng: 34.8745 },
  'rosh-haayin':    { lat: 32.0963, lng: 34.9578 },
  'hod-hasharon':   { lat: 32.1531, lng: 34.8960 },
  'kiryat-gat':     { lat: 31.6100, lng: 34.7642 },
  nahariya:         { lat: 33.0053, lng: 35.0950 },
  afula:            { lat: 32.6079, lng: 35.2893 },
  'kiryat-ata':     { lat: 32.8129, lng: 35.1138 },
  yavne:            { lat: 31.8794, lng: 34.7432 },
  eilat:            { lat: 29.5577, lng: 34.9519 },
  'nes-ziona':      { lat: 31.9267, lng: 34.7982 },
  sderot:           { lat: 31.5245, lng: 34.5966 },

  // ─── JERUSALEM neighborhoods ───────────────────────────────
  'jr-center':       { lat: 31.7790, lng: 35.2220 },
  'jr-ramot':        { lat: 31.8440, lng: 35.1840 },
  'jr-givat-shaul':  { lat: 31.7867, lng: 35.1857 },
  'jr-malha':        { lat: 31.7456, lng: 35.1912 },
  'jr-katamon':      { lat: 31.7611, lng: 35.2055 },
  'jr-rehavia':      { lat: 31.7745, lng: 35.2116 },
  'jr-baka':         { lat: 31.7561, lng: 35.2198 },
  'jr-east-talpiot': { lat: 31.7424, lng: 35.2385 },
  'jr-pisgat-zeev':  { lat: 31.8257, lng: 35.2479 },
  'jr-french-hill':  { lat: 31.8072, lng: 35.2366 },
  'jr-har-nof':      { lat: 31.7759, lng: 35.1643 },
  'jr-kiryat-moshe': { lat: 31.7838, lng: 35.1862 },
  'jr-bayit-vegan':  { lat: 31.7630, lng: 35.1892 },
  'jr-gilo':         { lat: 31.7213, lng: 35.1842 },

  // ─── TEL AVIV neighborhoods ────────────────────────────────
  'ta-center':        { lat: 32.0705, lng: 34.7767 },
  'ta-north':         { lat: 32.1010, lng: 34.7838 },
  'ta-florentine':    { lat: 32.0560, lng: 34.7700 },
  'ta-neve-tzedek':   { lat: 32.0620, lng: 34.7660 },
  'ta-jaffa':         { lat: 32.0486, lng: 34.7508 },
  'ta-ramat-aviv':    { lat: 32.1150, lng: 34.8028 },
  'ta-bavli':         { lat: 32.0940, lng: 34.7920 },
  'ta-lev-tel-aviv':  { lat: 32.0790, lng: 34.7830 },
  'ta-kikar-hamedina':{ lat: 32.0870, lng: 34.7883 },
  'ta-sarona':        { lat: 32.0718, lng: 34.7852 },
  'ta-shapira':       { lat: 32.0510, lng: 34.7720 },
  'ta-hatikvah':      { lat: 32.0483, lng: 34.7910 },

  // ─── HAIFA neighborhoods ───────────────────────────────────
  'haifa-center':        { lat: 32.8100, lng: 34.9900 },
  'haifa-carmel':        { lat: 32.7881, lng: 34.9819 },
  'haifa-hadar':         { lat: 32.8173, lng: 34.9993 },
  'haifa-neve-shaanan':  { lat: 32.7994, lng: 35.0055 },
  'haifa-bat-galim':     { lat: 32.8334, lng: 34.9707 },
  'haifa-kiryat-haim':   { lat: 32.8317, lng: 35.0693 },
  'haifa-kiryat-eliezer':{ lat: 32.8251, lng: 34.9826 },
  'haifa-downtown':      { lat: 32.8170, lng: 34.9989 },

  // ─── RISHON LEZION neighborhoods ───────────────────────────
  'rl-center':        { lat: 31.9636, lng: 34.7988 },
  'rl-north':         { lat: 31.9870, lng: 34.7960 },
  'rl-south':         { lat: 31.9560, lng: 34.7850 },
  'rl-ramat-eliyahu': { lat: 31.9535, lng: 34.8075 },
  'rl-nahalat-yehuda':{ lat: 31.9478, lng: 34.7895 },
  'rl-kiryat-haim':   { lat: 31.9760, lng: 34.7895 },

  // ─── PETAH TIKVA neighborhoods ─────────────────────────────
  'pt-center':        { lat: 32.0878, lng: 34.8815 },
  'pt-kiryat-arye':   { lat: 32.0716, lng: 34.8726 },
  'pt-neve-yarak':    { lat: 32.1022, lng: 34.8880 },
  'pt-pardes-katz':   { lat: 32.0760, lng: 34.8650 },
  'pt-kiryat-matalon':{ lat: 32.0953, lng: 34.9080 },
  'pt-segula':        { lat: 32.0645, lng: 34.8808 },
  'pt-neve-ganim':    { lat: 32.0832, lng: 34.9165 },

  // ─── ASHDOD neighborhoods ──────────────────────────────────
  'asd-center':   { lat: 31.8008, lng: 34.6445 },
  'asd-yud-alef': { lat: 31.8220, lng: 34.6630 },
  'asd-yud-bet':  { lat: 31.8320, lng: 34.6745 },
  'asd-gimmel':   { lat: 31.7905, lng: 34.6520 },
  'asd-dalet':    { lat: 31.8015, lng: 34.6670 },
  'asd-hey':      { lat: 31.8153, lng: 34.6528 },

  // ─── NETANYA neighborhoods ─────────────────────────────────
  'nt-center':          { lat: 32.3293, lng: 34.8572 },
  'nt-north':           { lat: 32.3530, lng: 34.8510 },
  'nt-kiryat-nordau':   { lat: 32.3189, lng: 34.8548 },
  'nt-ir-yamim':        { lat: 32.3401, lng: 34.8686 },
  'nt-kiryat-hasharon': { lat: 32.3157, lng: 34.8722 },
  'nt-maccabim':        { lat: 32.3060, lng: 34.8781 },

  // ─── BEER SHEVA neighborhoods ──────────────────────────────
  'bs-center': { lat: 31.2454, lng: 34.7869 },
  'bs-ramot':  { lat: 31.2701, lng: 34.8066 },
  'bs-dalet':  { lat: 31.2600, lng: 34.7950 },
  'bs-alef':   { lat: 31.2538, lng: 34.8078 },
  'bs-gimel':  { lat: 31.2576, lng: 34.8007 },
  'bs-tet':    { lat: 31.2358, lng: 34.7935 },

  // ─── HOLON neighborhoods ───────────────────────────────────
  'holon-center':         { lat: 32.0063, lng: 34.7752 },
  'holon-kiryat-sharet':  { lat: 32.0163, lng: 34.7891 },
  'holon-neve-holon':     { lat: 31.9992, lng: 34.7680 },
  'holon-bat-yam-border': { lat: 32.0007, lng: 34.7715 },
  'holon-north':          { lat: 32.0208, lng: 34.7810 },

  // ─── BNEI BRAK neighborhoods ───────────────────────────────
  'bb-center':      { lat: 32.0796, lng: 34.8344 },
  'bb-kahaneman':   { lat: 32.0891, lng: 34.8389 },
  'bb-ramat-aharon':{ lat: 32.0722, lng: 34.8404 },

  // ─── RAMAT GAN neighborhoods ───────────────────────────────
  'rg-center':        { lat: 32.0700, lng: 34.8188 },
  'rg-kikar-hamedina':{ lat: 32.0670, lng: 34.8100 },
  'rg-geha':          { lat: 32.0830, lng: 34.8450 },
  'rg-borochov':      { lat: 32.0770, lng: 34.8285 },
  'rg-ramat-amidar':  { lat: 32.0615, lng: 34.8365 },

  // ─── ASHKELON neighborhoods ────────────────────────────────
  'ask-center':  { lat: 31.6626, lng: 34.5743 },
  'ask-barnea':  { lat: 31.6823, lng: 34.5681 },
  'ask-migdal':  { lat: 31.6495, lng: 34.5686 },
  'ask-north':   { lat: 31.6790, lng: 34.5603 },
  'ask-shikmim': { lat: 31.6701, lng: 34.5826 },

  // ─── REHOVOT neighborhoods ─────────────────────────────────
  'reh-center':       { lat: 31.8988, lng: 34.8072 },
  'reh-kiryat-moshe': { lat: 31.8836, lng: 34.8088 },
  'reh-north':        { lat: 31.9175, lng: 34.8175 },
  'reh-south':        { lat: 31.8773, lng: 34.8023 },
  'reh-kfar-ganim':   { lat: 31.9053, lng: 34.8253 },

  // ─── BAT YAM neighborhoods ─────────────────────────────────
  'by-center': { lat: 32.0199, lng: 34.7523 },
  'by-kikar':  { lat: 32.0163, lng: 34.7453 },
  'by-north':  { lat: 32.0285, lng: 34.7504 },

  // ─── BEIT SHEMESH neighborhoods ────────────────────────────
  'bsh-center':                 { lat: 31.7462, lng: 34.9874 },
  'bsh-ramat-beit-shemesh-alef':{ lat: 31.7387, lng: 34.9762 },
  'bsh-ramat-beit-shemesh-bet': { lat: 31.7295, lng: 34.9682 },
  'bsh-old-city':               { lat: 31.7539, lng: 34.9925 },
  'bsh-north':                  { lat: 31.7578, lng: 34.9978 },

  // ─── KFAR SABA neighborhoods ───────────────────────────────
  'ks-center':     { lat: 32.1810, lng: 34.9108 },
  'ks-neve-yarko': { lat: 32.1676, lng: 34.9188 },
  'ks-north':      { lat: 32.1940, lng: 34.9072 },
  'ks-south':      { lat: 32.1683, lng: 34.9075 },

  // ─── HERZLIYA neighborhoods ────────────────────────────────
  'hz-center':          { lat: 32.1620, lng: 34.8432 },
  'hz-pituah':          { lat: 32.1552, lng: 34.8252 },
  'hz-herzliya-gimmel': { lat: 32.1710, lng: 34.8538 },
  'hz-shikun-vatikim':  { lat: 32.1680, lng: 34.8390 },
  'hz-north':           { lat: 32.1788, lng: 34.8508 },

  // ─── HADERA neighborhoods ──────────────────────────────────
  'hdr-center':        { lat: 32.4327, lng: 34.9239 },
  'hdr-north':         { lat: 32.4518, lng: 34.9219 },
  'hdr-south':         { lat: 32.4178, lng: 34.9121 },
  'hdr-givat-olga':    { lat: 32.4593, lng: 34.9124 },
  'hdr-kiryat-eliezer':{ lat: 32.4228, lng: 34.8988 },

  // ─── MODIIN neighborhoods ──────────────────────────────────
  'mod-center':        { lat: 31.8939, lng: 35.0123 },
  'mod-buchman':       { lat: 31.9082, lng: 35.0198 },
  'mod-maccabim':      { lat: 31.8673, lng: 34.9961 },
  'mod-reut':          { lat: 31.8938, lng: 35.0295 },
  'mod-yitzhak-rabin': { lat: 31.9025, lng: 35.0057 },
  'mod-kiryat-ilan':   { lat: 31.8854, lng: 35.0188 },

  // ─── LOD neighborhoods ─────────────────────────────────────
  'lod-center':        { lat: 31.9520, lng: 34.8968 },
  'lod-kiryat-eshkol': { lat: 31.9453, lng: 34.9102 },
  'lod-pardes':        { lat: 31.9601, lng: 34.9013 },
  'lod-south':         { lat: 31.9432, lng: 34.8882 },

  // ─── RAANANA neighborhoods ─────────────────────────────────
  'rn-center': { lat: 32.1840, lng: 34.8706 },
  'rn-north':  { lat: 32.2002, lng: 34.8766 },
  'rn-south':  { lat: 32.1674, lng: 34.8635 },
  'rn-east':   { lat: 32.1837, lng: 34.8900 },

  // ─── RAMLA neighborhoods ───────────────────────────────────
  'ram-center': { lat: 31.9282, lng: 34.8717 },
  'ram-south':  { lat: 31.9145, lng: 34.8686 },
  'ram-north':  { lat: 31.9418, lng: 34.8762 },

  // ─── ROSH HAAYIN neighborhoods ─────────────────────────────
  'rha-center': { lat: 32.0958, lng: 34.9572 },
  'rha-north':  { lat: 32.1082, lng: 34.9608 },
  'rha-south':  { lat: 32.0839, lng: 34.9490 },
  'rha-east':   { lat: 32.0966, lng: 34.9672 },

  // ─── HOD HASHARON neighborhoods ────────────────────────────
  'hhs-center':        { lat: 32.1528, lng: 34.8963 },
  'hhs-kiryat-haroeh': { lat: 32.1650, lng: 34.9085 },
  'hhs-magdiel':       { lat: 32.1430, lng: 34.8875 },
  'hhs-north':         { lat: 32.1694, lng: 34.8962 },

  // ─── KIRYAT GAT neighborhoods ──────────────────────────────
  'kg-center': { lat: 31.6083, lng: 34.7632 },
  'kg-north':  { lat: 31.6200, lng: 34.7710 },

  // ─── NAHARIYA neighborhoods ────────────────────────────────
  'nhr-center': { lat: 33.0038, lng: 35.0958 },
  'nhr-north':  { lat: 33.0155, lng: 35.0890 },
  'nhr-south':  { lat: 32.9921, lng: 35.0985 },

  // ─── AFULA neighborhoods ───────────────────────────────────
  'afl-center': { lat: 32.6092, lng: 35.2894 },
  'afl-north':  { lat: 32.6218, lng: 35.2912 },
  'afl-south':  { lat: 32.5963, lng: 35.2876 },
  'afl-east':   { lat: 32.6094, lng: 35.3063 },

  // ─── KIRYAT ATA neighborhoods ──────────────────────────────
  'ka-center': { lat: 32.8120, lng: 35.1147 },
  'ka-north':  { lat: 32.8258, lng: 35.1185 },
  'ka-south':  { lat: 32.7992, lng: 35.1098 },

  // ─── YAVNE neighborhoods ───────────────────────────────────
  'yv-center':       { lat: 31.8783, lng: 34.7450 },
  'yv-kiryat-ganim': { lat: 31.8858, lng: 34.7513 },
  'yv-north':        { lat: 31.8922, lng: 34.7413 },

  // ─── EILAT neighborhoods ───────────────────────────────────
  'eil-center': { lat: 29.5586, lng: 34.9512 },
  'eil-north':  { lat: 29.5710, lng: 34.9498 },
  'eil-south':  { lat: 29.5463, lng: 34.9540 },

  // ─── NES ZIONA neighborhoods ───────────────────────────────
  'nz-center': { lat: 31.9311, lng: 34.7978 },
  'nz-north':  { lat: 31.9437, lng: 34.8003 },
  'nz-south':  { lat: 31.9188, lng: 34.7953 },

  // ─── SDEROT neighborhoods ──────────────────────────────────
  'sderot-naot-hanasi':  { lat: 31.5282, lng: 34.6012 },
  'sderot-naot-aviv':    { lat: 31.5198, lng: 34.5948 },
  'sderot-kalaniyot':    { lat: 31.5245, lng: 34.5901 },
  'sderot-naot-neviim':  { lat: 31.5310, lng: 34.5978 },
  'sderot-naot-rabin':   { lat: 31.5233, lng: 34.6035 },
  'sderot-achuzah':      { lat: 31.5265, lng: 34.5870 },
  'sderot-naot-shikma':  { lat: 31.5178, lng: 34.5988 },
  'sderot-musica':       { lat: 31.5255, lng: 34.5942 },
  'sderot-naot-eshkol':  { lat: 31.5290, lng: 34.6058 },
  'sderot-naot-dekel':   { lat: 31.5222, lng: 34.5925 },
  'sderot-meysadim':     { lat: 31.5300, lng: 34.5895 },
  'sderot-bapark':       { lat: 31.5340, lng: 34.6018 },
  'sderot-bostanaim':    { lat: 31.5185, lng: 34.6072 },
  'sderot-bengurion':    { lat: 31.5215, lng: 34.5860 },
};
