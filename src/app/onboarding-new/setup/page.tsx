'use client';

// Force dynamic rendering to prevent SSR issues with window/localStorage
export const dynamic = 'force-dynamic';

import React from 'react';
import OnboardingWizard from '@/features/user/onboarding/components/OnboardingWizard';

export default function SetupPage() {
  return <OnboardingWizard />;
}
