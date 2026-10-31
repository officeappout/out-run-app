'use client';

import React from 'react';
import { buildProgramHierarchy, programDisplayName } from '../../shared.utils';
import type { UserTabData } from '../tabs/types';

type LevelMap = Record<string, { currentLevel?: number }> | undefined;

/**
 * Keeps the two signals the old view-mode Domains grid showed that the
 * hierarchy does not: domain/track level mismatches, and domain-only keys
 * (level > 1, no track, not under any program).
 */
export default function LevelDiagnostics({ fullProfile, programs }: Pick<UserTabData, 'fullProfile' | 'programs'>) {
  const progression = fullProfile.progression as unknown as { tracks?: LevelMap; domains?: LevelMap } | undefined;
  const tracks = progression?.tracks;
  const domains = progression?.domains;
  const covered = new Set<string>();
  buildProgramHierarchy(fullProfile, programs).forEach((m) => {
    covered.add(m.idOrSlug);
    m.children.forEach((c) => covered.add(c.idOrSlug));
  });
  const keys = Array.from(new Set([...Object.keys(domains ?? {}), ...Object.keys(tracks ?? {})]));
  const rows = keys.flatMap((key) => {
    const domainLevel = domains?.[key]?.currentLevel ?? 0;
    const trackLevel = tracks?.[key]?.currentLevel ?? 0;
    const isDesynced = domainLevel > 0 && trackLevel > 0 && domainLevel !== trackLevel;
    const isDomainOnly = domainLevel > 1 && trackLevel === 0 && !covered.has(key);
    if (!isDesynced && !isDomainOnly) return [];
    return [{ key, domainLevel, trackLevel, isDesynced, name: programDisplayName(key, programs).name }];
  });
  if (rows.length === 0) return null;
  return (
    <div className="mt-3 bg-amber-50 border border-amber-200 rounded-xl p-3">
      <p className="text-xs font-bold text-amber-800 mb-2">אי התאמות בנתוני רמות (domains מול tracks)</p>
      <div className="flex flex-wrap gap-2">
        {rows.map((r) => (
          <span key={r.key} className="px-2 py-1 bg-white border border-amber-200 rounded-lg text-xs font-bold text-amber-700">
            {r.name} · {r.isDesynced ? `⚠ domain=${r.domainLevel} track=${r.trackLevel}` : `רק ב-domains: רמה ${r.domainLevel}`}
          </span>
        ))}
      </div>
    </div>
  );
}
