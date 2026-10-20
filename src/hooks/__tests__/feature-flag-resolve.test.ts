import { describe, it, expect } from 'vitest';
import { FLAG_DEFS } from '../feature-flag-defs';
import { QA_TESTER_OVERRIDES, resolveViewerFlags } from '../feature-flag-resolve';

type Flags = Parameters<typeof resolveViewerFlags>[0];
const defaults = Object.fromEntries(FLAG_DEFS.map((d) => [d.key, d.defaultValue])) as Flags;
const superFlags = Object.fromEntries(FLAG_DEFS.map((d) => [d.key, d.superAdminValue])) as Flags;
const switchesOn = { ...defaults, enableDemoUsers: true, enableAiTesters: true };

describe('resolveViewerFlags', () => {
  it('only enable_home_v2 carries a tester value today', () => {
    expect(QA_TESTER_OVERRIDES).toEqual({ enableHomeV2: true });
  });

  it('a real user sees the stored values (byte-identical)', () => {
    expect(resolveViewerFlags(switchesOn, { isSuperAdmin: false, isQaTester: false }, superFlags)).toBe(switchesOn);
  });

  it('a tester sees v2 while both demo switches are on — nothing else changes', () => {
    const r = resolveViewerFlags(switchesOn, { isSuperAdmin: false, isQaTester: true }, superFlags);
    expect(r.enableHomeV2).toBe(true);
    expect({ ...r, enableHomeV2: switchesOn.enableHomeV2 }).toEqual(switchesOn);
  });

  it('a tester gets nothing extra when either switch is off', () => {
    const off1 = { ...defaults, enableDemoUsers: true };
    const off2 = { ...defaults, enableAiTesters: true };
    expect(resolveViewerFlags(off1, { isSuperAdmin: false, isQaTester: true }, superFlags)).toBe(off1);
    expect(resolveViewerFlags(off2, { isSuperAdmin: false, isQaTester: true }, superFlags)).toBe(off2);
  });

  it('a tester never receives the super-admin set', () => {
    const r = resolveViewerFlags(switchesOn, { isSuperAdmin: false, isQaTester: true }, superFlags);
    expect(r).not.toEqual(superFlags);
    expect(r.enableUnifiedSearch).toBe(defaults.enableUnifiedSearch);
  });

  it('super admin is unchanged', () => {
    expect(resolveViewerFlags(switchesOn, { isSuperAdmin: true, isQaTester: true }, superFlags)).toBe(superFlags);
  });
});
