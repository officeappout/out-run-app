'use client';

import ErrorState from '@/components/ui/v2/ErrorState';

/**
 * The compact "this card failed" fallback for widgets a screen shouldn't just
 * drop silently (e.g. the home hero): a small v2 card with a "נסו שוב" pill.
 * Use as `fallback={compactWidgetFallback}` on a WidgetBoundary.
 */
export function compactWidgetFallback(retry: () => void) {
  return (
    <ErrorState
      variant="compact"
      title="לא הצלחנו לטעון את הכרטיס"
      description="שאר המסך עובד כרגיל"
      primaryAction={{ label: 'נסו שוב', onClick: retry }}
    />
  );
}
