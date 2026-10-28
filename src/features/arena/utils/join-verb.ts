import type { CommunityKey } from '@/messages/ns/community';

/**
 * The verb in "invite a partner who will {verb} with you" (PostJoinSuccessDrawer) is catalog text in the
 * user's locale (postJoin.verb.*), never a hard-coded Hebrew word. Callers keep a KEY, the drawer translates it.
 */
export type JoinVerbKey = Extract<CommunityKey, `postJoin.verb.${string}`>;

const GROUP: Record<string, JoinVerbKey> = {
  walking: 'postJoin.verb.walking',
  running: 'postJoin.verb.running',
  yoga: 'postJoin.verb.yoga',
  calisthenics: 'postJoin.verb.calisthenics',
  cycling: 'postJoin.verb.cycling',
  other: 'postJoin.verb.other',
};

const EVENT: Record<string, JoinVerbKey> = {
  race: 'postJoin.verb.race',
  fitness_day: 'postJoin.verb.fitness_day',
  workshop: 'postJoin.verb.workshop',
  community_meetup: 'postJoin.verb.community_meetup',
  other: 'postJoin.verb.other',
};

export const DEFAULT_JOIN_VERB_KEY: JoinVerbKey = 'postJoin.verb.other';

export function groupJoinVerbKey(category: string | undefined): JoinVerbKey {
  return (category && GROUP[category]) || DEFAULT_JOIN_VERB_KEY;
}

export function eventJoinVerbKey(category: string | undefined): JoinVerbKey {
  return (category && EVENT[category]) || DEFAULT_JOIN_VERB_KEY;
}
