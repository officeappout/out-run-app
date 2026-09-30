'use client';

/**
 * ProgressionScreen — the "התקדמות" bottom-nav tab.
 *
 * A stack of independent <section>s under one shared AppHeader (the same
 * header Home/Profile use). Layer A shipped "המפות שלי" alone. Phase 4a
 * (Progression v2) adds the sibling sections its own original comment
 * already anticipated, in the specified order: hero (identity/XP/streak),
 * "המשך מכאן" (resume priority-#1 active program), "התוכניות שלי" (the
 * active set + tracked maps, reusing the SAME ProgramProgressCard via
 * SkillMapCard), "גלה עוד" (available/locked, collapsed), then the
 * original "המפות שלי" — kept last, exactly as it already was, untouched.
 *
 * No achievements section this phase (explicitly deferred — a future
 * phase's "הכל →" will open the existing AchievementSheet). No PRO
 * anywhere this phase.
 *
 * Every card here is ProgramProgressCard (via SkillMapCard) — no new card
 * UI. Navigation is each card's own existing destination (unchanged).
 *
 * No custom background here — the TREE's own scenic background
 * (SkillTreeBackground) stays untouched; this screen uses the same plain
 * light background every other list-style screen (Profile, Home sections)
 * already uses.
 */
import AppHeader from '@/components/ui/AppHeader';
import { PROGRESSION_MAP_HUB_PROGRAMS } from '@/lib/progression-map-config';
import { IdentityHeroCard } from '@/features/user/progression/components/IdentityHeroCard';
import { SkillMapCard } from './SkillMapCard';
import { ContinueHereCta } from './ContinueHereCta';
import { MyProgramsSection } from './MyProgramsSection';
import { DiscoverMoreSection } from './DiscoverMoreSection';

export function ProgressionScreen() {
  return (
    <div className="min-h-screen bg-[#F8FAFC]" dir="rtl">
      <AppHeader />

      <div className="max-w-md mx-auto px-4 py-5 space-y-6">
        <h1 className="text-xl font-black text-gray-900">התקדמות</h1>

        <IdentityHeroCard />

        <ContinueHereCta />

        <MyProgramsSection />

        <DiscoverMoreSection />

        {/* Original Layer A — "My Maps". Untouched. */}
        <section className="space-y-3">
          <h2 className="text-sm font-black text-gray-800">המפות שלי</h2>
          <div className="space-y-3">
            {PROGRESSION_MAP_HUB_PROGRAMS.map((program) => (
              <SkillMapCard key={program.programId} programId={program.programId} nameHe={program.nameHe} />
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
