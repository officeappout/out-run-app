/**
 * share-routes — which of the three share options a summary can offer (pilot AG2), PURE.
 * Order is fixed: post to the in-app feed, designed images for social networks, send via
 * phone (the OS share sheet). Phone is always there; the other two only when the summary
 * has them (a pending feed post / data for a share image).
 */
export type ShareRoute = 'feed' | 'images' | 'phone';

export function availableShareRoutes(has: { feed: boolean; images: boolean }): ShareRoute[] {
  const out: ShareRoute[] = [];
  if (has.feed) out.push('feed');
  if (has.images) out.push('images');
  out.push('phone');
  return out;
}
