import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';

/**
 * Regression — G2.6 (Sderot field test, 10.10.2026): the live free_run/
 * combined-route screen had TWO separate centering mechanisms:
 *   1. MapShell's "מרכז אותי" pill — setMapFollowEnabled(true), which drives
 *      useCameraController's padding-aware follow effect (reads live drawer
 *      height via metricsCardPosition/wazePadding).
 *   2. FreeRunLayer's own "triangle" button (Navigation icon) — bumped
 *      recenterSignal -> AppMap's centerOnUser(), a padding-BLIND easeTo()
 *      with no awareness of the metrics drawer at all. Its active/fill color
 *      was driven by useGPS's isFollowing, a blind toggle unrelated to real
 *      camera-follow state.
 *
 * Consolidated to ONE visible mechanism: the pill, with
 * logic.handleLocationClick() folded into its onClick so a tap is still
 * never a silent no-op with no GPS fix / no permission yet (the one real,
 * distinct thing the old triangle did beyond pure recentering).
 *
 * DiscoverLayer.tsx's OWN separate triangle (a different screen, no drawer
 * at all — pre-run browse-mode discovery map) is explicitly OUT of scope and
 * must remain untouched; it's a different context with no drawer to
 * conflict with, and still needs the shared recenterSignal/onRecenter/
 * isFollowing mechanism this fix does not remove, only stops FreeRunLayer
 * from using redundantly.
 *
 * Source-level, not a render test — this repo's vitest cannot even
 * parse/import .tsx files (confirmed directly, see
 * [[vitest-node-only-no-jsdom]]'s 10.10.2026 update).
 */

const freeRunLayerPath = fileURLToPath(new URL('../layers/FreeRunLayer.tsx', import.meta.url));
const freeRunLayerSrc = readFileSync(freeRunLayerPath, 'utf8');
const mapShellPath = fileURLToPath(new URL('../MapShell.tsx', import.meta.url));
const mapShellSrc = readFileSync(mapShellPath, 'utf8');
const discoverLayerPath = fileURLToPath(new URL('../layers/DiscoverLayer.tsx', import.meta.url));
const discoverLayerSrc = readFileSync(discoverLayerPath, 'utf8');

describe('FreeRunLayer — no longer has its own separate centering button', () => {
  it('no longer imports/uses the blind isFollowing toggle or onRecenter prop', () => {
    expect(freeRunLayerSrc).not.toContain('onRecenter');
    expect(freeRunLayerSrc).not.toContain('logic.isFollowing');
    expect(freeRunLayerSrc).not.toContain('BRAND_COLOR');
  });

  it('no longer calls logic.handleLocationClick() itself (folded into MapShell\'s single button)', () => {
    expect(freeRunLayerSrc).not.toContain('logic.handleLocationClick()');
  });

  it('still imports Navigation (used elsewhere, e.g. the mode-toggle icon — not a dead import)', () => {
    expect(freeRunLayerSrc).toMatch(/import\s*\{[^}]*\bNavigation\b[^}]*\}\s*from\s*'lucide-react'/);
    expect(freeRunLayerSrc).toContain('<Navigation size={14} />');
  });
});

describe('MapShell — the single recenter pill is the one source of truth', () => {
  it('the recenter button calls handleLocationClick() before re-enabling follow (never a silent no-op with no GPS fix)', () => {
    expect(mapShellSrc).toContain('onClick={() => { logic.handleLocationClick(); setMapFollowEnabled(true); }}');
  });

  it('no longer passes onRecenter to FreeRunLayer (that mechanism is retired there)', () => {
    expect(mapShellSrc).toMatch(/<FreeRunLayer logic=\{logic\} effectivePos=\{effectivePos\} \/>/);
    expect(mapShellSrc).not.toMatch(/<FreeRunLayer[^/]*onRecenter/);
  });

  it('still passes onRecenter to DiscoverLayer — that separate mechanism is untouched, out of scope', () => {
    expect(mapShellSrc).toMatch(/<DiscoverLayer[^/]*onRecenter=\{handleRecenter\}/);
  });
});

describe('DiscoverLayer — untouched, out of scope (different screen, no drawer)', () => {
  it('still has its own onRecenter-driven centering button and isFollowing indicator', () => {
    expect(discoverLayerSrc).toContain('onRecenter?.();');
    expect(discoverLayerSrc).toContain('logic.isFollowing ? BRAND_COLOR : \'none\'');
  });
});
