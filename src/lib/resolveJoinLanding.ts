/**
 * Decides where to land after a successful group join.
 * Returns a relative URL string.
 *
 * Current behaviour: all group types land on /home with the group drawer opened.
 * The switch stub lets future types (challenges, events, etc.) extend here
 * without touching call sites.
 */
export function resolveJoinLanding(groupId: string, group?: { category?: string }): string {
  switch (group?.category) {
    // case 'challenge': return `/challenges/${encodeURIComponent(groupId)}?joined=true`;
    // case 'event':     return `/events/${encodeURIComponent(groupId)}?joined=true`;
    default:
      return `/home?openGroupDrawer=${encodeURIComponent(groupId)}&joined=true`;
  }
}
