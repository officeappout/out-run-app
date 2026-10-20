import { describe, expect, it, vi } from 'vitest';
import { dispatchWorkflow, isValidWorkflowFile } from '../github-dispatch';

const fakeFetch = (status: number) => vi.fn(async () => new Response(null, { status })) as unknown as typeof fetch;

describe('dispatchWorkflow', () => {
  it('no token → dispatch_not_configured, without calling GitHub', async () => {
    const f = fakeFetch(204);
    expect(await dispatchWorkflow({ token: '', workflow: 'qa-testers.yml', fetchImpl: f })).toEqual({ ok: false, code: 'dispatch_not_configured', status: null });
    expect(await dispatchWorkflow({ token: undefined, workflow: 'qa-testers.yml', fetchImpl: f })).toMatchObject({ code: 'dispatch_not_configured' });
    expect(f).not.toHaveBeenCalled();
  });
  it('bad workflow name → bad_workflow', async () => {
    const f = fakeFetch(204);
    expect(await dispatchWorkflow({ token: 't', workflow: '../evil.yml', fetchImpl: f })).toMatchObject({ code: 'bad_workflow' });
    expect(f).not.toHaveBeenCalled();
  });
  it('posts to the workflow dispatches endpoint with ref + inputs', async () => {
    const f = fakeFetch(204);
    expect(await dispatchWorkflow({ token: 'tok', workflow: 'qa-testers.yml', inputs: { requested_by: 'u1' }, fetchImpl: f })).toEqual({ ok: true });
    const [url, init] = (f as unknown as { mock: { calls: [string, RequestInit][] } }).mock.calls[0];
    expect(url).toBe('https://api.github.com/repos/officeappout/out-run-app/actions/workflows/qa-testers.yml/dispatches');
    expect(init.method).toBe('POST');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer tok');
    expect(JSON.parse(init.body as string)).toEqual({ ref: 'main', inputs: { requested_by: 'u1' } });
  });
  it('honours a valid repo / ref override, ignores an invalid one', async () => {
    const f = fakeFetch(204);
    await dispatchWorkflow({ token: 't', repo: 'me/other', ref: 'feat/x', workflow: 'a.yaml', fetchImpl: f });
    await dispatchWorkflow({ token: 't', repo: 'not a repo', ref: 'bad ref!', workflow: 'a.yml', fetchImpl: f });
    const calls = (f as unknown as { mock: { calls: [string, RequestInit][] } }).mock.calls;
    expect(calls[0][0]).toContain('/repos/me/other/');
    expect(JSON.parse(calls[0][1].body as string).ref).toBe('feat/x');
    expect(calls[1][0]).toContain('/repos/officeappout/out-run-app/');
    expect(JSON.parse(calls[1][1].body as string).ref).toBe('main');
  });
  it('maps GitHub statuses to clear codes', async () => {
    const run = (s: number) => dispatchWorkflow({ token: 't', workflow: 'qa-testers.yml', fetchImpl: fakeFetch(s) });
    expect(await run(404)).toEqual({ ok: false, code: 'workflow_not_found', status: 404 });
    expect(await run(401)).toMatchObject({ code: 'token_rejected' });
    expect(await run(403)).toMatchObject({ code: 'token_rejected' });
    expect(await run(422)).toMatchObject({ code: 'dispatch_rejected' });
    expect(await run(500)).toMatchObject({ code: 'github_error' });
  });
  it('network failure → network_error', async () => {
    const f = vi.fn(async () => {
      throw new Error('offline');
    }) as unknown as typeof fetch;
    expect(await dispatchWorkflow({ token: 't', workflow: 'qa-testers.yml', fetchImpl: f })).toEqual({ ok: false, code: 'network_error', status: null });
  });
  it('isValidWorkflowFile', () => {
    expect(isValidWorkflowFile('qa-testers.yml')).toBe(true);
    expect(isValidWorkflowFile('x.yaml')).toBe(true);
    expect(isValidWorkflowFile('x.sh')).toBe(false);
    expect(isValidWorkflowFile('a/b.yml')).toBe(false);
    expect(isValidWorkflowFile(5)).toBe(false);
  });
});
