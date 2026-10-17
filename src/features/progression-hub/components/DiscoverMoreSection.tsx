'use client';

/**
 * DiscoverMoreSection — "גלה עוד" on the progress tab (collapsed by default,
 * last).
 *
 * Everything the user doesn't have yet, ordered by bucketForProgressHub:
 * programs that only need their own questionnaire, then programs locked by
 * a prerequisite, then parent programs. Hidden programs (muscle up,
 * handstand, human flag) are left out unless the user has them active.
 *
 * CTA per card comes from discoverCardHint: a missing prerequisite domain
 * now starts THAT domain's questionnaire (the old "בצע מבדק" here started
 * the skill's own one, which never cleared the missing prerequisite). A
 * too-low prerequisite is informational only. A parent card opens
 * ParentProgramSheet (SkillMapCard handles the tap).
 */
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { ChevronDown } from 'lucide-react';
import { domainTypeForSlug } from '@/features/profile/components/widgets/program-groups.utils';
import { startMiniDomainAssessment } from '@/features/user/onboarding/services/mini-domain-assessment';
import { getProgressionMapProgramName } from '@/lib/progression-map-config';
import {
  discoverCardHint,
  type HubDiscoverItem,
} from '@/features/progression-map/services/progress-hub-bucketing.service';
import { SkillMapCard } from './SkillMapCard';

function DiscoverCard({ item }: { item: HubDiscoverItem }) {
  const router = useRouter();
  const { lockedHint, assessSlug } = discoverCardHint(item);
  const onAssessTap = assessSlug
    ? () => startMiniDomainAssessment(router, assessSlug, '/progression', domainTypeForSlug(assessSlug))
    : undefined;
  return (
    <SkillMapCard
      programId={item.programId}
      nameHe={getProgressionMapProgramName(item.programId) ?? item.programId}
      state={item.kind === 'parent' ? 'not_started_master' : 'locked_prereq'}
      lockedHint={lockedHint}
      onAssessTap={onAssessTap}
    />
  );
}

export function DiscoverMoreSection({ items }: { items: HubDiscoverItem[] }) {
  const [expanded, setExpanded] = useState(false);
  if (items.length === 0) return null;

  return (
    <section className="space-y-3">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
        className="w-full flex items-center justify-between"
      >
        <h2 className="text-sm font-black text-gray-800">גלה עוד</h2>
        <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform ${expanded ? 'rotate-180' : ''}`} />
      </button>
      {expanded && (
        <div className="space-y-3">
          {items.map((item) => (
            <DiscoverCard key={item.slug} item={item} />
          ))}
        </div>
      )}
    </section>
  );
}

export default DiscoverMoreSection;
