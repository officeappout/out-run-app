/**
 * Design-sweep missions (kind "design-sweep"): a bounded walk over a fixed list of screens
 * ("checkpoints") on one phone size, resumable from any checkpoint. Pure helpers: validation of
 * the extra mission fields, per-device tester uids, and the "MISSION@checkpoint" resume syntax
 * (usable in the workflow's `missions` input as is — no workflow change needed).
 */
import { DEVICES } from '../config';

export interface Checkpoint {
  /** snake_case, unique in the mission — also the screen id the tester scores it under. */
  id: string;
  /** What the screen is (Hebrew, shown in the design report). */
  screen: string;
  /** How to get there / what state to look at (Hebrew, read by the tester). */
  how: string;
  /** Optional direct path — used as the start page when a run resumes from this checkpoint. */
  path?: string;
  /** The checkpoint is about an input with the keyboard open. */
  keyboard?: boolean;
  /** First-launch missions: a screen before the account exists (lib/first-launch.ts). */
  signedOut?: boolean;
}

/** Hard ceiling for a sweep session (smaller than the 60-step session cap). */
export const SWEEP_MAX_STEPS = 40;
export const SWEEP_MAX_CHECKPOINTS = 12;
/** The default viewports of a sweep: small, standard, large. */
export const SWEEP_DEVICES = ['iphone-se', 'iphone-13', 'iphone-15-pro-max'] as const;

const CP_ID = /^[a-z0-9_]{2,40}$/;

/** Short, uid-safe tag per device (demo_qa_* uids allow [a-z0-9_]). */
export const DEVICE_TAG: Record<string, string> = { 'iphone-se': 'se', 'iphone-13': 'i13', 'iphone-15-pro-max': 'pm', 'android-small': 'as' };

export function viewportLabel(deviceId: string): string {
  const d = DEVICES[deviceId];
  const name: Record<string, string> = { 'iphone-se': 'iPhone SE', 'iphone-13': 'iPhone 13', 'iphone-15-pro-max': 'iPhone Pro Max', 'android-small': 'small Android' };
  return d ? `${name[deviceId] ?? deviceId}, ${d.viewport.width}×${d.viewport.height}` : deviceId;
}

interface SweepFields {
  uid: string;
  device: string;
  kind?: 'journey' | 'design-sweep';
  devices?: string[];
  androidBack?: boolean;
  uidPerDevice?: boolean;
  checkpoints?: Checkpoint[];
}

/** The tester account for a mission on a device (one fresh account per phone size when uidPerDevice). */
export function uidFor(m: SweepFields, deviceId: string): string {
  return m.uidPerDevice ? `${m.uid}_${DEVICE_TAG[deviceId] ?? 'x'}` : m.uid;
}

/** The Android phone of the back-button check (OWN-007). */
export const ANDROID_DEVICE = 'android-small';

/** A sweep may also run on the Android phone (only when asked for with --device android-small). */
export function allowsAndroidBack(m: SweepFields): boolean {
  return m.kind === 'design-sweep' && m.androidBack !== false;
}

/** Every phone a mission can run on: its own, plus the Android phone for back-checking sweeps. */
export function missionDevices(m: SweepFields): string[] {
  const own = m.devices?.length ? m.devices : [m.device];
  return allowsAndroidBack(m) && !own.includes(ANDROID_DEVICE) ? [...own, ANDROID_DEVICE] : own;
}

/** Every uid a mission can sign in as (for the roster). */
export function missionUids(m: SweepFields): string[] {
  if (!m.uidPerDevice) return [m.uid];
  return Array.from(new Set(missionDevices(m).map((d) => uidFor(m, d))));
}

export function isSweep(m: { kind?: string }): boolean {
  return m.kind === 'design-sweep';
}

/** "D04_strength_player@strength_summary" → { id, checkpoint }. */
export function parseMissionRef(ref: string): { id: string; checkpoint: string | null } {
  const at = ref.indexOf('@');
  return at < 0 ? { id: ref, checkpoint: null } : { id: ref.slice(0, at), checkpoint: ref.slice(at + 1) || null };
}

export function resumeRef(missionId: string, checkpointId: string | null): string {
  return checkpointId ? `${missionId}@${checkpointId}` : missionId;
}

/** Checkpoints from `from` on (all when from is null / unknown → null result for unknown). */
export function checkpointsFrom(cps: readonly Checkpoint[], from: string | null): Checkpoint[] | null {
  if (!from) return [...cps];
  const i = cps.findIndex((c) => c.id === from);
  return i < 0 ? null : cps.slice(i);
}

/** Validation of the sweep-only fields (errors appended to `e`). */
export function validateSweepFields(m: Record<string, unknown>, e: string[]): void {
  if (m.kind !== undefined && m.kind !== 'journey' && m.kind !== 'design-sweep') e.push('mission.kind');
  if (m.devices !== undefined) {
    const ok = Array.isArray(m.devices) && m.devices.length > 0 && m.devices.every((d) => typeof d === 'string' && !!DEVICES[d]);
    if (!ok) e.push('mission.devices');
  }
  if (m.uidPerDevice !== undefined && typeof m.uidPerDevice !== 'boolean') e.push('mission.uidPerDevice');
  if (m.uidPerDevice === true && typeof m.uid === 'string') {
    // the suffixed uid must still be a valid tester uid (≤ 40 chars after demo_qa_)
    if (m.uid.length + 4 > 'demo_qa_'.length + 40) e.push('mission.uid (too long for uidPerDevice)');
  }
  if (m.checkpoints !== undefined || m.kind === 'design-sweep') {
    const cps = m.checkpoints;
    const ok =
      Array.isArray(cps) &&
      cps.length >= 1 &&
      cps.length <= SWEEP_MAX_CHECKPOINTS &&
      cps.every(
        (c: Record<string, unknown>) =>
          !!c &&
          typeof c.id === 'string' &&
          CP_ID.test(c.id) &&
          typeof c.screen === 'string' &&
          c.screen.trim().length >= 2 &&
          typeof c.how === 'string' &&
          c.how.trim().length >= 5 &&
          (c.path === undefined || (typeof c.path === 'string' && c.path.startsWith('/') && !c.path.startsWith('//'))) &&
          (c.keyboard === undefined || typeof c.keyboard === 'boolean'),
      ) &&
      new Set((cps as Checkpoint[]).map((c) => c.id)).size === cps.length;
    if (!ok) e.push('mission.checkpoints');
  }
  if (m.kind === 'design-sweep') {
    const b = (m.budget ?? {}) as Record<string, unknown>;
    if (typeof b.maxSteps === 'number' && b.maxSteps > SWEEP_MAX_STEPS) e.push(`mission.budget.maxSteps (design sweeps ≤ ${SWEEP_MAX_STEPS})`);
  }
}
