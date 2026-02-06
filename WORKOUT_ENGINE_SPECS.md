🏛 OutRun Architecture & Logic Specs (v2.0)
Strategic Context: We are building a professional training platform based on Separation of Concerns. The Logic (Brain), State (User), and Content (Data) must remain decoupled to allow Isomorphic Execution (Server-Side generation + Client-Side real-time adaptation).

1. Directory Structure & Responsibilities
Enforce strict boundaries between these modules:

🧠 src/features/workout-engine/ (The Brain)
Role: Pure logic calculation. No UI dependency.

Key Files:

services/WorkoutGenerator.ts: The core class/function. Must be Isomorphic (pure TypeScript, no React hooks). Accepts UserContext + Blueprint, returns WorkoutSession.

logic/Fragmenter.ts: Handles the splitting of workouts (Office/Home mode).

logic/SwapEngine.ts: The decision tree for replacing exercises (see Logic 3.2).

👤 src/features/user/ (The State)
Role: Long-term user progression and profile.

Key Files:

types/TrackingMatrix.ts: The granular level map (e.g., vertical_pull: 12, horizontal_push: 8).

stores/useProgressionStore.ts (Zustand): Manages the "Double Progression" logic and history.

📚 src/features/content/ (The Raw Material)
Role: Static data and types.

Key Files:

db/ExerciseDB.ts: The JSON/Data source.

types/ExerciseTypes.ts: Extended definitions including angles, equipment_ids, ai_tags, method_mappings.

⏱ src/store/ (Real-Time State)
Role: Short-term session management.

Key Files:

useSessionStore.ts: Manages the active workout, running timers, current set index, and temporary superset logic.

🧪 src/app/admin/ (The Lab)
Role: Simulation & QA.

Key Files:

test-algorithm/page.tsx: A dashboard to inject mock User Profiles and see what the Algorithm spits out (e.g., "Verify that Level 12 User gets 45° Rows").

2. The Isomorphic Constraint
Requirement: The WorkoutGenerator must be usable in two scenarios:

Server/Pre-load: Generating the "Plan for the week" (Batch job).

Client/Real-time: The user clicks "Swap" or "Shorten Workout" during the session (No latency, works offline).

Implementation Rule: Do NOT use React Hooks (useUser, useQuery) inside WorkoutGenerator. Pass all data as arguments:

TypeScript

// Correct
const session = WorkoutGenerator.build(userProfile, context, equipmentList);
3. Core Logic Specifications
3.1 The Shadow Replacement Mechanism (Smart Swaps)
When a user requests to swap an exercise, the SwapEngine must ask/infer the Reason:

Case A: "Equipment Occupied / Missing" (Contextual Issue)

Action: Find an alternative in the same MovementGroup + same Level.

Persistence: None. Do not save this preference to the User Profile. It is a one-time "Shadow Swap" for this session only.

Case B: "Too Hard / Pain" (Capability Issue)

Action: Find a Regression (Level - 1) or an Injury Variation.

Persistence: Update TrackingMatrix. Downgrade the user's level for this specific movement pattern so next time they get the correct level.

3.2 The Blueprint & Slot System
Workouts are not lists of exercises. They are lists of Slots.

Slot 1 (Golden Slot): Skill/Power. Never superset. Fresh CNS.

Slot 2 (Compounds): Supports AntagonistPairs (e.g., Push + Pull).

Slot 3 (Accessory): High volume, shorter rest.

3.3 Dynamic Context (Fragmented Mode)
If Context.timeAvailable < Blueprint.minDuration:

Split Logic:

Part A (Office): Extract SweatLevel: 1 + Equipment: None exercises (Mobility, Core, Skill Holds).

Part B (Home): Keep the heavy compounds.

UI implications: The user sees two "Mini Sessions" instead of one.

4. Implementation Priority (Roadmap)
Phase 1 (Types): Define WorkoutBlueprint, ExerciseInstance, and TrackingMatrix interfaces in features/content and features/user.

Phase 2 (The Generator): Build the pure TS WorkoutGenerator in features/workout-engine. Write a Unit Test (in app/admin) to verify it handles the "Slot Logic" correctly.

Phase 3 (The Store): Build useSessionStore to consume the generator's output.

Phase 4 (The Swapper): Implement the SwapEngine with the Logic from 3.1.