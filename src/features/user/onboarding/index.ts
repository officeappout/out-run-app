/**
 * User Onboarding Barrel Export
 * Multi-step setup wizard
 */

// Store
export { useOnboardingStore } from './store/useOnboardingStore';

// Services
export * from './services/onboarding-sync.service';

// Types
export * from './types';

// Components (selective exports)
export { default as OnboardingWizard } from './components/OnboardingWizard';
export { default as OnboardingLayout } from './components/OnboardingLayout';
