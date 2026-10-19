/**
 * App-side call to POST /api/routes/generate (loops). Throws on anything but
 * a 200 with loops — the caller falls back to Mapbox. Hard 2 s budget.
 */
import { auth } from '@/lib/firebase';
import type { GenerateLoopsRequest, GenerateLoopsResponse } from '@/lib/routing/api-contract';

export const GH_CLIENT_TIMEOUT_MS = 2000;

export interface ApiClientDeps {
  getToken?: () => Promise<string | undefined>;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
}

const defaultToken = () => auth.currentUser?.getIdToken() ?? Promise.resolve(undefined);

export async function fetchGraphhopperLoops(req: GenerateLoopsRequest, deps: ApiClientDeps = {}): Promise<GenerateLoopsResponse> {
  const token = await (deps.getToken ?? defaultToken)();
  if (!token) throw new Error('graphhopper: not signed in');
  const res = await (deps.fetchImpl ?? fetch)('/api/routes/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(req),
    signal: AbortSignal.timeout(deps.timeoutMs ?? GH_CLIENT_TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`graphhopper: http ${res.status}`);
  const data = (await res.json()) as GenerateLoopsResponse;
  if (data?.backend !== 'graphhopper' || !Array.isArray(data.loops)) throw new Error('graphhopper: bad response');
  return data;
}
