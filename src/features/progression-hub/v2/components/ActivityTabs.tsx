'use client';

/**
 * "לפי פעילות" — ריצה · הליכה · צעדים · כוח (P-2a–d). Only the open tab is
 * mounted, so only its data is read; each tab is code-split and wrapped in
 * a WidgetBoundary so a failure can't take the screen down.
 */
import { useMemo } from 'react';
import dynamic from 'next/dynamic';
import { SectionHeader, SegmentedPicker, ErrorState } from '@/components/ui/v2';
import WidgetBoundary from '@/components/system/WidgetBoundary';
import { KindGlyph } from './KindIcon';
import { TabSkeleton } from './tabs/TabParts';
import { useT } from '@/hooks/useT';
import { profile as profileNs } from '@/messages/ns/profile';

const RunTab = dynamic(() => import('./tabs/RunTab'), { ssr: false, loading: () => <TabSkeleton /> });
const WalkTab = dynamic(() => import('./tabs/WalkTab'), { ssr: false, loading: () => <TabSkeleton /> });
const StepsTab = dynamic(() => import('./tabs/StepsTab'), { ssr: false, loading: () => <TabSkeleton /> });
const StrengthTab = dynamic(() => import('./tabs/StrengthTab'), { ssr: false, loading: () => <TabSkeleton /> });

export type ActivityTabKey = 'run' | 'walk' | 'steps' | 'strength';

const OPTIONS = [
  { key: 'run', labelKey: 'hub.tabs.option.run', icon: <KindGlyph kind="run" className="h-3.5 w-3.5" /> },
  { key: 'walk', labelKey: 'hub.tabs.option.walk', icon: <KindGlyph kind="walk" className="h-3.5 w-3.5" /> },
  { key: 'steps', labelKey: 'hub.tabs.option.steps', icon: <KindGlyph kind="steps" className="h-3.5 w-3.5" /> },
  { key: 'strength', labelKey: 'hub.tabs.option.strength', icon: <KindGlyph kind="strength" className="h-3.5 w-3.5" /> },
] as const;

export default function ActivityTabs({ value, onChange }: { value: ActivityTabKey; onChange: (k: ActivityTabKey) => void }) {
  const t = useT(profileNs);
  const options = useMemo(() => OPTIONS.map(({ labelKey, ...o }) => ({ ...o, label: t(labelKey) })), [t]);
  return (
    <section className="space-y-3">
      <SectionHeader title={t('hub.tabs.title')} size={17} />
      <SegmentedPicker options={options} value={value} onChange={onChange} ariaLabel={t('hub.tabs.pickerLabel')} />
      <WidgetBoundary
        name={`progress.tab.${value}`}
        resetKeys={[value]}
        fallback={(retry) => (
          <ErrorState variant="compact" title={t('hub.tabs.error.title')} primaryAction={{ label: t('hub.tabs.error.retry'), onClick: retry }} />
        )}
      >
        {value === 'run' && <RunTab />}
        {value === 'walk' && <WalkTab />}
        {value === 'steps' && <StepsTab />}
        {value === 'strength' && <StrengthTab />}
      </WidgetBoundary>
    </section>
  );
}
