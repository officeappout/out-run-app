---
name: adr-002-zustand-only
description: Why Zustand is the only state manager — no Redux, no new React Contexts
metadata:
  type: project
---

# ADR-002 — Zustand Only (No Redux, No New React Contexts)

**Date:** ⚠️ exact date unverified — predates 17.06.2026 session  
**Status:** Decided and enforced (see `axioms.md §7`)

---

## Context

The mobile app is a React + Capacitor application with complex cross-feature state: map mode, workout session, live-session presence, park selection, and user progression. Early in the project, state could have gone in multiple directions: React Context, Redux Toolkit, Zustand, or Jotai.

**Triggering event:** ⚠️ Not recorded in any file — exact incident or decision meeting unknown. The rule appears in `.cursorrules` lines 48–51 as a standing architectural constraint. Confirm origin with David.

**The `MapModeContext` exception:** One React Context exists — `MapModeContext` — and is explicitly named as the only allowed Context. This suggests the decision was made *after* MapModeContext was already in use, grandfathering it in rather than migrating it.

**Source:** `.cursorrules` lines 48–51

---

## Decision

**Zustand** is the sole state management solution.

- ✅ New shared state → Zustand store in the relevant feature
- ✅ Cross-feature writes → via actions/callbacks exposed by the store
- ❌ Redux / Redux Toolkit — not used, do not add
- ❌ MobX — not used, do not add
- ❌ New React Contexts — forbidden; `MapModeContext` is the only allowed exception

---

## Consequences

- Zustand stores are colocated in `src/features/{domain}/store/` (convention, not enforced by directory structure)
- Cross-domain state must flow through explicit Zustand actions — no direct store reads across feature boundaries
- Any future "global" state requirement (e.g., notification banners, live session state) goes into a new Zustand store, not a Context
- When a developer creates a new Context "just for this one thing," `code-reviewer` should flag it as an axiom violation

---

## Why This File Exists

React developers instinctively reach for Context for "small" shared state. Without this ADR, the pattern will be violated incrementally — one small Context at a time — until the codebase has fragmented state management again. The rule is in `.cursorrules` but not explained; this ADR supplies the rationale.
