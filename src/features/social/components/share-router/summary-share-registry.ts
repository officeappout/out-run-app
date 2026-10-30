'use client';

/**
 * The summary's in-app feed card (SummaryFeedShare) registers its two actions here while it
 * is on screen, so the one share button (ShareRouterSheet) can open them without the summary
 * plumbing the post data through: `feed` = its "share to the feed" sheet (only while the post
 * is still undecided), `images` = its designed-image sheet.
 */
import { create } from 'zustand';

export interface SummaryShareActions {
  feed: (() => void) | null;
  images: (() => void) | null;
}

interface RegistryState extends SummaryShareActions {
  set: (actions: SummaryShareActions) => void;
}

const EMPTY: SummaryShareActions = { feed: null, images: null };

export const useSummaryShareRegistry = create<RegistryState>((set) => ({
  ...EMPTY,
  set: (actions) => set(actions),
}));

/** Register the summary card's actions; returns the cleanup that clears them. */
export function registerSummaryShare(actions: SummaryShareActions): () => void {
  useSummaryShareRegistry.getState().set(actions);
  return () => useSummaryShareRegistry.getState().set(EMPTY);
}
