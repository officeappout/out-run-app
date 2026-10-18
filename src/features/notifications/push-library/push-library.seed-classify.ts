/**
 * Pure classification for scripts/seed-push-library.ts (kept here so it is
 * unit-tested; the script only adds Firestore I/O around it).
 *
 *   seedInsertRows      the code defaults → library rows `lib_<pushType>_<n>`
 *                       (gendered pairs carry gender / subjectGender and a
 *                       shared pairId `lib_<pushType>_pair_<pair>`)
 *   classifyLegacyInUse the original Daily_Goal / Future_Partner_Plan rows a
 *                       live sender still reads → archive (superseded), with
 *                       the write rules each one breaks
 *   classifyDormant     the never-sent Inactivity rows → keep (needs rewrite)
 *                       or archive
 */

import {
  PUSH_CATALOG,
  PUSH_CATALOG_BY_TYPE,
  extractVarTokens,
  legacyPushMapping,
  normalizeLegacyPlaceholders,
  sendBlockers,
  validatePushCopyDraft,
  type PushGender,
} from './push-library.core';

export interface SeedInsertRow {
  id: string;
  data: Record<string, unknown>;
}

export const SEED_SOURCE = 'push_copy.csv (title_after/body_after) + gendered pairs';

/** One row per code default. Ids are by index, so appending defaults never renames an existing row. */
export function seedInsertRows(): SeedInsertRow[] {
  const out: SeedInsertRow[] = [];
  for (const entry of PUSH_CATALOG) {
    entry.defaults.forEach((d, i) => {
      const id = `lib_${entry.pushType}_${i}`;
      out.push({
        id,
        data: {
          pushType: entry.pushType,
          lever: entry.lever,
          title: d.title,
          body: d.body,
          text: d.body,
          deepLink: entry.deepLinks[0],
          audience: d.audience ?? null,
          conditions: d.conditions ?? null,
          timeWindow: null,
          fallbackOnly: d.fallbackOnly === true,
          gender: d.gender ?? 'both',
          subjectGender: d.subjectGender ?? 'any',
          pairId: d.pair ? `lib_${entry.pushType}_pair_${d.pair}` : null,
          active: true,
          archived: false,
          needsRewrite: false,
          version: 1,
          bundleId: id,
          source: SEED_SOURCE,
        },
      });
    });
  }
  return out;
}

export interface Classification {
  id: string;
  persona: string;
  decision: 'keep' | 'archive';
  pushType: string;
  reasons: string[];
  text: string;
  /** keep rows that address one gender (אבא / אמא / לוחם / לוחמת) → that recipient gender. */
  gender?: PushGender;
}

const RULE_REASON: Record<string, string> = { slash: 'gender slash', dash: 'em/en dash', emoji: 'emoji', placeholder: '{placeholder}' };

/**
 * The legacy rows a live sender still reads (no pushType yet, not archived,
 * mapped by legacyPushMapping). All are archived: the rewritten library rows
 * replace them. Reasons list which write rules each one breaks today (those
 * are already skipped at send time).
 */
export function classifyLegacyInUse(rows: Array<{ id: string; data: Record<string, unknown> }>): Classification[] {
  const out: Classification[] = [];
  for (const { id, data } of rows) {
    if (data.pushType || data.archived === true) continue;
    const m = legacyPushMapping(data);
    if (!m) continue;
    const text = typeof data.text === 'string' ? data.text : '';
    // Checked the way the sender reads it ({placeName} → @מקום first).
    const broken = sendBlockers({ pushType: m.pushType, title: 'x', body: normalizeLegacyPlaceholders(text) })
      .map((p) => RULE_REASON[p])
      .filter(Boolean);
    out.push({
      id,
      persona: String(data.persona ?? ''),
      decision: 'archive',
      pushType: m.pushType,
      reasons: [`superseded by the rewritten ${m.pushType} copy (lib_${m.pushType}_*)`, ...broken],
      text,
    });
  }
  return out;
}

/** Tags that are really broken gender slashes ("@בוא/י", "@את/ה") — fixable by rewording. */
const SLASH_ARTIFACT_TAGS = new Set(['@בוא', '@את', '@מוכן']);
/** Tags a rewrite can replace without changing the message (fixed number / renamed variable). */
const REWRITABLE_TAGS: Record<string, string> = {
  '@זמן_אימון': 'replace @זמן_אימון with a fixed number of minutes',
  '@ימי_אי_פעילות': 'rename @ימי_אי_פעילות to @ימים',
};
/** Addresses one gender. Now kept as a row for that recipient gender instead of a rewrite reason. */
const MALE_WORDS = /(^|[\s,.])(אבא|לוחם)(?=[\s,.!?]|$)/;
const FEMALE_WORDS = /(^|[\s,.])(אמא|לוחמת)(?=[\s,.!?]|$)/;
/** Retention fills these. */
const RETENTION_VARS = new Set(PUSH_CATALOG_BY_TYPE.retention_lapse.vars as readonly string[]);

function normalizeText(t: string): string {
  return t.replace(/\s+/g, ' ').replace(/[.!?,]+$/g, '').trim();
}

/** Order of `rows` decides which duplicate is kept (first wins). */
export function classifyDormant(rows: Array<{ id: string; data: Record<string, unknown> }>): Classification[] {
  const seen = new Map<string, string>();
  return rows.map(({ id, data }) => {
    const text = typeof data.text === 'string' ? data.text : '';
    const persona = typeof data.persona === 'string' ? data.persona : '';
    const tokens = extractVarTokens(text);
    const unfillable = tokens.filter((t) => !RETENTION_VARS.has(t) && !SLASH_ARTIFACT_TAGS.has(t) && !(t in REWRITABLE_TAGS));
    const norm = normalizeText(text);
    const base = { id, persona, text, pushType: '' };

    if (/[A-Za-z]{2,}/.test(text)) return { ...base, decision: 'archive' as const, reasons: ['english text'] };
    if (seen.has(norm)) return { ...base, decision: 'archive' as const, reasons: [`duplicate of ${seen.get(norm)}`] };
    seen.set(norm, id);
    if (unfillable.length > 0) {
      return {
        ...base,
        decision: 'archive' as const,
        reasons: [`needs data the retention push doesn't have: ${unfillable.join(' ')}`],
      };
    }

    const reasons: string[] = ['needs a title (old rows had body only)'];
    if (tokens.some((t) => SLASH_ARTIFACT_TAGS.has(t)) || text.includes('/')) {
      reasons.push('gender slash (rewrite as a male/female pair or plural)');
    }
    const male = MALE_WORDS.test(text);
    const female = FEMALE_WORDS.test(text);
    const gender: PushGender | undefined = male && !female ? 'male' : female && !male ? 'female' : undefined;
    if (gender) reasons.push(`addresses one gender → kept as a ${gender} row`);
    for (const t of tokens) if (REWRITABLE_TAGS[t]) reasons.push(REWRITABLE_TAGS[t]);
    const issues = validatePushCopyDraft({ pushType: 'retention_lapse', title: 'x', body: text, deepLink: 'home' });
    for (const i of issues) {
      if (/לוכסן|משתנה/.test(i.message)) continue; // already covered above
      if (/קו מפריד/.test(i.message)) reasons.push('em/en dash');
      else if (/אימוג/.test(i.message)) reasons.push('emoji');
      else if (/ארוכה/.test(i.message)) reasons.push('too long (>90)');
      else reasons.push(i.message);
    }
    return {
      ...base,
      decision: 'keep' as const,
      pushType: 'retention_lapse',
      reasons: Array.from(new Set(reasons)),
      ...(gender ? { gender } : {}),
    };
  });
}
