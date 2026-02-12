'use client';

/**
 * PostWorkoutGoalInput — shown after a workout if the session included
 * a "Target Exercise" defined in the current program-level's goals.
 *
 * The user enters their actual reps/seconds; the component:
 *   1. Calculates bonus XP via xp.service
 *   2. Saves performance to UserLevelGoalProgress
 *   3. Updates the specific child-program track
 *   4. Triggers recursive master-level recalculation
 */

import React, { useState } from 'react';
import { Target, CheckCircle, Award } from 'lucide-react';
import { doc, getDoc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db, auth } from '@/lib/firebase';
import {
  calculateGoalBonusXP,
  calculateGoalCompletionPercent,
} from '@/features/user/progression/services/xp.service';
import { recalculateAncestorMasters } from '@/features/user/progression/services/progression.service';
import type { LevelGoal } from '@/types/workout';

// ── Props ───────────────────────────────────────────────────────────

export interface PostWorkoutGoalInputProps {
  /** The matched goal from the current program-level */
  goal: LevelGoal;
  /** The child program this workout belongs to */
  childProgramId: string;
  /** Callback after the user submits (or skips) */
  onComplete: (bonusXP: number) => void;
}

// ── Component ───────────────────────────────────────────────────────

export default function PostWorkoutGoalInput({
  goal,
  childProgramId,
  onComplete,
}: PostWorkoutGoalInputProps) {
  const [value, setValue] = useState<string>('');
  const [submitted, setSubmitted] = useState(false);
  const [bonusAwarded, setBonusAwarded] = useState(0);
  const [completionPct, setCompletionPct] = useState(0);
  const [saving, setSaving] = useState(false);

  const unitLabel = goal.unit === 'reps' ? 'חזרות' : 'שניות';

  const handleSubmit = async () => {
    const actual = parseInt(value, 10);
    if (isNaN(actual) || actual < 0) return;

    setSaving(true);
    try {
      const uid = auth.currentUser?.uid;
      if (!uid) {
        onComplete(0);
        return;
      }

      // 1. Calculate bonus XP and completion percent
      const bonus = calculateGoalBonusXP(goal.targetValue, actual, goal.unit);
      const pct = calculateGoalCompletionPercent(goal.targetValue, actual);
      setBonusAwarded(bonus);
      setCompletionPct(pct);

      // 2. Update user's globalXP with the bonus
      const userRef = doc(db, 'users', uid);
      const userSnap = await getDoc(userRef);
      if (userSnap.exists()) {
        const data = userSnap.data();
        const currentXP = data.progression?.globalXP || 0;

        // Update globalXP
        await updateDoc(userRef, {
          'progression.globalXP': currentXP + bonus,
          updatedAt: serverTimestamp(),
        });

        // 3. Update levelGoalProgress (upsert)
        const existingGoalProgress: any[] = data.progression?.levelGoalProgress || [];
        // Find or create the program entry
        let progEntry = existingGoalProgress.find(
          (e: any) => e.programId === childProgramId
        );
        if (!progEntry) {
          progEntry = { programId: childProgramId, goals: [] };
          existingGoalProgress.push(progEntry);
        }

        // Find or create the specific goal
        let goalEntry = progEntry.goals?.find(
          (g: any) => g.exerciseId === goal.exerciseId
        );
        if (!goalEntry) {
          goalEntry = {
            exerciseId: goal.exerciseId,
            exerciseName: goal.exerciseName,
            targetValue: goal.targetValue,
            unit: goal.unit,
            bestPerformance: 0,
            completionPercent: 0,
            isCompleted: false,
          };
          progEntry.goals.push(goalEntry);
        }

        // Update best performance
        if (actual > goalEntry.bestPerformance) {
          goalEntry.bestPerformance = actual;
          goalEntry.completionPercent = pct;
          goalEntry.isCompleted = pct >= 100;
          goalEntry.lastAttemptDate = new Date().toISOString();
        }

        await updateDoc(userRef, {
          'progression.levelGoalProgress': existingGoalProgress,
        });

        // 4. Trigger recursive master recalculation
        try {
          await recalculateAncestorMasters(uid, childProgramId);
        } catch (e) {
          console.warn('[GoalInput] Master recalc skipped:', e);
        }
      }

      setSubmitted(true);
      // Give user a moment to see the result, then continue
      setTimeout(() => onComplete(bonus), 2000);
    } catch (err) {
      console.error('[GoalInput] Error saving:', err);
      onComplete(0);
    } finally {
      setSaving(false);
    }
  };

  const handleSkip = () => {
    onComplete(0);
  };

  // ── Success State ──
  if (submitted) {
    return (
      <div className="bg-gradient-to-br from-green-50 to-emerald-50 border-2 border-green-300 rounded-2xl p-6 text-center" dir="rtl">
        <CheckCircle className="w-12 h-12 text-green-500 mx-auto mb-3" />
        <h3 className="text-lg font-black text-green-800 mb-1">
          {completionPct >= 100 ? 'יעד הושג!' : 'נרשם בהצלחה!'}
        </h3>
        <p className="text-sm text-green-700">
          {completionPct >= 100 && (
            <span className="flex items-center justify-center gap-1 mb-1">
              <Award size={16} className="text-amber-500" />
              <span className="font-bold text-amber-600">+{bonusAwarded} XP בונוס</span>
            </span>
          )}
          {Math.round(completionPct)}% מהיעד — {goal.exerciseName}
        </p>
        <div className="w-full bg-green-200 rounded-full h-2 mt-3">
          <div
            className="bg-green-500 h-2 rounded-full transition-all duration-1000"
            style={{ width: `${Math.min(completionPct, 100)}%` }}
          />
        </div>
      </div>
    );
  }

  // ── Input State ──
  return (
    <div className="bg-gradient-to-br from-amber-50 to-orange-50 border-2 border-amber-300 rounded-2xl p-5" dir="rtl">
      <div className="flex items-center gap-2 mb-3">
        <Target size={20} className="text-amber-600" />
        <h3 className="text-base font-black text-gray-900">תרגיל יעד: {goal.exerciseName}</h3>
      </div>

      <p className="text-sm text-gray-600 mb-4">
        היעד שלך: <span className="font-bold text-amber-700">{goal.targetValue} {unitLabel}</span>.
        כמה {unitLabel} ביצעת?
      </p>

      <div className="flex items-center gap-3 mb-4">
        <input
          type="number"
          min="0"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="0"
          className="flex-1 text-center text-2xl font-black border-2 border-amber-300 rounded-xl py-3 focus:ring-2 focus:ring-amber-500 focus:border-transparent"
          autoFocus
        />
        <span className="text-sm font-bold text-gray-600 w-16">{unitLabel}</span>
      </div>

      <div className="flex gap-3">
        <button
          onClick={handleSubmit}
          disabled={saving || !value || parseInt(value) < 0}
          className="flex-1 flex items-center justify-center gap-2 bg-amber-500 text-white font-bold py-3 rounded-xl hover:bg-amber-600 transition-colors disabled:opacity-50"
        >
          {saving ? 'שומר...' : 'שלח'}
        </button>
        <button
          onClick={handleSkip}
          className="px-5 py-3 bg-gray-200 text-gray-600 font-bold rounded-xl hover:bg-gray-300 transition-colors"
        >
          דלג
        </button>
      </div>
    </div>
  );
}
