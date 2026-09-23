import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';

/**
 * Regression guard for the "אימון מלא בפארק" blocking banner having no
 * actionable link to the mini-questionnaire, unlike the 3 existing callers
 * (ProgramsSection, StatsOverview, WorkoutBuilderSheet — all via
 * startMiniDomainAssessment). Source-level, not a render test — no
 * jsdom/component harness in this repo (vitest.config.ts: "node" env only).
 */

const screenPath = fileURLToPath(new URL('../HybridOverviewScreen.tsx', import.meta.url));
const screenSrc = readFileSync(screenPath, 'utf8');

describe('HybridOverviewScreen — A3 banner becomes a real link when onAssessmentLink is provided', () => {
  it('declares the onAssessmentLink prop', () => {
    // Domain-assessment gate (David, 23-24.09.2026): widened to take an optional
    // domains array — now also invoked per-segment (a locked station card's own
    // assessmentDomains), not just for the session-level banner below.
    expect(screenSrc).toMatch(/onAssessmentLink\?:\s*\(domains\?:\s*string\[\]\)\s*=>\s*void/);
  });

  it('destructures onAssessmentLink from props', () => {
    expect(screenSrc).toMatch(/function HybridOverviewScreen\([^)]*onAssessmentLink[^)]*\)/);
  });

  it('renders the banner as a clickable button when onAssessmentLink is present AND assessmentDomains is non-empty, a plain div otherwise', () => {
    // composed.assessmentDomains?.length distinguishes the actionable
    // needs-assessment case from a plain info banner (e.g. insufficientHomeContent's
    // "park not found" message, which has no assessmentDomains at all) — added
    // because onAssessmentLink itself is now ALWAYS defined (needed for per-segment
    // lock cards), so its mere truthiness can no longer gate this branch alone.
    expect(screenSrc).toMatch(/fallbackHint && onAssessmentLink && composed\.assessmentDomains\?\.length \? \(/);
    const buttonBlockMatch = screenSrc.match(/fallbackHint && onAssessmentLink && composed\.assessmentDomains\?\.length \? \(([\s\S]*?)\) : fallbackHint && \(/);
    expect(buttonBlockMatch, 'clickable-banner branch not found').toBeTruthy();
    const buttonBlock = buttonBlockMatch![1];
    expect(buttonBlock).toContain('<button');
    expect(buttonBlock).toContain('onClick={() => onAssessmentLink()}');
    expect(buttonBlock).toContain('{fallbackHint}');
  });
});

const discoverLayerPath = fileURLToPath(new URL('../../../../../../app/map/layers/DiscoverLayer.tsx', import.meta.url));
const discoverLayerSrc = readFileSync(discoverLayerPath, 'utf8');

describe('DiscoverLayer — wires onAssessmentLink to startMiniDomainAssessment', () => {
  it('is always defined (domain-assessment gate, 23-24.09.2026) — a per-segment locked station card needs a working callback even when the session itself has no assessmentDomains', () => {
    expect(discoverLayerSrc).toContain('onAssessmentLink={(passedDomains?: string[]) => {');
  });

  it('prefers the passed-in (per-segment) domains, falling back to the session-level ones — resolves a known PrimaryCategory, defaulting to \'push\' (same fallback precedent as WorkoutBuilderSheet\'s unlockDomain)', () => {
    const match = discoverLayerSrc.match(/onAssessmentLink=\{\(passedDomains\?: string\[\]\) => \{([\s\S]*?)\}\}/);
    expect(match, 'onAssessmentLink callback body not found').toBeTruthy();
    const body = match![1];
    expect(body).toContain('passedDomains');
    expect(body).toContain('hybridComposed?.assessmentDomains');
    expect(body).toContain('PRIMARY_CATEGORIES');
    expect(body).toContain("?? 'push'");
    expect(body).toContain('startMiniDomainAssessment(router, domain)');
  });

  it('imports startMiniDomainAssessment and PRIMARY_CATEGORIES from the canonical onboarding services', () => {
    expect(discoverLayerSrc).toContain("import { startMiniDomainAssessment } from '@/features/user/onboarding/services/mini-domain-assessment'");
    expect(discoverLayerSrc).toContain("import { PRIMARY_CATEGORIES } from '@/features/user/onboarding/services/single-domain-assessment.service'");
  });
});
