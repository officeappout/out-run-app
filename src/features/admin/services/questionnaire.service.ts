/**
 * Firestore Service for Managing Onboarding Questions and Answers
 */
import { 
  collection, 
  doc, 
  getDoc, 
  getDocs, 
  addDoc, 
  updateDoc, 
  deleteDoc, 
  query, 
  where, 
  orderBy,
  serverTimestamp,
  Timestamp
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { OnboardingQuestion, OnboardingAnswer, QuestionWithAnswers, MultilingualText } from '@/types/onboarding-questionnaire';
import { Level, Program } from '@/types/workout';

// Collection names
const QUESTIONS_COLLECTION = 'onboarding_questions';
const ANSWERS_COLLECTION = 'onboarding_answers';
const LEVELS_COLLECTION = 'levels';
const PROGRAMS_COLLECTION = 'programs';

// Re-export types from workout.ts for convenience
export type LevelDoc = Level;
export type ProgramDoc = Program;

/**
 * Convert Firestore timestamp to Date
 */
function toDate(timestamp: Timestamp | Date | undefined): Date | undefined {
  if (!timestamp) return undefined;
  if (timestamp instanceof Date) return timestamp;
  return timestamp.toDate();
}

// ==========================================
// QUESTIONS CRUD
// ==========================================

/**
 * Migrate old string format to new MultilingualText format
 */
function migrateTextToMultilingual(text: string | MultilingualText | undefined): MultilingualText | undefined {
  if (!text) return undefined;
  if (typeof text === 'string') {
    // Old format: convert to new format
    return { he: { neutral: text } };
  }
  // Already in new format - ensure structure is valid
  if (typeof text === 'object' && text !== null) {
    return text;
  }
  return undefined;
}

/**
 * Get all questions (optionally filtered by part, language, and gender)
 */
export async function getAllQuestions(
  part?: 'assessment' | 'personal',
  language?: 'he' | 'en' | 'ru',
  gender?: 'male' | 'female' | 'neutral'
): Promise<OnboardingQuestion[]> {
  try {
    let q = query(collection(db, QUESTIONS_COLLECTION), orderBy('order', 'asc'));
    if (part) {
      q = query(q, where('part', '==', part));
    }
    
    const snapshot = await getDocs(q);
    let questions = snapshot.docs.map(doc => {
      const data = doc.data();
      // Migrate old string format to new format
      const title = migrateTextToMultilingual(data.title);
      const description = migrateTextToMultilingual(data.description);
      
      return {
        id: doc.id,
        ...data,
        title: title || { he: { neutral: '' } },
        description: description,
        createdAt: toDate(data.createdAt),
        updatedAt: toDate(data.updatedAt),
      } as OnboardingQuestion;
    });

    // Apply language filter
    const targetLanguage = language || 'he';
    questions = questions.filter((question) => {
      // Check if question has content in the requested language
      if (typeof question.title === 'string') {
        // Old format - assume Hebrew
        return targetLanguage === 'he';
      }
      // New format - check if language exists
      const langContent = question.title[targetLanguage];
      if (langContent && (langContent.neutral || langContent.female)) {
        return true; // Has content in this language
      }
      // Legacy language field check
      if (question.language !== undefined) {
        return question.language === targetLanguage;
      }
      // If no content in requested language but has Hebrew, include it (backwards compatibility)
      return question.title.he && (question.title.he.neutral || question.title.he.female);
    });

    // Apply gender filter
    const targetGender = gender || 'neutral';
    questions = questions.filter((question) => {
      if (typeof question.title === 'string') {
        // Old format - always include
        return true;
      }
      // Check if question has content for the requested gender
      const langContent = question.title[targetLanguage];
      if (langContent) {
        if (targetGender === 'neutral') {
          return true; // Neutral always matches
        }
        // For male/female, check if neutral exists (fallback) or specific gender exists
        return langContent.neutral !== undefined || langContent.female !== undefined;
      }
      // Legacy gender field check
      if (question.gender !== undefined) {
        return question.gender === 'neutral' || question.gender === targetGender;
      }
      return true; // Include questions without gender field
    });

    return questions;
  } catch (error) {
    console.error('Error fetching questions:', error);
    throw error;
  }
}

/**
 * Get a single question by ID
 */
export async function getQuestion(questionId: string): Promise<OnboardingQuestion | null> {
  try {
    const docRef = doc(db, QUESTIONS_COLLECTION, questionId);
    const docSnap = await getDoc(docRef);
    
    if (!docSnap.exists()) return null;
    
    const data = docSnap.data();
    // Migrate old string format to new format
    const title = migrateTextToMultilingual(data.title);
    const description = migrateTextToMultilingual(data.description);
    
    return {
      id: docSnap.id,
      ...data,
      title: title || { he: { neutral: '' } },
      description: description,
      createdAt: toDate(data.createdAt),
      updatedAt: toDate(data.updatedAt),
    } as OnboardingQuestion;
  } catch (error) {
    console.error('Error fetching question:', error);
    throw error;
  }
}

/**
 * Get the first question (marked as isFirstQuestion = true)
 * Optionally filtered by language and gender
 */
export async function getFirstQuestion(
  part: 'assessment' | 'personal' = 'assessment',
  language?: 'he' | 'en' | 'ru',
  gender?: 'male' | 'female' | 'neutral'
): Promise<OnboardingQuestion | null> {
  try {
    const q = query(
      collection(db, QUESTIONS_COLLECTION),
      where('part', '==', part),
      where('isFirstQuestion', '==', true)
    );
    const snapshot = await getDocs(q);
    
    if (snapshot.empty) return null;
    
    let questions = snapshot.docs.map(doc => {
      const data = doc.data();
      // Migrate old string format to new format
      const title = migrateTextToMultilingual(data.title);
      const description = migrateTextToMultilingual(data.description);
      
      return {
        id: doc.id,
        ...data,
        title: title || { he: { neutral: '' } },
        description: description,
        createdAt: toDate(data.createdAt),
        updatedAt: toDate(data.updatedAt),
      } as OnboardingQuestion;
    });

    // Apply language filter
    const targetLanguage = language || 'he';
    questions = questions.filter((question) => {
      if (typeof question.title === 'string') {
        return targetLanguage === 'he';
      }
      const langContent = question.title[targetLanguage];
      if (langContent && (langContent.neutral || langContent.female)) {
        return true;
      }
      if (question.language !== undefined) {
        return question.language === targetLanguage;
      }
      return question.title.he && (question.title.he.neutral || question.title.he.female);
    });

    // Apply gender filter
    const targetGender = gender || 'neutral';
    questions = questions.filter((question) => {
      if (typeof question.title === 'string') {
        return true;
      }
      const langContent = question.title[targetLanguage];
      if (langContent) {
        if (targetGender === 'neutral') return true;
        return langContent.neutral !== undefined || langContent.female !== undefined;
      }
      if (question.gender !== undefined) {
        return question.gender === 'neutral' || question.gender === targetGender;
      }
      return true;
    });

    if (questions.length === 0) return null;
    
    return questions[0];
  } catch (error) {
    console.error('Error fetching first question:', error);
    throw error;
  }
}

/**
 * Get question with all its answers
 * Optionally filtered by language and gender
 */
export async function getQuestionWithAnswers(
  questionId: string,
  language?: 'he' | 'en' | 'ru',
  gender?: 'male' | 'female' | 'neutral'
): Promise<QuestionWithAnswers | null> {
  try {
    const question = await getQuestion(questionId);
    if (!question) return null;
    
    const answers = await getAnswersByQuestionId(questionId, language, gender);
    
    return {
      ...question,
      answers: answers.sort((a, b) => (a.order || 0) - (b.order || 0)),
    };
  } catch (error) {
    console.error('Error fetching question with answers:', error);
    throw error;
  }
}

/**
 * Create a new question
 * Accepts MultilingualText format for title and description
 */
export async function createQuestion(data: Omit<OnboardingQuestion, 'id' | 'createdAt' | 'updatedAt'>): Promise<string> {
  try {
    // Ensure title and description are in MultilingualText format
    const title = typeof data.title === 'string' 
      ? migrateTextToMultilingual(data.title) || { he: { neutral: data.title } }
      : data.title;
    const description = data.description 
      ? (typeof data.description === 'string'
          ? migrateTextToMultilingual(data.description)
          : data.description)
      : undefined;

    const questionData: Record<string, any> = {
      ...data,
      title,
      description,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };

    // Handle progressIcon and progressIconSvg - convert undefined to null for Firebase
    questionData.progressIcon = data.progressIcon !== undefined ? (data.progressIcon || null) : null;
    questionData.progressIconSvg = data.progressIconSvg !== undefined ? (data.progressIconSvg || null) : null;

    // Remove legacy language/gender fields if they exist (they're now in the text structure)
    delete questionData.language;
    delete questionData.gender;

    // Clean any other undefined values
    Object.keys(questionData).forEach(key => {
      if (questionData[key] === undefined) {
        delete questionData[key];
      }
    });

    const docRef = await addDoc(collection(db, QUESTIONS_COLLECTION), questionData);
    return docRef.id;
  } catch (error) {
    console.error('Error creating question:', error);
    throw error;
  }
}

/**
 * Update a question
 */
export async function updateQuestion(
  questionId: string, 
  data: Partial<Omit<OnboardingQuestion, 'id' | 'createdAt' | 'updatedAt'>>
): Promise<void> {
  try {
    const docRef = doc(db, QUESTIONS_COLLECTION, questionId);
    
    // Ensure title and description are in MultilingualText format
    const updateData: Record<string, any> = {
      updatedAt: serverTimestamp(),
    };

    if (data.title !== undefined) {
      updateData.title = typeof data.title === 'string'
        ? migrateTextToMultilingual(data.title) || { he: { neutral: data.title } }
        : data.title;
    }

    if (data.description !== undefined) {
      if (data.description) {
        updateData.description = typeof data.description === 'string'
          ? migrateTextToMultilingual(data.description)
          : data.description;
      } else {
        updateData.description = null;
      }
    }

    // Handle progressIcon and progressIconSvg - convert undefined to null for Firebase
    if (data.progressIcon !== undefined) {
      updateData.progressIcon = data.progressIcon || null;
    }
    if (data.progressIconSvg !== undefined) {
      updateData.progressIconSvg = data.progressIconSvg || null;
    }

    // Copy other fields (excluding handled ones)
    Object.keys(data).forEach((key) => {
      if (
        key !== 'title' && 
        key !== 'description' && 
        key !== 'language' && 
        key !== 'gender' &&
        key !== 'progressIcon' &&
        key !== 'progressIconSvg'
      ) {
        const value = (data as any)[key];
        // Skip undefined values - Firebase doesn't accept them
        if (value !== undefined) {
          updateData[key] = value;
        }
      }
    });

    await updateDoc(docRef, updateData);
  } catch (error) {
    console.error('Error updating question:', error);
    throw error;
  }
}

/**
 * Delete a question (and optionally its answers)
 */
export async function deleteQuestion(questionId: string, deleteAnswers: boolean = false): Promise<void> {
  try {
    if (deleteAnswers) {
      const answers = await getAnswersByQuestionId(questionId);
      for (const answer of answers) {
        await deleteAnswer(answer.id);
      }
    }
    
    const docRef = doc(db, QUESTIONS_COLLECTION, questionId);
    await deleteDoc(docRef);
  } catch (error) {
    console.error('Error deleting question:', error);
    throw error;
  }
}

// ==========================================
// ANSWERS CRUD
// ==========================================

/**
 * Get all answers for a specific question
 * Optionally filtered by language and gender
 */
export async function getAnswersByQuestionId(
  questionId: string,
  language?: 'he' | 'en' | 'ru',
  gender?: 'male' | 'female' | 'neutral'
): Promise<OnboardingAnswer[]> {
  try {
    const q = query(
      collection(db, ANSWERS_COLLECTION),
      where('questionId', '==', questionId),
      orderBy('order', 'asc')
    );
    const snapshot = await getDocs(q);
    
    let answers = snapshot.docs.map(doc => {
      const data = doc.data();
      // Migrate old string format to new format
      const text = migrateTextToMultilingual(data.text);
      
      return {
        id: doc.id,
        ...data,
        text: text || { he: { neutral: '' } },
        createdAt: toDate(data.createdAt),
        updatedAt: toDate(data.updatedAt),
      } as OnboardingAnswer;
    });

    // Apply language filter
    const targetLanguage = language || 'he';
    answers = answers.filter((answer) => {
      if (typeof answer.text === 'string') {
        return targetLanguage === 'he';
      }
      const langContent = answer.text[targetLanguage];
      if (langContent && (langContent.neutral || langContent.female)) {
        return true;
      }
      if (answer.language !== undefined) {
        return answer.language === targetLanguage;
      }
      return answer.text.he && (answer.text.he.neutral || answer.text.he.female);
    });

    // Apply gender filter
    const targetGender = gender || 'neutral';
    answers = answers.filter((answer) => {
      if (typeof answer.text === 'string') {
        return true;
      }
      const langContent = answer.text[targetLanguage];
      if (langContent) {
        if (targetGender === 'neutral') return true;
        return langContent.neutral !== undefined || langContent.female !== undefined;
      }
      if (answer.gender !== undefined) {
        return answer.gender === 'neutral' || answer.gender === targetGender;
      }
      return true;
    });

    return answers;
  } catch (error) {
    console.error('Error fetching answers:', error);
    throw error;
  }
}

/**
 * Get a single answer by ID
 */
export async function getAnswer(answerId: string): Promise<OnboardingAnswer | null> {
  try {
    const docRef = doc(db, ANSWERS_COLLECTION, answerId);
    const docSnap = await getDoc(docRef);
    
    if (!docSnap.exists()) return null;
    
    const data = docSnap.data();
    // Migrate old string format to new format
    const text = migrateTextToMultilingual(data.text);
    
    return {
      id: docSnap.id,
      ...data,
      text: text || { he: { neutral: '' } },
      createdAt: toDate(data.createdAt),
      updatedAt: toDate(data.updatedAt),
    } as OnboardingAnswer;
  } catch (error) {
    console.error('Error fetching answer:', error);
    throw error;
  }
}

/**
 * Create a new answer
 * Accepts MultilingualText format for text
 */
export async function createAnswer(data: Omit<OnboardingAnswer, 'id' | 'createdAt' | 'updatedAt'>): Promise<string> {
  try {
    // Ensure text is in MultilingualText format
    const text = typeof data.text === 'string' 
      ? migrateTextToMultilingual(data.text) || { he: { neutral: data.text } }
      : data.text;

    // ✅ Clean data before saving - ensure no undefined values
    const cleanData: Record<string, any> = {
      questionId: data.questionId,
      text,
      order: data.order || 0,
      imageUrl: data.imageUrl !== undefined ? (data.imageUrl || null) : null,
      nextQuestionId: data.nextQuestionId !== undefined ? (data.nextQuestionId || null) : null,
      assignedLevelId: data.assignedLevelId !== undefined ? (data.assignedLevelId || null) : null,
      assignedProgramId: data.assignedProgramId !== undefined ? (data.assignedProgramId || null) : null,
      masterProgramSubLevels: data.masterProgramSubLevels !== undefined ? (data.masterProgramSubLevels || null) : null,
      // Legacy numeric
      assignedLevel: data.assignedLevel !== undefined ? (data.assignedLevel || null) : null,
      // Handle assignedResults: array of AnswerResult objects
      assignedResults: data.assignedResults !== undefined 
        ? (Array.isArray(data.assignedResults) && data.assignedResults.length > 0 
            ? data.assignedResults 
            : null)
        : null,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };

    // Remove legacy language/gender fields if they exist
    delete cleanData.language;
    delete cleanData.gender;

    const docRef = await addDoc(collection(db, ANSWERS_COLLECTION), cleanData);
    return docRef.id;
  } catch (error) {
    console.error('Error creating answer:', error);
    throw error;
  }
}

/**
 * Clean data object - remove undefined values, convert to null where appropriate
 * Firebase doesn't accept undefined - must be null or omitted
 */
function cleanAnswerData(data: Partial<Omit<OnboardingAnswer, 'id' | 'createdAt' | 'updatedAt'>>): Record<string, any> {
  const cleaned: Record<string, any> = {
    updatedAt: serverTimestamp(),
  };

  // Only include defined fields (explicitly check for undefined)
  if (data.questionId !== undefined) cleaned.questionId = data.questionId;
  if (data.order !== undefined) cleaned.order = data.order;
  
  // Handle imageUrl: null or string
  if (data.imageUrl !== undefined) {
    cleaned.imageUrl = data.imageUrl || null;
  }
  
  // Handle nextQuestionId: null is valid for "finish" type, string for "next" type
  // If undefined is passed, we need to determine intent or set null
  if (data.nextQuestionId !== undefined) {
    cleaned.nextQuestionId = data.nextQuestionId || null;
  } else {
    // If not in data, but we're in update mode and need to clear it, set null
    // But we can't know intent here, so we'll handle this in the calling code
  }
  
  // Handle assignedLevelId: null means clear, string means set
  if (data.assignedLevelId !== undefined) {
    cleaned.assignedLevelId = data.assignedLevelId || null;
  }
  
  // Handle assignedProgramId: null means no program, string means program ID
  if (data.assignedProgramId !== undefined) {
    cleaned.assignedProgramId = data.assignedProgramId || null;
  }

  // Handle masterProgramSubLevels: object or null
  if (data.masterProgramSubLevels !== undefined) {
    cleaned.masterProgramSubLevels = data.masterProgramSubLevels || null;
  }

  // Legacy numeric assignedLevel
  if (data.assignedLevel !== undefined) {
    cleaned.assignedLevel = data.assignedLevel || null;
  }

  // Handle assignedResults: array of AnswerResult objects
  if (data.assignedResults !== undefined) {
    if (Array.isArray(data.assignedResults) && data.assignedResults.length > 0) {
      cleaned.assignedResults = data.assignedResults;
    } else {
      // If empty array or undefined, set to null to clear it
      cleaned.assignedResults = null;
    }
  }

  // Handle text: migrate to MultilingualText if needed
  if (data.text !== undefined) {
    if (typeof data.text === 'string') {
      cleaned.text = migrateTextToMultilingual(data.text) || { he: { neutral: data.text } };
    } else {
      cleaned.text = data.text;
    }
  }

  // Remove any undefined values that might have slipped through
  Object.keys(cleaned).forEach(key => {
    if (cleaned[key] === undefined) {
      delete cleaned[key];
    }
  });

  return cleaned;
}

/**
 * Update an answer
 */
export async function updateAnswer(
  answerId: string,
  data: Partial<Omit<OnboardingAnswer, 'id' | 'createdAt' | 'updatedAt'>>
): Promise<void> {
  try {
    const docRef = doc(db, ANSWERS_COLLECTION, answerId);
    const cleanedData = cleanAnswerData(data);
    await updateDoc(docRef, cleanedData);
  } catch (error) {
    console.error('Error updating answer:', error);
    throw error;
  }
}

// ==========================================
// LEVELS / PROGRAMS (Admin pickers)
// ==========================================

export async function getLevels(): Promise<LevelDoc[]> {
  try {
    const q = query(collection(db, LEVELS_COLLECTION), orderBy('order', 'asc'));
    const snapshot = await getDocs(q);
    return snapshot.docs.map((d) => ({
      id: d.id,
      ...(d.data() as any),
    })) as LevelDoc[];
  } catch (error) {
    console.error('Error fetching levels:', error);
    throw error;
  }
}

/**
 * @deprecated Use `getAllPrograms()` from `@/features/content/programs/core/program.service` instead.
 * Kept temporarily for backward-compatibility. Delegates to the canonical service.
 */
export { getAllPrograms as getPrograms } from '@/features/content/programs/core/program.service';

/**
 * Delete an answer
 */
export async function deleteAnswer(answerId: string): Promise<void> {
  try {
    const docRef = doc(db, ANSWERS_COLLECTION, answerId);
    await deleteDoc(docRef);
  } catch (error) {
    console.error('Error deleting answer:', error);
    throw error;
  }
}

// ==========================================
// UTILITY FUNCTIONS
// ==========================================

/**
 * Get all questions with their answers (for admin view)
 * Optionally filtered by language and gender
 */
export async function getAllQuestionsWithAnswers(
  part?: 'assessment' | 'personal',
  language?: 'he' | 'en' | 'ru',
  gender?: 'male' | 'female' | 'neutral'
): Promise<QuestionWithAnswers[]> {
  try {
    const questions = await getAllQuestions(part, language, gender);
    const questionsWithAnswers = await Promise.all(
      questions.map(async (question) => {
        const answers = await getAnswersByQuestionId(question.id, language, gender);
        return {
          ...question,
          answers: answers.sort((a, b) => (a.order || 0) - (b.order || 0)),
        };
      })
    );
    return questionsWithAnswers;
  } catch (error) {
    console.error('Error fetching questions with answers:', error);
    throw error;
  }
}
