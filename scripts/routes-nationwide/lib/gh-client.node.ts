/**
 * The runner's GraphHopper client (RC8): the live Cloud Run URL comes from
 * the command line (--graphhopper-url=…, or GRAPHHOPPER_URL), the ID token
 * from the existing helper (src/lib/routing/graphhopper/id-token — the
 * Firebase Admin SA in .env.local holds run.invoker). One budget + one JSON
 * response cache per authority (gh-budget.ts), so a resumed or repeated
 * dry-run re-uses every answer it already paid for.
 */
import * as fs from 'fs';
import * as path from 'path';
import { createGraphHopperClient, createIdTokenProvider, invokerKeyFromEnv, isLocalUrl, type GraphHopperClient, type RoutedPath } from '../../../src/lib/routing/graphhopper';
import { budgetedClient, type GhBudgetStats, type GhCacheStore } from '../../../src/lib/routes-nationwide/gh-budget';

/** Round trips are slower than the app's 1.2 s live timeout — batch work can wait. */
const RUNNER_TIMEOUT_MS = 20_000;

export function createRunnerGhClient(url: string | null): { client: GraphHopperClient | null; note: string } {
  const baseUrl = url?.trim().replace(/\/+$/, '');
  if (!baseUrl) return { client: null, note: 'no --graphhopper-url' };
  if (!/^https:\/\//.test(baseUrl) && !isLocalUrl(baseUrl)) throw new Error('--graphhopper-url must be https (or localhost)');
  if (isLocalUrl(baseUrl)) return { client: createGraphHopperClient({ baseUrl, timeoutMs: RUNNER_TIMEOUT_MS }), note: `${baseUrl} (local, no token)` };
  const key = invokerKeyFromEnv();
  if (!key) throw new Error('--graphhopper-url set but no service-account key in env (FIREBASE_SERVICE_ACCOUNT_KEY / GRAPHHOPPER_INVOKER_SA_KEY)');
  return { client: createGraphHopperClient({ baseUrl, audience: baseUrl, timeoutMs: RUNNER_TIMEOUT_MS, getIdToken: createIdTokenProvider(key) }), note: `${baseUrl} as ${key.client_email}` };
}

export class FileGhCache implements GhCacheStore {
  private map: Map<string, RoutedPath | null>;
  private dirty = false;
  constructor(private file: string) {
    this.map = new Map(fs.existsSync(file) ? Object.entries(JSON.parse(fs.readFileSync(file, 'utf8')) as Record<string, RoutedPath | null>) : []);
  }
  get(k: string) { return this.map.get(k); }
  set(k: string, v: RoutedPath | null) { this.map.set(k, v); this.dirty = true; }
  flush() {
    if (!this.dirty) return;
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    fs.writeFileSync(`${this.file}.tmp`, JSON.stringify(Object.fromEntries(this.map)));
    fs.renameSync(`${this.file}.tmp`, this.file);
    this.dirty = false;
  }
}

export interface AuthorityGh {
  client: GraphHopperClient;
  stats: () => GhBudgetStats;
  spent: () => boolean;
  flush: () => void;
}

export function authorityGh(base: GraphHopperClient | null, cacheDir: string, authorityId: string, maxCalls: number): AuthorityGh | null {
  if (!base) return null;
  const cache = new FileGhCache(path.join(cacheDir, `${authorityId}.json`));
  const b = budgetedClient(base, { maxCalls, cache });
  return { client: b.client, stats: b.stats, spent: () => b.stats().calls >= maxCalls, flush: () => cache.flush() };
}
