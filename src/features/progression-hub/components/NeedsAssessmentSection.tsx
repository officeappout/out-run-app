'use client';

/**
 * NeedsAssessmentSection — "עוד לא בדקת רמה" on the progress tab.
 *
 * Unassessed child programs of the user's active parent program(s), and
 * active programs that were never assessed. The workout engine leaves a
 * program out until it has a level (absent=absent, see
 * resolveChildDomainsForParent), so each card says so and offers the mini
 * level check for that exact program. Tapping the card itself still opens
 * the map in view mode.
 */
import { useRouter } from 'next/navigation';
import { startMiniDomainAssessment } from '@/features/user/onboarding/services/mini-domain-assessment';
import { domainTypeForSlug } from '@/features/profile/components/widgets/program-groups.utils';
import {
  CHECK_LEVEL_CTA,
  NEEDS_ASSESSMENT_EXPLAINER,
  type HubNeedsAssessmentItem,
} from '@/features/progression-map/services/progress-hub-bucketing.service';
import { SkillMapCard } from './SkillMapCard';

export function NeedsAssessmentSection({ items }: { items: HubNeedsAssessmentItem[] }) {
  const router = useRouter();
  if (items.length === 0) return null;

  return (
    <section className="space-y-3">
      <div>
        <h2 className="text-sm font-black text-gray-800">עוד לא בדקת רמה</h2>
        <p className="mt-1 text-xs font-medium text-gray-500">{NEEDS_ASSESSMENT_EXPLAINER}</p>
      </div>
      <div className="space-y-3">
        {items.map((item) => (
          <SkillMapCard
            key={item.slug}
            programId={item.programId}
            nameHe={item.programId}
            state="locked_prereq"
            lockedHint={CHECK_LEVEL_CTA}
            onAssessTap={() =>
              startMiniDomainAssessment(router, item.slug, '/progression', domainTypeForSlug(item.slug))
            }
          />
        ))}
      </div>
    </section>
  );
}

export default NeedsAssessmentSection;
