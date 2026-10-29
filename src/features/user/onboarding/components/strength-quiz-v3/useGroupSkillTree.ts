'use client';

/**
 * The real progress map of a muscle group (owner 28.10, Y7): the group's program id from the
 * questionnaire's own resolver, then the progress tab's useSkillTree (cached exercise corpus).
 */
import { useEffect, useState } from 'react';
import { useSkillTree } from '@/features/progression-map/hooks/useSkillTree';
import type { SkillTreeData } from '@/features/progression-map/core/types';
import { resolveCategoryToProgramId } from '../../services/visual-content-resolver.service';

export function useGroupSkillTree(group: string): SkillTreeData | null {
  const [programId, setProgramId] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    resolveCategoryToProgramId(group)
      .then((id) => { if (!cancelled) setProgramId(id); })
      .catch(() => { if (!cancelled) setProgramId(null); });
    return () => { cancelled = true; };
  }, [group]);
  return useSkillTree(programId).tree;
}
