/**
 * Run planning (pure): which missions run, in what order, on which device, and why any were
 * skipped. Also the CLI parser and the run id.
 */
import { DEFAULT_BASE_URL, DEVICES, HARD_CAPS } from './config';
import type { Mission } from './missions';
import { ANDROID_DEVICE, allowsAndroidBack, isSweep, parseMissionRef, uidFor } from './design/checkpoints';

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
  /** For a resumed sweep, `start` is the resume checkpoint's path when it has one. */
  mission: Mission;
  device: string;
  /** The tester account of this session (per device for uidPerDevice missions). */
  uid: string;
  /** Sweep resumed from this checkpoint (earlier ones were covered in an earlier run). */
  resumeFrom: string | null;
}

export type SkipReason = 'unknown_mission' | 'not_registered' | 'over_session_cap' | 'device_not_in_mission' | 'unknown_checkpoint';

export interface RunPlan {
  sessions: PlannedSession[];
  skipped: Array<{ id: string; reason: SkipReason }>;
}

/** Keyword in --missions / QA_MISSIONS: every design sweep, in id order. */
export const SWEEP_KEYWORD = 'sweep';

/**
 * Which sessions run. Default (no list) = the journey missions only; "sweep" expands to all
 * design sweeps; "ID@checkpoint" resumes a sweep. A sweep runs on --device when it is one of its
 * devices (the workflow always passes one), or on each of its devices when no device is given.
 */
export function planRun(all: readonly Mission[], args: Pick<RunArgs, 'missions' | 'device' | 'maxSessions'>, roster: ReadonlySet<string>): RunPlan {
  const byId = new Map(all.map((m) => [m.id, m]));
  const wanted = (args.missions ?? all.filter((m) => !isSweep(m)).map((m) => m.id).sort()).flatMap((ref) =>
    ref === SWEEP_KEYWORD ? all.filter(isSweep).map((m) => m.id).sort() : [ref],
  );
  const sessions: PlannedSession[] = [];
  const skipped: RunPlan['skipped'] = [];
  for (const ref of wanted) {
    const { id, checkpoint } = parseMissionRef(ref);
    const m = byId.get(id);
    if (!m) {
      skipped.push({ id: ref, reason: 'unknown_mission' });
      continue;
    }
    let mission = m;
    if (checkpoint) {
      const cp = m.checkpoints?.find((c) => c.id === checkpoint);
      if (!cp) {
        skipped.push({ id: ref, reason: 'unknown_checkpoint' });
        continue;
      }
      if (cp.path) mission = { ...m, start: cp.path };
    }
    const own = m.devices?.length ? m.devices : [m.device];
    let devices: string[];
    // A sweep runs on its own phones; the Android phone only when asked for (back-button check).
    const allowed = (d: string) => own.includes(d) || (d === ANDROID_DEVICE && allowsAndroidBack(m));
    if (isSweep(m)) devices = args.device ? (allowed(args.device) ? [args.device] : []) : own;
    else devices = [args.device ?? m.device];
    if (!devices.length) {
      skipped.push({ id: ref, reason: 'device_not_in_mission' });
      continue;
    }
    for (const device of devices) {
      const uid = uidFor(m, device);
      if (!roster.has(uid)) skipped.push({ id: ref, reason: 'not_registered' });
      else if (sessions.length >= args.maxSessions) skipped.push({ id: ref, reason: 'over_session_cap' });
      else sessions.push({ mission, device, uid, resumeFrom: checkpoint });
    }
  }
  return { sessions, skipped };
}
