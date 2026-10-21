/**
 * qaRunnerReport — the pure request rules (validation + exactly which doc each op may touch).
 * Zero Firebase imports: unit-tested from the root vitest.
 *
 * Least privilege (owner, 20.10.2026): the AI-driven tester runner has NO Firestore / Storage
 * role. Everything it reads or writes goes through this one endpoint, which accepts a closed
 * set of ops, validates every field, and maps each op to fixed paths:
 *
 *   status        read   flags (2 switches), demo_registry/config, control stop flag, usage (31 days), testers roster,
 *                        demo_registry/owner_rules (notes + dismissals, whitelisted; read only)
 *   stop          read   demo_registry/control.testersStopRequested
 *   heartbeat     merge  demo_registry/control.testers.{state, runId, lastSessionAt, findingsCount, spentUsd, heartbeatAt}
 *   usage         incr   demo_registry/usage/days/{today ± 1}  totals + bySource.testers (+ testerSessions)
 *   finding       create qa_findings/{runId}__{fingerprint}    (once; an existing doc only gets count+1)
 *   finding_bump  incr   qa_findings/{id}.count                 (doc must exist)
 *   upload_url    —      signed PUT URL for qa/{runId}/{mission}/{NNN}-{hex8}.png, image/png, 10 min
 *   findings      read   qa_findings where runId == x (limit 500)
 *   latest_run    read   newest qa_findings runId
 *   summary_get   read   demo_registry/qa_summary
 *   summary_put   set    demo_registry/qa_summary (sanitised, incl. the overseer's `design` block)
 *
 * `finding` and `upload_url` additionally need enable_demo_users && enable_ai_testers. Usage and
 * heartbeat are always accepted (cost accounting must never be lost; "idle" after a switch-off).
 */

export const QA_FINDINGS = 'qa_findings';
export const REGISTRY = 'demo_registry';
export const CONTROL_DOC = `${REGISTRY}/control`;
export const SUMMARY_DOC = `${REGISTRY}/qa_summary`;
export const usageDayPath = (day: string) => `${REGISTRY}/usage/days/${day}`;

export const RUN_ID_RE = /^[A-Za-z0-9_-]{1,64}$/;
export const FINDING_DOC_RE = /^[A-Za-z0-9_-]{1,64}__[a-f0-9]{8,40}$/;
export const UPLOAD_PATH_RE = /^qa\/([A-Za-z0-9_-]{1,64})\/[A-Za-z0-9_-]{1,40}\/\d{3}-[a-f0-9]{8}\.png$/;
const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
const MODEL_RE = /^[a-z0-9][a-z0-9._:-]{0,63}$/;
const FP_RE = /^[a-f0-9]{8,40}$/;

export const FINDINGS_READ_LIMIT = 500;
export const UPLOAD_URL_TTL_MS = 10 * 60 * 1000;

/** Per-call ceilings: one model call can't plausibly exceed these. */
const MAX_TOKENS_PER_CALL = 2_000_000;
const MAX_USD_PER_CALL = 50;

export type OpError = { ok: false; status: number; error: string };
export type Op<T> = { ok: true; value: T } | OpError;
const bad = (error: string, status = 400): OpError => ({ ok: false, status, error });

export const OPS = ['status', 'stop', 'heartbeat', 'usage', 'finding', 'finding_bump', 'upload_url', 'findings', 'latest_run', 'summary_get', 'summary_put'] as const;
export type OpName = (typeof OPS)[number];
export const OPS_NEEDING_SWITCHES: ReadonlySet<OpName> = new Set<OpName>(['finding', 'upload_url']);

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const str = (v: unknown, max: number) => (typeof v === 'string' ? v.slice(0, max) : '');
const nonNeg = (v: unknown, max: number) => typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= max;
const sanitizeRunId = (r: string) => r.replace(/[^A-Za-z0-9_-]/g, '_');

export function parseOp(body: unknown): Op<{ op: OpName; args: Record<string, unknown> }> {
  if (!isObj(body) || typeof body.op !== 'string' || !(OPS as readonly string[]).includes(body.op)) return bad('bad_op');
  return { ok: true, value: { op: body.op as OpName, args: isObj(body.args) ? body.args : {} } };
}

// ── Days ──────────────────────────────────────────────────────────────────────

function shiftDay(day: string, delta: number): string {
  const d = new Date(`${day}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + delta);
  return d.toISOString().slice(0, 10);
}

/** The runner's Israel day key, accepted only around the server's (clock skew at midnight). */
export function validDayKey(day: unknown, today: string): day is string {
  return typeof day === 'string' && DAY_RE.test(day) && (day === today || day === shiftDay(today, -1) || day === shiftDay(today, 1));
}

// ── heartbeat ─────────────────────────────────────────────────────────────────

export interface Heartbeat {
  state: 'running' | 'idle';
  runId: string;
  lastSessionAtMs: number | null;
  findingsCount: number;
  spentUsd: number;
}

export function parseHeartbeat(a: Record<string, unknown>): Op<Heartbeat> {
  if (a.state !== 'running' && a.state !== 'idle') return bad('bad_state');
  if (typeof a.runId !== 'string' || !RUN_ID_RE.test(a.runId)) return bad('bad_run_id');
  const last = nonNeg(a.lastSessionAtMs, 8.64e15) ? (a.lastSessionAtMs as number) : null;
  return {
    ok: true,
    value: {
      state: a.state,
      runId: a.runId,
      lastSessionAtMs: last,
      findingsCount: nonNeg(a.findingsCount, 100_000) ? Math.floor(a.findingsCount as number) : 0,
      spentUsd: nonNeg(a.spentUsd, 10_000) ? (a.spentUsd as number) : 0,
    },
  };
}

// ── usage ─────────────────────────────────────────────────────────────────────

export interface UsageDelta {
  llmCalls: number;
  inputTokens: number;
  outputTokens: number;
  cachedTokens: number;
  usd: number;
  model: string;
}

export function parseUsage(a: Record<string, unknown>, today: string): Op<{ day: string; delta: UsageDelta; sessionStarted: boolean }> {
  if (!validDayKey(a.day, today)) return bad('bad_day');
  const d = isObj(a.delta) ? a.delta : {};
  if (!nonNeg(d.llmCalls, 1)) return bad('bad_llm_calls');
  for (const k of ['inputTokens', 'outputTokens', 'cachedTokens'] as const) if (!nonNeg(d[k], MAX_TOKENS_PER_CALL)) return bad(`bad_${k}`);
  if (!nonNeg(d.usd, MAX_USD_PER_CALL)) return bad('bad_usd');
  if (typeof d.model !== 'string' || !MODEL_RE.test(d.model)) return bad('bad_model');
  return {
    ok: true,
    value: {
      day: a.day,
      sessionStarted: a.sessionStarted === true,
      delta: {
        llmCalls: Math.floor(d.llmCalls as number),
        inputTokens: Math.floor(d.inputTokens as number),
        outputTokens: Math.floor(d.outputTokens as number),
        cachedTokens: Math.floor(d.cachedTokens as number),
        usd: d.usd as number,
        model: d.model,
      },
    },
  };
}

/** The merge payload: increments only (several writers share the day doc). */
export function usageWrite(delta: UsageDelta, sessionStarted: boolean, inc: (n: number) => unknown, now: unknown): Record<string, unknown> {
  const counters = {
    llmCalls: inc(delta.llmCalls),
    inputTokens: inc(delta.inputTokens),
    outputTokens: inc(delta.outputTokens),
    cachedTokens: inc(delta.cachedTokens),
    usdEstimate: inc(delta.usd),
  };
  return {
    ...counters,
    ...(sessionStarted ? { testerSessions: inc(1) } : {}),
    bySource: { testers: { ...counters, model: delta.model } },
    updatedAt: now,
  };
}

// ── findings ──────────────────────────────────────────────────────────────────

const SEVERITIES = ['P0', 'P1', 'P2', 'P3'];
const CATEGORIES = ['broken', 'ux', 'design-rule', 'copy', 'perf', 'a11y'];
const SOURCES = ['lint', 'llm', 'runner'];

export function findingDocId(runId: string, fp: string): string {
  return `${sanitizeRunId(runId)}__${fp}`;
}

function sanitizeRepro(v: unknown): Array<Record<string, string | number | boolean>> {
  if (!Array.isArray(v)) return [];
  return v.slice(-25).flatMap((step) => {
    if (!isObj(step)) return [];
    const out: Record<string, string | number | boolean> = {};
    for (const [k, x] of Object.entries(step).slice(0, 8)) {
      if (!/^[a-z_]{1,20}$/.test(k)) continue;
      if (typeof x === 'string') out[k] = x.slice(0, 200);
      else if (typeof x === 'number' && Number.isFinite(x)) out[k] = x;
      else if (typeof x === 'boolean') out[k] = x;
    }
    return [out];
  });
}

/** Whitelists and bounds every field; the doc id must be derived from (runId, fingerprint). */
export function parseFinding(a: Record<string, unknown>): Op<{ docId: string; data: Record<string, unknown> }> {
  const f = isObj(a.finding) ? a.finding : null;
  if (!f) return bad('bad_finding');
  if (typeof f.runId !== 'string' || !RUN_ID_RE.test(f.runId)) return bad('bad_run_id');
  if (typeof f.fingerprint !== 'string' || !FP_RE.test(f.fingerprint)) return bad('bad_fingerprint');
  const docId = findingDocId(f.runId, f.fingerprint);
  if (a.docId !== docId) return bad('bad_doc_id');
  if (!SEVERITIES.includes(f.severity as string) || !CATEGORIES.includes(f.category as string) || !SOURCES.includes(f.source as string)) return bad('bad_enum');
  if (typeof f.title !== 'string' || !f.title.trim()) return bad('bad_title');
  let screenshot: string | null = null;
  if (f.screenshot !== null && f.screenshot !== undefined) {
    const m = typeof f.screenshot === 'string' ? UPLOAD_PATH_RE.exec(f.screenshot) : null;
    if (!m || m[1] !== sanitizeRunId(f.runId)) return bad('bad_screenshot');
    screenshot = f.screenshot as string;
  }
  const route = str(f.route, 120);
  const data: Record<string, unknown> = {
    id: docId,
    fingerprint: f.fingerprint,
    runId: f.runId,
    mission: str(f.mission, 40),
    persona: str(f.persona, 40),
    device: str(f.device, 40),
    cohort: str(f.cohort, 20),
    url: str(f.url, 200),
    route: route || '/',
    step: nonNeg(f.step, 1000) ? Math.floor(f.step as number) : 0,
    category: f.category,
    severity: f.severity,
    rule: typeof f.rule === 'string' && /^[A-Z0-9-]{2,30}$/.test(f.rule) ? f.rule : null,
    title: str(f.title, 140),
    expected: str(f.expected, 400),
    actual: str(f.actual, 600),
    screenshot,
    repro: sanitizeRepro(f.repro),
    confidence: nonNeg(f.confidence, 1) ? f.confidence : 0.5,
    source: f.source,
    count: 1,
    createdAtMs: nonNeg(f.createdAtMs, 8.64e15) ? f.createdAtMs : 0,
  };
  return { ok: true, value: { docId, data } };
}

export function parseFindingBump(a: Record<string, unknown>): Op<{ docId: string }> {
  return typeof a.docId === 'string' && FINDING_DOC_RE.test(a.docId) ? { ok: true, value: { docId: a.docId } } : bad('bad_doc_id');
}

export function parseUploadPath(a: Record<string, unknown>): Op<{ path: string }> {
  return typeof a.path === 'string' && UPLOAD_PATH_RE.test(a.path) ? { ok: true, value: { path: a.path } } : bad('bad_path');
}

export function parseRunIdArg(a: Record<string, unknown>): Op<{ runId: string }> {
  return typeof a.runId === 'string' && RUN_ID_RE.test(a.runId) ? { ok: true, value: { runId: a.runId } } : bad('bad_run_id');
}

// ── summary ───────────────────────────────────────────────────────────────────

const strArr = (v: unknown, max: number, len: number) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string').slice(0, max).map((x) => x.slice(0, len)) : []);
const int = (v: unknown, max: number) => (nonNeg(v, max) ? Math.floor(v as number) : 0);

// The overseer's `design` block (scripts/qa/lib/overseer/design-report.ts DesignSummary).
export const DESIGN_MAX_SCREENS = 15;
export const DESIGN_MAX_RESUME = 10;
const RULE_RE = /^[A-Z0-9-]{2,30}$/;
const RESUME_RE = /^[A-Za-z0-9_-]{1,40}(@[a-z0-9_]{2,40})?$/;
// eslint-disable-next-line no-control-regex
const CTRL_RE = /[\u0000-\u001f\u007f]/g;
/** A 1–5 score (means carry one decimal), anything else → null. */
const score = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) && v >= 1 && v <= 5 ? Math.round(v * 10) / 10 : null);
const text = (v: unknown, max: number): string => str(v, max).replace(CTRL_RE, ' ').trim();

function parseDesignScreen(x: unknown): Record<string, unknown>[] {
  if (!isObj(x)) return [];
  const screen = text(x.screen, 120);
  if (!screen) return [];
  return [
    {
      screen,
      label: text(x.label, 80) || null,
      route: text(x.route, 120) || '/',
      score: score(x.score),
      clarity: score(x.clarity),
      consistency: score(x.consistency),
      density: score(x.density),
      rtl: score(x.rtl),
      devices: strArr(x.devices, 10, 40),
      findings: int(x.findings, 100_000),
      worst: SEVERITIES.includes(x.worst as string) ? x.worst : null,
      topRule: typeof x.topRule === 'string' && RULE_RE.test(x.topRule) ? x.topRule : null,
      screenshot: typeof x.screenshot === 'string' && UPLOAD_PATH_RE.test(x.screenshot) ? x.screenshot : null,
    },
  ];
}

/** Whitelisted + bounded; null when the summary has no design block (non-design runs). */
export function parseDesignBlock(v: unknown): Record<string, unknown> | null {
  if (!isObj(v)) return null;
  return {
    screensScored: int(v.screensScored, 10_000),
    avgScore: score(v.avgScore),
    lowScreens: int(v.lowScreens, 10_000),
    findings: int(v.findings, 100_000),
    screens: (Array.isArray(v.screens) ? v.screens : []).slice(0, DESIGN_MAX_SCREENS).flatMap(parseDesignScreen),
    resume: Array.from(new Set(strArr(v.resume, DESIGN_MAX_RESUME * 3, 100).filter((r) => RESUME_RE.test(r)))).slice(0, DESIGN_MAX_RESUME),
  };
}

/** Same shape as src/lib/demo-control/qa-summary.ts (the panel's parser). */
export function parseSummary(a: Record<string, unknown>): Op<Record<string, unknown>> {
  const s = isObj(a.summary) ? a.summary : null;
  if (!s || typeof s.runId !== 'string' || !RUN_ID_RE.test(s.runId)) return bad('bad_summary');
  const bs = isObj(s.bySeverity) ? s.bySeverity : {};
  const clusters = (Array.isArray(s.clusters) ? s.clusters : []).slice(0, 10).flatMap((c) => {
    if (!isObj(c) || typeof c.key !== 'string' || typeof c.title !== 'string') return [];
    return [
      {
        key: c.key.slice(0, 40),
        title: c.title.slice(0, 200),
        severity: SEVERITIES.includes(c.severity as string) ? c.severity : 'P3',
        rule: typeof c.rule === 'string' ? c.rule.slice(0, 30) : null,
        route: str(c.route, 120) || '/',
        count: int(c.count, 100_000),
        devices: strArr(c.devices, 10, 40),
        personas: strArr(c.personas, 20, 40),
        missions: strArr(c.missions, 20, 40),
        screenshot: typeof c.screenshot === 'string' && UPLOAD_PATH_RE.test(c.screenshot) ? c.screenshot : null,
        isNew: c.isNew === true,
      },
    ];
  });
  return {
    ok: true,
    value: {
      runId: s.runId,
      findings: int(s.findings, 100_000),
      bySeverity: { P0: int(bs.P0, 100_000), P1: int(bs.P1, 100_000), P2: int(bs.P2, 100_000), P3: int(bs.P3, 100_000) },
      clusters,
      clusterKeys: strArr(s.clusterKeys, 300, 40),
      sessions: (Array.isArray(s.sessions) ? s.sessions : []).slice(0, 20).flatMap((x) =>
        isObj(x) && typeof x.mission === 'string' && typeof x.outcome === 'string' ? [{ mission: x.mission.slice(0, 40), outcome: x.outcome.slice(0, 20) }] : [],
      ),
      design: parseDesignBlock(s.design),
    },
  };
}

// ── status (what the runner may read) ─────────────────────────────────────────

export function statusPayload(input: {
  flagsRaw: Record<string, unknown> | undefined;
  configRaw: Record<string, unknown> | undefined;
  controlRaw: Record<string, unknown> | undefined;
  testersRaw: Record<string, unknown> | undefined;
  usageDocs: Array<{ id: string; data: Record<string, unknown> | undefined }>;
  /** demo_registry/owner_rules (the owner's notes + "לא רלוונטי" dismissals). */
  ownerRulesRaw?: Record<string, unknown> | undefined;
}): Record<string, unknown> {
  const roster = Array.isArray(input.testersRaw?.uids) ? (input.testersRaw!.uids as unknown[]).filter((u): u is string => typeof u === 'string') : [];
  return {
    switches: { enable_demo_users: input.flagsRaw?.enable_demo_users === true, enable_ai_testers: input.flagsRaw?.enable_ai_testers === true },
    config: { caps: input.configRaw?.caps ?? null, prices: input.configRaw?.prices ?? null },
    stopRequested: input.controlRaw?.testersStopRequested === true,
    usageDays: input.usageDocs.map((d) => ({ id: d.id, data: jsonSafe(d.data ?? {}) })),
    roster,
    ownerRules: ownerRulesPayload(input.ownerRulesRaw),
  };
}

// ── owner rules (src/lib/demo-control/owner-rules-model.ts) ──────────────────

export const OWNER_NOTES_MAX = 200;
export const OWNER_DISMISSALS_MAX = 300;
const OWN_ID_RE = /^OWN-\d{3}$/;
const SCREEN_KEY_RE = /^[A-Za-z0-9_/\[\]:.-]{1,120}$/;
const RULE_ID_RE = /^[A-Z0-9-]{2,30}$/;
const isScreenKey = (v: unknown): v is string => typeof v === 'string' && SCREEN_KEY_RE.test(v) && !v.includes('..');
const FINDING_ID_LOOSE_RE = /^[A-Za-z0-9_.:-]{1,300}$/;
const ms = (v: unknown): number => {
  if (typeof v === 'number' && Number.isFinite(v) && v >= 0) return v;
  const t = v as { toMillis?: () => number } | null;
  return t && typeof t.toMillis === 'function' ? t.toMillis() : 0;
};

/**
 * Whitelist of demo_registry/owner_rules for the runner: note id / text / screen / severity /
 * time, and dismissal finding id / rule / screen / title / reason / time. Never `by` (admin uid).
 */
export function ownerRulesPayload(raw: Record<string, unknown> | undefined): { notes: Array<Record<string, unknown>>; dismissals: Array<Record<string, unknown>> } {
  const r = isObj(raw) ? raw : {};
  const notes = (Array.isArray(r.notes) ? r.notes : []).slice(-OWNER_NOTES_MAX).flatMap((n: unknown) => {
    if (!isObj(n) || typeof n.id !== 'string' || !OWN_ID_RE.test(n.id) || typeof n.text !== 'string' || !n.text.trim()) return [];
    return [
      {
        id: n.id,
        text: n.text.slice(0, 500),
        screen: isScreenKey(n.screen) ? n.screen : null,
        severity: SEVERITIES.includes(n.severity as string) ? n.severity : 'P2',
        createdAtMs: ms(n.createdAtMs),
      },
    ];
  });
  const dismissals = (Array.isArray(r.dismissals) ? r.dismissals : []).slice(-OWNER_DISMISSALS_MAX).flatMap((d: unknown) => {
    if (!isObj(d) || typeof d.findingId !== 'string' || !FINDING_ID_LOOSE_RE.test(d.findingId) || !isScreenKey(d.screen)) return [];
    return [
      {
        findingId: d.findingId,
        rule: typeof d.rule === 'string' && RULE_ID_RE.test(d.rule) ? d.rule : null,
        screen: d.screen as string,
        title: typeof d.title === 'string' ? d.title.slice(0, 140) : '',
        reason: typeof d.reason === 'string' ? d.reason.slice(0, 300) : '',
        atMs: ms(d.atMs),
      },
    ];
  });
  return { notes, dismissals };
}

/** Firestore Timestamps → ms numbers so the payload is plain JSON. */
export function jsonSafe(v: unknown): unknown {
  if (v === null || typeof v !== 'object') return v;
  const t = v as { toMillis?: () => number };
  if (typeof t.toMillis === 'function') return t.toMillis();
  if (Array.isArray(v)) return v.map(jsonSafe);
  return Object.fromEntries(Object.entries(v as Record<string, unknown>).map(([k, x]) => [k, jsonSafe(x)]));
}
