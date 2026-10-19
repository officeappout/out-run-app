'use client';

/**
 * Renders a list of hits of one category with that category's card + layout:
 * exercises → the library's own ExerciseImageCard grid · people → tile grid · the rest → stacks.
 */
import { useRouter } from 'next/navigation';
import ExerciseImageCard from '@/features/content/exercises/client/components/ExerciseImageCard';
import { useExerciseLibraryStore } from '@/features/content/exercises/client/store/useExerciseLibraryStore';
import PlaceRow from '../cards/PlaceRow';
import PersonCard from '../cards/PersonCard';
import GroupResultCard from '../cards/GroupResultCard';
import EventResultCard from '../cards/EventResultCard';
import ArticleCard from '../cards/ArticleCard';
import QaRow from '../cards/QaRow';
import { parkHref, routeHref } from '../../providers/places';
import type { ResultCategory, SearchHit, ArticleHit } from '../../core/types';
import type { CommunityActions } from '../../hooks/useCommunityActions';
import type { ArticleItem } from '@/lib/content-items/types';

export interface HitViewDeps {
  actions: CommunityActions;
  openArticle: (a: ArticleItem) => void;
}

export default function HitGroupView({ category, hits, query, deps }: { category: ResultCategory; hits: SearchHit[]; query?: string; deps: HitViewDeps }) {
  const router = useRouter();
  const openDetail = useExerciseLibraryStore((s) => s.openDetail);
  const { actions } = deps;

  if (category === 'exercises') {
    return (
      <div className="grid grid-cols-2 gap-2.5">
        {hits.map((h) => (h.kind === 'exercise' ? <ExerciseImageCard key={h.key} exercise={h.exercise} onClick={() => openDetail(h.exercise)} /> : null))}
      </div>
    );
  }

  if (category === 'social') {
    const groups = hits.filter((h) => h.kind === 'group');
    const people = hits.filter((h) => h.kind === 'person');
    return (
      <div className="flex flex-col gap-2.5">
        {groups.map((h, i) =>
          h.kind === 'group' ? (
            <GroupResultCard
              key={h.key}
              group={h.group}
              distanceKm={h.distanceKm}
              query={query}
              variant={i === 0 && groups.length > 1 ? 'feature' : 'compact'}
              joined={actions.joinedGroupIds.has(h.group.id)}
              joining={actions.joiningId === h.group.id}
              onOpen={() => actions.setSelectedGroup(h.group)}
              onJoin={() => void actions.joinGroup(h.group)}
            />
          ) : null,
        )}
        {people.length > 0 && (
          <div className="grid grid-cols-2 gap-2.5">
            {people.map((h) => (h.kind === 'person' ? <PersonCard key={h.key} person={h.person} query={query} /> : null))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className={`flex flex-col ${category === 'articles' ? 'gap-3.5' : 'gap-2'}`}>
      {hits.map((h) => {
        switch (h.kind) {
          case 'park':
            return <PlaceRow key={h.key} hit={h} query={query} onOpen={() => router.push(parkHref(h.id))} />;
          case 'route':
            return <PlaceRow key={h.key} hit={h} query={query} onOpen={() => router.push(routeHref(h.id))} />;
          case 'event':
            return (
              <EventResultCard
                key={h.key}
                event={h.event}
                distanceKm={h.distanceKm}
                query={query}
                joined={actions.joinedEventIds.has(h.event.id)}
                joining={actions.joiningId === h.event.id}
                onOpen={() => actions.setSelectedEvent(h.event)}
                onJoin={() => void actions.joinEvent(h.event)}
              />
            );
          case 'article':
            return <ArticleCard key={h.key} article={(h as ArticleHit).article} query={query} onOpen={() => deps.openArticle((h as ArticleHit).article)} />;
          case 'faq':
          case 'help':
            return <QaRow key={h.key} q={h.q} a={h.a} query={query} />;
          default:
            return null;
        }
      })}
    </div>
  );
}
