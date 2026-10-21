'use client';

/**
 * Running questionnaire — owner-approved v2 screens (enable_home_v2 only):
 *
 *  • RunningGoalPickerV2   — q_run_goal. Same pattern as the strength goal
 *    picker (ProgramPathV2View): a hero photo that crossfades to the picked
 *    goal, compact cards with a thumbnail + "who it's for" line, single
 *    choice, one gradient CTA.
 *  • RunningAbilityPickerV2 — q_run_*_ability ("כמה זמן אפשר לרוץ ברצף?").
 *    Cards with a 4-step level glyph + a reassurance line (R5-prop-ability),
 *    and a short training-experience hint per card (owner 20.10.2026).
 *
 * Same answers, same onAnswer(answerId) the generic renderer calls — the
 * only interaction change is tap-to-select + "המשך" instead of
 * advance-on-tap, so the hero / selection can be seen before moving on.
 * What gets saved (the answer's metadata, via the dynamic page) is unchanged.
 */

import React, { useState } from 'react';
import { Check, Footprints, Info, Sprout } from 'lucide-react';
import type { DynamicQuestionNode } from '../../engine/DynamicOnboardingEngine';
import {
  ABILITY_LEVEL,
  abilityCopy,
  abilityExperienceHe,
  abilityTierOf,
  resolveRunningGoalVisual,
  runningGoalSubtitle,
  type RunningGoalVisual,
} from '../../constants/running-goal-visuals';
import { useT } from '@/hooks/useT';
import { onboarding } from '@/messages/ns/onboarding';
import { MediaHeroImage } from '@/components/ui/v2/MediaHeroFade';
import { GOAL_HERO_HEIGHT } from '../../utils/fit-screen';

type Answer = DynamicQuestionNode['answers'][number];

interface BaseProps {
  question: DynamicQuestionNode;
  title: string;
  description?: string;
  selectedAnswerId?: string;
  onAnswer: (answerId: string) => void;
  answerText: (a: Answer) => string;
  isFemale: boolean;
}

/**
 * Walking (owner 20.10.2026): a 4th choice on q_run_goal that is NOT a Firestore
 * answer — it leaves the running tree for the walking signup (/onboarding-new/walking).
 * Only passed under enable_home_v2; absent → the picker is exactly the 3 answers.
 */
export interface WalkingChoice {
  onChoose: () => void;
}

const WALKING_ID = '__walking';
const WALKING_VISUAL: RunningGoalVisual = {
  goalPath: null,
  src: null,
  alt: '',
  heroPosition: '50% 50%',
  thumbPosition: '50% 50%',
  tint: { from: '#fff7e8', to: '#fde7bf', ink: '#d97706' },
};

function meta(a: Answer): Record<string, unknown> | null {
  return a.metadata ?? null;
}

/** Tap-to-select + one submit (the page advances ~300ms after onAnswer). */
function usePick(selectedAnswerId: string | undefined, onAnswer: (id: string) => void) {
  const [picked, setPicked] = useState<string | null>(selectedAnswerId ?? null);
  const [sent, setSent] = useState(false);
  const submit = () => {
    if (!picked || sent) return;
    setSent(true);
    onAnswer(picked);
  };
  return { picked, setPicked: (id: string) => { if (!sent) setPicked(id); }, submit, sent };
}

// ── Shared bits ────────────────────────────────────────────────────

function Radio({ on }: { on: boolean }) {
  return (
    <span
      aria-hidden
      className={`grid h-[26px] w-[26px] shrink-0 place-items-center rounded-full transition-colors duration-150 ${
        on ? 'bg-v2-cta' : 'bg-v2-surface ring-[1.5px] ring-inset ring-v2-pill-border'
      }`}
    >
      {on && <Check size={14} strokeWidth={3.2} className="text-v2-on-cta" />}
    </span>
  );
}

function ContinueBar({ disabled, onPress }: { disabled: boolean; onPress: () => void }) {
  const t = useT(onboarding);
  return (
    <div
      className="sticky bottom-0 z-30 -mx-4 mt-auto px-4 pb-1 pt-3"
      style={{ background: 'linear-gradient(to top, #f6fbfd 70%, rgba(246,251,253,0))' }}
    >
      <button
        type="button"
        onClick={onPress}
        disabled={disabled}
        aria-disabled={disabled}
        className={`flex h-[52px] w-full items-center justify-center whitespace-nowrap rounded-full text-[16.5px] font-extrabold transition-transform duration-150 ease-v2 ${
          disabled
            ? 'cursor-not-allowed bg-v2-hairline text-v2-muted'
            : 'bg-v2-cta text-v2-on-cta shadow-v2-cta active:scale-[0.97]'
        }`}
      >
        {t('signup.runChoice.continue')}
      </button>
    </div>
  );
}

function Header({ title, description }: { title: string; description?: string }) {
  return (
    <div className="mb-4 px-1 text-right">
      <h2 className="text-[24px] font-black leading-[1.2] !tracking-[-0.02em] text-v2-ink">{title}</h2>
      {description && <p className="mt-1 text-[14px] font-medium leading-snug text-v2-ink-2">{description}</p>}
    </div>
  );
}

// ── Goal picker ────────────────────────────────────────────────────

function GoalTint({ v, size }: { v: RunningGoalVisual; size: number }) {
  if (v === WALKING_VISUAL) {
    return (
      <span className="grid h-full w-full place-items-center" style={{ background: `linear-gradient(160deg, ${v.tint.from}, ${v.tint.to})` }}>
        <Footprints size={size} strokeWidth={1.8} style={{ color: v.tint.ink }} aria-hidden />
      </span>
    );
  }
  return (
    <span
      className="grid h-full w-full place-items-center"
      style={{ background: `linear-gradient(160deg, ${v.tint.from}, ${v.tint.to})` }}
    >
      {v.goalPath === 'start_running' ? (
        <Sprout size={size} strokeWidth={1.8} style={{ color: v.tint.ink }} aria-hidden />
      ) : (
        <Footprints size={size} strokeWidth={1.8} style={{ color: v.tint.ink }} aria-hidden />
      )}
    </span>
  );
}

function PhotoLayer({ v, mode }: { v: RunningGoalVisual; mode: 'hero' | 'thumb' }) {
  if (!v.src) return <GoalTint v={v} size={mode === 'hero' ? 44 : 24} />;
  // Fades in once decoded (over the goal's tint) instead of popping in.
  return (
    <span className="absolute inset-0" style={{ background: `linear-gradient(160deg, ${v.tint.from}, ${v.tint.to})` }}>
      <MediaHeroImage
        src={v.src}
        alt={mode === 'hero' ? v.alt : ''}
        position={mode === 'hero' ? v.heroPosition : v.thumbPosition}
        zoom={mode === 'hero' ? v.heroZoom : v.thumbZoom}
      />
    </span>
  );
}

export function RunningGoalPickerV2({
  question, title, description, selectedAnswerId, onAnswer, answerText, isFemale, walking,
}: BaseProps & { walking?: WalkingChoice }) {
  const t = useT(onboarding);
  const { picked, setPicked, submit } = usePick(selectedAnswerId, (id) => {
    if (id === WALKING_ID) walking?.onChoose();
    else onAnswer(id);
  });
  // The walking choice is a pseudo-answer at the end (the 4th option).
  const answers: Array<{ id: string; label: string; visual: RunningGoalVisual; sub: string | null }> = [
    ...question.answers.map((a) => {
      const visual = resolveRunningGoalVisual({ id: a.id, metadata: meta(a), imageUrl: a.imageUrl });
      return { id: a.id, label: answerText(a), visual, sub: runningGoalSubtitle(visual.goalPath, isFemale) };
    }),
    ...(walking
      ? [{ id: WALKING_ID, label: t('signup.runChoice.walking.label'), visual: WALKING_VISUAL, sub: t('signup.runChoice.walking.sub') }]
      : []),
  ];
  const visuals = answers.map((a) => a.visual);
  // Before a pick, the hero shows the first goal that has a photo.
  const firstPhoto = answers.findIndex((_, i) => !!visuals[i].src);
  const activeIdx = picked ? answers.findIndex((a) => a.id === picked) : Math.max(0, firstPhoto);

  return (
    <div className="flex w-full flex-1 flex-col font-simpler text-v2-ink" dir="rtl">
      {/* Hero — crossfades to the picked goal */}
      {/* Height yields on short phones so the first question fits one screen (fit-screen.ts). */}
      <div className="relative mb-4 shrink-0 overflow-hidden rounded-v2-card bg-v2-tint shadow-v2-card" style={{ height: GOAL_HERO_HEIGHT }}>
        {answers.map((a, i) => {
          const on = i === activeIdx;
          return (
            <div
              key={a.id}
              aria-hidden={!on}
              className="absolute inset-0 transition-[opacity,transform] duration-[420ms,900ms] ease-v2 motion-reduce:transition-none"
              style={{ opacity: on ? 1 : 0, transform: on ? 'scale(1)' : 'scale(1.06)' }}
            >
              <PhotoLayer v={visuals[i]} mode="hero" />
            </div>
          );
        })}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{ background: 'linear-gradient(180deg, rgba(14,20,25,0) 55%, rgba(14,20,25,0.18) 100%)' }}
        />
      </div>

      <Header title={title} description={description} />

      <div role="radiogroup" aria-label={title} className="flex flex-col gap-2.5">
        {answers.map((a, i) => {
          const on = picked === a.id;
          const v = visuals[i];
          const sub = a.sub;
          return (
            <button
              key={a.id}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => setPicked(a.id)}
              className={`flex w-full items-center gap-3 rounded-[22px] bg-white py-2.5 pl-3 pr-2.5 text-right transition-[transform,box-shadow] duration-150 ease-v2 active:scale-[0.97] ${
                on ? 'shadow-v2-card ring-2 ring-v2-accent' : 'shadow-v2-ring'
              }`}
            >
              <span className="relative h-[52px] w-[52px] shrink-0 overflow-hidden rounded-2xl bg-v2-tint">
                <PhotoLayer v={v} mode="thumb" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate whitespace-nowrap text-[16.5px] font-black !tracking-[-0.01em]">
                  {a.label}
                </span>
                {sub && (
                  <span className="mt-0.5 block text-[12.5px] font-bold leading-[1.4] text-v2-muted line-clamp-2">{sub}</span>
                )}
              </span>
              <Radio on={on} />
            </button>
          );
        })}
      </div>

      <div className="min-h-4 flex-grow" />
      <ContinueBar disabled={!picked} onPress={submit} />
    </div>
  );
}

// ── Ability picker ─────────────────────────────────────────────────

function LevelGlyph({ n }: { n: number }) {
  return (
    <span className="flex h-[22px] items-end gap-[2px]" aria-hidden>
      {[1, 2, 3, 4].map((i) => (
        <span
          key={i}
          className={`block w-[5px] rounded-[2px] ${i <= n ? 'bg-v2-deep' : 'bg-v2-pill-border'}`}
          style={{ height: 1 + i * 5 }}
        />
      ))}
    </span>
  );
}

export function RunningAbilityPickerV2({
  question, selectedAnswerId, onAnswer, answerText, isFemale,
}: BaseProps) {
  const { picked, setPicked, submit } = usePick(selectedAnswerId, onAnswer);
  const t = useT(onboarding);
  const title = t('signup.runChoice.ability.title');
  return (
    <div className="flex w-full flex-1 flex-col font-simpler text-v2-ink" dir="rtl">
      <Header title={title} description={t('signup.runChoice.ability.description')} />

      <div role="radiogroup" aria-label={title} className="flex flex-col gap-2.5">
        {question.answers.map((a) => {
          const on = picked === a.id;
          const tier = abilityTierOf({ metadata: meta(a) });
          const copy = tier ? abilityCopy(tier, isFemale) : null;
          const experience = tier ? abilityExperienceHe(tier, isFemale) : null;
          const label = copy?.title ?? answerText(a);
          return (
            <button
              key={a.id}
              type="button"
              role="radio"
              aria-checked={on}
              onClick={() => setPicked(a.id)}
              className={`flex w-full items-center gap-3 rounded-[22px] bg-white p-3.5 text-right transition-[transform,box-shadow] duration-150 ease-v2 active:scale-[0.97] ${
                on ? 'shadow-v2-card ring-2 ring-v2-accent' : 'shadow-v2-ring'
              }`}
            >
              <span className="grid h-[52px] w-[52px] shrink-0 place-items-center rounded-2xl bg-v2-tint">
                <LevelGlyph n={tier ? ABILITY_LEVEL[tier] : 0} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate whitespace-nowrap text-[16.5px] font-black">{label}</span>
                {copy?.sub && (
                  <span className="mt-0.5 block truncate whitespace-nowrap text-[12.5px] font-bold text-v2-muted">{copy.sub}</span>
                )}
                {experience && (
                  <span className="mt-0.5 block text-[12px] font-bold leading-[1.35] text-v2-deep line-clamp-2">{experience}</span>
                )}
              </span>
              <Radio on={on} />
            </button>
          );
        })}

        <div className="mt-1 flex items-center gap-2.5 rounded-[18px] bg-v2-tint px-3.5 py-3">
          <Info size={17} strokeWidth={2.3} className="shrink-0 text-v2-deep" aria-hidden />
          <p className="text-[13px] font-bold leading-snug text-v2-ink-2">
            {t('signup.runChoice.ability.info')}
          </p>
        </div>
      </div>

      <div className="min-h-4 flex-grow" />
      <ContinueBar disabled={!picked} onPress={submit} />
    </div>
  );
}
