'use client';

/**
 * MappedByCreditLine — "מופה על ידי …" under a place (enable_park_mapped_by_credit).
 *
 * Reusable: takes the stored `mappedBy` (parks today; routes can pass the same
 * shape later) and an `onOpenProfile` callback, so the caller decides how a
 * profile opens (the park sheet reuses its own UserProfileSheet, which links
 * on to /profile/[userId]). Renders nothing for unknown credits and while the
 * contributor's public profile is still loading. Callers mount it only when the
 * flag is on — mounted = enabled; unmounted = zero reads, zero markup.
 */
import type { ReactNode } from 'react';
import { MapPin } from 'lucide-react';
import { useT } from '@/hooks/useT';
import { map } from '@/messages/ns/map';
import type { ParkMappedBy } from './mapped-by';
import { useMappedByCredit } from './useMappedByCredit';

export interface MappedByPerson {
  uid: string;
  name: string;
  photoURL?: string;
}

interface MappedByCreditLineProps {
  mappedBy: ParkMappedBy | undefined;
  v2?: boolean;
  onOpenProfile?: (person: MappedByPerson) => void;
}

export default function MappedByCreditLine({ mappedBy, v2 = false, onOpenProfile }: MappedByCreditLineProps) {
  const t = useT(map);
  const credit = useMappedByCredit(mappedBy, true);
  if (credit.kind === 'none') return null;

  const tone = v2 ? 'text-v2-muted' : 'text-gray-500 dark:text-gray-400';
  const base = `mb-4 flex items-center gap-1.5 text-[12px] leading-snug ${tone}`;

  if (credit.kind !== 'person') {
    return (
      <p className={base} data-testid="mapped-by-credit" data-kind={credit.kind}>
        <MapPin size={13} aria-hidden className="flex-shrink-0" />
        <span>{t(credit.kind === 'team' ? 'mappedBy.team' : 'mappedBy.community')}</span>
      </p>
    );
  }

  const person: MappedByPerson = {
    uid: credit.uid,
    name: credit.name,
    ...(credit.photoURL ? { photoURL: credit.photoURL } : {}),
  };
  return (
    <button
      type="button"
      onClick={() => onOpenProfile?.(person)}
      aria-label={t('mappedBy.openProfile', { name: credit.name })}
      className={`${base} active:opacity-70 transition-opacity`}
      data-testid="mapped-by-credit"
      data-kind="person"
    >
      {credit.photoURL ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={credit.photoURL} alt="" className="h-5 w-5 flex-shrink-0 rounded-full object-cover" />
      ) : (
        <span aria-hidden className="grid h-5 w-5 flex-shrink-0 place-items-center rounded-full bg-gradient-to-br from-cyan-400 to-blue-500 text-[10px] font-black text-white">
          {credit.name.charAt(0).toUpperCase()}
        </span>
      )}
      <span>{t.rich('mappedBy.person', { name: credit.name, b: (chunks: ReactNode) => <b className="font-bold">{chunks}</b> })}</span>
    </button>
  );
}
