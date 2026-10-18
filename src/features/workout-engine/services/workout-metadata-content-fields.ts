/**
 * Shared definitions for workoutMetadata content rows (titles / descriptions):
 * the deterministic doc-id scheme and the "moment" fields (weather, situation,
 * timeOfDay) that the admin bulk upload, the admin row editor and
 * scripts/import-workout-copy-v2.ts all write. Pure — no Firebase imports, so
 * the Node import script can use it as-is.
 */

/**
 * FNV-1a 32-bit hash → 8-char hex string (UTF-16 code units, like the
 * original admin implementation). Deterministic, fast, fine for short strings.
 */
export function fnv1aHash(input: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

/**
 * Deterministic Firestore doc id for a content row, exactly as the admin bulk
 * upload has always computed it: text + persona + bundleId + gender, trimmed,
 * empty parts dropped, joined with '|', FNV-1a hashed. Same content → same id →
 * a re-upload overwrites instead of duplicating.
 */
export function generateMetadataDocId(text: string, persona: string, bundleId: string, gender: string): string {
  const raw = [text.trim(), persona.trim(), bundleId.trim(), gender.trim()]
    .filter(Boolean)
    .join('|');
  return fnv1aHash(raw);
}

export const CONTENT_WEATHER_VALUES = ['rain', 'heat', 'cold', 'uv'] as const;
export type ContentWeather = typeof CONTENT_WEATHER_VALUES[number];

export const CONTENT_SITUATION_VALUES = ['returning', 'deload'] as const;
export type ContentSituationValue = typeof CONTENT_SITUATION_VALUES[number];

export const CONTENT_TIME_OF_DAY_VALUES = ['morning', 'afternoon', 'evening', 'night', 'any'] as const;

/** Admin dropdown labels. Empty value = the row shows in any weather / situation. */
export const CONTENT_WEATHER_LABELS_HE: Record<ContentWeather, string> = {
  rain: 'גשם',
  heat: 'חום',
  cold: 'קור',
  uv: 'קרינת UV גבוהה',
};

export const CONTENT_SITUATION_LABELS_HE: Record<ContentSituationValue, string> = {
  returning: 'חוזרים אחרי הפסקה',
  deload: 'שבוע הורדת עומס',
};

/**
 * Pure: read + validate the moment fields from a parsed bulk-upload row.
 * Unknown values are dropped (and reported as warnings) rather than written,
 * because the engine hard-excludes any row whose weather/situation does not
 * match the session — a typo would hide the row everywhere.
 */
export function readMomentFields(item: Record<string, unknown>): {
  weather?: ContentWeather;
  situation?: ContentSituationValue;
  timeOfDay?: string;
  warnings: string[];
} {
  const warnings: string[] = [];
  const str = (v: unknown) => (typeof v === 'string' ? v.trim() : v == null ? '' : String(v).trim());

  const weatherRaw = str(item.weather ?? item['מזג_אוויר']);
  const situationRaw = str(item.situation ?? item['מצב']);
  const timeRaw = str(item.timeOfDay ?? item['שעת_יום']);

  const out: { weather?: ContentWeather; situation?: ContentSituationValue; timeOfDay?: string; warnings: string[] } = { warnings };

  if (weatherRaw && weatherRaw !== 'any') {
    if ((CONTENT_WEATHER_VALUES as readonly string[]).includes(weatherRaw)) out.weather = weatherRaw as ContentWeather;
    else warnings.push(`weather לא תקין: "${weatherRaw}" (ערכים: ${CONTENT_WEATHER_VALUES.join(', ')}) — השדה לא נשמר`);
  }
  if (situationRaw && situationRaw !== 'any') {
    if ((CONTENT_SITUATION_VALUES as readonly string[]).includes(situationRaw)) out.situation = situationRaw as ContentSituationValue;
    else warnings.push(`situation לא תקין: "${situationRaw}" (ערכים: ${CONTENT_SITUATION_VALUES.join(', ')}) — השדה לא נשמר`);
  }
  if (timeRaw) {
    if ((CONTENT_TIME_OF_DAY_VALUES as readonly string[]).includes(timeRaw)) out.timeOfDay = timeRaw;
    else warnings.push(`timeOfDay לא תקין: "${timeRaw}" (ערכים: ${CONTENT_TIME_OF_DAY_VALUES.join(', ')}) — השדה לא נשמר`);
  }
  return out;
}
