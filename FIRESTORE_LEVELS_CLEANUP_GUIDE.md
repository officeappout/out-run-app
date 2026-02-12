# Firestore Levels Collection Cleanup Guide

## Purpose
Remove obsolete "ghost levels" (like 'CC') from the `levels` collection to ensure only valid, active levels appear in questionnaire dropdowns and admin interfaces.

## Pre-Cleanup Checklist

Before deleting any levels, verify:
1. The level is not actively assigned to any users in questionnaires
2. The level is not referenced in any active program's `maxLevels` constraint
3. The level does not have valid XP thresholds for the gamification system

## Cleanup Steps

### 1. Access Firebase Console
1. Go to [Firebase Console](https://console.firebase.google.com/project/appout-1/firestore/data)
2. Navigate to **Firestore Database**
3. Find the `levels` collection

### 2. Identify Ghost Levels

Review each document in the `levels` collection. A ghost level typically has:
- Invalid or missing `order` value
- Missing `minXP` / `maxXP` thresholds
- Non-standard `name` (e.g., 'CC', 'test', 'dummy')
- No clear role in the progression system

**Common ghost level patterns:**
- Document ID or name contains 'CC'
- Document ID or name contains 'test', 'temp', 'demo'
- `order` is missing or set to 0
- `minXP` and `maxXP` are both 0 or undefined

### 3. Valid Level Structure

A valid level document should have:
```json
{
  "id": "level_1",           // or auto-generated ID
  "name": "Beginner",         // Clear, descriptive name
  "order": 1,                 // Sequential number (1, 2, 3, etc.)
  "minXP": 0,                 // XP threshold to reach this level
  "maxXP": 100,               // XP ceiling before next level
  "description": "...",       // Optional description
  "targetGoals": [...],       // Optional exercise mastery goals
  "createdAt": Timestamp,
  "updatedAt": Timestamp
}
```

### 4. Delete Ghost Levels

For each identified ghost level:
1. Click on the document in Firebase Console
2. Click the **Delete Document** button (trash icon)
3. Confirm deletion
4. Document the deletion in the table below

### 5. Verification

After cleanup:
1. Open `/admin/questionnaire` in the app
2. Create a test result and check the level dropdown
3. Verify only valid levels appear
4. Open Firebase Console → `levels` collection
5. Verify all remaining documents have proper structure

## Deletion Log

| Document ID | Name | Reason for Deletion | Deleted By | Date |
|-------------|------|---------------------|------------|------|
| (example: 'CC') | CC | Ghost level with invalid structure | David | 2026-02-11 |
| | | | | |
| | | | | |

## Post-Cleanup Actions

After completing the cleanup:
- [ ] Verify questionnaire dropdowns show only valid levels
- [ ] Check that existing user progression data is not affected
- [ ] Update this document with the deletion log

## Rollback (If Needed)

If you accidentally delete a valid level:
1. Re-create the document in Firestore with the same ID
2. Restore the fields: `name`, `order`, `minXP`, `maxXP`, `description`, `targetGoals`
3. Set `createdAt` and `updatedAt` to current timestamp

## Notes

- The levels system is used for the **App Engagement (System A)** layer (globalXP/globalLevel)
- It powers avatar/lemur evolution, coins, and widgets
- It is independent from **Professional Mastery (System B)** (program tracks)
- Deleting a level does NOT affect existing users' `globalLevel` values (they remain as numbers)
- However, level names and descriptions will no longer display correctly for deleted levels

## Support

If you're unsure whether a level is safe to delete, check:
1. Firebase Console → `users` collection → sample user → `progression.globalLevel` field
2. See what level values are actively in use
3. Cross-reference with the `levels` collection `order` field
