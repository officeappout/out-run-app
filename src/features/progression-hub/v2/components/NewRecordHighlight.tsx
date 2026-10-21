'use client';

/**
 * "שיא חדש" — a small row in the progress tab when a personal record was set
 * in the last 7 days (#542 records, real values only); tapping it opens the
 * profile's records card ("השיאים שלך", הישגים tab). Renders nothing when
 * there's no fresh record. Same data as the profile card (useProfileRecords).
 */
import { useRouter } from 'next/navigation';
import { ChevronLeft, Trophy } from 'lucide-react';
import { useProfileRecords } from '@/features/profile/hooks/useProfileRecords';
import { dateLabel } from '@/features/profile/components/records/record-tiles';
import { useT } from '@/hooks/useT';
import { profile as profileNs } from '@/messages/ns/profile';

/** The profile opens on its records card from this link (DashboardTab reads ?tab=). */
export const PROFILE_RECORDS_HREF = '/profile?tab=badges#records';

export default function NewRecordHighlight() {
  const t = useT(profileNs);
  const router = useRouter();
  const { tiles } = useProfileRecords(true);
  const fresh = tiles.filter((tile) => tile.isNew).sort((a, b) => (b.at ?? 0) - (a.at ?? 0));
  if (!fresh.length) return null;
  const top = fresh[0];
  const more = fresh.length - 1;
  // "12 חזרות · 20 באוק׳ · ועוד 2" — the pieces that exist, joined by " · " exactly as before.
  const detail = [
    `${top.value}${top.unit ? ` ${top.unit}` : ''}`,
    top.at != null ? dateLabel(top.at) : null,
    more > 0 ? t('hub.newRecord.more', { count: String(more) }) : null,
  ]
    .filter((part): part is string => part != null)
    .join(' · ');
  return (
    <button
      type="button"
      onClick={() => router.push(PROFILE_RECORDS_HREF)}
      className="flex w-full items-center gap-2.5 rounded-[18px] bg-white py-2 pe-2.5 ps-3 text-start shadow-v2-ring transition-transform duration-150 ease-v2 active:scale-[0.97]"
    >
      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-v2-gold text-v2-on-gold" aria-hidden>
        <Trophy className="h-4 w-4" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate whitespace-nowrap text-[13.5px] font-black text-v2-ink">{t('hub.newRecord.title', { label: top.label })}</span>
        <span className="block truncate whitespace-nowrap text-[12px] font-bold text-v2-muted">
          {t('hub.newRecord.meta', { detail })}
        </span>
      </span>
      <ChevronLeft className="h-4 w-4 shrink-0 text-v2-muted" aria-hidden />
    </button>
  );
}
