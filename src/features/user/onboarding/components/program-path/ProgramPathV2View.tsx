'use client';

/**
 * Program-path goal picker — home-v2 look (enable_home_v2).
 *
 * Owner-approved sketch ("מה הכי חשוב לך?"): one screen, a hero photo that
 * crossfades to the selected goal with a glass chip saying what the level
 * test will be, 3 compact goal cards (single choice), the goal's own
 * follow-up (body areas) inside the selected card — the skills goal gets
 * its own step after Continue (ProgramPathSkillsStepV2) — an
 * optional free-text note, and one gradient CTA.
 *
 * Pure view — every piece of state and every handler comes from
 * src/app/onboarding-new/program-path/page.tsx. The area tiles map onto the legacy muscle packages (utils/muscle-selection.ts), so
 * what gets saved on Continue is what the legacy UI would save.
 */

import React, { useEffect, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Activity, Check, ChevronRight, Dumbbell, Info } from 'lucide-react';
import type { ProgramCardId } from '../../utils/program-card-selection';
import { MUSCLE_BALANCE_MESSAGES_HE, type MuscleBalanceCase } from '../../utils/muscle-balance';
import { AREA_TILES, type AreaTileId } from '../../utils/muscle-selection';
import { GOAL_NOTE_MAX_LENGTH, goalNotePlaceholder } from '../../utils/goal-note';
import type { ResolvedGoalImage } from '../../constants/program-path-goal-images';
import MediaHeroFade, { MediaHeroLayer } from '@/components/ui/v2/MediaHeroFade';

export interface ProgramPathV2ViewProps {
  isFemale: boolean;
  /** The single chosen goal (cardOrder[0]), null until the user picks one. */
  selectedGoal: ProgramCardId | null;
  onSelectGoal: (id: ProgramCardId) => void;
  images: Record<ProgramCardId, ResolvedGoalImage>;

  areaTiles: AreaTileId[];
  onPickAreaTile: (id: AreaTileId) => void;
  showMuscleRecommendation: boolean;
  muscleBalanceCase: MuscleBalanceCase | null;
  recommendedTiles: ReadonlySet<AreaTileId>;

  goalNote: string;
  onGoalNoteChange: (value: string) => void;
  noteExamples: string[];

  totalSegments: number;
  currentSegment: number;
  onBack: () => void;
  onContinue: () => void;
  canContinue: boolean;
  continueLabel: string;
}

const GOAL_ORDER: ProgramCardId[] = ['health', 'body_focus', 'skills'];

const TEST_LINE: Record<ProgramCardId, string> = {
  health: 'מבחן קצר: 4 תרגילים לכל הגוף',
  body_focus: 'המבחן: רק האזורים שבחרת',
  skills: 'המבחן: סולם לכל אלמנט + ליבה',
};

const EXPAND = {
  initial: { opacity: 0, height: 0 },
  animate: { opacity: 1, height: 'auto' },
  exit: { opacity: 0, height: 0 },
  transition: { duration: 0.28, ease: [0.23, 1, 0.32, 1] },
} as const;

const SAFE_TOP = 'env(safe-area-inset-top, 0px)';
const SAFE_BOTTOM = 'env(safe-area-inset-bottom, 0px)';

function goalCopy(id: ProgramCardId, isFemale: boolean) {
  const g = (m: string, f: string) => (isFemale ? f : m);
  switch (id) {
    case 'health':
      return {
        title: g('להרגיש טוב וחזק', 'להרגיש טובה וחזקה'),
        sub: g(
          'למי שמתחיל, חוזר אחרי הפסקה או רוצה בסיס בריא לכל הגוף',
          'למי שמתחילה, חוזרת אחרי הפסקה או רוצה בסיס בריא לכל הגוף',
        ),
        level: g('מתחילים', 'מתחילות'),
        bars: 1,
      };
    case 'body_focus':
      return {
        title: 'לחטב ולבנות שריר',
        sub: g(
          'למי שכבר מתאמן ורוצה לעלות רמה, לחזור לכושר או למקד אזורים',
          'למי שכבר מתאמנת ורוצה לעלות רמה, לחזור לכושר או למקד אזורים',
        ),
        level: 'לכל רמה',
        bars: 2,
      };
    case 'skills':
      return {
        title: 'קליסטניקס: לפתוח אלמנטים',
        sub: 'למי שעושה כבר כמה מתח ומקבילים ורוצה לפתוח עליית כוח, עמידת ידיים ופלאנץ׳',
        level: g('מתקדמים', 'מתקדמות'),
        bars: 3,
      };
  }
}

// ── Building blocks ────────────────────────────────────────────────

function TintPanel({ iconSize = 28 }: { iconSize?: number }) {
  return (
    <span className="grid h-full w-full place-items-center bg-[linear-gradient(160deg,#eef8fc,#d9f1fb)]">
      <Dumbbell size={iconSize} strokeWidth={1.8} className="text-v2-deep/60" aria-hidden />
    </span>
  );
}

function Hero({
  images, activeGoal, selectedGoal, totalSegments, currentSegment, onBack,
}: {
  images: Record<ProgramCardId, ResolvedGoalImage>;
  activeGoal: ProgramCardId;
  selectedGoal: ProgramCardId | null;
  totalSegments: number;
  currentSegment: number;
  onBack: () => void;
}) {
  return (
    <MediaHeroFade
      fadeTo="#f6fbfd"
      style={{
        flex: '1 1 0px',
        minHeight: `calc(108px + ${SAFE_TOP})`,
        maxHeight: `calc(248px + ${SAFE_TOP})`,
      }}
      overlay={<HeroOverlay {...{ selectedGoal, totalSegments, currentSegment, onBack }} />}
    >
      {/* Crossfade stack — one layer per goal, the active one on top. No
          photo → the soft brand fill (fades out like a photo), no icon. */}
      {GOAL_ORDER.map((id) => {
        const img = images[id];
        const on = id === activeGoal;
        return (
          <div
            key={id}
            aria-hidden={!on}
            className="absolute inset-0 transition-[opacity,transform] duration-[420ms,900ms] ease-v2 motion-reduce:transition-none"
            style={{ opacity: on ? 1 : 0, transform: on ? 'scale(1)' : 'scale(1.06)' }}
          >
            <MediaHeroLayer
              media={img.src ? { kind: 'image', src: img.src, alt: on ? img.alt : '', position: img.heroPosition } : { kind: 'none' }}
            />
          </div>
        );
      })}
    </MediaHeroFade>
  );
}

function HeroOverlay({
  selectedGoal, totalSegments, currentSegment, onBack,
}: {
  selectedGoal: ProgramCardId | null;
  totalSegments: number;
  currentSegment: number;
  onBack: () => void;
}) {
  return (
    <>
      {/* Back + story bar */}
      <div
        className="absolute inset-x-4 top-0 flex items-center gap-3"
        style={{ paddingTop: `calc(${SAFE_TOP} + 10px)` }}
      >
        <button
          type="button"
          onClick={onBack}
          aria-label="חזרה"
          className="pointer-events-auto grid h-10 w-10 shrink-0 place-items-center rounded-full bg-white/70 shadow-v2-ring backdrop-blur-[14px] transition-transform duration-150 ease-v2 active:scale-[0.97]"
        >
          <ChevronRight size={18} strokeWidth={2.4} className="text-v2-ink" />
        </button>
        <div className="flex flex-1 gap-[5px]" aria-hidden>
          {Array.from({ length: totalSegments }, (_, i) => (
            <span
              key={i}
              className={`h-[5px] flex-1 rounded-full ${i + 1 <= currentSegment ? 'bg-white' : 'bg-white/45'}`}
            />
          ))}
        </div>
      </div>

      {/* What the level test will be */}
      <div
        className="absolute bottom-[26px] right-4 flex items-center gap-2 rounded-full bg-white/75 py-2 pl-3 pr-3.5 shadow-v2-ring backdrop-blur-[14px] transition-opacity duration-300 ease-v2"
        style={{ opacity: selectedGoal ? 1 : 0 }}
        aria-live="polite"
      >
        <Activity size={16} strokeWidth={2.2} className="shrink-0 text-v2-deep" aria-hidden />
        <span className="whitespace-nowrap text-[13px] font-extrabold text-v2-ink">
          {selectedGoal ? TEST_LINE[selectedGoal] : ''}
        </span>
      </div>
    </>
  );
}

function LevelBars({ n }: { n: number }) {
  return (
    <span className="flex items-end gap-[3px]" aria-hidden>
      {[1, 2, 3].map((i) => (
        <span
          key={i}
          className={`block w-[5px] rounded-[2px] ${i <= n ? 'bg-v2-accent' : 'bg-v2-pill-border'}`}
          style={{ height: 4 + i * 3 }}
        />
      ))}
    </span>
  );
}

function CoachNote({ text }: { text: string }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: -6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -6 }}
      transition={{ duration: 0.22 }}
      className="mb-2 flex items-start gap-2 rounded-[14px] bg-amber-50 px-3 py-2 text-right ring-1 ring-inset ring-amber-300/70"
      role="status"
      aria-live="polite"
    >
      <Info size={15} className="mt-0.5 shrink-0 text-v2-amber" strokeWidth={2.5} />
      <p className="text-[12.5px] font-bold leading-snug text-amber-900">{text}</p>
    </motion.div>
  );
}

function GoalCard({
  id, isFemale, selected, image, onSelect, children,
}: {
  id: ProgramCardId;
  isFemale: boolean;
  selected: boolean;
  image: ResolvedGoalImage;
  onSelect: () => void;
  children?: React.ReactNode;
}) {
  const c = goalCopy(id, isFemale);
  return (
    <div
      className={`overflow-hidden rounded-[22px] bg-white transition-shadow duration-200 ease-v2 ${
        selected ? 'shadow-v2-card ring-2 ring-v2-accent' : 'shadow-v2-ring'
      }`}
    >
      <button
        type="button"
        role="radio"
        aria-checked={selected}
        onClick={onSelect}
        className="flex w-full items-center gap-3 py-2.5 pl-2.5 pr-3.5 text-right text-v2-ink transition-transform duration-150 ease-v2 active:scale-[0.97] [@media(max-height:720px)]:py-2"
      >
        <span className="relative h-[52px] w-[52px] shrink-0 overflow-hidden rounded-2xl bg-v2-tint [@media(max-height:720px)]:h-11 [@media(max-height:720px)]:w-11">
          {image.src ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={image.src}
              alt=""
              className="h-full w-full object-cover"
              style={{
                objectPosition: image.thumbPosition,
                transform: image.thumbZoom ? `scale(${image.thumbZoom})` : undefined,
                transformOrigin: '50% 35%',
              }}
              draggable={false}
            />
          ) : (
            <TintPanel iconSize={22} />
          )}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate whitespace-nowrap text-[16px] font-black !tracking-[-0.01em]">{c.title}</span>
          <span
            className={`mt-0.5 block text-[12.5px] font-semibold leading-[1.35] text-v2-ink-2 line-clamp-2 ${
              selected ? '' : '[@media(max-height:720px)]:line-clamp-1'
            }`}
          >
            {c.sub}
          </span>
          <span className="mt-1 flex items-center gap-1.5">
            <LevelBars n={c.bars} />
            <span className="whitespace-nowrap text-[11.5px] font-extrabold text-v2-deep">{c.level}</span>
          </span>
        </span>
        <span
          aria-hidden
          className={`grid h-[26px] w-[26px] shrink-0 place-items-center rounded-full transition-colors duration-150 ${
            selected ? 'bg-v2-cta' : 'bg-v2-surface ring-[1.5px] ring-inset ring-v2-pill-border'
          }`}
        >
          {selected && <Check size={14} strokeWidth={3.2} className="text-v2-on-cta" />}
        </span>
      </button>
      <AnimatePresence initial={false}>
        {selected && children && (
          <motion.div {...EXPAND} style={{ overflow: 'hidden' }}>
            <div className="px-3 pb-3">{children}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

const TINT_ON = 'bg-v2-tint text-v2-deep ring-[1.5px] ring-inset ring-v2-accent/50';
const TINT_OFF = 'bg-white text-v2-ink-2 shadow-v2-ring';
const TINT_REC = 'bg-white text-v2-ink-2 ring-2 ring-inset ring-v2-amber/70';

function GoalNoteField({
  value, onChange, examples,
}: {
  value: string;
  onChange: (v: string) => void;
  examples: string[];
}) {
  const [idx, setIdx] = useState(0);
  const [shown, setShown] = useState(true);
  const [focused, setFocused] = useState(false);
  const swapTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Rotate the example every ~3.5s with a short fade; stop once focused.
  useEffect(() => {
    if (focused || examples.length < 2) return;
    const reduce =
      typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const t = setInterval(() => {
      if (reduce) { setIdx((i) => (i + 1) % examples.length); return; }
      setShown(false);
      swapTimer.current = setTimeout(() => {
        setIdx((i) => (i + 1) % examples.length);
        setShown(true);
      }, 260);
    }, 3500);
    return () => {
      clearInterval(t);
      if (swapTimer.current) clearTimeout(swapTimer.current);
      setShown(true);
    };
  }, [focused, examples.length]);

  const example = examples.length > 0 ? examples[idx % examples.length] : '';

  return (
    <label className="mt-3 block [@media(max-height:720px)]:mt-2.5">
      <span className="mb-1.5 flex items-baseline gap-1.5">
        <span className="whitespace-nowrap text-[13px] font-extrabold text-v2-deep">יש עוד משהו שחשוב לך?</span>
        <span className="whitespace-nowrap text-[11.5px] font-semibold text-v2-muted">לא חובה</span>
      </span>
      <span className="relative block">
        <textarea
          rows={2}
          value={value}
          maxLength={GOAL_NOTE_MAX_LENGTH}
          onChange={(e) => onChange(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          className="block w-full resize-none rounded-2xl border-0 bg-white px-3.5 py-2.5 text-[16px] font-medium leading-[1.4] text-v2-ink shadow-v2-ring outline-none focus:ring-2 focus:ring-inset focus:ring-v2-accent/60"
          dir="rtl"
          enterKeyHint="done"
        />
        {!value && example && (
          <span
            aria-hidden
            className="pointer-events-none absolute inset-x-3.5 top-2.5 line-clamp-2 text-[16px] font-medium leading-[1.4] text-v2-muted transition-opacity duration-200 ease-v2 motion-reduce:transition-none"
            style={{ opacity: shown ? 1 : 0 }}
          >
            {goalNotePlaceholder(example)}
          </span>
        )}
      </span>
    </label>
  );
}

// ── View ───────────────────────────────────────────────────────────

export default function ProgramPathV2View(p: ProgramPathV2ViewProps) {
  const { isFemale, selectedGoal } = p;
  const g = (m: string, f: string) => (isFemale ? f : m);
  const activeGoal: ProgramCardId = selectedGoal ?? 'health';

  return (
    <div
      dir="rtl"
      className="relative flex flex-col overflow-hidden bg-v2-surface text-v2-ink"
      style={{
        // Bleed under the notch and the home indicator: <main> already pads
        // both insets on this route, the hero/CTA re-apply them themselves.
        marginTop: `calc(-1 * ${SAFE_TOP})`,
        marginBottom: `calc(-1 * ${SAFE_BOTTOM})`,
        height: `calc(100% + ${SAFE_TOP} + ${SAFE_BOTTOM})`,
      }}
    >
      {/* Everything above the CTA. Fits without scrolling on 667–932px
          phones (the hero absorbs the slack); scrolls only as a fallback
          (very short screens, keyboard open). */}
      <div className="flex min-h-0 flex-1 flex-col overflow-y-auto overflow-x-hidden overscroll-contain">
        <Hero
          images={p.images}
          activeGoal={activeGoal}
          selectedGoal={selectedGoal}
          totalSegments={p.totalSegments}
          currentSegment={p.currentSegment}
          onBack={p.onBack}
        />

        <div className="relative -mt-2.5 flex shrink-0 flex-col px-4 pb-1">
          <h1 className="text-[26px] font-black leading-[1.15] !tracking-[-0.02em] [@media(max-height:720px)]:text-[23px]">
            מה הכי חשוב לך?
          </h1>
          <p className="mb-3 mt-1 text-[14px] font-medium text-v2-ink-2 [@media(max-height:720px)]:mb-2.5">
            {g('בחר מטרה אחת. את הרמה המדויקת נמדוד במבחן הקצר.', 'בחרי מטרה אחת. את הרמה המדויקת נמדוד במבחן הקצר.')}
          </p>

          <div role="radiogroup" aria-label="מה הכי חשוב לך?" className="flex flex-col gap-2.5 [@media(max-height:720px)]:gap-2">
            {/* ── Health ── */}
            <GoalCard
              id="health"
              isFemale={isFemale}
              selected={selectedGoal === 'health'}
              image={p.images.health}
              onSelect={() => p.onSelectGoal('health')}
            />

            {/* ── Body focus → area tiles ── */}
            <GoalCard
              id="body_focus"
              isFemale={isFemale}
              selected={selectedGoal === 'body_focus'}
              image={p.images.body_focus}
              onSelect={() => p.onSelectGoal('body_focus')}
            >
              <p className="mb-[7px] text-[12.5px] font-extrabold text-v2-deep">על מה נתמקד?</p>
              <AnimatePresence>
                {p.showMuscleRecommendation && p.muscleBalanceCase && (
                  <CoachNote key="muscle-note" text={MUSCLE_BALANCE_MESSAGES_HE[p.muscleBalanceCase]} />
                )}
              </AnimatePresence>
              <div className="grid grid-cols-2 gap-[7px]">
                {AREA_TILES.map((t) => {
                  const on = p.areaTiles.includes(t.id);
                  const rec = p.showMuscleRecommendation && !on && p.recommendedTiles.has(t.id);
                  return (
                    <button
                      key={t.id}
                      type="button"
                      aria-pressed={on}
                      onClick={() => p.onPickAreaTile(t.id)}
                      className={`flex h-10 items-center justify-center gap-1.5 rounded-[14px] text-[13.5px] font-extrabold transition-transform duration-150 ease-v2 active:scale-[0.97] ${
                        on ? TINT_ON : rec ? TINT_REC : TINT_OFF
                      }`}
                    >
                      <span className="whitespace-nowrap">{t.label}</span>
                      {t.recommended && (
                        <span className="whitespace-nowrap rounded-full bg-white px-1.5 py-px text-[11px] font-extrabold text-v2-deep">
                          מומלץ
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </GoalCard>

            {/* ── Skills → its own step (ProgramPathSkillsStepV2) after Continue ── */}
            <GoalCard
              id="skills"
              isFemale={isFemale}
              selected={selectedGoal === 'skills'}
              image={p.images.skills}
              onSelect={() => p.onSelectGoal('skills')}
            />
          </div>

          <GoalNoteField
            value={p.goalNote}
            onChange={p.onGoalNoteChange}
            examples={p.noteExamples}
          />
        </div>
      </div>

      {/* The one gradient on the screen */}
      <div
        className="shrink-0 px-4 pt-2.5"
        style={{ paddingBottom: `calc(${SAFE_BOTTOM} + 14px)` }}
      >
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
