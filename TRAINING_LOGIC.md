# 🧠 OutRun Training Logic: The Source of Truth

**Document Goal:** This file serves as the absolute logic reference for the OutRun Workout Generator. All algorithms must strictly adhere to these rules.
**Version:** 1.0 (Based on the "21 Points" Directive)

---

## 1. The Context Engine (Real-Life Adaptation)

### 1.1 Fragmented Mode (Rule #1)
If the user cannot complete a full session ("No Time" / "Office Mode"):
* **Split Strategy:** Break the daily workout into two mini-sessions:
    * **Part A (Office/Morning):** Mobility, Core, or Accessories (Low Sweat, No Equipment).
    * **Part B (Home/Evening):** Main Compound Lifts (Push/Pull) requiring equipment.
* **Completion:** The day is marked "Done" only when Part A + Part B are completed.

### 1.2 Maintenance & Streaks (Rule #2)
* **Trigger:** If user is inactive/low energy/rest day.
* **Content:** Follow-along videos (Mobility/Flexibility).
* **Logic:** 2-3 specific videos for Library/Office vs. 2-3 for Home. Preserves the streak without CNS fatigue.

### 1.3 The "Adapt Exercise" Logic (Rule #12, #8)
* **User Action:** User clicks "Adapt Exercise" inside a session.
* **Priority Shift:** The engine re-calculates based on:
    1.  **Equipment:** Available gear right now.
    2.  **Constraint:** Specific muscle fatigue or injury.
* **Persistence (Smart Swap):**
    * If swapped due to "Missing Equipment" -> Temporary change (Session only).
    * If swapped due to "Too Hard" (x2 times) -> Permanent downgrade in `TrackingMatrix`.

---

## 2. The Macro Scheduler (Weekly Planning)

### 2.1 Split Logic & Frequency (Rule #5, #14, #18)
The system ignores calendar days (Mon/Tue) and uses a **Queue**:
* **2 Days/Week:** Full Body (Focus A: Push Dominant / Focus B: Pull Dominant). *Correction: Both are high intensity.*
* **3 Days/Week:** Undulating (Light, Medium, Hard) OR Push/Pull/Mixed.
* **4 Days/Week:**
    * *General:* Upper / Lower / Upper / Lower.
    * *Calisthenics:* Push / Pull / Push / Pull.

### 2.2 Shadow Tracking Matrix (Rule #13)
* **User View:** "Full Body Program - Level 10".
* **System View:** Decoupled progression.
    * `Push_Strength`: Level 12
    * `Pull_Strength`: Level 8
    * `Legs`: Level 4
* **Logic:** When generating a "Full Body" session, pull the specific exercise matching the *muscle's* level, not the program's level.

### 2.3 Missed Workouts & Reactivation (Rule #10, #21)
* **The Queue:** Workouts do not expire. If you miss Tuesday, you do Tuesday's workout on Wednesday.
* **Reactivation Protocol:**
    * If gap > 3 days: Trigger "Return to Routine".
    * **Action:** Take the planned workout, strictly reduce Volume (Sets) by 30-40%. Keep Intensity (Weight) moderate.

### 2.4 Periodization (Rule #6)
* **Deload:** Every 4th or 5th week is strictly a "Deload Week" (Volume -50%, Intensity maintenance).

---

## 3. The Session Builder (Micro Logic)

### 3.1 Session Structure & Flow (Rule #11, #19, #20)
* **Full Body:** Warmup -> Push Compound -> Pull Compound -> Legs -> Core.
* **Pull Only:** Skill (e.g., OAP) -> Main Pull (Weighted) -> Isolation/Accessory.
* **Calisthenics Upper (Rule #16):**
    1.  **Slot 1 (Skills):** Planche/Front Lever / Handstand (Fresh CNS).
    2.  **Slot 2 (Compounds):** Antagonist Superset (Push + Pull).
    3.  **Slot 3 (Accessory):** Isolation / Core / Grip.

### 3.2 Dynamic Rest Timers (Rule #3, #17)
Rest times are derived from the *Exercise Type* and *Level*:
* **Skills / Heavy Strength (1-5 Reps):** 180s (3 mins).
* **Hypertrophy (6-12 Reps):** 90s - 120s.
* **Endurance / Accessory (12+ Reps):** 45s - 60s.
* **Rule #17:** If a Static Hold is short (4-8s), increase SETS (4-6) and keep REST long.

### 3.3 Set Types (Rule #4, #15)
* **Beginner (< Level 10):** Straight Sets only.
* **Intermediate/Advanced (> Level 10):**
    * Introduce **Antagonist Supersets** (Push exercise -> Rest 30s -> Pull exercise -> Rest 90s).
    * Option for **HIIT** segments in "Full Body" plans.

---

## 4. Progression & Gamification

### 4.1 Double Progression (Rule #9)
* **Algorithm:**
    1.  Keep Weight/Variation constant.
    2.  Increase Reps until Upper Range is hit with perfect form.
    3.  **Only then** -> Level Up (Harder Variation) and drop Reps to Lower Range.

### 4.2 The Bonus System (Rule #7)
* **Trigger:** User exceeds target range in the LAST SET only.
* **Reward:** Visual "XP Boost" + accelerated progression marker.

---

## 5. Specific Content Rules

* **Skills (Rule #20):** Skill sessions include a "Golden Slot" (high volume, fresh) followed by complementary strength (e.g., OAP work -> Weighted Pullups -> Bicep Curls).
* **Lower Body (Rule #13):** "Glutes & Abs" is treated logically as a Lower Body workout with specific emphasis filters.