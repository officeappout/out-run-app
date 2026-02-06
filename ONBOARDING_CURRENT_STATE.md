# Onboarding Flow - Current State Document

> **Last Updated:** February 2026  
> **Path:** `/app/onboarding-new/`

---

## 1. Route Structure Overview

The onboarding flow consists of **7 pages** organized in two phases:

| Route | Purpose | Phase |
|-------|---------|-------|
| `/intro` | Welcome screen with image slider & language selection | Pre-Phase 1 |
| `/selection` | Goal selection (up to 3 fitness goals) + Google button | Pre-Phase 1 |
| `/roadmap` | Progress roadmap + Name/Gender collection | Phase 1 |
| `/dynamic` | Dynamic fitness assessment questionnaire | Phase 1 |
| `/phase2-intro` | Bridge screen between phases | Transition |
| `/persona-selection` | Lemur/Persona character selection | Phase 2 |
| `/setup` | OnboardingWizard (Location, Equipment, History, Schedule) | Phase 2 |

---

## 2. Detailed Route Analysis

### 2.1 `/intro` - Welcome Screen
**File:** `intro/page.tsx`

**Purpose:**
- First touchpoint with the app
- Language selection (HE/EN/RU)
- Visual introduction with rotating image slider

**UI Components:**
- `OnboardingLayout` (progress header)
- Language selector (segmented control)
- Image slider with progress cards
- "OUT" branding

**Data Collected:**
- Language preference → `sessionStorage['onboarding_language']`
- Coins reward (+10) → `useOnboardingStore.addCoins()`

**Navigation:**
- Continue → `/onboarding-new/selection`

---

### 2.2 `/selection` - Goal Selection
**File:** `selection/page.tsx`

**Purpose:**
- Select up to 3 fitness goals
- Optional Google sign-in (button present but not wired to auth flow)
- Guest mode option

**UI Components:**
- Language selector
- 2x2 goal grid with checkboxes
- Google sign-in button (visual only)
- "Start" CTA button
- "Continue as Guest" link

**Data Collected:**
- Selected goals array → `sessionStorage['onboarding_selected_goals']`
  - Types: `'glutes_abs' | 'skills' | 'mass_building' | 'fat_loss'`

**State Management:**
- `useState<FitnessGoal[]>` for local selection
- Persisted to `sessionStorage` on each toggle

**Navigation:**
- Start button → `/onboarding-new/roadmap`
- Guest mode → `/onboarding-new/dynamic?guest=true`

---

### 2.3 `/roadmap` - Progress Roadmap + Personal Details
**File:** `roadmap/page.tsx`

**Purpose:**
- Show visual progress roadmap (3 steps)
- Collect user's name and gender
- Transition to AI assessment

**UI Components:**
- `OnboardingLayout` (progress header)
- `LoadingAIBuilder` (loading animation)
- Step cards with typewriter animation
- Name input field
- Gender selection buttons

**Data Collected:**
- User name → `sessionStorage['onboarding_personal_name']`
- Gender → `sessionStorage['onboarding_personal_gender']`
  - Values: `'male' | 'female'`
- Coins (+10 for gender selection, +10 for continuing)

**State Management:**
- `useState` for `currentStep` (1 = Roadmap view, 2 = Personal details form)
- `useState` for `formData: { name, gender }`
- Auto-transition timer (7 seconds) from step 1 to step 2

**Navigation:**
- Continue (after form complete) → Shows `LoadingAIBuilder` → `/onboarding-new/dynamic`

---

### 2.4 `/dynamic` - Dynamic Assessment Questionnaire
**File:** `dynamic/page.tsx`

**Purpose:**
- Core fitness assessment via dynamic questions from Firestore
- Calculates user's assigned level and program
- Shows result screens

**UI Components:**
- `OnboardingLayout` (progress header)
- `DynamicQuestionRenderer` (renders questions dynamically)
- `ResultLoading` (level reveal animation)
- `ProgramResult` (final level display)

**Data Collected:**
- All assessment answers → via `DynamicOnboardingEngine`
- Assigned level number → `assignedLevel`
- Assigned level ID → `assignedLevelId`
- Assigned program ID → `assignedProgramId`
- Sub-levels → `masterProgramSubLevels` (upper_body, lower_body, core)

**State Management:**
- `DynamicOnboardingEngine` class instance
- `useState` for current question, loading, error states
- `useUserStore` for profile initialization

**Key Services:**
```typescript
import { DynamicOnboardingEngine } from '@/features/user/onboarding/engine/DynamicOnboardingEngine';
import { mapAnswersToProfile } from '@/features/user/identity/services/profile.service';
```

**Profile Creation:**
After assessment completes, calls:
```typescript
const profile = mapAnswersToProfile(allAnswers, assignedLevel, assignedProgramId, masterProgramSubLevels);
await initializeProfile(profile);
```

**Navigation:**
- After result screens → `/onboarding-new/phase2-intro`

---

### 2.5 `/phase2-intro` - Bridge Screen
**File:** `phase2-intro/page.tsx`

**Purpose:**
- Visual transition between Phase 1 and Phase 2
- Shows completed step + upcoming steps
- Adds coin reward

**UI Components:**
- `OnboardingLayout` (progress at ~45%)
- Visual roadmap with 3 steps
- Continue button with coin badge

**Data Collected:**
- None (display only)
- Coins (+10 on continue)

**Navigation Logic:**
```typescript
const handleContinue = () => {
  addCoins(10);
  const savedPersonaId = sessionStorage.getItem('onboarding_selected_persona_id');
  
  if (!savedPersonaId) {
    router.push('/onboarding-new/persona-selection');
  } else {
    router.push('/onboarding-new/setup');
  }
};
```

---

### 2.6 `/persona-selection` - Persona/Lemur Selection
**File:** `persona-selection/page.tsx`

**Purpose:**
- Select a "Lemur" character that matches user's lifestyle
- Each persona has linked lifestyle tags

**UI Components:**
- `OnboardingLayout`
- Persona grid (fetched from Firestore or defaults)
- Character cards with images, names, descriptions

**Data Collected:**
- Selected persona ID → `sessionStorage['onboarding_selected_persona_id']`
- Persona lifestyle tags → `sessionStorage['onboarding_selected_persona_tags']`

**State Management:**
- `useState<Persona[]>` for personas list
- `useState<string>` for selected persona
- `useUserStore` for immediate profile update if logged in

**Data Source:**
```typescript
const data = await getAllPersonas(); // From Firestore
const defaults = getDefaultPersonas(); // Fallback
```

**Navigation:**
- Continue → `/onboarding-new/setup`

---

### 2.7 `/setup` - OnboardingWizard (Phase 2)
**File:** `setup/page.tsx`

**Purpose:**
- Wrapper for the multi-step Phase 2 wizard
- Collects location, equipment, history, schedule

**UI Components:**
- `OnboardingWizard` component (all logic delegated)

**Wizard Steps (internal):**
1. `LOCATION` - Primary workout location selection
2. `EQUIPMENT` - Available equipment selection
3. `HISTORY` - Fitness background
4. `SCHEDULE` - Workout schedule preferences
5. `SOCIAL_MAP` / `CITY_SELECTION` - Location-based features
6. `COMPLETED` - Calculating screen
7. `SUMMARY` - Final summary reveal

**Data Collected:**
All wizard data is managed via `useOnboardingStore`:
```typescript
const { currentStep, setStep, addCoins, updateData, data, coins } = useOnboardingStore();
```

**Final Sync:**
```typescript
await syncOnboardingToFirestore('COMPLETED', data);
```

---

## 3. Data Flow Summary

### 3.1 State Management Systems

| System | Usage | Persistence |
|--------|-------|-------------|
| `sessionStorage` | Cross-page data transfer | Browser session |
| `useOnboardingStore` (Zustand) | Wizard steps, coins, form data | Memory + Firestore sync |
| `useUserStore` (Zustand) | User profile, auth state | Memory + Firestore |
| `useAppStore` (Zustand) | App-wide settings (language) | Memory |

### 3.2 SessionStorage Keys

| Key | Set In | Read In | Value |
|-----|--------|---------|-------|
| `onboarding_language` | `/intro`, `/selection` | All pages | `'he' | 'en' | 'ru'` |
| `onboarding_selected_goals` | `/selection` | `/dynamic` | `FitnessGoal[]` JSON |
| `onboarding_personal_name` | `/roadmap` | `/dynamic` | `string` |
| `onboarding_personal_gender` | `/roadmap` | `/dynamic` | `'male' | 'female'` |
| `onboarding_selected_persona_id` | `/persona-selection` | `/phase2-intro`, `/dynamic` | `string` |
| `onboarding_selected_persona_tags` | `/persona-selection` | `/dynamic` | `string[]` JSON |
| `onboarding_claim_coins` | URL params | `/dynamic` | `number` |
| `onboarding_claim_calories` | URL params | `/dynamic` | `number` |

### 3.3 Data Collection Timeline

```
┌─────────────────────────────────────────────────────────────────────────┐
│ INTRO                                                                   │
│  └─ Language preference                                                 │
├─────────────────────────────────────────────────────────────────────────┤
│ SELECTION                                                               │
│  └─ Fitness goals (up to 3)                                             │
├─────────────────────────────────────────────────────────────────────────┤
│ ROADMAP                                                                 │
│  └─ Name, Gender                                                        │
├─────────────────────────────────────────────────────────────────────────┤
│ DYNAMIC                                                                 │
│  └─ Assessment answers → Assigned Level, Program, Sub-levels            │
│  └─ PROFILE CREATED HERE ← mapAnswersToProfile()                        │
├─────────────────────────────────────────────────────────────────────────┤
│ PERSONA-SELECTION                                                       │
│  └─ Persona ID, Lifestyle tags                                          │
├─────────────────────────────────────────────────────────────────────────┤
│ SETUP (WIZARD)                                                          │
│  └─ Location, Equipment, History, Schedule                              │
│  └─ FINAL SYNC → syncOnboardingToFirestore()                            │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 4. Authentication Analysis

### 4.1 Current Authentication Triggers

**⚠️ IMPORTANT:** Authentication is **NOT currently integrated** in the onboarding-new flow.

| Page | Auth Element | Status |
|------|--------------|--------|
| `/selection` | Google button | **Visual only** - no `onClick` handler calls auth |
| `/selection` | Guest mode link | Navigates with `?guest=true` param |

### 4.2 AuthModal Component

**Location:** `src/components/AuthModal.tsx`

**Supported Auth Methods:**
- Email/Password sign up/in
- Google sign-in (`signInWithGoogle()`)
- Guest-to-Google upgrade (`linkGoogleAccount()`)

**NOT in onboarding-new:**
- Apple sign-in
- Phone number auth

### 4.3 Where Auth Should Happen

The Google button in `/selection` page has this code:
```tsx
<button className="w-full bg-white flex items-center justify-center gap-3 py-4 px-6 rounded-[1.5rem] ...">
  <span className="font-bold text-slate-700">{locale.selection.googleButton}</span>
  {/* Google SVG icon */}
</button>
```

**Missing:** No `onClick` handler. To enable auth:
```tsx
onClick={handleGoogleSignIn}
```

### 4.4 Profile Initialization

Profile is initialized in `/dynamic/page.tsx` after assessment:
```typescript
const profile = mapAnswersToProfile(allAnswers, assignedLevel, assignedProgramId, masterProgramSubLevels);
await initializeProfile(profile);
```

This uses `useUserStore.initializeProfile()` which creates an anonymous or authenticated profile in Firestore.

---

## 5. Key Components Used

### 5.1 Layout Components

| Component | Path | Usage |
|-----------|------|-------|
| `OnboardingLayout` | `features/user/onboarding/components/OnboardingLayout.tsx` | Wraps all pages, provides header with progress/coins |
| `MobileFrame` | `components/MobileFrame.tsx` | Mobile device frame wrapper |

### 5.2 Step Components (Wizard)

| Component | Path | Step |
|-----------|------|------|
| `LocationStep` | `features/user/onboarding/components/steps/LocationStep.tsx` | LOCATION |
| `EquipmentStep` | `features/user/onboarding/components/steps/EquipmentStep.tsx` | EQUIPMENT |
| `HistoryStep` | `features/user/onboarding/components/steps/HistoryStep.tsx` | HISTORY |
| `ScheduleStep` | `features/user/onboarding/components/steps/ScheduleStep.tsx` | SCHEDULE |
| `CitySelectionStep` | `features/user/onboarding/components/steps/CitySelectionStep.tsx` | SOCIAL_MAP |

### 5.3 Special Components

| Component | Usage |
|-----------|-------|
| `DynamicQuestionRenderer` | Renders questions from `DynamicOnboardingEngine` |
| `LoadingAIBuilder` | AI-style loading animation before assessment |
| `ResultLoading` | Level reveal animation |
| `ProgramResult` | Final assigned level display |
| `SummaryReveal` | Wizard completion summary |
| `CalculatingProfileScreen` | Final calculation animation |

---

## 6. Services & Engines

### 6.1 DynamicOnboardingEngine

**Path:** `features/user/onboarding/engine/DynamicOnboardingEngine.ts`

**Purpose:** Manages dynamic question flow, calculates fitness level

**Key Methods:**
```typescript
await engine.initialize('assessment', undefined, currentLang, gender);
const question = engine.getCurrentQuestion();
const result = await engine.answer(answerId);
const allAnswers = engine.getAllAnswers();
```

### 6.2 Onboarding Sync Service

**Path:** `features/user/onboarding/services/onboarding-sync.service.ts`

**Purpose:** Syncs onboarding progress to Firestore

```typescript
await syncOnboardingToFirestore(step, data);
```

### 6.3 Profile Service

**Path:** `features/user/identity/services/profile.service.ts`

**Purpose:** Maps questionnaire answers to user profile structure

```typescript
const profile = mapAnswersToProfile(answers, level, programId, subLevels);
```

---

## 7. Coin Reward System

| Action | Coins | Location |
|--------|-------|----------|
| Start onboarding | +10 | `/intro` |
| Select gender (first time) | +10 | `/roadmap` |
| Continue from personal details | +10 | `/roadmap` |
| Phase 2 intro continue | +10 | `/phase2-intro` |
| Each wizard step completion | +10 | `/setup` (wizard) |

**Store:** `useOnboardingStore.addCoins(amount)`

---

## 8. Localization

**Supported Languages:** `he` (Hebrew), `en` (English), `ru` (Russian)

**Locale Files:** `lib/i18n/onboarding-locales.ts`

**Usage:**
```typescript
const locale = getOnboardingLocale(selectedLanguage);
// Access: locale.intro.title, locale.selection.googleButton, etc.
```

---

## 9. Known Issues / Gaps

1. **Google Auth Not Connected:** The Google button in `/selection` is visual only
2. **No Apple/Phone Auth:** Not implemented in onboarding flow
3. **Guest Mode:** Creates anonymous profile, no upgrade path shown
4. **SessionStorage Dependency:** Data lost if user closes browser mid-flow
5. **No Back Navigation:** Most pages don't have back button to previous step
6. **Persona Selection Optional:** Can be skipped if already selected

---

## 10. Flow Diagram

```
┌──────────┐    ┌───────────┐    ┌──────────┐    ┌──────────┐
│  /intro  │───▶│ /selection│───▶│ /roadmap │───▶│ /dynamic │
└──────────┘    └───────────┘    └──────────┘    └──────────┘
                     │                                 │
                     ▼                                 ▼
              (Guest Mode)                    Profile Created
                     │                                 │
                     ▼                                 ▼
              ┌──────────┐    ┌─────────────────┐    ┌────────┐
              │ /dynamic │───▶│ /phase2-intro   │───▶│ /setup │
              │ ?guest   │    └─────────────────┘    └────────┘
              └──────────┘             │                  │
                                       ▼                  ▼
                               ┌─────────────────┐   COMPLETED
                               │/persona-selection│      │
                               └─────────────────┘      ▼
                                       │           → /home
                                       └─────────────────┘
```

---

*End of Document*
