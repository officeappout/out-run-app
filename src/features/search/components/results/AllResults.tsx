'use client';

/** "הכל": every category with hits, best first — 2–3 per type + "לכל N" (Results board). */
import SectionHead from '../SectionHead';
import HitGroupView, { type HitViewDeps } from './HitGroupView';
import { previewOf, type HitGroup } from '../../core/grouping';
import { CATEGORY_LABEL, type ResultCategory } from '../../core/types';

export default function AllResults({ groups, query, deps, onSeeAll }: { groups: HitGroup[]; query: string; deps: HitViewDeps; onSeeAll: (c: ResultCategory) => void }) {
  return (
    <div className="flex flex-col gap-4">
      {groups.map((g) => {
        const { shown, more } = previewOf(g);
        const titleId = `sr-${g.category}`;
        return (
          <section key={g.category} aria-labelledby={titleId} className="flex flex-col gap-2">
            <SectionHead id={titleId} title={CATEGORY_LABEL[g.category]} action={more > 0 ? `לכל ${g.total}` : undefined} onAction={() => onSeeAll(g.category)} />
            <HitGroupView category={g.category} hits={shown} query={query} deps={deps} />
          </section>
        );
      })}
    </div>
  );
}
