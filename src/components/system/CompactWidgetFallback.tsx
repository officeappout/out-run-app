'use client';

import ErrorState from '@/components/ui/v2/ErrorState';
import { useT } from '@/hooks/useT';
import { common } from '@/messages/ns/common';

/**
 * The compact "this card failed" fallback for widgets a screen shouldn't just
 * drop silently (e.g. the home hero): a small v2 card with a "נסו שוב" pill.
 * Use as `fallback={compactWidgetFallback}` on a WidgetBoundary.
 */
function CompactWidgetFallback({ retry }: { retry: () => void }) {
  const t = useT(common);
  return (
    <ErrorState
      variant="compact"
      title={t('ui.system.compact.title')}
      description={t('ui.system.compact.description')}
      primaryAction={{ label: t('actions.retry'), onClick: retry }}
    />
  );
}

export function compactWidgetFallback(retry: () => void) {
  return <CompactWidgetFallback retry={retry} />;
}
