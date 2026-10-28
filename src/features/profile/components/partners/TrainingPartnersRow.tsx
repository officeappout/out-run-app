'use client';

/**
 * TrainingPartnersRow — the own profile's "שותפי אימון" row (enable_where_to_train_v1): a header with
 * the count that opens the full list, over the shared PartnersHighlightsRow strip (+ the add
 * affordance). Partners = mutual follows, read with useMutualPartners — the same slice the public
 * profile shows.
 */
import { useState } from 'react';
import { ChevronLeft } from 'lucide-react';
import PartnersHighlightsRow, { type PartnerHighlight } from '../PartnersHighlightsRow';
import PartnersListSheet from './PartnersListSheet';
import { useT } from '@/hooks/useT';
import { profile as profileNs } from '@/messages/ns/profile';
import { formatNumber } from '@/lib/i18n/core/fmt';

export default function TrainingPartnersRow({ partners, loading, onPartnerClick, onAddClick }: {
  partners: readonly PartnerHighlight[];
  loading: boolean;
  onPartnerClick: (uid: string) => void;
  onAddClick: () => void;
}) {
  const t = useT(profileNs);
  const [open, setOpen] = useState(false);
  return (
    <div>
      <button type="button" onClick={() => setOpen(true)} aria-haspopup="dialog"
        className="mb-2.5 flex w-full items-center gap-2 text-start" data-testid="training-partners-row">
        <span className="text-[15px] font-black text-v2-ink">{t('profile.partners.title')}</span>
        {!loading && (
          <span className="rounded-full bg-v2-tint px-2 py-0.5 text-[12.5px] font-extrabold tabular-nums text-v2-deep">
            {formatNumber(partners.length, t.locale)}
          </span>
        )}
        <span className="flex-1" />
        <ChevronLeft size={18} className="text-v2-muted ltr:-scale-x-100" aria-hidden />
      </button>
      <PartnersHighlightsRow partners={[...partners]} isLoading={loading} onPartnerClick={onPartnerClick} onAddClick={onAddClick} />
      <PartnersListSheet open={open} onClose={() => setOpen(false)} partners={partners}
        onPartnerClick={(uid) => { setOpen(false); onPartnerClick(uid); }} />
    </div>
  );
}
