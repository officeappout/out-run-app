'use client';

/**
 * /progression-map/[programId] — the Skill Tree route.
 *
 * The "מפה מלאה" destination for the 6 Phase-1 allow-listed leaf programs,
 * replacing the dead /exercises/roadmap/[baseMovementId]. Deliberately a new
 * route prefix, not /exercises/roadmap or /roadmap or /progress — the latter
 * two are already unrelated, shipped features (an onboarding-completion
 * placeholder page and a 90-day activity log, respectively) and reusing
 * either name would collide semantically even with different route strings.
 */
import { useParams } from 'next/navigation';
import { SkillTreeScreen } from '@/features/progression-map/components/SkillTreeScreen';
import { isProgressionMapLeafProgram } from '@/lib/progression-map-config';

export default function ProgressionMapProgramPage() {
  const params = useParams<{ programId: string }>();
  const programId = params?.programId ?? '';

  if (!programId || !isProgressionMapLeafProgram(programId)) {
    return (
      <div className="min-h-screen flex items-center justify-center px-6" dir="rtl">
        <p className="text-sm text-gray-400 text-center">
          המסלול הזה עדיין לא זמין כמפה — בקרוב.
        </p>
      </div>
    );
  }

  return <SkillTreeScreen programId={programId} />;
}
