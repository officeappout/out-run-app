'use client';

/**
 * useMuscleChipSelection — single source of truth for muscle-chip
 * selection/assessment/gating in the workout builder.
 *
 * Extracted from WorkoutBuilderSheet after a real bug class: "selected"
 * (autoChips/selectedChips) and "assessed" (enrolledIds) were computed
 * independently across different parts of the component, and the click
 * handler's assessment gate ran BEFORE checking whether a chip was already
 * selected — so a chip that was selected-but-unassessed could never be
 * turned off by tapping it; it always reopened the assessment popup
 * instead. This hook is now the ONE place both the render (isSelected /
 * isAssessed / isGated) and the click handler (toggleChip) read from — they
 * cannot structurally diverge again because there is only one copy of each.
 *
 * Click-order contract (toggleChip) — deliberate, do not reorder:
 *   1. isGated    → feedback only (onGatedTap); never toggles, never opens
 *                   the assessment popup. Domain conflict with the
 *                   currently-selected program(s) — tappable, not a dead tap.
 *   2. isSelected → ALWAYS deselects, regardless of assessment. An active
 *                   chip must always be turnable off by tapping it again.
 *   3. !isAssessed → opens the assessment popup (onNeedsAssessment).
 *   4. else        → selects, and runs the muscle→program inverse.
 */

import { useState, useEffect, useMemo, useCallback, type Dispatch, type SetStateAction } from 'react';
import type { UserFullProfile } from '@/features/user/core/types/user.types';
import {
  MUSCLE_CHIPS,
  domainsToChipIds,
  CHIP_TO_PRIMARY_PROGRAMS,
  CHIP_TO_PROGRAMS,
  PROG_PRIMARY_CHIPS,
  type MuscleChip,
} from '@/features/home/constants/muscle-chips';

export interface UseMuscleChipSelectionParams {
  profile: UserFullProfile | null | undefined;
  selectedProgramIds: string[];
  setSelectedProgramIds: Dispatch<SetStateAction<string[]>>;
  /** Shared with the parent's own program-level checks (displayPrograms etc.) — owned there, passed in here. */
  isEnrolledInProgram: (pid: string) => boolean;
  resolveBaseCategoryForThisProgram: (id: string) => string;
  onNeedsAssessment: (domain: string | null) => void;
  onGatedTap: (chipLabel: string) => void;
  onManualInteraction: () => void;
}

export function useMuscleChipSelection({
  profile,
  selectedProgramIds,
  setSelectedProgramIds,
  isEnrolledInProgram,
  resolveBaseCategoryForThisProgram,
  onNeedsAssessment,
  onGatedTap,
  onManualInteraction,
}: UseMuscleChipSelectionParams) {
  const [selectedChips, setSelectedChips] = useState<string[]>([]);
  const [autoChips, setAutoChips] = useState<string[]>([]);
  // Muscle↔program bidirectional selection — tracks which selectedProgramIds
  // entries were auto-added by the muscle→program inverse (Behavior #2), as
  // opposed to an explicit program-pill tap. Only muscle-derived entries are
  // eligible for the deselect cascade (Behavior #4); an explicit pill tap
  // always removes an id from this set (via promoteProgram below),
  // "promoting" it to manual even if the muscle inverse added it first.
  const [muscleAddedProgramIds, setMuscleAddedProgramIds] = useState<Set<string>>(new Set());
  // Explicit opt-out for an autoChips-sourced muscle. autoChips reflects the
  // currently selected program(s) only — it has no memory of a tap — so a
  // plain selectedChips toggle could never make an auto-selected chip look/
  // behave deselected (it stayed in the selected∪auto union regardless).
  const [manuallyDeselectedChips, setManuallyDeselectedChips] = useState<Set<string>>(new Set());

  // ── Program → auto-select muscle chips ──────────────────────────────────
  useEffect(() => {
    if (selectedProgramIds.length === 0) {
      setAutoChips([]);
      return;
    }
    const chips = new Set<string>();
    for (const pid of selectedProgramIds) {
      const ap = profile?.progression?.activePrograms?.find(
        p => p.templateId === pid || (p as any).id === pid,
      );
      const focusDomains = (ap?.focusDomains as string[] | undefined)?.length
        ? (ap!.focusDomains as string[])
        : [pid];
      domainsToChipIds(focusDomains).forEach(c => chips.add(c));
    }
    setAutoChips([...chips]);
  }, [selectedProgramIds, profile]);

  // Reset manual muscle opt-outs when the selected PROGRAM SET itself
  // changes — deliberately keyed on selectedProgramIds alone (not profile,
  // which the autoChips effect above also depends on) so an unrelated
  // profile refresh never silently discards a real opt-out; only an actual
  // program switch should offer a fresh recommended set.
  useEffect(() => {
    setManuallyDeselectedChips(new Set());
  }, [selectedProgramIds]);

  // ── Derived ────────────────────────────────────────────────────────────
  const effectiveChips = useMemo(
    () => [...new Set([
      ...autoChips.filter(id => !manuallyDeselectedChips.has(id)),
      ...selectedChips,
    ])],
    [autoChips, selectedChips, manuallyDeselectedChips],
  );

  // When program pills are selected, derive their allowed movement domains
  // so incompatible muscle chips can be gated (feedback + dimmed, not a
  // dead tap — see isGated/onGatedTap below).
  const selectedProgramAllowedDomains: Set<string> = useMemo(() => {
    if (selectedProgramIds.length === 0) return new Set();
    // autoChips are already the union of all selected programs via useEffect;
    const domains = autoChips.flatMap(id => MUSCLE_CHIPS.find(c => c.id === id)?.domains ?? []);
    return new Set(domains);
  }, [selectedProgramIds, autoChips]);

  // A chip is "assessed" when the user is enrolled in at least one program
  // that trains it AT ALL — primary OR secondary mover (CHIP_TO_PROGRAMS,
  // built from PROG_TO_CHIPS's full per-program muscle set) — not only the
  // single program where it happens to be the PRIMARY mover.
  const isAssessed = useCallback(
    (chip: MuscleChip): boolean => (CHIP_TO_PROGRAMS[chip.id] ?? []).some(isEnrolledInProgram),
    [isEnrolledInProgram],
  );

  const isSelected = useCallback(
    (chip: MuscleChip): boolean =>
      selectedChips.includes(chip.id) ||
      (autoChips.includes(chip.id) && !manuallyDeselectedChips.has(chip.id)),
    [selectedChips, autoChips, manuallyDeselectedChips],
  );

  const isGated = useCallback(
    (chip: MuscleChip): boolean =>
      selectedProgramAllowedDomains.size > 0 &&
      !chip.domains.some(d => selectedProgramAllowedDomains.has(d)),
    [selectedProgramAllowedDomains],
  );

  const toggleChip = useCallback((chip: MuscleChip) => {
    // TEMP DIAGNOSTIC — remove before merge. Confirms, on the live preview,
    // that isAssessed reads the real enrollment data for push's muscles
    // (the "selected+assessed chest/shoulders opened the popup" report) —
    // static reading couldn't reproduce a wrong read against the confirmed
    // slug-consistent write path, so this logs the actual inputs at tap time.
    // eslint-disable-next-line no-console
    console.log('[muscle-chip diag]', {
      chip: chip.id,
      isAssessed: isAssessed(chip),
      isSelected: isSelected(chip),
      isGated: isGated(chip),
      activeProgramTemplateIds: profile?.progression?.activePrograms?.map(p => p.templateId),
      trackKeys: Object.keys(profile?.progression?.tracks ?? {}),
    });

    if (isGated(chip)) {
      onGatedTap(chip.label);
      return;
    }

    const primaryPrograms = CHIP_TO_PRIMARY_PROGRAMS[chip.id] ?? [];

    if (isSelected(chip)) {
      // Deselecting ALWAYS wins over assessment — an active chip must
      // always be turnable off, regardless of why it became active.
      setSelectedChips(prev => prev.filter(c => c !== chip.id));
      if (autoChips.includes(chip.id)) {
        setManuallyDeselectedChips(prev => {
          const next = new Set(prev);
          next.add(chip.id);
          return next;
        });
      }
      onManualInteraction();
      return;
    }

    if (!isAssessed(chip)) {
      // Not assessed in ANY program this muscle could activate — gate
      // entirely (same popup the program-pill flow already uses). Nothing
      // is applied here, so there is nothing to revert if the user cancels.
      console.log(`[WorkoutBuilder] Chip gated — not assessed: ${chip.id}`);
      const domain = primaryPrograms.length > 0
        ? resolveBaseCategoryForThisProgram(primaryPrograms[0])
        : (chip.domains[0] ?? null);
      onNeedsAssessment(domain);
      return;
    }

    // Selecting.
    setSelectedChips(prev => [...prev, chip.id]);
    setManuallyDeselectedChips(prev => {
      if (!prev.has(chip.id)) return prev;
      const next = new Set(prev);
      next.delete(chip.id);
      return next;
    });
    onManualInteraction();

    // Muscle → program inverse (Behavior #2) — only on activation, only for
    // programs the user is actually enrolled in. A muscle can be primary for
    // several programs (e.g. 'back' → pull/front_lever/muscle_up/back_lever/
    // one_arm_pullup) — every enrolled match is added, union-style (#3).
    if (primaryPrograms.length > 0) {
      const toAdd = primaryPrograms.filter(
        pid => isEnrolledInProgram(pid) && !selectedProgramIds.includes(pid),
      );
      if (toAdd.length > 0) {
        setSelectedProgramIds(prev => [...prev, ...toAdd]);
        setMuscleAddedProgramIds(prev => {
          const next = new Set(prev);
          toAdd.forEach(id => next.add(id));
          return next;
        });
      }
      // Mixed case: some of this muscle's primary programs are enrolled
      // (added above), others aren't — surface the assessment popup for the
      // first unassessed one too, without blocking the ones that already
      // activated.
      const stillUnassessed = primaryPrograms.find(pid => !isEnrolledInProgram(pid));
      if (stillUnassessed) {
        onNeedsAssessment(resolveBaseCategoryForThisProgram(stillUnassessed));
      }
    }
  }, [
    isAssessed, isSelected, isGated, isEnrolledInProgram, autoChips, selectedProgramIds,
    setSelectedProgramIds, resolveBaseCategoryForThisProgram,
    onNeedsAssessment, onGatedTap, onManualInteraction, profile,
  ]);

  // Deselect cascade (Behavior #4): a program the muscle inverse added
  // auto-removes once NONE of its own PROG_PRIMARY_CHIPS muscles are still
  // manually selected — checked against selectedChips specifically (not the
  // wider autoChips union), since those primary muscles are the only thing
  // that could have triggered this program's addition in the first place.
  // Explicit pins are never in muscleAddedProgramIds (promoteProgram below
  // removes them immediately), so this never touches a manually-selected program.
  useEffect(() => {
    if (muscleAddedProgramIds.size === 0) return;
    const toRemove: string[] = [];
    Array.from(muscleAddedProgramIds).forEach(pid => {
      const primaryMuscles = PROG_PRIMARY_CHIPS[pid] ?? [];
      const stillTriggered = primaryMuscles.some(m => selectedChips.includes(m));
      if (!stillTriggered) toRemove.push(pid);
    });
    if (toRemove.length === 0) return;
    setSelectedProgramIds(prev => prev.filter(id => !toRemove.includes(id)));
    setMuscleAddedProgramIds(prev => {
      const next = new Set(prev);
      toRemove.forEach(id => next.delete(id));
      return next;
    });
  }, [muscleAddedProgramIds, selectedChips, setSelectedProgramIds]);

  // Called by an explicit program-pill tap to "promote" a muscle-added
  // program to manual — only an explicit tap can ever remove it again.
  const promoteProgram = useCallback((programId: string) => {
    setMuscleAddedProgramIds(prev => {
      if (!prev.has(programId)) return prev;
      const next = new Set(prev);
      next.delete(programId);
      return next;
    });
  }, []);

  // Called by "אוטו" to drop every manual muscle override (selections AND
  // muscle-added programs) so autoChips alone drives the grid again.
  // manuallyDeselectedChips clears itself via the selectedProgramIds-change
  // effect above whenever Auto also reassigns the program set.
  const resetManualOverrides = useCallback(() => {
    setSelectedChips([]);
    setMuscleAddedProgramIds(new Set());
  }, []);

  return {
    selectedChips,
    autoChips,
    manuallyDeselectedChips,
    muscleAddedProgramIds,
    effectiveChips,
    selectedProgramAllowedDomains,
    isAssessed,
    isSelected,
    isGated,
    toggleChip,
    promoteProgram,
    resetManualOverrides,
  };
}
