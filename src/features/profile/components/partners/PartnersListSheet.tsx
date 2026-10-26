'use client';

/**
 * PartnersListSheet — the full list of training partners (mutual follows), each row opening that
 * partner's profile. v2 Sheet; avatars share PartnersHighlightsRow's fallback (avatar.ts).
 */
import Sheet from '@/components/ui/v2/Sheet';
import { SHEET_Z } from '@/components/ui/v2/tokens';
import { avatarBackground, firstGrapheme } from '@/features/profile/utils/avatar';
import { useT } from '@/hooks/useT';
import { profile as profileNs } from '@/messages/ns/profile';
import type { PartnerHighlight } from '../PartnersHighlightsRow';

export default function PartnersListSheet({ open, onClose, partners, onPartnerClick }: {
  open: boolean;
  onClose: () => void;
  partners: readonly PartnerHighlight[];
  onPartnerClick: (uid: string) => void;
}) {
  const t = useT(profileNs);
  return (
    <Sheet open={open} onClose={onClose} title={t('profile.partners.title')} layout="nested" scroll="panel"
      zIndex={SHEET_Z.profilePanel} className="max-h-[80vh]" keyboardAware={false}>
      <ul className="space-y-1 px-5 pb-4" dir="rtl">
        {partners.length === 0 && <li className="py-6 text-center text-[14px] font-bold text-v2-muted">{t('profile.partners.empty')}</li>}
        {partners.map((p) => (
          <li key={p.uid}>
            <button type="button" onClick={() => onPartnerClick(p.uid)}
              className="flex w-full items-center gap-3 rounded-[14px] px-2 py-2 text-start active:bg-v2-surface">
              <span className="h-10 w-10 shrink-0 overflow-hidden rounded-full">
                {p.photoURL
                  // eslint-disable-next-line @next/next/no-img-element
                  ? <img src={p.photoURL} alt="" className="h-full w-full object-cover" loading="lazy" />
                  : <span className="grid h-full w-full place-items-center text-[14px] font-black text-white" style={{ background: avatarBackground(p.uid) }}>{firstGrapheme(p.name)}</span>}
              </span>
              <span className="min-w-0 flex-1 truncate text-[15px] font-extrabold text-v2-ink">{p.name}</span>
            </button>
          </li>
        ))}
      </ul>
    </Sheet>
  );
}
