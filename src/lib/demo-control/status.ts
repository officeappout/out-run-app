/**
 * Demo control center — the one payload GET /api/admin/demo/status returns, built
 * from raw reads by a pure function (unit-tested; the server file only reads).
 */
import { parseControl, type DemoControl } from './control';
import { DEMO_SWITCH_KEYS, type DemoSwitchKey } from './paths';
import {
  checkCaps,
  parseConfig,
  parseUsageDay,
  summarizeUsage,
  type CapReport,
  type DemoConfig,
  type UsageSummary,
} from './usage-cost';

export interface DemoStatusPayload {
  nowMs: number;
  todayKey: string;
  /** Raw stored values (no super-admin override) — exactly what the engines read. */
  switches: Record<DemoSwitchKey, boolean>;
  population: { demoUsers: number; activeToday: number; capped: boolean };
  control: DemoControl;
  config: DemoConfig;
  usage: UsageSummary;
  caps: CapReport;
  /** GITHUB_DISPATCH_TOKEN is set on the server (the value is never sent). */
  dispatchConfigured: boolean;
}

export interface DemoStatusInput {
  nowMs: number;
  todayKey: string;
  flagsRaw: Record<string, unknown> | undefined;
  configRaw: Record<string, unknown> | undefined;
  controlRaw: Record<string, unknown> | undefined;
  usageDocs: Array<{ id: string; data: Record<string, unknown> | undefined }>;
  /** Israel day key of each demo user's lastActive (null = never). */
  demoUserActiveDays: Array<string | null>;
  /** The demo-user read hit its limit (count shown as "N+"). */
  demoUsersCapped: boolean;
  dispatchConfigured: boolean;
}

export function buildDemoStatus(input: DemoStatusInput): DemoStatusPayload {
  const switches = Object.fromEntries(
    DEMO_SWITCH_KEYS.map((k) => [k, input.flagsRaw?.[k] === true]),
  ) as Record<DemoSwitchKey, boolean>;
  const config = parseConfig(input.configRaw);
  const days = input.usageDocs.map((d) => parseUsageDay(d.id, d.data));
  const usage = summarizeUsage(days, input.todayKey, config.prices);
  return {
    nowMs: input.nowMs,
    todayKey: input.todayKey,
    switches,
    population: {
      demoUsers: input.demoUserActiveDays.length,
      activeToday: input.demoUserActiveDays.filter((d) => d === input.todayKey).length,
      capped: input.demoUsersCapped,
    },
    control: parseControl(input.controlRaw, input.nowMs),
    config,
    usage,
    caps: checkCaps(usage, config.caps),
    dispatchConfigured: input.dispatchConfigured,
  };
}
