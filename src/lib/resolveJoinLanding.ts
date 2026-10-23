/**
 * Decides where to land after a successful group join (or any "open this
 * group" deep link). Returns a relative URL string.
 *
 * Every group type lands on /home with the group drawer opened BY ID — the
 * home page reads community_groups/{id} directly, so it works for a group in
 * another city, for a user with no city, and while the community flags are
 * off (/community renders nothing then and only opens groups from the city
 * list). enable_group_fixes_v1 routes every join path here (owner, 22.10).
 *
 * `joined` (default true) fires the post-join celebration first; false opens
 * the group drawer straight away (session links, legacy push links).
 * The switch stub lets future types (challenges, events, etc.) extend here
 * without touching call sites.
 */
export function resolveJoinLanding(
  groupId: string,
  group?: { category?: string; joined?: boolean },
): string {
  const joined = group?.joined !== false;
  switch (group?.category) {
    // case 'challenge': return `/challenges/${encodeURIComponent(groupId)}?joined=true`;
    // case 'event':     return `/events/${encodeURIComponent(groupId)}?joined=true`;
    default:
      return `/home?openGroupDrawer=${encodeURIComponent(groupId)}${joined ? '&joined=true' : ''}`;
  }
}
