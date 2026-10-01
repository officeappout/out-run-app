'use client';

/**
 * ProgressionScreen — the "התקדמות" bottom-nav tab.
 *
 * A stack of independent <section>s under one shared AppHeader (the same
 * header Home/Profile use). Section order (Progression v2 Phase 4a-fix):
 * hero (identity/XP/streak) -> "פעילות" (active only) -> "המפות שלי"
 * (tracked only) -> "גלה עוד" (everything else: available/needs_assessment/
 * locked_prereq, collapsed by default, LAST).
 *
 * Phase 4b round 4: the blue "המשך מכאן" hero CTA (ContinueHereCta) was
 * removed — it resumed activePrograms[0], the exact same destination the
 * white active-program card in "פעילות" already opens, making it a
 * redundant second entry point to the same program. "פעילות" is now the
 * single entry into the active program; ContinueHereCta.tsx itself was
 * deleted (no other importer).
 *
 * The three state-driven sections are mutually exclusive by construction —
 * each derives its membership from the SAME real per-user state (Phase
 * 1's getProgramState), never a hardcoded list. This replaced Phase 4a's
 * original bug: a legacy, unconditional hardcoded-catalog section used to
 * sit here under the SAME "המפות שלי" name, rendering regardless of user
 * state — duplicating whatever DiscoverMoreSection also (correctly) showed
 * for the same programs. That legacy section is gone; "המפות שלי" now
 * means exactly one thing (TrackedProgramsSection).
 *
 * No achievements section this phase (explicitly deferred — a future
 * phase's "הכל →" will open the existing AchievementSheet). No PRO
 * anywhere this phase.
 *
 * Every card here is ProgramProgressCard (via SkillMapCard) — no new card
 * UI. Navigation is each card's own existing destination (unchanged) —
 * tapping ANY card, including a locked/unassessed one, opens its tree in
 * view mode (SkillTreeScreen itself has no assessment/prerequisite gate on
 * viewing — see that file's own Phase 4a-fix banner instead).
 *
 * No custom background here — the TREE's own scenic background
 * (SkillTreeBackground) stays untouched; this screen uses the same plain
 * light background every other list-style screen (Profile, Home sections)
 * already uses.
 */
import AppHeader from '@/components/ui/AppHeader';
import { IdentityHeroCard } from '@/features/user/progression/components/IdentityHeroCard';
import { ActiveProgramsSection } from './ActiveProgramsSection';
import { TrackedProgramsSection } from './TrackedProgramsSection';
import { DiscoverMoreSection } from './DiscoverMoreSection';

export function ProgressionScreen() {
  return (
    <div className="min-h-screen bg-[#F8FAFC]" dir="rtl">
      <AppHeader />

      <div className="max-w-md mx-auto px-4 py-5 space-y-6">
        <h1 className="text-xl font-black text-gray-900">התקדמות</h1>

        <IdentityHeroCard />

        <ActiveProgramsSection />

        <TrackedProgramsSection />

        <DiscoverMoreSection />
      </div>
    </div>
  );
}
