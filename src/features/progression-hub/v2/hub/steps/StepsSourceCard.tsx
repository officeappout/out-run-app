'use client';

/**
 * Where the steps come from (PG-5): the phone's health app, connected or not,
 * with the existing connect flow (disclosure → OS permission) when it isn't.
 * The board's "updated N min ago" is not shown — the app keeps no last-sync time.
 */
import { HeartPulse } from 'lucide-react';
import { Button, Card } from '@/components/ui/v2';
import { useT } from '@/hooks/useT';
import { profile as profileNs } from '@/messages/ns/profile';
import { HUB_COLORS } from '../hub-colors';

export default function StepsSourceCard({ connected, onConnect }: { connected: boolean | null; onConnect: () => void }) {
  const t = useT(profileNs);
  return (
    <Card padding="none" className="px-4 py-3.5" data-steps-source>
      <h3 className="mb-2.5 whitespace-nowrap text-[15px] font-black text-v2-ink">{t('hubV2.steps.source.title')}</h3>
      <div className="flex items-center gap-3">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-[10px]" style={{ background: HUB_COLORS.steps.tile, color: HUB_COLORS.steps.text }} aria-hidden>
          <HeartPulse className="h-[18px] w-[18px]" strokeWidth={2.4} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate text-[14px] font-extrabold text-v2-ink">{t('hubV2.steps.source.health')}</p>
          <p className="truncate text-[12px] font-bold text-v2-muted">
            {connected == null ? ' ' : t('hubV2.steps.source.state', { state: connected ? 'on' : 'off' })}
          </p>
        </div>
        {connected === false && (
          <Button variant="primary" size="sm" onClick={onConnect}>
            {t('steps.connect.cta')}
          </Button>
        )}
      </div>
    </Card>
  );
}
