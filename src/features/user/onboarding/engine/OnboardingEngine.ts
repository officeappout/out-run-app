// ==========================================
// מנוע Onboarding דינמי
// מריץ שאלונים לפי JSON configuration
// ==========================================

import { QuestionnaireNode, OnboardingState, OnboardingAnswers } from '../types';

export class OnboardingEngine {
  private nodes: Map<string, QuestionnaireNode>;
  private startNodeId: string;
  private state: OnboardingState;

  constructor(nodes: QuestionnaireNode[], startNodeId: string) {
    this.nodes = new Map(nodes.map(node => [node.id, node]));
    this.startNodeId = startNodeId;
    this.state = {
      currentStepId: startNodeId,
      answers: {},
      visitedSteps: [],
      isComplete: false,
    };
  }

  // ==========================================
  // קבלת השאלה הנוכחית
  // ==========================================
  getCurrentNode(): QuestionnaireNode | null {
    if (!this.state.currentStepId) return null;
    return this.nodes.get(this.state.currentStepId) || null;
  }

  // ==========================================
  // קבלת מצב השאלון
  // ==========================================
  getState(): OnboardingState {
    return { ...this.state };
  }

  // ==========================================
  // קבלת תשובה
  // ==========================================
  getAnswer(questionId: string): any {
    return this.state.answers[questionId];
  }

  // ==========================================
  // שמירת תשובה בלבד (ללא התקדמות)
  // ==========================================
  saveAnswer(questionId: string, value: any): void {
    const node = this.nodes.get(questionId);
    if (!node) {
      console.warn(`Question ${questionId} not found`);
      return;
    }

    // שמירת התשובה (עם deep merge אם זה אובייקט)
    if (typeof value === 'object' && value !== null && !Array.isArray(value) && !(value instanceof Date)) {
      this.state.answers[questionId] = {
        ...this.state.answers[questionId],
        ...value,
      };
    } else {
      this.state.answers[questionId] = value;
    }

    // הוספה לרשימת צעדים שביקרנו
    if (!this.state.visitedSteps.includes(questionId)) {
      this.state.visitedSteps.push(questionId);
    }
  }

  // ==========================================
  // שמירת תשובה והתקדמות
  // ==========================================
  answer(questionId: string, value: any, optionId?: string, shouldAdvance: boolean = true): void {
    const node = this.nodes.get(questionId);
    if (!node) {
      console.warn(`Question ${questionId} not found`);
      return;
    }

    // שמירת התשובה
    this.saveAnswer(questionId, value);

    // אם לא צריך להתקדם, רק שמור את התשובה
    if (!shouldAdvance) {
      return;
    }

    // קביעת השאלה הבאה
    let nextStepId: string | null = null;

    // אם יש אפשרות עם nextStepId ספציפי
    if (optionId && node.options) {
      const option = node.options.find(opt => opt.id === optionId);
      if (option) {
        nextStepId = option.nextStepId;
      }
    }

    // אם לא נמצא, נבדוק לוגיקה מותנית
    if (!nextStepId && node.conditionalLogic) {
      const dependsOnValue = this.state.answers[node.conditionalLogic.dependsOnQuestionId];
      if (dependsOnValue === node.conditionalLogic.matchValue) {
        nextStepId = node.conditionalLogic.jumpToStepId;
      }
    }

    // אם עדיין אין, נקפוץ לשאלה הבאה בסדר (אם יש)
    if (!nextStepId) {
      // נחפש את השאלה הבאה בסדר
      const nodeIds = Array.from(this.nodes.keys());
      const currentIndex = nodeIds.indexOf(questionId);
      if (currentIndex < nodeIds.length - 1) {
        nextStepId = nodeIds[currentIndex + 1];
      }
    }

    // עדכון מצב
    if (nextStepId && this.nodes.has(nextStepId)) {
      this.state.currentStepId = nextStepId;
    } else {
      // סיום השאלון
      this.state.currentStepId = null;
      this.state.isComplete = true;
    }
  }

  // ==========================================
  // חזרה לשאלה קודמת
  // ==========================================
  goBack(): boolean {
    if (this.state.visitedSteps.length <= 1) {
      return false; // אין לאן לחזור
    }

    // הסרת השאלה הנוכחית מהרשימה
    this.state.visitedSteps.pop();
    
    // חזרה לשאלה הקודמת
    const previousStepId = this.state.visitedSteps[this.state.visitedSteps.length - 1];
    if (previousStepId) {
      this.state.currentStepId = previousStepId;
      // התשובות נשמרות ב-state.answers - לא צריך לעדכן אותן
      return true;
    }

    return false;
  }

  // ==========================================
  // דילוג על שאלה
  // ==========================================
  skip(questionId: string): boolean {
    const node = this.nodes.get(questionId);
    if (!node || !node.skippable) {
      return false;
    }

    // מעבר לשאלה הבאה
    const nodeIds = Array.from(this.nodes.keys());
    const currentIndex = nodeIds.indexOf(questionId);
    if (currentIndex < nodeIds.length - 1) {
      this.state.currentStepId = nodeIds[currentIndex + 1];
      return true;
    }

    return false;
  }

  // ==========================================
  // קבלת כל התשובות
  // ==========================================
  getAllAnswers(): OnboardingAnswers {
    return { ...this.state.answers };
  }

  // ==========================================
  // איפוס השאלון
  // ==========================================
  reset(): void {
    this.state = {
      currentStepId: this.startNodeId,
      answers: {},
      visitedSteps: [],
      isComplete: false,
    };
  }

  // ==========================================
  // בדיקת תקינות תשובה
  // ==========================================
  validateAnswer(questionId: string, value: any): { valid: boolean; error?: string } {
    const node = this.nodes.get(questionId);
    if (!node || !node.validation) {
      return { valid: true };
    }

    const { validation } = node;

    // בדיקת required
    if (validation.required && (value === null || value === undefined || value === '')) {
      return { valid: false, error: 'שדה חובה' };
    }

    // בדיקת אורך (לטקסט)
    if (typeof value === 'string') {
      if (validation.minLength && value.length < validation.minLength) {
        return { valid: false, error: `מינימום ${validation.minLength} תווים` };
      }
      if (validation.maxLength && value.length > validation.maxLength) {
        return { valid: false, error: `מקסימום ${validation.maxLength} תווים` };
      }
    }

    // בדיקת גיל מינימלי (לתאריך לידה)
    if (validation.minAge && value instanceof Date) {
      const today = new Date();
      const age = today.getFullYear() - value.getFullYear();
      const monthDiff = today.getMonth() - value.getMonth();
      const actualAge = monthDiff < 0 || (monthDiff === 0 && today.getDate() < value.getDate()) 
        ? age - 1 
        : age;
      
      if (actualAge < validation.minAge) {
        return { valid: false, error: `גיל מינימלי: ${validation.minAge}` };
      }
    }

    return { valid: true };
  }
}
