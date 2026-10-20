import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';

/**
 * Regression guard for the owner's 20.10.2026 on-device bug: birth date and
 * name were typed behind the keyboard on the JIT identity screen (the
 * IdentityProfileScreen rendered inline at workout start). Its host is a
 * `fixed inset-0` overlay, so <main>'s --kb-inset padding never reached it;
 * with the keyboard controller on (iOS resize 'none') the screen kept its full
 * height and its non-overflowing scroll area ended behind the keyboard, so the
 * controller had nothing to scroll. The host must end at the keyboard
 * (`kb-fit`, inert while enable_keyboard_insets_v1 is off).
 * Source-level (vitest runs in the node env, no component harness).
 */

const modalSrc = readFileSync(fileURLToPath(new URL('../JITSetupModal.tsx', import.meta.url)), 'utf8');

describe('JITSetupModal — inline identity screen follows the keyboard', () => {
  const host = modalSrc.match(/<div\s+className="([^"]*)"\s*style=\{\{([^}]*)\}\}\s*>\s*<IdentityProfileScreen/);

  it('the IdentityProfileScreen host is a kb-fit full-screen overlay', () => {
    expect(host, 'identity host wrapper not found').toBeTruthy();
    expect(host![1].split(/\s+/)).toEqual(expect.arrayContaining(['kb-fit', 'fixed', 'inset-0']));
  });

  it('pads the home indicator with --kb-safe-bottom (falls back to env() = today)', () => {
    expect(host![2]).toContain('var(--kb-safe-bottom, env(safe-area-inset-bottom, 0px))');
  });
});
