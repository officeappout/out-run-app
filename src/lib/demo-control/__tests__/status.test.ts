import { describe, expect, it } from 'vitest';
import { buildDemoStatus } from '../status';
import { parseControl, RUNNER_STALE_MS } from '../control';

const NOW = Date.UTC(2026, 9, 20, 12, 0, 0);

describe('parseControl', () => {
  it('defaults when the doc is missing', () => {
    expect(parseControl(undefined, NOW)).toEqual({
      testersStopRequested: false,
      stopRequestedAtMs: null,
      lastDispatch: null,
      testers: { state: 'unknown', lastSessionAtMs: null, findingsCount: null, runId: null },
    });
  });
  it('reads the runner state and a fresh heartbeat', () => {
    const c = parseControl(
      {
        testersStopRequested: true,
        stopRequestedAt: { toMillis: () => NOW - 1000 },
        lastDispatch: { at: new Date(NOW - 5000), workflow: 'qa-testers.yml', ok: false, error: 'workflow_not_found' },
        testers: { state: 'running', heartbeatAt: NOW - 60_000, lastSessionAt: NOW - 120_000, findingsCount: 4, runId: 'r1' },
      },
      NOW,
    );
    expect(c.testersStopRequested).toBe(true);
    expect(c.stopRequestedAtMs).toBe(NOW - 1000);
    expect(c.lastDispatch).toEqual({ atMs: NOW - 5000, workflow: 'qa-testers.yml', ok: false, error: 'workflow_not_found' });
    expect(c.testers).toEqual({ state: 'running', lastSessionAtMs: NOW - 120_000, findingsCount: 4, runId: 'r1' });
  });
  it('a "running" runner with a stale heartbeat reads as unknown (it crashed)', () => {
    expect(parseControl({ testers: { state: 'running', heartbeatAt: NOW - RUNNER_STALE_MS - 1 } }, NOW).testers.state).toBe('unknown');
    expect(parseControl({ testers: { state: 'idle' } }, NOW).testers.state).toBe('idle');
  });
});

describe('buildDemoStatus', () => {
  it('raw switches, population, usage and caps in one payload', () => {
    const s = buildDemoStatus({
      nowMs: NOW,
      todayKey: '2026-10-20',
      flagsRaw: { enable_demo_users: true, demo_life_llm: 'yes', enable_ai_testers: false, demo_kelly: true },
      configRaw: { caps: { dailyUsdCap: 1 } },
      controlRaw: undefined,
      usageDocs: [{ id: '2026-10-20', data: { usdEstimate: 1.5, testerSessions: 1 } }],
      demoUserActiveDays: ['2026-10-20', '2026-10-19', null, '2026-10-20'],
      demoUsersCapped: false,
      dispatchConfigured: false,
    });
    expect(s.switches).toEqual({ enable_demo_users: true, demo_life_llm: false, enable_ai_testers: false, demo_kelly: true });
    expect(s.population).toEqual({ demoUsers: 4, activeToday: 2, capped: false });
    expect(s.usage.today.usd).toBe(1.5);
    expect(s.caps.dailyUsd.state).toBe('exceeded');
    expect(s.caps.blocksTesterRun).toBe(true);
    expect(s.dispatchConfigured).toBe(false);
  });
});
