import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';

/**
 * Regression guard for "no visual separation at the top of the health
 * questionnaire on iOS/Android" (bug ג, 10.08.2026 diagnosis): the JIT-inline
 * wrapper around HealthDeclarationStep had no top safe-area padding at all —
 * content started flush against the physical screen edge, rendering under
 * the status bar/notch on both platforms. HealthDeclarationStep itself only
 * has an 8px `pt-2` above its header (confirmed: its only OTHER safe-area
 * usage is a `paddingBottom` for the CTA bar) — it relies on its PARENT for
 * top safe-area padding, same as it correctly gets at its standalone route
 * (/onboarding-new/health, wrapped in OnboardingLayout, whose own header sets
 * `paddingTop: env(safe-area-inset-top)`). The JIT-inline wrapper is not that
 * parent and supplied none. Source-level, not a render test — no jsdom/
 * component harness in this repo (vitest.config.ts: "node" env only).
 */

const modalPath = fileURLToPath(new URL('../JITSetupModal.tsx', import.meta.url));
const modalSrc = readFileSync(modalPath, 'utf8');
const stepPath = fileURLToPath(new URL('../HealthDeclarationStep.tsx', import.meta.url));
const stepSrc = readFileSync(stepPath, 'utf8');
const layoutPath = fileURLToPath(new URL('../OnboardingLayout.tsx', import.meta.url));
const layoutSrc = readFileSync(layoutPath, 'utf8');

describe('JITSetupModal — inline Health Declaration top safe-area', () => {
  it('the inline-questionnaire wrapper now sets paddingTop: env(safe-area-inset-top)', () => {
    const match = modalSrc.match(/<div className="fixed inset-0 z-\[140\][^"]*"\s*style=\{\{([^}]*)\}\}/);
    expect(match, 'inline-questionnaire wrapper style not found').toBeTruthy();
    expect(match![1]).toContain('paddingTop');
    expect(match![1]).toContain('env(safe-area-inset-top, 0px)');
  });
});

describe('HealthDeclarationStep — relies on its parent for top safe-area (unchanged, both callers responsible for their own)', () => {
  it('still has no top-safe-area handling of its own (only a small fixed pt-2)', () => {
    expect(stepSrc).not.toContain('safe-area-inset-top');
  });

  it('the OnboardingLayout parent (the standalone /onboarding-new/health route) already supplies it — confirms the JIT-inline path was the actual gap', () => {
    expect(layoutSrc).toContain("paddingTop: 'env(safe-area-inset-top, 0px)'");
  });
});
