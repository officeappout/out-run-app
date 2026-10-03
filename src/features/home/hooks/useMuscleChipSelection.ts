'use client';

/**
 * useMuscleChipSelection — single source of truth for muscle-chip
 * selection/assessment in the workout builder.
 *
 * Extracted from WorkoutBuilderSheet after a real bug class: "selected"
 * (autoChips/selectedChips) and "assessed" (enrolledIds) were computed
 * independently across different parts of the component, and the click
 * handler's assessment gate ran BEFORE checking whether a chip was already
 * selected — so a chip that was selected-but-unassessed could never be
 * turned off by tapping it; it always reopened the assessment popup
 * instead. This hook is now the ONE place both the render (isSelected /
 * isAssessed) and the click handler (toggleChip) read from — they cannot
 * structurally diverge again because there is only one copy of each.
 *
 * Click-order contract (toggleChip) — deliberate, do not reorder:
 *   1. isSelected  → ALWAYS deselects, regardless of assessment. An active
 *                    chip must always be turnable off by tapping it again.
 *   2. !isAssessed → opens the assessment popup (onNeedsAssessment).
 *   3. else        → selects, and runs the muscle→program inverse.
 *
 * No program-membership gate (retired, product decision): a muscle chip is
 * no longer blocked for belonging to a domain outside the currently-
 * selected program(s) — isGated was always a UX-only restriction (never a
 * generator safety net; derivedRequiredDomains/requiredDomains never read
 * it), and the simpler two-state model (assessed → toggle, unassessed →
 * assess) is what's wanted now.
 *
 * autoChips is a plain derived useMemo, not a useEffect+setState pair
 * (bug fix) — the previous effect-based version lagged one render behind
 * selectedProgramIds, so a muscle just added to the selected-program set
 * (e.g. adding "pull" alongside "push") could still read as gated/foreign
 * for one render. A useMemo recomputes synchronously in the same render
 * as the selectedProgramIds change, closing that window entirely.
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
import { resolveToSlug } from '@/features/workout-engine/services/program-hierarchy.utils';

export interface UseMuscleChipSelectionParams {
  profile: UserFullProfile | null | undefined;
  selectedProgramIds: string[];
  setSelectedProgramIds: Dispatch<SetStateAction<string[]>>;
  /** Shared with the parent's own program-level checks (displayPrograms etc.) — owned there, passed in here. */
  isEnrolledInProgram: (pid: string) => boolean;
  /** Diagnostic-only (round 2) — the raw enrollment set itself, so the temp
   * dump below can show exactly what's IN it (slugs? hash ids? both?)
   * instead of only the derived isEnrolledInProgram boolean. */
  enrolledIds: Set<string>;
  resolveBaseCategoryForThisProgram: (id: string) => string;
  onNeedsAssessment: (domain: string | null) => void;
  onManualInteraction: () => void;
}

export function useMuscleChipSelection({
  profile,
  selectedProgramIds,
  setSelectedProgramIds,
  isEnrolledInProgram,
  enrolledIds,
  resolveBaseCategoryForThisProgram,
  onNeedsAssessment,
  onManualInteraction,
}: UseMuscleChipSelectionParams) {
  const [selectedChips, setSelectedChips] = useState<string[]>([]);
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

  // ── Program(s) → auto-select muscle chips ───────────────────────────────
  // Union of EVERY currently-selected program's own chip set — recomputes
  // synchronously whenever selectedProgramIds or profile changes, so adding
  // a second program is reflected in the SAME render (see the bug-fix note
  // at the top of this file).
  const autoChips = useMemo<string[]>(() => {
    // TEMP DIAGNOSTIC (round 3 — flat primitives only, no behavior change)
    // — traces wire 2 (autoChips following selectedProgramIds) across a
    // pill tap: the raw pid as stored (hash or slug?), whether/how it
    // matched an activePrograms entry, which source produced focusDomains,
    // and the resulting chip ids — per pid, then the final set. Remove
    // before merge.
    if (selectedProgramIds.length === 0) {
      // eslint-disable-next-line no-console
      console.log('[muscle-chip diag] autoChips: selectedProgramIds=[] -> autoChips=[]');
      return [];
    }
    const chips = new Set<string>();
    for (const pid of selectedProgramIds) {
      const ap = profile?.progression?.activePrograms?.find(
        p => p.templateId === pid || (p as any).id === pid,
      );
      const matchedVia = !ap ? 'none' : ap.templateId === pid ? 'templateId' : 'id';
      const hasFocusDomains = (ap?.focusDomains as string[] | undefined)?.length;
      const focusDomains = hasFocusDomains ? (ap!.focusDomains as string[]) : [pid];
      const resolvedChipIds = domainsToChipIds(focusDomains);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const apRawId = (ap as any)?.id ?? 'n/a';
      // eslint-disable-next-line no-console
      console.log(
        `[muscle-chip diag] autoChips: pid=${pid} matchedVia=${matchedVia} ` +
        `apTemplateId=${ap?.templateId ?? 'n/a'} apId=${apRawId} ` +
        `focusDomainsSource=${hasFocusDomains ? 'ap.focusDomains' : 'fallback=[pid]'} ` +
        `focusDomains=[${focusDomains.join(',')}] chipIds=[${resolvedChipIds.join(',')}]`,
      );
      resolvedChipIds.forEach(c => chips.add(c));
    }
    const result = [...chips];
    // eslint-disable-next-line no-console
    console.log(
      `[muscle-chip diag] autoChips: selectedProgramIds=[${selectedProgramIds.join(',')}] -> autoChips=[${result.join(',')}]`,
    );
    return result;
  }, [selectedProgramIds, profile]);

  // Reset manual muscle opt-outs when the selected PROGRAM SET itself
  // changes — deliberately keyed on selectedProgramIds alone (not profile,
  // which autoChips above also depends on) so an unrelated profile refresh
  // never silently discards a real opt-out; only an actual program switch
  // should offer a fresh recommended set.
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

  // TEMP DIAGNOSTIC (round 3 — flat primitives only, FIXED from round 2
  // where nested objects printed as "Object" with no way to read the real
  // per-chip values). One line per chip, plain string interpolation only
  // — no object literal anywhere in this block. Still traces wire 1: for
  // every mapped program on a chip, isEnrolledInProgram's result AND
  // resolveToSlug's own output, plus the raw enrolledIds contents on their
  // own flat line. Remove before merge.
  useEffect(() => {
    // eslint-disable-next-line no-console
    console.log(
      `[muscle-chip diag] state: selectedProgramIds=[${selectedProgramIds.join(',')}] ` +
      `autoChips=[${autoChips.join(',')}] selectedChips=[${selectedChips.join(',')}] ` +
      `manuallyDeselectedChips=[${Array.from(manuallyDeselectedChips).join(',')}]`,
    );
    // eslint-disable-next-line no-console
    console.log(`[muscle-chip diag] enrolledIds=[${Array.from(enrolledIds).join(',')}]`);
    for (const chip of MUSCLE_CHIPS.filter(c => c.group !== 'aggregate')) {
      const assessed = isAssessed(chip);
      const selected = isSelected(chip);
      const isAuto = autoChips.includes(chip.id);
      // eslint-disable-next-line no-console
      console.log(
        `[muscle-chip diag] chip=${chip.id} isAssessed=${assessed} isSelected=${selected} isAuto=${isAuto}`,
      );
      const mappedPrograms = CHIP_TO_PROGRAMS[chip.id] ?? [];
      for (const pid of mappedPrograms) {
        // eslint-disable-next-line no-console
        console.log(
          `[muscle-chip diag] chip=${chip.id} program=${pid} ` +
          `isEnrolledInProgram=${isEnrolledInProgram(pid)} resolveToSlug=${resolveToSlug(pid)}`,
        );
      }
    }
  }, [selectedProgramIds, autoChips, selectedChips, manuallyDeselectedChips, enrolledIds, isAssessed, isSelected, isEnrolledInProgram]);

  const toggleChip = useCallback((chip: MuscleChip) => {
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
    isAssessed, isSelected, isEnrolledInProgram, autoChips, selectedProgramIds,
    setSelectedProgramIds, resolveBaseCategoryForThisProgram, onNeedsAssessment, onManualInteraction,
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
    effectiveChips,
    isAssessed,
    isSelected,
    toggleChip,
    promoteProgram,
    resetManualOverrides,
  };
}
