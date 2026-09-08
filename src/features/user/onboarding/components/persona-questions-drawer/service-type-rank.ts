/**
 * Ranking (never filtering) of unitDirectory entries by service type —
 * used by HierarchySearchStep's soft-filter sort (persona-question.types.ts's
 * softFilterFromKey doc: "prioritize/highlight... never excludes a
 * non-matching choice").
 *
 * serviceType (per-unit, English — Phase 6c unit import) and statusCategory
 * (legacy, brigade-only, Hebrew — parsed from the brigade name's
 * parenthetical, onAuthorityWrite.ts) describe the same idea in two
 * vocabularies. Before this map existed, the sort compared statusCategory
 * directly against the English 'status' answer and could never match — a
 * real, silent no-op bug fixed as part of adding serviceType.
 */
const LEGACY_STATUS_CATEGORY_MAP: Record<string, string> = {
  'סדיר': 'regular',
  'מילואים': 'reserve',
};

export function effectiveServiceType(entry: { serviceType: string | null; statusCategory: string | null }): string | null {
  if (entry.serviceType) return entry.serviceType;
  if (entry.statusCategory && LEGACY_STATUS_CATEGORY_MAP[entry.statusCategory]) {
    return LEGACY_STATUS_CATEGORY_MAP[entry.statusCategory];
  }
  return null;
}

// The user answers 'regular' | 'career' | 'reserve' (persona-question.types.ts);
// units are tagged 'regular' | 'reserve' | 'mixed'. Career soldiers serve
// alongside regular units organizationally, so 'career' ranks like 'regular'.
export function effectiveUserStatus(status: string): string {
  return status === 'career' ? 'regular' : status;
}
