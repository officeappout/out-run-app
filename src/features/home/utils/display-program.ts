/**
 * Pilot AH18 (enable_pilot_ah_v1, owner 31.10.2026): a full-body signup can be saved as its
 * children only (activePrograms = push / pull / legs / core, no full_body entry), so home showed
 * "דחיפה". Parent / child programs: when the active programs hold every child of a master and
 * not the master itself, the program to SHOW is the master (its level = the children's average,
 * which useProgramProgress already derives). PURE; reads only.
 */
export function displayProgramTemplateId(
  activePrograms: ReadonlyArray<{ templateId?: string | null; id?: string | null }> | null | undefined,
  masters: Readonly<Record<string, readonly string[]>>,
): string | undefined {
  const ids = (activePrograms ?? []).map((p) => p.templateId ?? p.id ?? '').filter(Boolean);
  if (ids.length === 0) return undefined;
  for (const [master, children] of Object.entries(masters)) {
    if (!ids.includes(master) && children.length > 0 && children.every((c) => ids.includes(c))) return master;
  }
  return ids[0];
}
