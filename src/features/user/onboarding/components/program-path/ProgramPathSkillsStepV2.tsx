'use client';

/**
 * Program-path, step 2 for the skills goal — home-v2 look (enable_home_v2).
 *
 * Shown after the goal picker when the chosen goal is "קליסטניקס: לפתוח
 * אלמנטים" (owner-approved sketch "בחירת אלמנטים"). Pure view: the selection
 * goes through the page's own toggleSkill (master exclusive, tap order =
 * priority), readiness gate ("בקרוב") and push/pull coach gate — only the
 * layout, a 3-pick cap and the v2 skill subset (V2_HIDDEN_SKILLS) are new.
 */

import React from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Check, ChevronRight, Lightbulb, Star } from 'lucide-react';
import {
  PULL_SKILLS,
  PUSH_SKILLS,
  SKILL_ICON_PATHS,
  SKILL_MASTER_ID,
} from '../../constants/program-path.constants';
import { V2_SKILL_GROUPS, canToggleSkillV2 } from '../../utils/skill-selection';
import { useT } from '@/hooks/useT';
import { onboarding } from '@/messages/ns/onboarding';

export interface ProgramPathSkillsStepV2Props {
  isFemale: boolean;
  selectedSkills: string[];
  toggleSkill: (id: string) => void;
  readySkillIds: Set<string> | null;
  showRecommendation: boolean;
  missingCategory: 'push' | 'pull' | null;
  totalSegments: number;
  currentSegment: number;
  onBack: () => void;
  onContinue: () => void;
  canContinue: boolean;
  continueLabel: string;
}

const SAFE_TOP = 'env(safe-area-inset-top, 0px)';
const SAFE_BOTTOM = 'env(safe-area-inset-bottom, 0px)';

const hideOnError = (e: React.SyntheticEvent<HTMLImageElement>) => {
  e.currentTarget.style.visibility = 'hidden';
};

export default function ProgramPathSkillsStepV2(p: ProgramPathSkillsStepV2Props) {
  const t = useT(onboarding);
  const gender = p.isFemale ? 'female' : 'other';
  const masterOn = p.selectedSkills.includes(SKILL_MASTER_ID);
  const tap = (id: string) => {
    if (canToggleSkillV2(p.selectedSkills, id)) p.toggleSkill(id);
  };
  const tip =
    p.missingCategory === 'push'
      ? t('programPath.skills.tip.push')
      : t('programPath.skills.tip.pull');

  return (
    <div
      dir="rtl"
      className="relative flex flex-col overflow-hidden bg-v2-surface text-v2-ink"
      style={{
        marginTop: `calc(-1 * ${SAFE_TOP})`,
        marginBottom: `calc(-1 * ${SAFE_BOTTOM})`,
        height: `calc(100% + ${SAFE_TOP} + ${SAFE_BOTTOM})`,
      }}
    >
      <div
        className="flex min-h-0 flex-1 flex-col overflow-y-auto overflow-x-hidden overscroll-none px-4"
        style={{ paddingTop: `calc(${SAFE_TOP} + 10px)` }}
      >
        {/* Back + story bar */}
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={p.onBack}
            aria-label={t('programPath.back')}
            className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-white shadow-v2-ring transition-transform duration-150 ease-v2 active:scale-[0.97]"
          >
            <ChevronRight size={18} strokeWidth={2.4} className="text-v2-ink" />
          </button>
          <div className="flex flex-1 gap-[5px]" aria-hidden>
            {Array.from({ length: p.totalSegments }, (_, i) => (
              <span
                key={i}
                className={`h-[5px] flex-1 rounded-full ${i + 1 <= p.currentSegment ? 'bg-v2-accent' : 'bg-v2-pill-border'}`}
              />
            ))}
          </div>
        </div>

        <span className="mt-[18px] inline-flex self-start whitespace-nowrap rounded-full bg-v2-tint px-[11px] py-[5px] text-[12.5px] font-extrabold text-v2-deep">
          {t('programPath.skills.tag')}
        </span>
        <h1 className="mt-2 text-[26px] font-black leading-[1.15] !tracking-[-0.02em] [@media(max-height:720px)]:text-[23px]">
          {t('programPath.skills.title', { gender })}
        </h1>
        <p className="mb-3.5 mt-1 text-[14px] font-medium text-v2-ink-2">
          {t('programPath.skills.subtitle', { gender })}
        </p>

        {/* Master — "all elements", exclusive with the others */}
        <button
          type="button"
          aria-pressed={masterOn}
          onClick={() => tap(SKILL_MASTER_ID)}
          className={`flex w-full items-center gap-3 rounded-[22px] bg-white px-3 py-2.5 text-right transition-transform duration-150 ease-v2 active:scale-[0.97] ${
            masterOn ? 'shadow-v2-card ring-2 ring-v2-accent' : 'shadow-v2-ring'
          }`}
        >
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-[14px] bg-v2-tint">
            <Star size={22} strokeWidth={2} className="text-v2-deep" aria-hidden />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block whitespace-nowrap text-[15.5px] font-black">{t('programPath.skills.master.title')}</span>
            <span className="block truncate text-[12.5px] font-semibold text-v2-ink-2">
              {t('programPath.skills.master.sub', { gender })}
            </span>
          </span>
          <span
            aria-hidden
            className={`grid h-[26px] w-[26px] shrink-0 place-items-center rounded-full ${
              masterOn ? 'bg-v2-cta' : 'bg-v2-surface ring-[1.5px] ring-inset ring-v2-pill-border'
            }`}
          >
            {masterOn && <Check size={14} strokeWidth={3.2} className="text-v2-on-cta" />}
          </span>
        </button>

        {V2_SKILL_GROUPS.map((grp) => (
          <div key={grp.key} className="mt-3.5 [@media(max-height:720px)]:mt-2.5">
            <div className="mb-2 flex items-baseline gap-2">
              <span className="whitespace-nowrap text-[15px] font-black">{grp.name}</span>
              <span className="whitespace-nowrap text-[12px] font-semibold text-v2-muted">{grp.hint}</span>
            </div>
            <div className="grid grid-cols-2 gap-2.5">
              {grp.items.map((it) => {
                const on = p.selectedSkills.includes(it.id);
                const order = on ? p.selectedSkills.filter((s) => s !== SKILL_MASTER_ID).indexOf(it.id) + 1 : null;
                const notReady = p.readySkillIds !== null && !p.readySkillIds.has(it.id);
                const recommended =
                  p.showRecommendation && !on && !notReady &&
                  ((p.missingCategory === 'push' && PUSH_SKILLS.has(it.id)) ||
                    (p.missingCategory === 'pull' && PULL_SKILLS.has(it.id)));
                return (
                  <button
                    key={it.id}
                    type="button"
                    aria-pressed={on}
                    disabled={notReady}
                    aria-disabled={notReady}
                    onClick={notReady ? undefined : () => tap(it.id)}
                    className={`relative flex flex-col items-center gap-1.5 rounded-[20px] bg-white px-2 pb-2.5 pt-2 transition-transform duration-150 ease-v2 ${
                      notReady
                        ? 'cursor-not-allowed shadow-v2-ring'
                        : `active:scale-[0.97] ${
                            on
                              ? 'shadow-v2-card ring-2 ring-v2-accent'
                              : recommended
                                ? 'ring-2 ring-v2-amber/70'
                                : 'shadow-v2-ring'
                          }`
                    }`}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={SKILL_ICON_PATHS[it.id]}
                      alt=""
                      onError={hideOnError}
                      className={`h-24 w-full rounded-[14px] object-contain [@media(max-height:720px)]:h-[72px] ${
                        notReady ? 'opacity-30 grayscale' : ''
                      }`}
                    />
                    <span className={`max-w-full truncate whitespace-nowrap text-[12.5px] font-extrabold ${notReady ? 'text-v2-muted' : 'text-v2-ink'}`}>
                      {it.label}
                    </span>
                    {notReady && (
                      <span className="absolute right-2 top-2 rounded-full bg-v2-hairline px-1.5 py-px text-[11px] font-extrabold text-v2-muted">
                        {t('programPath.skills.soon')}
                      </span>
                    )}
                    {on && order !== null && (
                      <span className="absolute left-1.5 top-1.5 grid h-6 w-6 place-items-center rounded-full bg-v2-cta text-[13px] font-black tabular-nums text-v2-on-cta">
                        {order}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        ))}

        <AnimatePresence>
          {p.showRecommendation && p.missingCategory && (
            <motion.div
              key="coach-tip"
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.22 }}
              role="status"
              aria-live="polite"
              className="mt-3.5 flex items-start gap-2.5 rounded-[18px] bg-white px-3 py-[11px] shadow-v2-ring"
            >
              <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-v2-tint">
                <Lightbulb size={17} strokeWidth={2.2} className="text-v2-deep" aria-hidden />
              </span>
              <span className="text-[13px] font-semibold leading-[1.45] text-v2-ink-2">
                <b className="font-extrabold text-v2-ink">{t('programPath.skills.tip.label')}</b>
                {tip}
              </span>
            </motion.div>
          )}
        </AnimatePresence>
        <div className="h-2 shrink-0" />
      </div>

      <div className="shrink-0 px-4 pt-2.5" style={{ paddingBottom: `calc(${SAFE_BOTTOM} + 14px)` }}>
        <button
          type="button"
          onClick={p.onContinue}
          disabled={!p.canContinue}
          aria-disabled={!p.canContinue}
          className={`flex h-[52px] w-full items-center justify-center rounded-full text-[16.5px] font-extrabold whitespace-nowrap transition-transform duration-150 ease-v2 ${
            p.canContinue
              ? 'bg-v2-cta text-v2-on-cta shadow-v2-cta active:scale-[0.97]'
              : 'cursor-not-allowed bg-v2-hairline text-v2-muted'
          }`}
        >
          <span className="truncate">{p.continueLabel}</span>
        </button>
      </div>
    </div>
  );
}
