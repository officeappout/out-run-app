/**
 * Command-line target for the demo scripts: which Firestore, and is the owner sure.
 *
 *   --project <id>      REQUIRED, always. Production also needs FIREBASE_SERVICE_ACCOUNT_KEY
 *                       (from .env.local) whose project_id equals it.
 *   --emulator          the local Firestore emulator (FIRESTORE_EMULATOR_HOST, default
 *                       127.0.0.1:8080) — refuses any non-local host.
 *   --confirm "<phrase>" the exact Hebrew phrase of the action (seed / purge real writes).
 *
 * Without --emulator a set FIRESTORE_EMULATOR_HOST is an error (ambiguous target), and
 * without --project nothing runs at all.
 */
import { existsSync } from 'fs';
import { resolve } from 'path';
import type { App } from 'firebase-admin/app';
import type { Firestore } from 'firebase-admin/firestore';

export interface DemoArgs {
  project: string | null;
  emulator: boolean;
  confirm: string | null;
  dryRun: boolean;
  positional: string[];
  flags: Set<string>;
  values: Record<string, string>;
}

const VALUE_FLAGS = new Set(['--project', '--confirm', '--days', '--rate']);

export function parseDemoArgs(argv: readonly string[]): DemoArgs {
  const flags = new Set<string>();
  const values: Record<string, string> = {};
  const positional: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (VALUE_FLAGS.has(a)) {
      const v = argv[i + 1];
      if (v === undefined || v.startsWith('--')) throw new Error(`${a} needs a value`);
      values[a] = v;
      i++;
    } else if (a.startsWith('--')) flags.add(a);
    else positional.push(a);
  }
  return {
    project: values['--project'] ?? null,
    emulator: flags.has('--emulator'),
    confirm: values['--confirm'] ?? null,
    dryRun: flags.has('--dry-run'),
    positional,
    flags,
    values,
  };
}

export const LOCAL_HOST_RE = /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/;

export interface DemoTarget {
  db: Firestore;
  app: App;
  projectId: string;
  emulator: string | null;
}

export function describeDemoTarget(t: Pick<DemoTarget, 'projectId' | 'emulator'>): string {
  return t.emulator ? `האמולטור המקומי ${t.emulator} (פרויקט ${t.projectId})` : `Firestore של פרודקשן (פרויקט ${t.projectId})`;
}

/** Decides the target from args + env — pure, unit-tested. */
export function resolveDemoTarget(
  args: Pick<DemoArgs, 'project' | 'emulator'>,
  env: Record<string, string | undefined>,
): { projectId: string; emulator: string | null; credentialJson: string | null; adc?: boolean } {
  if (!args.project) throw new Error('חסר --project <id>. הסקריפט לא רץ בלי פרויקט מפורש.');
  if (args.emulator) {
    const host = env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8080';
    if (!LOCAL_HOST_RE.test(host)) throw new Error(`--emulator: FIRESTORE_EMULATOR_HOST חייב להיות מקומי (קיבלתי "${host}").`);
    return { projectId: args.project, emulator: host, credentialJson: null };
  }
  if (env.FIRESTORE_EMULATOR_HOST) {
    throw new Error(`FIRESTORE_EMULATOR_HOST מוגדר (${env.FIRESTORE_EMULATOR_HOST}) אבל לא ביקשת --emulator. הסר אותו או הוסף --emulator.`);
  }
  const raw = env.FIREBASE_SERVICE_ACCOUNT_KEY;
  // DEMO_ADC=1: use the owner's gcloud Application Default Credentials
  // (`gcloud auth application-default login`) instead of a service-account key file.
  if (!raw && env.DEMO_ADC === '1') return { projectId: args.project, emulator: null, credentialJson: null, adc: true };
  if (!raw) throw new Error('FIREBASE_SERVICE_ACCOUNT_KEY לא מוגדר (מצופה ב-.env.local), או הרץ עם DEMO_ADC=1 אחרי gcloud auth application-default login.');
  let cred: { project_id?: string };
  try {
    cred = JSON.parse(raw);
  } catch {
    throw new Error('FIREBASE_SERVICE_ACCOUNT_KEY אינו JSON תקין.');
  }
  if (cred.project_id !== args.project) throw new Error(`מפתח השירות שייך לפרויקט "${cred.project_id}", לא ל---project ${args.project}.`);
  return { projectId: args.project, emulator: null, credentialJson: raw };
}

export function requireConfirm(args: Pick<DemoArgs, 'confirm'>, phrase: string, action: string): void {
  if (args.confirm !== phrase) {
    throw new Error(`${action} דורש אישור מפורש: --confirm "${phrase}"`);
  }
}

/** Loads .env.local from the current directory when present (FIREBASE_SERVICE_ACCOUNT_KEY). */
export async function loadEnvLocal(): Promise<void> {
  const p = resolve(process.cwd(), '.env.local');
  if (!existsSync(p)) return;
  const dotenv = await import('dotenv');
  dotenv.config({ path: p });
}

export async function openDemoTarget(args: DemoArgs, env: Record<string, string | undefined> = process.env): Promise<DemoTarget> {
  const r = resolveDemoTarget(args, env);
  const { initializeApp, cert, applicationDefault } = await import('firebase-admin/app');
  const { getFirestore } = await import('firebase-admin/firestore');
  const name = `demo-world-${r.projectId}-${Date.now()}`;
  let app: App;
  if (r.emulator) {
    process.env.FIRESTORE_EMULATOR_HOST = r.emulator;
    app = initializeApp({ projectId: r.projectId }, name);
  } else if (r.adc) {
    app = initializeApp({ credential: applicationDefault(), projectId: r.projectId }, name);
  } else {
    app = initializeApp({ credential: cert(JSON.parse(r.credentialJson!)), projectId: r.projectId }, name);
  }
  return { db: getFirestore(app), app, projectId: r.projectId, emulator: r.emulator };
}

export async function closeDemoTarget(t: DemoTarget): Promise<void> {
  const { deleteApp } = await import('firebase-admin/app');
  await deleteApp(t.app).catch(() => {});
}
