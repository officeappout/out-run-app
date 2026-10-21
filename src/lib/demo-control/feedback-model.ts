/**
 * Demo control center — the "משוב דמו" tab (owner, 20.10.2026): one feed for
 *   - life:    the life engine's park / app feedback moments (demo_registry/life/feedback/{id},
 *              written by functions/src/demo-life/social.ts writeFeedback)
 *              { kind: 'park' | 'app', uid, parkId?, parkName?, authorityId, text, generatedBy, createdAt, isDemo }
 *   - testers: the AI testers' findings (qa_findings/{runId}__{fingerprint}, written by qaRunnerReport)
 *              { runId, persona, device, mission, route, url, category, severity, rule, title,
 *                expected, actual, screenshot, repro[], count, createdAt, createdAtMs }
 * plus the panel's own triage mark on the same doc: { triage: { status, by, at } }.
 *
 * Pure: lenient mappers (bad fields → defaults, never throw) + the markdown task text.
 * No Firebase import.
 */
import { QA_SEVERITIES, type QaDesignDimension, type QaSeverity } from './qa-summary';
import { decodeDesignScores } from './qa-design';

export type FeedbackSource = 'life' | 'testers';
export const FEEDBACK_SOURCES: readonly FeedbackSource[] = ['life', 'testers'];

export const LIFE_FEEDBACK_TYPES = ['park', 'app'] as const;
export const QA_CATEGORIES = ['broken', 'ux', 'design-rule', 'copy', 'perf', 'a11y'] as const;
export type FeedbackType = (typeof LIFE_FEEDBACK_TYPES)[number] | (typeof QA_CATEGORIES)[number];
export const FEEDBACK_TYPES: readonly FeedbackType[] = [...LIFE_FEEDBACK_TYPES, ...QA_CATEGORIES];

export type TriageStatus = 'open' | 'handled' | 'irrelevant';
export const TRIAGE_STATUSES: readonly TriageStatus[] = ['open', 'handled', 'irrelevant'];

export interface FeedbackItem {
  /** Doc id inside its source collection. */
  id: string;
  source: FeedbackSource;
  type: FeedbackType;
  /** Testers only. */
  severity: QaSeverity | null;
  /** Demo uid (life) or the tester persona id (testers). */
  personaId: string;
  /** Display name when known (life: from demo_registry/personas), else the id. */
  personaName: string;
  title: string;
  /** Life: the feedback text. Testers: what happened (actual). */
  text: string;
  /** Testers: what we expected. */
  expected: string;
  createdAtMs: number;
  status: TriageStatus;
  statusAtMs: number | null;
  /** Life park feedback. */
  parkName: string | null;
  /** Life: 'llm' | 'bank'. */
  generatedBy: string | null;
  /** Testers. */
  route: string | null;
  url: string | null;
  runId: string | null;
  mission: string | null;
  device: string | null;
  rule: string | null;
  count: number;
  /** Testers: Storage path qa/{runId}/… (the screenshot route signs it). */
  hasScreenshot: boolean;
  repro: string[];
  /** Testers: a design score record's four 1–5 numbers (rule DESIGN-SCORE), else null. */
  designScores: Record<QaDesignDimension, number> | null;
}

export function millisOf(v: unknown): number | null {
  if (typeof v === 'number' && Number.isFinite(v)) return v;
  if (v instanceof Date) return v.getTime();
  const maybe = v as { toMillis?: () => number } | null;
  return maybe && typeof maybe.toMillis === 'function' ? maybe.toMillis() : null;
}

const s = (v: unknown, max: number): string => (typeof v === 'string' ? v.slice(0, max) : '');
const sOrNull = (v: unknown, max: number): string | null => (typeof v === 'string' && v ? v.slice(0, max) : null);

export function parseTriage(raw: unknown): { status: TriageStatus; atMs: number | null } {
  const t = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const status = TRIAGE_STATUSES.includes(t.status as TriageStatus) ? (t.status as TriageStatus) : 'open';
  return { status, atMs: millisOf(t.at) };
}

/** One repro step ({ name: 'tap', target: '…' } / { world: 'offline', seconds: 5 }) → one line. */
export function reproLine(step: unknown): string | null {
  if (!step || typeof step !== 'object') return null;
  const entries = Object.entries(step as Record<string, unknown>).filter(
    ([, v]) => typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean',
  );
  if (!entries.length) return null;
  const head = entries.find(([k]) => k === 'name');
  const rest = entries.filter(([k]) => k !== 'name').map(([k, v]) => `${k}: ${String(v)}`);
  const line = head ? `${String(head[1])}${rest.length ? ` (${rest.join(', ')})` : ''}` : rest.join(', ');
  return line.slice(0, 240);
}

export function mapLifeFeedback(id: string, raw: Record<string, unknown> | undefined | null, names: ReadonlyMap<string, string>): FeedbackItem {
  const d = raw ?? {};
  const type = d.kind === 'park' ? 'park' : 'app';
  const uid = s(d.uid, 80);
  const parkName = sOrNull(d.parkName, 120);
  const triage = parseTriage(d.triage);
  return {
    id,
    source: 'life',
    type,
    severity: null,
    personaId: uid,
    personaName: names.get(uid) ?? uid,
    title: type === 'park' ? `משוב על פארק${parkName ? `: ${parkName}` : ''}` : 'משוב / רעיון לאפליקציה',
    text: s(d.text, 1000),
    expected: '',
    createdAtMs: millisOf(d.createdAt) ?? 0,
    status: triage.status,
    statusAtMs: triage.atMs,
    parkName,
    generatedBy: sOrNull(d.generatedBy, 20),
    route: null,
    url: null,
    runId: null,
    mission: null,
    device: null,
    rule: null,
    count: 1,
    hasScreenshot: false,
    repro: [],
    designScores: null,
  };
}

export function mapQaFinding(id: string, raw: Record<string, unknown> | undefined | null): FeedbackItem {
  const d = raw ?? {};
  const persona = s(d.persona, 40);
  const triage = parseTriage(d.triage);
  const category = (QA_CATEGORIES as readonly string[]).includes(d.category as string) ? (d.category as FeedbackType) : 'ux';
  const count = typeof d.count === 'number' && Number.isFinite(d.count) && d.count > 0 ? Math.floor(d.count) : 1;
  return {
    id,
    source: 'testers',
    type: category,
    severity: QA_SEVERITIES.includes(d.severity as QaSeverity) ? (d.severity as QaSeverity) : 'P3',
    personaId: persona,
    personaName: persona,
    title: s(d.title, 200) || '(ממצא בלי כותרת)',
    text: s(d.actual, 1000),
    expected: s(d.expected, 600),
    createdAtMs: millisOf(d.createdAt) ?? millisOf(d.createdAtMs) ?? 0,
    status: triage.status,
    statusAtMs: triage.atMs,
    parkName: null,
    generatedBy: null,
    route: sOrNull(d.route, 120),
    url: sOrNull(d.url, 200),
    runId: sOrNull(d.runId, 80),
    mission: sOrNull(d.mission, 40),
    device: sOrNull(d.device, 40),
    rule: sOrNull(d.rule, 30),
    count,
    hasScreenshot: typeof d.screenshot === 'string' && d.screenshot.startsWith('qa/'),
    repro: (Array.isArray(d.repro) ? d.repro : []).slice(-25).map(reproLine).filter((x): x is string => !!x),
    designScores: decodeDesignScores(sOrNull(d.rule, 30), s(d.actual, 1000)),
  };
}

/** Persona names from demo_registry/personas ({ personas: [{ uid, life: { name } }] }). */
export function personaNames(raw: Record<string, unknown> | undefined | null): Map<string, string> {
  const rows = Array.isArray(raw?.personas) ? (raw!.personas as unknown[]) : [];
  const out = new Map<string, string>();
  for (const row of rows.slice(0, 2000)) {
    const r = (row && typeof row === 'object' ? row : {}) as Record<string, unknown>;
    const life = (r.life && typeof r.life === 'object' ? r.life : {}) as Record<string, unknown>;
    const name = typeof life.name === 'string' ? life.name : typeof r.name === 'string' ? r.name : null;
    if (typeof r.uid === 'string' && name) out.set(r.uid, name.slice(0, 60));
  }
  return out;
}

export const TYPE_LABEL: Record<FeedbackType, string> = {
  park: 'משוב על פארק',
  app: 'משוב לאפליקציה',
  broken: 'תקלה',
  ux: 'חוויית שימוש',
  'design-rule': 'חוק עיצוב',
  copy: 'ניסוח',
  perf: 'ביצועים',
  a11y: 'נגישות',
};

export const STATUS_LABEL: Record<TriageStatus, string> = { open: 'פתוח', handled: 'טופל', irrelevant: 'לא רלוונטי' };

/** "העתק כמשימה" — a self-contained markdown task (pasted into a brief / an issue). */
export function buildTaskMarkdown(item: FeedbackItem): string {
  const lines: string[] = [];
  if (item.source === 'testers') {
    lines.push(`## [${item.severity ?? 'P3'}] ${item.title}`, '');
    lines.push(`- מקור: בודקי AI (ריצה ${item.runId ?? '—'}, משימה ${item.mission ?? '—'}, פרסונה ${item.personaName || '—'}, מכשיר ${item.device ?? '—'})`);
    lines.push(`- סוג: ${TYPE_LABEL[item.type]}${item.rule ? ` · חוק ${item.rule}` : ''}`);
    if (item.route) lines.push(`- מסך: \`${item.route}\``);
    if (item.count > 1) lines.push(`- נצפה ${item.count} פעמים`);
    lines.push(`- מזהה ממצא: \`qa_findings/${item.id}\``);
    if (item.expected) lines.push('', '**מה ציפינו:**', item.expected);
    if (item.text) lines.push('', '**מה קרה:**', item.text);
    if (item.repro.length) lines.push('', '**צעדי שחזור:**', ...item.repro.map((r, i) => `${i + 1}. ${r}`));
    if (item.hasScreenshot) lines.push('', 'צילום מסך: במרכז הדמו, לשונית "משוב דמו".');
  } else {
    lines.push(`## ${item.title}`, '');
    lines.push(`- מקור: מנוע החיים של הדמו (פרסונה ${item.personaName || '—'}${item.generatedBy ? `, ${item.generatedBy === 'llm' ? 'נכתב ב-AI' : 'משפט מוכן'}` : ''})`);
    lines.push(`- סוג: ${TYPE_LABEL[item.type]}`);
    lines.push(`- מזהה: \`demo_registry/life/feedback/${item.id}\``);
    lines.push('', '**המשוב:**', `> ${item.text.replace(/\n/g, '\n> ')}`);
    lines.push('', '_זה משוב של משתמש דמו (סימולציה). לבדוק אם הוא מצביע על בעיה אמיתית לפני שמתקנים._');
  }
  return lines.join('\n');
}
