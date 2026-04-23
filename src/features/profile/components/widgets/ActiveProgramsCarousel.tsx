'use client';

import { useEffect, useState } from 'react';
import { useUserStore } from '@/features/user/identity/store/useUserStore';
import { getProgramByTemplateId } from '@/features/content/programs/core/program.service';
import { ProgramProgressCard } from '@/features/home/components/widgets/ProgramProgressCard';
import type { Program } from '@/types/workout';
import type { UserActiveProgram } from '@/features/user/core/types/user.types';

interface EnrichedProgram {
  active: UserActiveProgram;
  template: Program;
  percent: number;
  currentLevel: number;
  maxLevel: number;
}

/**
 * Sub-domain program IDs that are created by level-equivalence rules.
 * These should not appear as top-level cards — they are child tracks of
 * master programs (e.g. 'push' / 'pull' under 'upper_body').
 */
const SUB_DOMAIN_IDS = new Set([
  'push', 'pushing', 'pull', 'pulling',
  'legs', 'lower_body', 'core', 'abs',
]);

/** Build a display-ready Program stub when the Firestore lookup fails. */
function toStubProgram(ap: UserActiveProgram): Program {
  const PROGRAM_NAME_HE: Record<string, string> = {
    full_body: 'כל הגוף', fullbody: 'כל הגוף',
    upper_body: 'פלג גוף עליון',
    running: 'ריצה', cardio: 'קרדיו',
    pilates: 'פילאטיס', yoga: 'יוגה',
    healthy_lifestyle: 'אורח חיים בריא', pull_up_pro: 'מתח מקצועי',
    calisthenics: 'קליסטניקס',
  };
  const displayName =
    PROGRAM_NAME_HE[ap.templateId.toLowerCase()] ||
    (ap.name
      ? ap.name
          .replace(/_/g, ' ')
          .split(' ')
          .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
          .join(' ')
      : ap.templateId.replace(/_/g, ' '));
  return { id: ap.templateId, name: displayName, isMaster: false };
}

/**
 * Active Programs carousel — uses the same ProgramProgressCard component
 * as the Home Page (circular progress ring, program icon, level text).
 *
 * Template lookup failure is handled gracefully: a stub card is built from
 * the UserActiveProgram's own metadata so the section is never empty.
 */
export default function ActiveProgramsCarousel() {
  const profile = useUserStore((s) => s.profile);
  const [programs, setPrograms] = useState<EnrichedProgram[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const allActivePrograms = profile?.progression?.activePrograms ?? [];

    // Only show master/top-level programs — exclude sub-domain tracks (push, pull, legs, core …)
    const activePrograms = allActivePrograms.filter(
      (ap) => !SUB_DOMAIN_IDS.has(ap.templateId.toLowerCase()),
    );

    if (activePrograms.length === 0) {
      setLoading(false);
      return;
    }

    const tracks = (profile?.progression?.tracks ?? {}) as Record<
      string,
      { percent?: number; currentLevel?: number }
    >;

    // `domains` stores maxLevel (same source the Home Page uses)
    const domains = (profile?.progression?.domains ?? {}) as Record<
      string,
      { maxLevel?: number; currentLevel?: number }
    >;

    Promise.all(
      activePrograms.map(async (ap): Promise<EnrichedProgram> => {
        const percent = tracks[ap.templateId]?.percent ?? 0;
        const currentLevel =
          tracks[ap.templateId]?.currentLevel ??
          domains[ap.templateId]?.currentLevel ??
          1;

        // maxLevel: domains (same as Home Page) → template field → safe default 25
        const domainMax = domains[ap.templateId]?.maxLevel;

        try {
          const template = await getProgramByTemplateId(ap.templateId);
          if (template) {
            const maxLevel = domainMax ?? template.maxLevels ?? 25;
            return { active: ap, template, percent, currentLevel, maxLevel };
          }
        } catch {
          // fall through to stub
        }

        const maxLevel = domainMax ?? 25;
        return { active: ap, template: toStubProgram(ap), percent, currentLevel, maxLevel };
      }),
    )
      .then(setPrograms)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [profile?.progression?.activePrograms, profile?.progression?.tracks, profile?.progression?.domains]);

  return (
    <div className="bg-white rounded-2xl p-4 shadow-sm border border-gray-100" dir="rtl">
      <h3 className="text-sm font-black text-gray-800 mb-3">תוכניות פעילות</h3>

      {loading ? (
        /* Skeleton — matches ProgramProgressCard's carousel height (~107px) */
        <div className="flex gap-3 overflow-x-auto pb-1 -mx-1 px-1 scrollbar-hide">
          {[0, 1].map((i) => (
            <div
              key={i}
              className="flex-shrink-0 bg-gray-100 rounded-xl animate-pulse"
              style={{ width: 320, minHeight: 107 }}
            />
          ))}
        </div>
      ) : programs.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-6 gap-2">
          <span className="text-3xl">📋</span>
          <p className="text-sm font-bold text-gray-500 text-center leading-snug">
            אין תוכנית פעילה כרגע.
            <br />
            בחר תוכנית מעמוד הבית.
          </p>
        </div>
      ) : (
        /* Horizontal scroll — same scrollbar-hide pattern as other carousels */
        <div className="flex gap-3 overflow-x-auto pb-2 -mx-1 px-1 scrollbar-hide">
          {programs.map(({ active, template, percent, currentLevel, maxLevel }) => (
            <ProgramProgressCard
              key={active.id}
              programName={template.name}
              iconKey={active.templateId}
              currentLevel={currentLevel}
              maxLevel={maxLevel}
              progressPercent={Math.round(percent)}
              programCount={programs.length}
            />
          ))}
        </div>
      )}
    </div>
  );
}
