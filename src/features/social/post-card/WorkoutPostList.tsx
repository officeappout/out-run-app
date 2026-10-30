'use client';

/**
 * WorkoutPostList: a column of compact workout post cards (enable_workout_post_v1), the profile's
 * history in the same card as home and the feed. The caller keeps its own loading / empty states.
 */

import React from 'react';
import type { PostModel } from './post-model';
import WorkoutPostCard from './WorkoutPostCard';

export interface WorkoutPostListItem {
  key: string;
  model: PostModel;
  meta?: string | null;
  onOpen?: () => void;
}

export default function WorkoutPostList({ items }: { items: readonly WorkoutPostListItem[] }) {
  return (
    <div className="flex flex-col gap-2.5">
      {items.map((it) => (
        <WorkoutPostCard key={it.key} model={it.model} surface="compact" meta={it.meta} onOpen={it.onOpen} />
      ))}
    </div>
  );
}
