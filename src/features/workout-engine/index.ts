/**
 * Workout Engine Master Barrel Export
 * Unified access to all workout functionality
 */

// Core (Session State, Types, Services)
export * from './core';

// Logic (ISOMORPHIC: Pure TypeScript, No React Hooks)
// - WorkoutGenerator: Core session generation
// - Fragmenter: Office/Home workout splitting
// - RestCalculator: Dynamic rest times
// - SwapEngine: Exercise replacement logic
export * from './logic';

// Generator (AI Workout Builder)
export * from './generator';

// Players (Running, Strength, Hybrid)
export * from './players';

// Shared (Utils, Components)
export * from './shared';
