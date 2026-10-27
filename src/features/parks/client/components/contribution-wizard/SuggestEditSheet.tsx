'use client';

import React, { useState, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Pencil, Loader2, Plus, Minus } from 'lucide-react';
import { createContribution } from '@/features/parks/core/services/contribution.service';
import { useUserStore } from '@/features/user';
import { XP_REWARDS } from '@/types/contribution.types';
import type { Park, ParkFeatureTag } from '@/features/parks/core/types/park.types';
import { useFeatureFlags } from '@/hooks/useFeatureFlags';
import Sheet from '@/components/ui/v2/Sheet';
import IconButton from '@/components/ui/v2/IconButton';
import { SHEET_Z } from '@/components/ui/v2/tokens';
import type { NamespaceKey } from '@/lib/i18n/catalogs';
import { useT } from '@/hooks/useT';
import { map } from '@/messages/ns/map';

interface SuggestEditSheetProps {
  isOpen: boolean;
  onClose: () => void;
  park: Park;
}

/** `label` = the Hebrew text stored in the contribution's editSummary (data); the tile shows `labelKey`. */
const ALL_FEATURE_TAGS: { id: ParkFeatureTag; label: string; labelKey: NamespaceKey<typeof map>; icon: string }[] = [
  { id: 'shaded', label: 'מוצל', labelKey: 'wizard.suggest.tag.shaded', icon: '☀️' }, // i18n-allow-hebrew: data — label stored in editSummary
  { id: 'night_lighting', label: 'תאורת לילה', labelKey: 'wizard.suggest.tag.night_lighting', icon: '💡' }, // i18n-allow-hebrew: data — label stored in editSummary
  { id: 'water_fountain', label: 'ברזיית מים', labelKey: 'wizard.suggest.tag.water_fountain', icon: '🚰' }, // i18n-allow-hebrew: data — label stored in editSummary
  { id: 'has_toilets', label: 'שירותים', labelKey: 'wizard.suggest.tag.has_toilets', icon: '🚻' }, // i18n-allow-hebrew: data — label stored in editSummary
  { id: 'has_benches', label: 'ספסלים', labelKey: 'wizard.suggest.tag.has_benches', icon: '🪑' }, // i18n-allow-hebrew: data — label stored in editSummary
  { id: 'rubber_floor', label: 'ריצפת גומי', labelKey: 'wizard.suggest.tag.rubber_floor', icon: '🟫' }, // i18n-allow-hebrew: data — label stored in editSummary
  { id: 'parkour_friendly', label: 'פארקור', labelKey: 'wizard.suggest.tag.parkour_friendly', icon: '🤸' }, // i18n-allow-hebrew: data — label stored in editSummary
  { id: 'stairs_training', label: 'מדרגות', labelKey: 'wizard.suggest.tag.stairs_training', icon: '🪜' }, // i18n-allow-hebrew: data — label stored in editSummary
  { id: 'near_water', label: 'ליד מים', labelKey: 'wizard.suggest.tag.near_water', icon: '🌊' }, // i18n-allow-hebrew: data — label stored in editSummary
  { id: 'dog_friendly', label: 'כלבים', labelKey: 'wizard.suggest.tag.dog_friendly', icon: '🐕' }, // i18n-allow-hebrew: data — label stored in editSummary
  { id: 'wheelchair_accessible', label: 'נגישות', labelKey: 'wizard.suggest.tag.wheelchair_accessible', icon: '♿' }, // i18n-allow-hebrew: data — label stored in editSummary
  { id: 'safe_zone', label: 'מיגונית', labelKey: 'wizard.suggest.tag.safe_zone', icon: '🛡️' }, // i18n-allow-hebrew: data — label stored in editSummary
  { id: 'nearby_shelter', label: 'מקלט קרוב', labelKey: 'wizard.suggest.tag.nearby_shelter', icon: '🏠' }, // i18n-allow-hebrew: data — label stored in editSummary
];

export default function SuggestEditSheet({ isOpen, onClose, park }: SuggestEditSheetProps) {
  const t = useT(map);
  const { profile } = useUserStore();
  const existingTags = useMemo(() => park.featureTags ?? [], [park.featureTags]);
  const [selectedTags, setSelectedTags] = useState<ParkFeatureTag[]>([...existingTags]);
  const [submitting, setSubmitting] = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  // enable_home_v2: the shared <Sheet>; flag off keeps the markup below untouched.
  const isSuperAdmin = useUserStore((st) => !!(st.profile?.core as { isSuperAdmin?: boolean } | undefined)?.isSuperAdmin);
  const v2 = useFeatureFlags(isSuperAdmin).flags.enableHomeV2;

  const toggleTag = (tag: ParkFeatureTag) => {
    setSelectedTags((prev) =>
      prev.includes(tag) ? prev.filter((x) => x !== tag) : [...prev, tag],
    );
  };

  const addedTags = selectedTags.filter((x) => !existingTags.includes(x));
  const removedTags = existingTags.filter((x) => !selectedTags.includes(x));
  const hasChanges = addedTags.length > 0 || removedTags.length > 0;

  const editSummary = useMemo(() => {
    const parts: string[] = [];
    if (addedTags.length > 0) {
      const labels = addedTags.map((x) => ALL_FEATURE_TAGS.find((f) => f.id === x)?.label ?? x);
      parts.push(`הוסיף: ${labels.join(', ')}`); // i18n-allow-hebrew: data — stored in editSummary
    }
    if (removedTags.length > 0) {
      const labels = removedTags.map((x) => ALL_FEATURE_TAGS.find((f) => f.id === x)?.label ?? x);
      parts.push(`הסיר: ${labels.join(', ')}`); // i18n-allow-hebrew: data — stored in editSummary
    }
    return parts.join(' | ');
  }, [addedTags, removedTags]);

  const handleSubmit = useCallback(async () => {
    if (!hasChanges || !profile?.id) return;
    setSubmitting(true);
    try {
      await createContribution({
        userId: profile.id,
        type: 'suggest_edit',
        status: 'pending',
        location: park.location,
        linkedParkId: park.id,
        editDiff: { featureTags: selectedTags },
        editSummary,
      });
      setShowSuccess(true);
      setTimeout(() => {
        setShowSuccess(false);
        onClose();
      }, 1800);
    } catch (err) {
      console.error('[SuggestEdit] Submit failed:', err);
    } finally {
      setSubmitting(false);
    }
  }, [hasChanges, profile?.id, park, selectedTags, editSummary, onClose]);

  const success = (
    <>
      {/* Success */}
      <AnimatePresence>
        {showSuccess && (
          <motion.div
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 z-50 flex flex-col items-center justify-center bg-white rounded-t-3xl"
          >
            <motion.div initial={{ scale: 0 }} animate={{ scale: [0, 1.3, 1] }} transition={{ duration: 0.4 }} className="text-4xl mb-3">
              ✏️
            </motion.div>
            <p className="text-slate-900 text-lg font-bold mb-1">{t('wizard.suggest.success')}</p>
            <p className="text-[#00E5FF] text-sm font-bold">+{XP_REWARDS.suggest_edit} XP</p>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );

  const form = (
    <>
      <p className="text-slate-400 text-xs mb-3">{t('wizard.suggest.hint')}</p>

      {/* Feature tags grid */}
      <div className="grid grid-cols-4 gap-2 mb-4">
        {ALL_FEATURE_TAGS.map((tag) => {
          const isSelected = selectedTags.includes(tag.id);
          const wasOriginal = existingTags.includes(tag.id);
          const isAdded = isSelected && !wasOriginal;
          const isRemoved = !isSelected && wasOriginal;

          let borderClass = 'border-slate-200';
          let bgClass = 'bg-slate-50';
          let textClass = 'text-slate-500';

          if (isAdded) {
            borderClass = 'border-emerald-400';
            bgClass = 'bg-emerald-50';
            textClass = 'text-emerald-600';
          } else if (isRemoved) {
            borderClass = 'border-red-300';
            bgClass = 'bg-red-50';
            textClass = 'text-red-500 line-through';
          } else if (isSelected) {
            borderClass = 'border-[#00E5FF]';
            bgClass = 'bg-[#00E5FF]';
            textClass = 'text-white';
          }

          return (
            <button
              key={tag.id}
              onClick={() => toggleTag(tag.id)}
              className={`relative flex flex-col items-center gap-1 py-2.5 rounded-xl text-[10px] font-bold transition-all border ${bgClass} ${textClass} ${borderClass}`}
            >
              {isAdded && (
                <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-emerald-500 flex items-center justify-center">
                  <Plus size={10} className="text-white" />
                </span>
              )}
              {isRemoved && (
                <span className="absolute -top-1 -right-1 w-4 h-4 rounded-full bg-red-500 flex items-center justify-center">
                  <Minus size={10} className="text-white" />
                </span>
              )}
              <span className="text-base">{tag.icon}</span>
              <span>{t(tag.labelKey)}</span>
            </button>
          );
        })}
      </div>

      {/* Change summary */}
      {hasChanges && (
        <div className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 mb-4">
          <p className="text-slate-400 text-[10px] font-bold mb-1">{t('wizard.suggest.changes')}</p>
          <p className="text-slate-600 text-xs">{editSummary}</p>
        </div>
      )}

      {/* Submit */}
      <button
        onClick={handleSubmit}
        disabled={!hasChanges || submitting}
        className={`w-full py-3.5 rounded-2xl text-sm font-bold transition-all flex items-center justify-center gap-2 ${
          hasChanges && !submitting
            ? 'bg-[#00E5FF] text-slate-900 active:scale-[0.97] shadow-lg shadow-cyan-500/25'
            : 'bg-slate-100 text-slate-300 cursor-not-allowed'
        }`}
      >
        {submitting ? (
          <><Loader2 size={16} className="animate-spin" /> {t('wizard.sending')}</>
        ) : (
          t('wizard.suggest.submit')
        )}
      </button>
    </>
  );

  if (v2) {
    return (
      <Sheet
        open={isOpen}
        onClose={onClose}
        layout="nested"
        // One z-[100] layer (.cursorrules full-screen overlays), in place over ParkDetailSheet — unchanged.
        zIndex={SHEET_Z.overlay}
        portal={false}
        keyboardAware={false}
        backdropClassName="bg-black/30 backdrop-blur-sm"
        frameClassName="w-full"
        scroll="panel"
        className="relative max-h-[80vh]"
        transition={{ type: 'spring', damping: 28, stiffness: 300 }}
        ariaLabel={t('wizard.suggest.title', { name: park.name })}
        header={
          <div className="flex items-center justify-between gap-3 px-5 pb-3 pt-1">
            <div className="flex min-w-0 items-center gap-2">
              <Pencil className="h-4 w-4 shrink-0 text-v2-deep" aria-hidden="true" />
              <h3 className="truncate text-[17px] font-black text-v2-ink">{t('wizard.suggest.title', { name: park.name })}</h3>
            </div>
            <IconButton aria-label={t('wizard.close')} tone="surface" size={36} className="shrink-0" onClick={onClose}>
              <X className="h-4 w-4" />
            </IconButton>
          </div>
        }
      >
        {success}
        <div className="px-5">{form}</div>
      </Sheet>
    );
  }

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex flex-col justify-end">
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="absolute inset-0 bg-black/30 backdrop-blur-sm"
        onClick={onClose}
      />

      <motion.div
        initial={{ y: '100%' }}
        animate={{ y: 0 }}
        exit={{ y: '100%' }}
        transition={{ type: 'spring', damping: 28, stiffness: 300 }}
        className="relative bg-white rounded-t-3xl shadow-2xl p-5 max-h-[80vh] overflow-y-auto"
        dir="rtl"
      >
        {success}

        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Pencil size={16} className="text-slate-500" />
            <h3 className="text-slate-900 text-base font-bold">{t('wizard.suggest.title', { name: park.name })}</h3>
          </div>
          <button onClick={onClose} className="p-2 rounded-full bg-slate-100 text-slate-500 active:scale-90 transition-transform">
            <X size={16} />
          </button>
        </div>

        {form}
      </motion.div>
    </div>
  );
}
