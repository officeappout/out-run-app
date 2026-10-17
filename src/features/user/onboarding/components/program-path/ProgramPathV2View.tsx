'use client';

/**
 * Program-path picker — home-v2 look (enable_home_v2).
 *
 * Pure view: every piece of state and every handler comes from
 * src/app/onboarding-new/program-path/page.tsx, exactly the ones the legacy
 * markup uses (toggleProgramCard / toggleMuscle / selectPackage /
 * toggleSkill / toggleWishlist*), so what gets saved to sessionStorage on
 * Continue is identical. Only the layout and copy around it change:
 *   • 3 choice cards with a checkbox-style indicator (multi-select is now
 *     visible), tint selection, priority number in a tint badge (never black).
 *   • The muscle step gets a title that says WHY it's asked, "כל הגוף" as
 *     the recommended one-tap answer, then grouped chips with an explicit
 *     "בחר הכל" text button instead of the old unlabeled circle.
 *   • An inline hint explains a disabled Continue (card picked, nothing
 *     chosen inside it).
 */

import React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Check, CheckCircle2, ChevronDown, Info, Star, UserCircle } from 'lucide-react';
import type { ExerciseWishlistEntry } from '@/features/user/core/types/user.types';
import type { ProgramCardId } from '../../utils/program-card-selection';
import { MUSCLE_BALANCE_MESSAGES_HE, type MuscleBalanceCase } from '../../utils/muscle-balance';
import {
  MUSCLE_ICON_PATHS,
  MUSCLE_CHIP_LABELS,
  SKILL_MASTER_ID,
  SKILL_PROGRAMS,
  PUSH_SKILLS,
  PULL_SKILLS,
  SKILL_ICON_PATHS,
  MUSCLE_PACKAGES,
  type MusclePackageKey,
} from '../../constants/program-path.constants';
import type { MuscleGroup } from '@/features/content/exercises/core/exercise.types';

const FULL_BODY_ID = 'full_body';

export interface ProgramPathV2ViewProps {
  isFemale: boolean;

  selectedCards: ProgramCardId[];
  getCardOrder: (cards: ProgramCardId[], id: ProgramCardId) => number | null;
  toggleProgramCard: (id: ProgramCardId, ref: React.RefObject<HTMLDivElement>) => void;
  healthCardRef: React.RefObject<HTMLDivElement>;
  muscleCardRef: React.RefObject<HTMLDivElement>;
  skillsCardRef: React.RefObject<HTMLDivElement>;

  selectedMuscles: string[];
  isFullBodySelected: boolean;
  toggleMuscle: (id: string) => void;
  selectPackage: (muscles: MuscleGroup[]) => void;
  showMuscleRecommendation: boolean;
  muscleBalanceCase: MuscleBalanceCase | null;
  recommendedMuscles: ReadonlySet<string>;

  foundationExercises: Record<MusclePackageKey, string[]>;
  exerciseNames: Record<string, string>;
  exerciseThumbnails: Record<string, string>;
  expandedWishlist: Set<MusclePackageKey>;
  toggleWishlistDrawer: (pkg: MusclePackageKey) => void;
  wishlist: ExerciseWishlistEntry[];
  toggleWishlistExercise: (pkg: MusclePackageKey, exerciseId: string) => void;

  selectedSkills: string[];
  toggleSkill: (id: string) => void;
  getSkillOrder: (id: string) => number | null;
  readySkillIds: Set<string> | null;
  showRecommendation: boolean;
  missingCategory: 'push' | 'pull' | null;
}

const hideOnError = (e: React.SyntheticEvent<HTMLImageElement>) => {
  e.currentTarget.style.display = 'none';
};

const EXPAND = {
  initial: { opacity: 0, height: 0 },
  animate: { opacity: 1, height: 'auto' },
  exit: { opacity: 0, height: 0 },
  transition: { duration: 0.28, ease: [0.23, 1, 0.32, 1] },
} as const;

// ── Building blocks ────────────────────────────────────────────────

function SelectIndicator({ selected, order }: { selected: boolean; order: number | null }) {
  return (
    <span
      aria-hidden
      className={`grid h-7 w-7 shrink-0 place-items-center rounded-full transition-colors duration-150 ${
        selected
          ? 'bg-v2-tint text-v2-deep ring-1 ring-inset ring-v2-accent/40'
          : 'bg-white ring-1 ring-inset ring-v2-pill-border'
      }`}
    >
      {selected && (order !== null
        ? <span className="text-[13px] font-black tabular-nums">{order}</span>
        : <Check size={15} strokeWidth={3} />)}
    </span>
  );
}

function ChoiceCard({
  cardRef, selected, order, onToggle, imgSrc, tag, title, desc, note, children,
}: {
  cardRef: React.RefObject<HTMLDivElement>;
  selected: boolean;
  order: number | null;
  onToggle: () => void;
  imgSrc: string;
  tag: string;
  title: string;
  desc: string;
  note?: string;
  children?: React.ReactNode;
}) {
  return (
    <div
      ref={cardRef}
      className={`scroll-mt-24 rounded-v2-card bg-white transition-shadow duration-200 ease-v2 ${
        selected ? 'shadow-v2-card ring-2 ring-v2-accent' : 'shadow-v2-ring'
      }`}
    >
      <button
        type="button"
        onClick={onToggle}
        aria-pressed={selected}
        className="w-full flex items-center gap-3 p-4 text-right active:scale-[0.98] transition-transform duration-150 ease-v2"
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={imgSrc} alt="" className="h-16 w-16 shrink-0 rounded-2xl bg-v2-tint object-contain p-1" />
        <div className="flex-1 min-w-0">
          <span className="inline-block whitespace-nowrap rounded-full bg-v2-tint px-2 py-0.5 text-[11px] font-extrabold text-v2-deep">
            {tag}
          </span>
          <p className="mt-1 truncate whitespace-nowrap text-[16px] font-black !tracking-[-0.02em] text-v2-ink">{title}</p>
          <p className="mt-0.5 line-clamp-2 text-[13px] font-bold leading-snug text-v2-muted">{desc}</p>
          {note && <p className="mt-0.5 truncate text-[12px] font-bold text-v2-deep">{note}</p>}
        </div>
        <SelectIndicator selected={selected} order={order} />
      </button>
      <AnimatePresence initial={false}>
        {selected && children && (
          <motion.div {...EXPAND} style={{ overflow: 'hidden' }}>
            <div className="px-4 pb-4">
              <div className="mb-3 h-px bg-v2-hairline" />
              {children}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function SectionTitle({ title, hint }: { title: string; hint: string }) {
  return (
    <div className="mb-3 text-right">
      <p className="whitespace-nowrap text-[15px] font-black text-v2-ink">{title}</p>
      <p className="mt-0.5 text-[12.5px] font-bold leading-snug text-v2-muted">{hint}</p>
    </div>
  );
}

function CoachNote({ text }: { text: string }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: -6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -6 }}
      transition={{ duration: 0.22 }}
      className="mb-3 flex items-start gap-2 rounded-[16px] bg-amber-50 px-3 py-2.5 text-right ring-1 ring-inset ring-amber-300/70"
      role="status"
      aria-live="polite"
    >
      <Info size={16} className="mt-0.5 shrink-0 text-v2-amber" strokeWidth={2.5} />
      <p className="text-[13px] font-bold leading-snug text-amber-900">{text}</p>
    </motion.div>
  );
}

function MissingPickHint({ text }: { text: string }) {
  return <p className="mt-3 text-center text-[12px] font-bold text-v2-muted">{text}</p>;
}

/** Chip — tint when selected, amber ring when it's the coach's suggestion. */
function Chip({
  selected, recommended = false, disabled = false, onClick, iconSrc, iconClass = 'h-6 w-6', label, trailing, wide = false,
}: {
  selected: boolean;
  recommended?: boolean;
  disabled?: boolean;
  onClick: () => void;
  iconSrc?: string;
  iconClass?: string;
  label: string;
  trailing?: React.ReactNode;
  wide?: boolean;
}) {
  const tone = disabled
    ? 'bg-v2-surface text-v2-muted ring-1 ring-inset ring-v2-hairline cursor-not-allowed'
    : selected
      ? 'bg-v2-tint text-v2-deep ring-1 ring-inset ring-v2-accent/40'
      : recommended
        ? 'bg-white text-v2-ink-2 ring-2 ring-inset ring-v2-amber/70'
        : 'bg-white text-v2-ink-2 shadow-v2-ring';
  return (
    <button
      type="button"
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
      aria-disabled={disabled}
      aria-pressed={selected}
      className={`${wide ? 'w-full justify-start' : ''} flex h-11 items-center gap-1.5 rounded-full pl-3.5 pr-2 text-[14px] font-extrabold whitespace-nowrap transition-transform duration-150 ease-v2 ${
        disabled ? '' : 'active:scale-[0.97]'
      } ${tone}`}
    >
      {iconSrc && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={iconSrc}
          alt=""
          className={`${iconClass} shrink-0 object-contain ${disabled ? 'opacity-30 grayscale' : selected ? '' : 'opacity-60'}`}
          onError={hideOnError}
        />
      )}
      <span className="truncate">{label}</span>
      {trailing}
    </button>
  );
}

// ── View ───────────────────────────────────────────────────────────

export default function ProgramPathV2View(p: ProgramPathV2ViewProps) {
  const { isFemale, selectedCards } = p;
  const order = (id: ProgramCardId) =>
    selectedCards.length > 1 ? p.getCardOrder(selectedCards, id) : null;
  const pick = (m: string, f: string) => (isFemale ? f : m);

  return (
    <div className="w-full max-w-md mx-auto px-4 pt-2 pb-6 flex flex-col gap-3" dir="rtl">
      <motion.div
        initial={{ opacity: 0, y: -8 }}
        animate={{ opacity: 1, y: 0 }}
        className="mb-1 text-center"
      >
        <h1 className="text-[24px] font-black !tracking-[-0.02em] text-v2-ink">מה הכי בא לך להשיג?</h1>
        <p className="mt-1 text-[14px] font-bold text-v2-muted">
          {pick('אפשר לבחור יותר מאחד — מה שתבחר ראשון יקבל עדיפות', 'אפשר לבחור יותר מאחד — מה שתבחרי ראשון יקבל עדיפות')}
        </p>
      </motion.div>

      {/* ── A: Health & lifestyle ── */}
      <ChoiceCard
        cardRef={p.healthCardRef}
        selected={selectedCards.includes('health')}
        order={order('health')}
        onToggle={() => p.toggleProgramCard('health', p.healthCardRef)}
        imgSrc="/assets/lemur/lemur-avatar.png"
        tag="מתחילים"
        title="בריאות, כוח ואנרגיה"
        desc="למי שרק מתחיל, חוזר אחרי הפסקה או רוצה בסיס בריא לכל הגוף."
      >
        <ul className="space-y-2">
          {[
            'אימוני כוח לכל הגוף לבניית בסיס איתן',
            'מסלולי הליכה מותאמים ויעד צעדים יומי',
            'שיפור טווחי תנועה, גמישות ויציבה',
          ].map((item) => (
            <li key={item} className="flex items-start gap-2 text-right">
              <CheckCircle2 size={16} className="mt-0.5 shrink-0 text-v2-accent" strokeWidth={2.5} />
              <span className="flex-1 text-[13.5px] font-bold leading-snug text-v2-ink-2">{item}</span>
            </li>
          ))}
        </ul>
      </ChoiceCard>

      {/* ── B: Body focus (the muscle step) ── */}
      <ChoiceCard
        cardRef={p.muscleCardRef}
        selected={selectedCards.includes('body_focus')}
        order={order('body_focus')}
        onToggle={() => p.toggleProgramCard('body_focus', p.muscleCardRef)}
        imgSrc="/assets/lemur/lemur-avatar.png"
        tag="לכל רמה"
        title="עיצוב ושרירים"
        desc="למי שכבר זז ורוצה למקד אזורים ולראות שינוי בגוף."
      >
        <SectionTitle
          title="על אילו אזורים נעבוד?"
          hint={pick(
            'לפי מה שתבחר נבנה את מבחן הרמה הקצר ואת האימונים. לא בטוח? "כל הגוף" זו בחירה מצוינת.',
            'לפי מה שתבחרי נבנה את מבחן הרמה הקצר ואת האימונים. לא בטוחה? "כל הגוף" זו בחירה מצוינת.',
          )}
        />

        <AnimatePresence>
          {p.showMuscleRecommendation && p.muscleBalanceCase && (
            <CoachNote key="muscle-note" text={MUSCLE_BALANCE_MESSAGES_HE[p.muscleBalanceCase]} />
          )}
        </AnimatePresence>

        {/* Recommended one-tap answer */}
        <button
          type="button"
          onClick={() => p.toggleMuscle(FULL_BODY_ID)}
          aria-pressed={p.isFullBodySelected}
          className={`flex h-12 w-full items-center gap-2 rounded-[16px] px-3 text-right transition-transform duration-150 ease-v2 active:scale-[0.98] ${
            p.isFullBodySelected
              ? 'bg-v2-tint text-v2-deep ring-1 ring-inset ring-v2-accent/40'
              : 'bg-white text-v2-ink shadow-v2-ring'
          }`}
        >
          <UserCircle size={22} strokeWidth={1.75} className={p.isFullBodySelected ? 'text-v2-deep' : 'text-v2-muted'} />
          <span className="flex-1 whitespace-nowrap text-[15px] font-black">כל הגוף</span>
          <span className="whitespace-nowrap rounded-full bg-v2-tint px-2 py-0.5 text-[11px] font-extrabold text-v2-deep">מומלץ</span>
          {p.isFullBodySelected && <Check size={16} strokeWidth={3} className="text-v2-deep" />}
        </button>

        <div className="my-3 flex items-center gap-2" aria-hidden>
          <span className="h-px flex-1 bg-v2-hairline" />
          <span className="whitespace-nowrap text-[12px] font-bold text-v2-muted">או לפי אזורים</span>
          <span className="h-px flex-1 bg-v2-hairline" />
        </div>

        <div className="space-y-3">
          {MUSCLE_PACKAGES.map((pkg) => {
            const fullySelected = pkg.muscles.every((m) => p.selectedMuscles.includes(m));
            const exercises = p.foundationExercises[pkg.key];
            const wishlistOpen = p.expandedWishlist.has(pkg.key);
            return (
              <div key={pkg.key}>
                <div className="mb-2 flex h-7 items-center justify-between">
                  <p className="whitespace-nowrap text-[13px] font-extrabold text-v2-deep">{pkg.nameHe}</p>
                  {/* A 1-muscle group's "select all" is just its chip — hidden. */}
                  {pkg.muscles.length > 1 && !fullySelected && (
                    <button
                      type="button"
                      onClick={() => p.selectPackage(pkg.muscles)}
                      aria-label={`בחר את כל השרירים בקבוצת ${pkg.nameHe}`}
                      className="h-7 whitespace-nowrap rounded-full bg-white px-2.5 text-[12px] font-extrabold text-v2-deep shadow-v2-ring active:scale-[0.97] transition-transform duration-150 ease-v2"
                    >
                      {pick('בחר הכל', 'בחרי הכל')}
                    </button>
                  )}
                </div>
                <div className="flex flex-wrap gap-2">
                  {pkg.muscles.map((id) => {
                    const selected = p.selectedMuscles.includes(id);
                    return (
                      <Chip
                        key={id}
                        selected={selected}
                        recommended={p.showMuscleRecommendation && !selected && p.recommendedMuscles.has(id)}
                        onClick={() => p.toggleMuscle(id)}
                        iconSrc={MUSCLE_ICON_PATHS[id]}
                        label={MUSCLE_CHIP_LABELS[id] ?? id}
                      />
                    );
                  })}
                </div>

                {exercises.length > 0 && (
                  <div className="mt-2">
                    <button
                      type="button"
                      onClick={() => p.toggleWishlistDrawer(pkg.key)}
                      aria-expanded={wishlistOpen}
                      className="flex h-8 items-center gap-1 text-right"
                    >
                      <span className="whitespace-nowrap text-[12.5px] font-bold text-v2-muted">
                        תרגילים שרוצים לשפר (לא חובה)
                      </span>
                      <ChevronDown
                        size={15}
                        className={`shrink-0 text-v2-muted transition-transform duration-200 ${wishlistOpen ? 'rotate-180' : ''}`}
                      />
                    </button>
                    <AnimatePresence initial={false}>
                      {wishlistOpen && (
                        <motion.div {...EXPAND} style={{ overflow: 'hidden' }}>
                          <div className="flex flex-wrap gap-2 pt-1">
                            {exercises.map((exerciseId) => {
                              const starred = p.wishlist.some(
                                (e) => e.exerciseId === exerciseId && e.packageKey === pkg.key,
                              );
                              const thumb = p.exerciseThumbnails[exerciseId];
                              return (
                                <button
                                  key={exerciseId}
                                  type="button"
                                  onClick={() => p.toggleWishlistExercise(pkg.key, exerciseId)}
                                  aria-pressed={starred}
                                  className={`flex h-9 max-w-full items-center gap-1.5 rounded-full pl-3 pr-1.5 text-[13px] font-extrabold transition-transform duration-150 ease-v2 active:scale-[0.97] ${
                                    starred
                                      ? 'bg-v2-tint text-v2-deep ring-1 ring-inset ring-v2-accent/40'
                                      : 'bg-white text-v2-ink-2 shadow-v2-ring'
                                  }`}
                                >
                                  {thumb && (
                                    // eslint-disable-next-line @next/next/no-img-element
                                    <img src={thumb} alt="" className="h-6 w-6 shrink-0 rounded-full object-cover" onError={hideOnError} />
                                  )}
                                  <Star
                                    size={14}
                                    className={starred ? 'shrink-0 fill-v2-gold text-v2-gold' : 'shrink-0 text-v2-pill-border'}
                                  />
                                  <span className="truncate">{p.exerciseNames[exerciseId] ?? exerciseId}</span>
                                </button>
                              );
                            })}
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {p.selectedMuscles.length === 0 && (
          <MissingPickHint text={pick('בחר לפחות אזור אחד כדי להמשיך', 'בחרי לפחות אזור אחד כדי להמשיך')} />
        )}
      </ChoiceCard>

      {/* ── C: Calisthenics skills ── */}
      <ChoiceCard
        cardRef={p.skillsCardRef}
        selected={selectedCards.includes('skills')}
        order={order('skills')}
        onToggle={() => p.toggleProgramCard('skills', p.skillsCardRef)}
        imgSrc="/assets/lemur/king-lemur.png"
        tag="מתקדמים"
        title="קליסטניקס מתקדם"
        desc="למי שכבר עושה כמה מתח ומקבילים ורוצה לאתגר את עצמו לרמה הבאה."
        note="עוד לא שם? נבנה לך את הבסיס עד לשם."
      >
        <SectionTitle
          title="אילו אלמנטים?"
          hint={pick('הסדר שבו תבחר הוא סדר העדיפות (ראשון = 1)', 'הסדר שבו תבחרי הוא סדר העדיפות (ראשון = 1)')}
        />

        <AnimatePresence>
          {p.showRecommendation && (
            <CoachNote
              key="skills-note"
              text="בחרת סקיל עוצמתי! כדי למנוע פציעות כתפיים ולפתח כוח סימטרי, קלי המאמן הווירטואלי ממליץ לך לסמן לפחות אלמנט משלים אחד מהקבוצה המודגשת (דחיפה/משיכה)."
            />
          )}
        </AnimatePresence>

        <div className="flex flex-wrap gap-2">
          {SKILL_PROGRAMS.map((skill) => {
            const isMaster = skill.id === SKILL_MASTER_ID;
            const selected = p.selectedSkills.includes(skill.id);
            const skillOrder = !isMaster ? p.getSkillOrder(skill.id) : null;
            const notReady = !isMaster && p.readySkillIds !== null && !p.readySkillIds.has(skill.id);
            const recommended =
              p.showRecommendation && !selected && !isMaster && !notReady &&
              ((p.missingCategory === 'push' && PUSH_SKILLS.has(skill.id)) ||
                (p.missingCategory === 'pull' && PULL_SKILLS.has(skill.id)));
            return (
              <Chip
                key={skill.id}
                wide={isMaster}
                selected={selected}
                recommended={recommended}
                disabled={notReady}
                onClick={() => p.toggleSkill(skill.id)}
                iconSrc={SKILL_ICON_PATHS[skill.id]}
                iconClass="h-7 w-7"
                label={skill.nameHe}
                trailing={
                  notReady ? (
                    <span className="shrink-0 rounded-full bg-v2-hairline px-1.5 py-0.5 text-[11px] font-extrabold text-v2-muted">בקרוב</span>
                  ) : skillOrder !== null ? (
                    <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-white text-[11px] font-black tabular-nums text-v2-deep ring-1 ring-inset ring-v2-accent/40">
                      {skillOrder}
                    </span>
                  ) : null
                }
              />
            );
          })}
        </div>

        {p.selectedSkills.length === 0 && (
          <MissingPickHint text={pick('בחר לפחות אלמנט אחד כדי להמשיך', 'בחרי לפחות אלמנט אחד כדי להמשיך')} />
        )}
      </ChoiceCard>
    </div>
  );
}
