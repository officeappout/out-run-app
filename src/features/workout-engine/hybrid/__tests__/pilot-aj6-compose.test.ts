/**
 * Pilot AJ6 (enable_pilot_ah_v1), source-level: the map passes `pilotParallel` only with the
 * flag on, shows the skeleton only with the flag on (the old pill stays for flag off), and the
 * recommended compose keeps its sequential reads when the flag is absent.
 */
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';

const read = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf8');
const layer = read('../../../../app/map/layers/DiscoverLayer.tsx');
const compose = read('../start-hybrid-session.ts');

describe('AJ6 wiring', () => {
  it('both map compose calls pass pilotParallel behind the flag', () => {
    expect(layer.match(/\.\.\.\(mapFeatureFlags\.enablePilotAhV1 \? \{ pilotParallel: true \} : \{\}\)/g)).toHaveLength(2);
  });
  it('skeleton with the flag, the original pill without it', () => {
    expect(layer).toContain('hybridComposing && mapFeatureFlags.enablePilotAhV1 && <HybridComposingSkeleton />');
    expect(layer).toContain("hybridComposing && !mapFeatureFlags.enablePilotAhV1 && (");
  });
  it('compose: early reads only under ctx.pilotParallel, sequential fallbacks kept', () => {
    expect(compose).toContain('const tm = ctx.pilotParallel ? createComposeTimer() : null;');
    expect(compose).toContain('const weeklyGaps = early ? await early.weeklyGaps : await safeGetWeeklyGaps();');
    expect(compose).toContain('const parks: any[] = early ? await early.parks : await safeFetchRealParks();');
    expect(compose).toContain("tm?.report('hybrid');");
  });
});
