'use client';

/**
 * PartnersHighlightsRow — shared "partners as highlights" row ("public
 * profile" slice 1 extraction). Pulled out of DashboardTab's BLOCK 1 so
 * both profiles render the same horizontal circular-avatar strip:
 *   - Self profile: no real partner list wired yet (see DECISION note in
 *     DashboardTab's own call site) — renders ONLY the dashed "+ הוסף"
 *     affordance, same as before this extraction.
 *   - Public profile: renders the target user's REAL mutual-follow
 *     partners (connections/{targetUid}, readable by any authenticated
 *     user per firestore.rules — see mutual-partners.service.ts), each
 *     avatar tapping through to that partner's own public profile.
 * Renders nothing when there's nothing to show (no partners AND no add
 * affordance) rather than an empty section with just a hairline border.
 */

import React from 'react';
import { Plus } from 'lucide-react';
import { avatarBackground, firstGrapheme } from '@/features/profile/utils/avatar';

export interface PartnerHighlight {
  uid: string;
  name: string;
  photoURL?: string | null;
}

interface PartnersHighlightsRowProps {
  partners: PartnerHighlight[];
  isLoading?: boolean;
  onPartnerClick?: (uid: string) => void;
  addLabel?: string;
  onAddClick?: () => void;
}

export default function PartnersHighlightsRow({
  partners,
  isLoading = false,
  onPartnerClick,
  addLabel = 'הוסף',
  onAddClick,
}: PartnersHighlightsRowProps) {
  if (!isLoading && partners.length === 0 && !onAddClick) return null;

  return (
    <div className="pb-5 border-b border-gray-100">
      <div className="flex items-center gap-3 overflow-x-auto scrollbar-hide" dir="rtl">
        {onAddClick && (
          <button
            type="button"
            onClick={onAddClick}
            aria-label={addLabel}
            className="flex flex-col items-center gap-1 flex-shrink-0 active:scale-95 transition-transform"
          >
            <div className="w-14 h-14 rounded-full border-2 border-dashed border-gray-300 flex items-center justify-center text-gray-400">
              <Plus className="w-5 h-5" />
            </div>
            <span className="text-[10px] font-semibold text-gray-500">{addLabel}</span>
          </button>
        )}

        {isLoading &&
          [0, 1, 2].map((i) => (
            <div key={i} className="w-14 h-14 rounded-full bg-gray-100 animate-pulse flex-shrink-0" />
          ))}

        {!isLoading &&
          partners.map((partner) => (
            <button
              key={partner.uid}
              type="button"
              onClick={() => onPartnerClick?.(partner.uid)}
              disabled={!onPartnerClick}
              className="flex flex-col items-center gap-1 flex-shrink-0 active:scale-95 transition-transform disabled:cursor-default"
            >
              <div className="w-14 h-14 rounded-full overflow-hidden flex-shrink-0">
                {partner.photoURL ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={partner.photoURL}
                    alt={partner.name}
                    width={56}
                    height={56}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div
                    className="w-full h-full flex items-center justify-center text-white font-black text-sm"
                    style={{ background: avatarBackground(partner.uid) }}
                  >
                    {firstGrapheme(partner.name)}
                  </div>
                )}
              </div>
              <span className="text-[10px] font-semibold text-gray-500 max-w-[56px] truncate">
                {partner.name}
              </span>
            </button>
          ))}
      </div>
    </div>
  );
}
