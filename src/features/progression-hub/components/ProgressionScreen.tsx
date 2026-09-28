'use client';

/**
 * ProgressionScreen — the "התקדמות" bottom-nav tab, layer A.
 *
 * This is deliberately built as a screen that GROWS, not a throwaway: it's
 * a stack of independent <section>s under one shared AppHeader (the same
 * header Home/Profile use). Layer A adds exactly one section — "המפות
 * שלי", a grid of skill cards linking into each program's Skill Tree.
 * Later layers (hero/streak, "המשך מכאן", achievements) are meant to be
 * added as sibling <section>s here, not a rewrite of this file.
 *
 * The grid is driven entirely by PROGRESSION_MAP_HUB_PROGRAMS
 * (src/lib/progression-map-config.ts's visibleInHub subset of the Phase-1
 * allow-list) — no hardcoded card list here. Every card is
 * SkillMapCard, itself a thin navigation wrapper around
 * ProgramProgressCard (Home/Profile's existing card) — no new card UI.
 *
 * Round 10: single-column full-width stack, not a 2-col grid — the 2-col
 * version squeezed the icon+name+ring row (ProgramProgressCard's own
 * internal layout, unchanged) into roughly half the screen width, and the
 * name (e.g. "פרונט לבר") truncated ("פרונ ט…") because the card had no
 * room left after the fixed-size 68px progress ring. Full width gives it
 * the same room ProgramsSection.tsx's own single (non-carousel) card gets
 * on Profile — ProgramProgressCard itself is untouched, only its container
 * changed.
 *
 * No custom background here — the brief is explicit that the TREE's own
 * scenic background (SkillTreeBackground) stays untouched, and this is a
 * different screen entirely; it uses the same plain light background every
 * other list-style screen (Profile, Home sections) already uses.
 */
import AppHeader from '@/components/ui/AppHeader';
import { PROGRESSION_MAP_HUB_PROGRAMS } from '@/lib/progression-map-config';
import { SkillMapCard } from './SkillMapCard';

export function ProgressionScreen() {
  return (
    <div className="min-h-screen bg-[#F8FAFC]" dir="rtl">
      <AppHeader />

      <div className="max-w-md mx-auto px-4 py-5 space-y-6">
        <h1 className="text-xl font-black text-gray-900">התקדמות</h1>

        {/* Layer A — "My Maps". Future layers append sibling <section>s
            here (hero/streak, "המשך מכאן", achievements). */}
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
