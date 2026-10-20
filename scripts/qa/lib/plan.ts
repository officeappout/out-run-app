/**
 * Run planning (pure): which missions run, in what order, on which device, and why any were
 * skipped. Also the CLI parser and the run id.
 */
import { DEFAULT_BASE_URL, DEVICES, HARD_CAPS } from './config';
import type { Mission } from './missions';

export interface RunArgs {
  missions: string[] | null;
  device: string | null;
  baseUrl: string;
  runId: string | null;
  dryRun: boolean;
  maxSessions: number;
}

export function parseRunArgs(argv: readonly string[], env: Record<string, string | undefined> = {}): RunArgs {
  const val = (flag: string) => {
    const i = argv.indexOf(flag);
    if (i < 0) return null;
    const v = argv[i + 1];
    if (v === undefined || v.startsWith('--')) throw new Error(`${flag} needs a value`);
    return v;
  };
  const list = (val('--missions') ?? env.QA_MISSIONS ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  const device = val('--device') ?? (env.QA_DEVICE || null);
  if (device && !DEVICES[device]) throw new Error(`unknown device ${device} (known: ${Object.keys(DEVICES).join(', ')})`);
  const baseUrl = val('--base-url') ?? env.QA_BASE_URL ?? DEFAULT_BASE_URL;
  const u = new URL(baseUrl);
  if (u.protocol !== 'https:') throw new Error('--base-url must be https');
  const max = Number(val('--max-sessions') ?? env.QA_MAX_SESSIONS ?? HARD_CAPS.maxSessionsPerRun);
  return {
    missions: list.length ? list : null,
    device,
    baseUrl: `${u.protocol}//${u.host}`,
    runId: val('--run-id') ?? (env.QA_RUN_ID || null),
    dryRun: argv.includes('--dry-run'),
    maxSessions: Number.isFinite(max) ? Math.max(1, Math.min(HARD_CAPS.maxSessionsPerRun, Math.floor(max))) : HARD_CAPS.maxSessionsPerRun,
  };
}

export function makeRunId(now: Date, suffix = ''): string {
  const p = (n: number) => String(n).padStart(2, '0');
  const base = `qa-${now.getUTCFullYear()}${p(now.getUTCMonth() + 1)}${p(now.getUTCDate())}-${p(now.getUTCHours())}${p(now.getUTCMinutes())}`;
  return suffix ? `${base}-${suffix.replace(/[^A-Za-z0-9_-]/g, '').slice(0, 20)}` : base;
}

export interface PlannedSession {
  mission: Mission;
  device: string;
}

export interface RunPlan {
  sessions: PlannedSession[];
  skipped: Array<{ id: string; reason: 'unknown_mission' | 'not_registered' | 'over_session_cap' }>;
}

export function planRun(all: readonly Mission[], args: Pick<RunArgs, 'missions' | 'device' | 'maxSessions'>, roster: ReadonlySet<string>): RunPlan {
  const byId = new Map(all.map((m) => [m.id, m]));
  const wanted = args.missions ?? all.map((m) => m.id).sort();
  const sessions: PlannedSession[] = [];
  const skipped: RunPlan['skipped'] = [];
  for (const id of wanted) {
    const m = byId.get(id);
    if (!m) skipped.push({ id, reason: 'unknown_mission' });
    else if (!roster.has(m.uid)) skipped.push({ id, reason: 'not_registered' });
    else if (sessions.length >= args.maxSessions) skipped.push({ id, reason: 'over_session_cap' });
    else sessions.push({ mission: m, device: args.device ?? m.device });
  }
  return { sessions, skipped };
}
