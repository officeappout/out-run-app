/**
 * League card key → lucide icon (design v2: no emoji UI icons). The card's
 * `emoji` field stays in the data for now; the UI renders this icon instead.
 */
import { Building2, Globe, School, Shield, Trees, Trophy, Users, type LucideIcon } from 'lucide-react';

export function leagueIconFor(key: string): LucideIcon {
  if (key === 'global') return Globe;
  if (key === 'city') return Building2;
  if (key === 'org') return School;
  if (key === 'park') return Trees;
  if (key === 'reserve') return Shield;
  if (key.startsWith('league_')) return Users;
  return Trophy;
}
