/**
 * The runner's and overseer's only way to read / write server state: the qaRunnerReport function
 * (functions/src/qaRunnerReport.ts). Least privilege (owner, 20.10.2026): the qa-runner service
 * account has NO Firestore or Storage role — it can only invoke the two tester functions. Each
 * call carries the qa-runner Google ID token (audience = the report function's URL); the function
 * re-verifies it, validates the op and touches only its fixed docs. Screenshots go to Storage
 * with a short-lived signed PUT URL the function issues for one path under qa/{runId}/.
 */
import { parseConfig, parseUsageDay, type DemoConfig, type UsageDay } from '@/lib/demo-control/usage-cost';
import { parseOwnerRulesDoc, type OwnerRulesDoc } from '@/lib/demo-control/owner-rules-model';
import type { UsageDelta } from './budget';
import type { Finding } from './findings';

export const DEFAULT_REPORT_URL = 'https://us-central1-appout-1.cloudfunctions.net/qaRunnerReport';

export interface RunnerStatus {
  switchesOn: boolean;
  config: DemoConfig;
  stopRequested: boolean;
  usageDays: UsageDay[];
  roster: Set<string>;
  /** The owner's panel notes + "לא רלוונטי" dismissals (empty until qaRunnerReport is redeployed). */
  ownerRules: OwnerRulesDoc;
}

export interface HeartbeatInput {
  state: 'running' | 'idle';
  runId: string;
  lastSessionAtMs: number | null;
  findingsCount: number;
  spentUsd: number;
}

export interface Store {
  status(): Promise<RunnerStatus>;
  stopRequested(): Promise<boolean>;
  heartbeat(h: HeartbeatInput): Promise<void>;
  addUsage(dayKey: string, delta: UsageDelta, sessionStarted: boolean): Promise<void>;
  saveFinding(docId: string, f: Finding): Promise<void>;
  bumpFinding(docId: string): Promise<void>;
  uploadScreenshot(path: string, png: Buffer): Promise<string | null>;
  readFindings(runId: string): Promise<Finding[]>;
  latestRunId(): Promise<string | null>;
  readQaSummaryRaw(): Promise<Record<string, unknown> | undefined>;
  writeQaSummary(doc: Record<string, unknown>): Promise<void>;
}

export class ReportCallError extends Error {
  constructor(
    readonly op: string,
    readonly code: string,
  ) {
    super(`qaRunnerReport ${op}: ${code}`);
  }
}

/** Pure: the function's `status` payload → typed status (lenient, like the panel's parsers). */
export function parseStatus(body: Record<string, unknown>): RunnerStatus {
  const sw = (body.switches ?? {}) as Record<string, unknown>;
  const cfg = (body.config ?? {}) as Record<string, unknown>;
  const days = Array.isArray(body.usageDays) ? body.usageDays : [];
  return {
    switchesOn: sw.enable_demo_users === true && sw.enable_ai_testers === true,
    config: parseConfig(cfg),
    stopRequested: body.stopRequested === true,
    usageDays: days.flatMap((d) => {
      const x = (d ?? {}) as { id?: unknown; data?: unknown };
      return typeof x.id === 'string' ? [parseUsageDay(x.id, (x.data ?? {}) as Record<string, unknown>)] : [];
    }),
    roster: new Set(Array.isArray(body.roster) ? body.roster.filter((u): u is string => typeof u === 'string') : []),
    ownerRules: parseOwnerRulesDoc(body.ownerRules),
  };
}

export function openStore(opts: { url: string; idToken: string; fetchImpl?: typeof fetch }): Store {
  const doFetch = opts.fetchImpl ?? fetch;

  async function call(op: string, args: Record<string, unknown> = {}): Promise<Record<string, unknown>> {
    let res: Response;
    try {
      res = await doFetch(opts.url, {
        method: 'POST',
        headers: { Authorization: `Bearer ${opts.idToken}`, 'X-Qa-Id-Token': opts.idToken, 'Content-Type': 'application/json' },
        body: JSON.stringify({ op, args }),
      });
    } catch {
      throw new ReportCallError(op, 'network_error');
    }
    let body: Record<string, unknown> = {};
    try {
      body = (await res.json()) as Record<string, unknown>;
    } catch {
      /* non-JSON (e.g. a Cloud Run 403 page) */
    }
    if (!res.ok) throw new ReportCallError(op, typeof body.error === 'string' ? body.error : `http_${res.status}`);
    return body;
  }

  return {
    status: async () => parseStatus(await call('status')),
    stopRequested: async () => (await call('stop')).stopRequested === true,
    async heartbeat(h) {
      await call('heartbeat', { ...h });
    },
    async addUsage(day, delta, sessionStarted) {
      await call('usage', { day, delta, sessionStarted });
    },
    async saveFinding(docId, finding) {
      await call('finding', { docId, finding });
    },
    async bumpFinding(docId) {
      await call('finding_bump', { docId });
    },
    async uploadScreenshot(path, png) {
      try {
        const { url } = await call('upload_url', { path });
        if (typeof url !== 'string') return null;
        const put = await doFetch(url, { method: 'PUT', headers: { 'Content-Type': 'image/png' }, body: new Uint8Array(png) });
        return put.ok ? path : null;
      } catch {
        return null;
      }
    },
    async readFindings(runId) {
      const b = await call('findings', { runId });
      return (Array.isArray(b.findings) ? b.findings : []) as Finding[];
    },
    async latestRunId() {
      const b = await call('latest_run');
      return typeof b.runId === 'string' ? b.runId : null;
    },
    async readQaSummaryRaw() {
      const b = await call('summary_get');
      return b.summary && typeof b.summary === 'object' ? (b.summary as Record<string, unknown>) : undefined;
    },
    async writeQaSummary(summary) {
      await call('summary_put', { summary });
    },
  };
}

/** A zero-cost usage row that only counts a started session. */
export function sessionStartDelta(model: string): UsageDelta {
  return { llmCalls: 0, inputTokens: 0, outputTokens: 0, cachedTokens: 0, model, usd: 0 };
}
