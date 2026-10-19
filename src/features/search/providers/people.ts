/**
 * People provider — the same nationwide name search today's "אנשים" tab runs
 * (searchUsersByName, age-group gated by the service + rules). Server query → only for 2+ chars.
 */
import { searchUsersByName, type UserSearchResult } from '@/features/social/services/user-search.service';
import { scoreText } from '../core/text';
import type { PersonHit } from '../core/types';

export function peopleToHits(list: readonly UserSearchResult[], query: string): PersonHit[] {
  return list.map((p, i) => ({
    kind: 'person' as const,
    key: `person:${p.uid}`,
    title: p.name,
    subtitle: p.currentLevel ? `רמה ${p.currentLevel}` : undefined,
    // the service already returns prefix matches in its own order; keep it, never 0
    score: Math.max(scoreText(p.name, query), 30) - i * 0.01,
    person: p,
  }));
}

export async function searchPeople(query: string, ageGroup: 'minor' | 'adult', myUid: string | null): Promise<PersonHit[]> {
  if (query.trim().length < 2) return [];
  const list = await searchUsersByName(query.trim(), ageGroup);
  return peopleToHits(list.filter((p) => p.uid !== myUid), query);
}
