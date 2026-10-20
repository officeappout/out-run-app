/**
 * Trigger a GitHub Actions workflow (workflow_dispatch) from the server. Generic — any
 * workflow file in the repo — with fetch injected so it is unit-testable. No secrets
 * are logged or returned.
 *
 *   POST https://api.github.com/repos/{repo}/actions/workflows/{workflow}/dispatches
 *   { ref, inputs }  →  204 No Content on success
 *
 * Env (server only, read by the caller):
 *   GITHUB_DISPATCH_TOKEN   fine-grained token, "Actions: read and write" on the repo only
 *   GITHUB_DISPATCH_REPO    default officeappout/out-run-app
 *   GITHUB_DISPATCH_REF     default main
 */

export const DEFAULT_DISPATCH_REPO = 'officeappout/out-run-app';
export const DEFAULT_DISPATCH_REF = 'main';

export type DispatchErrorCode =
  | 'dispatch_not_configured' // no token in the environment
  | 'bad_workflow' // name failed validation
  | 'workflow_not_found' // 404 — the workflow file isn't on that ref yet
  | 'token_rejected' // 401 / 403
  | 'dispatch_rejected' // 422 — e.g. the workflow has no workflow_dispatch trigger, bad inputs
  | 'github_error' // anything else
  | 'network_error';

export type DispatchResult = { ok: true } | { ok: false; code: DispatchErrorCode; status: number | null };

export interface DispatchInput {
  token: string | undefined | null;
  repo?: string | null;
  ref?: string | null;
  workflow: string;
  inputs?: Record<string, string>;
  fetchImpl?: typeof fetch;
}

const WORKFLOW_FILE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,80}\.ya?ml$/;
const REPO = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/;
const REF = /^[A-Za-z0-9._\/-]{1,100}$/;

export function isValidWorkflowFile(name: unknown): name is string {
  return typeof name === 'string' && WORKFLOW_FILE.test(name);
}

export async function dispatchWorkflow(input: DispatchInput): Promise<DispatchResult> {
  const token = (input.token ?? '').trim();
  if (!token) return { ok: false, code: 'dispatch_not_configured', status: null };
  if (!isValidWorkflowFile(input.workflow)) return { ok: false, code: 'bad_workflow', status: null };
  const repo = input.repo && REPO.test(input.repo) ? input.repo : DEFAULT_DISPATCH_REPO;
  const ref = input.ref && REF.test(input.ref) ? input.ref : DEFAULT_DISPATCH_REF;
  const doFetch = input.fetchImpl ?? fetch;

  let res: Response;
  try {
    res = await doFetch(`https://api.github.com/repos/${repo}/actions/workflows/${encodeURIComponent(input.workflow)}/dispatches`, {
      method: 'POST',
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${token}`,
        'X-GitHub-Api-Version': '2022-11-28',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ ref, inputs: input.inputs ?? {} }),
    });
  } catch {
    return { ok: false, code: 'network_error', status: null };
  }

  if (res.status === 204 || res.status === 200) return { ok: true };
  const code: DispatchErrorCode =
    res.status === 404 ? 'workflow_not_found'
      : res.status === 401 || res.status === 403 ? 'token_rejected'
        : res.status === 422 ? 'dispatch_rejected'
          : 'github_error';
  return { ok: false, code, status: res.status };
}
