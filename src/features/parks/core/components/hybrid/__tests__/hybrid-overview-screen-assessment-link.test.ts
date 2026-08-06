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
    expect(screenSrc).toMatch(/onAssessmentLink\?:\s*\(\)\s*=>\s*void/);
  });

  it('destructures onAssessmentLink from props', () => {
    expect(screenSrc).toMatch(/function HybridOverviewScreen\([^)]*onAssessmentLink[^)]*\)/);
  });

  it('renders the banner as a clickable button when onAssessmentLink is present, a plain div otherwise', () => {
    expect(screenSrc).toMatch(/fallbackHint && onAssessmentLink \? \(/);
    const buttonBlockMatch = screenSrc.match(/fallbackHint && onAssessmentLink \? \(([\s\S]*?)\) : fallbackHint && \(/);
    expect(buttonBlockMatch, 'clickable-banner branch not found').toBeTruthy();
    const buttonBlock = buttonBlockMatch![1];
    expect(buttonBlock).toContain('<button');
    expect(buttonBlock).toContain('onClick={onAssessmentLink}');
    expect(buttonBlock).toContain('{fallbackHint}');
  });
});

const discoverLayerPath = fileURLToPath(new URL('../../../../../../app/map/layers/DiscoverLayer.tsx', import.meta.url));
const discoverLayerSrc = readFileSync(discoverLayerPath, 'utf8');

describe('DiscoverLayer — wires onAssessmentLink to startMiniDomainAssessment', () => {
  it('only passes a callback when composed.assessmentDomains is non-empty (undefined otherwise, matching HybridOverviewScreen\'s presence check)', () => {
    expect(discoverLayerSrc).toContain('onAssessmentLink={hybridComposed?.assessmentDomains?.length ? () => {');
  });

  it('resolves a known PrimaryCategory from assessmentDomains, defaulting to \'push\' — same fallback precedent as WorkoutBuilderSheet\'s unlockDomain', () => {
    const match = discoverLayerSrc.match(/onAssessmentLink=\{hybridComposed\?\.assessmentDomains\?\.length \? \(\) => \{([\s\S]*?)\} : undefined\}/);
    expect(match, 'onAssessmentLink callback body not found').toBeTruthy();
    const body = match![1];
    expect(body).toContain('PRIMARY_CATEGORIES');
    expect(body).toContain("?? 'push'");
    expect(body).toContain('startMiniDomainAssessment(router, domain)');
  });

  it('imports startMiniDomainAssessment and PRIMARY_CATEGORIES from the canonical onboarding services', () => {
    expect(discoverLayerSrc).toContain("import { startMiniDomainAssessment } from '@/features/user/onboarding/services/mini-domain-assessment'");
    expect(discoverLayerSrc).toContain("import { PRIMARY_CATEGORIES } from '@/features/user/onboarding/services/single-domain-assessment.service'");
  });
});
