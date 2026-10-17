'use client';

/**
 * MyProgramsSection — "התוכניות שלי" on the progress tab.
 *
 * Order comes from bucketForProgressHub (progress-hub-bucketing.service.ts):
 * the main active program ("ראשי"), then its assessed child programs, then
 * other active programs (each followed by its own children), then tracked
 * programs by level, highest first. Replaces the old "פעילות" + "המפות שלי"
 * pair, whose tracked order was raw object-key order.
 *
 * Empty state (no program at all, not even one waiting for a level check):
 * the existing AddStrengthProgramCard, same as before.
 */
import { useUserStore } from '@/features/user/identity/store/useUserStore';
import AddStrengthProgramCard from '@/features/home/components/AddStrengthProgramCard';
import type { HubMineItem } from '@/features/progression-map/services/progress-hub-bucketing.service';
import { SkillMapCard } from './SkillMapCard';

interface MyProgramsSectionProps {
  items: HubMineItem[];
  /** Something waits in "עוד לא בדקת רמה" — then an empty list here isn't a brand-new user. */
  hasPendingAssessment: boolean;
}

export function MyProgramsSection({ items, hasPendingAssessment }: MyProgramsSectionProps) {
  const profile = useUserStore((s) => s.profile);

  if (items.length === 0 && hasPendingAssessment) return null;

  return (
    <section className="space-y-3">
      <h2 className="text-sm font-black text-gray-800">התוכניות שלי</h2>
      {items.length === 0 ? (
        <AddStrengthProgramCard profile={profile} />
      ) : (
        <div className="space-y-3">
          {items.map((item) => (
            <SkillMapCard
              key={item.slug}
              programId={item.programId}
              nameHe={item.programId}
              state={item.role === 'primary' || item.role === 'active' ? 'active' : 'tracked'}
              badge={item.role === 'primary' ? 'ראשי' : undefined}
            />
          ))}
        </div>
      )}
    </section>
  );
}

export default MyProgramsSection;
