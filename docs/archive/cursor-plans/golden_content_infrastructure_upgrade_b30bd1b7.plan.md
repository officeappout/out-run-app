---
name: Golden Content Infrastructure Upgrade
overview: Upgrade the existing Coverage Matrix (/admin/workout-settings/status) to support hyper-personalization with Gender, Sport Type, Experience Level, and Progress Range filters. Add Level-Up scoring logic (+5 bonus for 90%+ progress) and new @tags for program context.
todos:
  - id: schema
    content: Add progressRange field to all 4 content type interfaces & form states
    status: completed
  - id: dropdowns
    content: Add progressRange dropdowns to all editor forms (Titles, Phrases, Descriptions, Notifications)
    status: completed
  - id: bulk
    content: Update bulk upload parser & CSV templates for progressRange field
    status: completed
  - id: user_profile
    content: Add programProgress field to UserFullProfile type definition
    status: completed
  - id: scoring
    content: Implement Level-Up bonus logic (+5 for progress>90% + range=90-100) in scoreContentRow
    status: completed
  - id: tags
    content: Add @שם_תוכנית, @אחוז_התקדמות, @רמה_הבאה tags to branding.utils.ts
    status: completed
  - id: matrix_titles
    content: Add 'Workout Titles' tab to Coverage Matrix page
    status: completed
  - id: matrix_filters
    content: Add Gender, Sport, Experience, Progress global filters to matrix UI
    status: completed
  - id: matrix_personas
    content: Add reservist & school_student to PERSONA_OPTIONS in status page
    status: completed
  - id: wire_context
    content: Wire programProgress from UserProfile to WorkoutMetadataContext in home-workout.service.ts
    status: completed
isProject: false
---

# Golden Content Infrastructure: Hyper-Personalization & Level-Up Logic

## Architecture Overview

```mermaid
graph TB
    subgraph UserProfile [User Profile]
        PP[programProgress: number]
        G[gender: male/female]
        S[sportType: string]
        E[experienceLevel: string]
    end
    
    subgraph FirestoreContent [Firestore Content Rows]
        PR[progressRange: 0-20 | 20-90 | 90-100]
        SPT[sportType: optional]
        EXP[experienceLevel: optional]
        GEN[gender: male/female/both]
    end
    
    subgraph ScoringEngine [Scoring Engine]
        MATCH[Match Attributes]
        CALC[Calculate Score]
        BONUS[+5 if progress>90% AND progressRange=90-100]
        SHUFFLE[Shuffle Among Ties]
    end
    
    subgraph CoverageMatrix [Coverage Matrix UI]
        FILTERS[Global Filters: Gender, Sport, Experience, Progress]
        TABS[Tabs: Phrases | Notifications | Descriptions | Titles]
        HEATMAP[Quality Heatmap: Red/Yellow/Green]
    end
    
    UserProfile --> ScoringEngine
    FirestoreContent --> ScoringEngine
    ScoringEngine --> CoverageMatrix
```



## 1. Schema Expansions

### 1.1 Add progressRange to All Content Types

**Files to modify:**

- `[src/app/admin/workout-settings/page.tsx](src/app/admin/workout-settings/page.tsx)` - Add `progressRange` field to `WorkoutTitle`, `MotivationalPhrase`, `Notification`, `SmartDescription` interfaces
- Add `progressRangeLabels` constant mapping:
  - `'0-20'`: 'מתחילים (0-20%)'
  - `'20-90'`: 'בדרך (20-90%)'
  - `'90-100'`: 'לקראת דרגה הבאה (90-100%)'

**Changes:**

```typescript
const progressRangeLabels: Record<string, string> = {
  '0-20': 'מתחילים (0-20%)',
  '20-90': 'בדרך (20-90%)',
  '90-100': 'לקראת דרגה הבאה (90-100%)',
};

interface WorkoutTitle {
  // ... existing fields
  progressRange?: string; // NEW: '0-20' | '20-90' | '90-100'
}
```

### 1.2 Add progressRange Dropdowns to All Editor Forms

**Files to modify:**

- `[src/app/admin/workout-settings/page.tsx](src/app/admin/workout-settings/page.tsx)`

**Changes:**

- Add dropdown selector to Title form (after experienceLevel)
- Add dropdown selector to Phrase form (after experienceLevel)
- Add dropdown selector to Description form (after experienceLevel)
- Add dropdown selector to Notification form (after psychologicalTrigger)
- Update all form state initializations to include `progressRange: ''`
- Update all edit-click handlers to load `progressRange` field

### 1.3 Update Bulk Upload Parser

**Files to modify:**

- `[src/app/admin/workout-settings/bulk/page.tsx](src/app/admin/workout-settings/bulk/page.tsx)`

**Changes:**

- Add `progressRange` / `טווח_התקדמות` to field mapping for all 4 content types
- Update CSV templates to include `progressRange` column
- Update instructions section to document the new field

## 2. UserProfile programProgress Field

### 2.1 Add programProgress to UserFullProfile Type

**Files to modify:**

- `[src/features/user/types.ts](src/features/user/types.ts)` or wherever `UserFullProfile` is defined

**Changes:**

```typescript
export interface UserFullProfile {
  // ... existing fields
  programProgress?: number; // NEW: 0-100 percentage tracking user's progress in their current program
}
```

### 2.2 Expand WorkoutMetadataContext

**Files to modify:**

- `[src/features/workout-engine/services/workout-metadata.service.ts](src/features/workout-engine/services/workout-metadata.service.ts)`

**Changes:**

```typescript
export interface WorkoutMetadataContext {
  // ... existing fields
  programProgress?: number; // NEW: User's current program progress (0-100)
  currentProgram?: string;  // NEW: Current program name for @שם_תוכנית tag
  targetLevel?: number;     // NEW: Next level for @רמה_הבאה tag
}
```

## 3. Scoring Engine: Level-Up Bonus Logic

### 3.1 Update scoreContentRow Function

**Files to modify:**

- `[src/features/workout-engine/services/workout-metadata.service.ts](src/features/workout-engine/services/workout-metadata.service.ts)`

**Current scoring (7 attributes):**

- persona, location, timeOfDay, gender, sportType, motivationStyle, experienceLevel

**New scoring (8 attributes + bonus):**

1. Add `progressRange` to `SCORABLE_FIELDS` array
2. Implement **Level-Up Bonus Logic**:
  - IF user's `programProgress > 90` AND content row's `progressRange === '90-100'`
  - THEN add **+5 bonus** to the score

**Changes:**

```typescript
const SCORABLE_FIELDS = [
  // ... existing 7 fields
  { rowField: 'progressRange', ctxKey: 'programProgress', neutralWhenEmpty: true },
];

function scoreContentRow(row: any, ctx: WorkoutMetadataContext): number {
  let score = 0;
  
  // ... existing scoring logic for 7 fields
  
  // Progress Range scoring
  const rowProgress = row.progressRange;
  const userProgress = ctx.programProgress;
  if (rowProgress && userProgress !== undefined) {
    const [min, max] = rowProgress.split('-').map(Number);
    if (userProgress >= min && userProgress <= max) {
      score += 1; // Base match
      
      // LEVEL-UP BONUS: +5 if user is >90% AND content targets 90-100
      if (userProgress > 90 && rowProgress === '90-100') {
        score += 5; // Strong boost for level-up content
      }
    }
  }
  
  return score;
}
```

## 4. Tag Resolver: Progress Tags

### 4.1 Add New Progress Tags

**Files to modify:**

- `[src/features/content/branding/core/branding.utils.ts](src/features/content/branding/core/branding.utils.ts)`

**New tags:**

- `@שם_תוכנית` - Current program name (e.g., "משיכה", "דחיפה")
- `@אחוז_התקדמות` - Progress percentage (e.g., "92%")
- `@רמה_הבאה` - Target level (e.g., "רמה 4")

**Changes:**

```typescript
export interface TagResolverContext {
  // ... existing fields
  currentProgram?: string;
  programProgress?: number;
  targetLevel?: number;
}

export function resolveDescription(template: string, context: TagResolverContext): string {
  // ... existing tags
  
  // @שם_תוכנית
  resolved = resolved.replace(/@שם_תוכנית/g, () => {
    const programLabels: Record<string, string> = {
      pulling: 'משיכה',
      pushing: 'דחיפה',
      core: 'ליבה',
      legs: 'רגליים',
    };
    return context.currentProgram 
      ? programLabels[context.currentProgram] || context.currentProgram 
      : 'התוכנית';
  });
  
  // @אחוז_התקדמות
  resolved = resolved.replace(/@אחוז_התקדמות/g, () => {
    return context.programProgress !== undefined 
      ? `${Math.round(context.programProgress)}%` 
      : '0%';
  });
  
  // @רמה_הבאה
  resolved = resolved.replace(/@רמה_הבאה/g, () => {
    return context.targetLevel !== undefined 
      ? `רמה ${context.targetLevel}` 
      : 'הרמה הבאה';
  });
  
  return resolved;
}
```

**Update getAvailableDescriptionTags():**

```typescript
{
  tag: '@שם_תוכנית',
  description: 'שם התוכנית הנוכחית (משיכה, דחיפה, ליבה, רגליים)',
  example: 'התקדמות מצוינת ב@שם_תוכנית!',
},
{
  tag: '@אחוז_התקדמות',
  description: 'אחוז ההתקדמות בתוכנית (0-100%)',
  example: '@את/ה ב-@אחוז_התקדמות - כמעט שם!',
},
{
  tag: '@רמה_הבאה',
  description: 'הרמה הבאה שאליה המשתמש מתקדם',
  example: 'עוד קצת ו@את/ה מגיע/ה ל@רמה_הבאה',
},
```

## 5. Coverage Matrix Upgrade

### 5.1 Add 'Workout Titles' Tab

**Files to modify:**

- `[src/app/admin/workout-settings/status/page.tsx](src/app/admin/workout-settings/status/page.tsx)`

**Changes:**

- Add `'titles'` to `viewMode` state type: `'phrases' | 'notifications' | 'descriptions' | 'titles'`
- Add "כותרות אימון" tab button
- Update `buildMatrix()` to handle titles view (Persona × Location grid, same as Phrases)
- Update `getCount()` to return `cell.titleCount` when in titles mode
- Add `titleCount` field to `MatrixCell` interface

### 5.2 Add Global Filters

**Files to modify:**

- `[src/app/admin/workout-settings/status/page.tsx](src/app/admin/workout-settings/status/page.tsx)`

**New state variables:**

```typescript
const [genderFilter, setGenderFilter] = useState<'all' | 'male' | 'female'>('all');
const [sportFilter, setSportFilter] = useState<string>(''); // '' = all
const [experienceFilter, setExperienceFilter] = useState<string>(''); // '' = all
const [progressFilter, setProgressFilter] = useState<string>(''); // '' = all
```

**UI additions:**

- Add filter bar below tab buttons with 4 dropdown selectors:
  - Gender: כל המינים / זכר / נקבה
  - Sport Type: כל הספורטים / קליסתניקס / ריצה / כדורסל...
  - Experience: כל הרמות / מתחיל / בינוני / מתקדם / מקצועי
  - Progress Range: כל הטווחים / 0-20% / 20-90% / 90-100%

**Filter logic in `buildMatrix()`:**

- When counting matches, apply additional filters:
  - If `genderFilter !== 'all'`, only count rows where `gender === genderFilter || gender === 'both'`
  - If `sportFilter !== ''`, only count rows where `sportType === sportFilter`
  - If `experienceFilter !== ''`, only count rows where `experienceLevel === experienceFilter`
  - If `progressFilter !== ''`, only count rows where `progressRange === progressFilter`

### 5.3 Quality-Based Heatmap Colors

**Current colors:**

- Red (0 rows) - `bg-red-100 text-red-700`
- Yellow (1 row) - `bg-yellow-100 text-yellow-700`
- Green (2+ rows) - `bg-green-100 text-green-700`

**No changes needed** - existing color logic already implements the requested heatmap.

### 5.4 Update Persona Constants

**Files to modify:**

- `[src/app/admin/workout-settings/status/page.tsx](src/app/admin/workout-settings/status/page.tsx)`

**Changes:**

- Add `reservist` and `school_student` to `PERSONA_OPTIONS`:

```typescript
const PERSONA_OPTIONS = [
  { value: 'parent', label: 'הורה' },
  { value: 'student', label: 'סטודנט' },
  { value: 'school_student', label: 'תלמיד' }, // NEW
  { value: 'office_worker', label: 'עובד משרד' },
  { value: 'remote_worker', label: 'עובד מהבית' },
  { value: 'athlete', label: 'ספורטאי' },
  { value: 'senior', label: 'גיל הזהב' },
  { value: 'reservist', label: 'מילואימניק' }, // NEW
];
```

## 6. Integration: Wire Progress Context to Scoring Engine

### 6.1 Update home-workout.service.ts

**Files to modify:**

- `[src/features/workout-engine/services/home-workout.service.ts](src/features/workout-engine/services/home-workout.service.ts)`

**Changes:**

- In `generateHomeWorkout()`, when building `WorkoutMetadataContext`:

```typescript
const metadataCtx: WorkoutMetadataContext = {
  persona: /* ... */,
  location: /* ... */,
  timeOfDay: /* ... */,
  gender: userProfile.core?.gender,
  sportType: userProfile.sportType, // Assuming this exists or will be added
  motivationStyle: userProfile.motivationStyle, // Assuming this exists
  experienceLevel: userProfile.experienceLevel, // Assuming this exists
  programProgress: userProfile.programProgress, // NEW
  currentProgram: /* extract from shadowMatrix or userProfile */,
  targetLevel: /* calculate from current level + 1 */,
};
```

## Summary of File Changes

### Core Files (8 files):

1. `[src/app/admin/workout-settings/page.tsx](src/app/admin/workout-settings/page.tsx)` - Add progressRange to all interfaces, forms, edit handlers
2. `[src/app/admin/workout-settings/bulk/page.tsx](src/app/admin/workout-settings/bulk/page.tsx)` - Add progressRange to bulk upload parser
3. `[src/app/admin/workout-settings/status/page.tsx](src/app/admin/workout-settings/status/page.tsx)` - Add Titles tab, global filters, heatmap
4. `[src/features/workout-engine/services/workout-metadata.service.ts](src/features/workout-engine/services/workout-metadata.service.ts)` - Add progressRange scoring + Level-Up bonus
5. `[src/features/content/branding/core/branding.utils.ts](src/features/content/branding/core/branding.utils.ts)` - Add 3 new progress tags
6. `[src/features/workout-engine/services/home-workout.service.ts](src/features/workout-engine/services/home-workout.service.ts)` - Wire programProgress to metadata context
7. `[src/features/user/types.ts](src/features/user/types.ts)` - Add programProgress field to UserFullProfile
8. `[src/features/workout-engine/logic/ContextualEngine.ts](src/features/workout-engine/logic/ContextualEngine.ts)` - Update LifestylePersona type (already done in previous session)

### Key Features:

- **Hyper-Personalization**: 8 scoring dimensions (persona, location, time, gender, sport, experience, progress, motivation)
- **Level-Up Logic**: +5 bonus when user progress >90% AND content targets 90-100% range
- **Unified Matrix**: Single UI showing coverage for Titles, Phrases, Descriptions, Notifications
- **Dynamic Filters**: Gender, Sport, Experience, Progress filters affect all tabs
- **Quality Heatmap**: Red (0) / Yellow (1) / Green (2+) shows variety coverage
- **New Tags**: @שם_תוכנית, @אחוז_התקדמות, @רמה_הבאה for progress-aware content

