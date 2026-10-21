import type { CommunityGroupType } from '@/types/community.types';
import type { CommunityKey } from '@/messages/ns/community';

// Types that have a dedicated institutional scope card (city/org) — excluded from
// per-group league cards so the sheet doesn't double-count them.
export const INSTITUTIONAL_GROUP_TYPES = new Set<CommunityGroupType>([
  'work', 'university', 'school', 'military', 'youth_movement',
]);

export type CommunityTopTab = 'feed' | 'leagues';

// ── Verb mappings for success drawer ──────────────────────────────────────────
export const GROUP_VERB: Record<string, string> = {
  walking:      'ילך',
  running:      'ירוץ',
  yoga:         'יתאמן',
  calisthenics: 'יתאמן',
  cycling:      'ירכב',
  other:        'יתאמן',
};

export const EVENT_VERB: Record<string, string> = {
  race:             'ירוץ',
  fitness_day:      'יתאמן',
  workshop:         'ישתתף',
  community_meetup: 'ישתתף',
  other:            'יתאמן',
};

// 16.08.2026 design review: hide "ליגת הפארק" from the league selector for
// now — the scope='park' data path (ParkSegment, useLeaderboard,
// getStreakLeaderboard/getStepsLeaderboard park-scope handling) is untouched.
export const SHOW_PARK_LEAGUE = false;

export type FeedFilter = 'all' | 'partners' | 'neighborhood' | 'groups';
export const FEED_FILTERS: { id: FeedFilter; labelKey: CommunityKey }[] = [
  { id: 'all', labelKey: 'communityPage.feed.filter.all' },
  { id: 'partners', labelKey: 'communityPage.feed.filter.partners' },
  { id: 'neighborhood', labelKey: 'communityPage.feed.filter.neighborhood' },
  { id: 'groups', labelKey: 'communityPage.feed.filter.groups' },
];

// Home v2 leagues (design lab, stage 2): four tabs on top — אישי / שכונות /
// יישובים / חטיבות. The tab decides individual vs groups, so the old
// יחידים/קבוצות toggle is hidden in v2.
export type LeagueTabV2 = 'people' | 'neighborhoods' | 'settlements' | 'units';

export type CompetitionMode = 'individual' | 'group';

// ── Groups-tab axis chooser. 'פלוגות' stays out (Stage G — needs the
// leaderboard_shards data source, not feed_posts).
//
// 16.08.2026 IA fix: "ערים" (city-vs-city) moved from City→Groups to
// Global→Groups. It was never actually city-scoped —
// getScopeCompetitionLeaderboard({granularity:'city'}) has no scope
// filter, it's a nationwide ranking — so nesting it three taps under "my
// city" was misleading. City→Groups now offers only שכונות + קבוצות,
// both genuinely scoped to the selected city. Global→Groups gained an
// axis chooser of its own (ערים / קבוצות) where it didn't have one before.
// Two separate state variables (not one shared axis) because the two
// segments now offer different option sets — a stale 'city' value left
// over from Global shouldn't be silently reinterpreted when the user
// switches to City.
export type GroupAxis = 'city' | 'neighborhood' | 'group';
// Axis labels: `communityPage.axis.*` (select on the axis id) in the community catalog.

// מדד/טווח chips shown read-only next to the scope chooser (Groups mode
// has no metric/time dropdown of its own — these reflect the shared
// leaderboardCategory/leaderboardTimeWindow state that Individuals mode
// and getScopeCompetitionLeaderboard's category filter already drive, per
// the mockup's .chip pattern. Not a new interactive control.
// Category labels: `communityPage.axis.metric` (select on the category) in the community catalog.

export const HEBREW_MONTHS = ['ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני', 'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר'];
