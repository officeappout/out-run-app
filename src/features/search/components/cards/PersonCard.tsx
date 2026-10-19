'use client';

import Link from 'next/link';
import { BrandCard } from '@/components/ui/v2';
import Highlight from '../Highlight';
import type { UserSearchResult } from '@/features/social/services/user-search.service';

/** Person tile (Social board): avatar with the teal ring, name, level, "לפרופיל". */
export default function PersonCard({ person, query }: { person: UserSearchResult; query?: string }) {
  const initials = person.name.trim().split(/\s+/).map((w) => w[0]).slice(0, 2).join('');
  return (
    <BrandCard as="article" className="flex flex-col items-center gap-1.5 p-3 text-center">
      <span
        className="grid h-14 w-14 place-items-center overflow-hidden rounded-full bg-gradient-to-br from-[#e0f2fe] to-[#c7f3ee] text-[17px] font-bold text-[#007399]"
        style={{ boxShadow: '0 0 0 3px #ffffff, 0 0 0 5px #00dcd0' }}
        aria-hidden
      >
        {person.photoURL ? <img src={person.photoURL} alt="" className="h-full w-full object-cover" loading="lazy" /> : initials}
      </span>
      <span className="line-clamp-1 text-[14px] font-bold text-[#171717]"><Highlight text={person.name} query={query} /></span>
      <span className="text-[12px] text-[#6b7280]">{person.currentLevel ? `רמה ${person.currentLevel}` : person.fitnessLevel ?? 'מתאמן/ת ב־OUT'}</span>
      <Link
        href={`/profile/${person.uid}`}
        className="mt-1 grid h-[34px] w-full place-items-center rounded-full bg-[#f0faff] text-[13px] font-bold text-[#007399] active:scale-[0.98]"
        aria-label={`לפרופיל של ${person.name}`}
      >
        לפרופיל
      </Link>
    </BrandCard>
  );
}
