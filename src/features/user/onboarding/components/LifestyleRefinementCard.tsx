'use client';

import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { Persona } from '@/features/content/personas';
import { getLocalizedText } from '@/features/content/shared/localized-text.types';
import { Check, ArrowRight } from 'lucide-react';

interface LifestyleRefinementCardProps {
  persona: Persona | null;
  onComplete: (answers: Record<string, any>) => void;
  onSkip?: () => void;
}

/**
 * Lifestyle Refinement Card
 * Shows persona-specific questions for deep dive refinement
 */
export default function LifestyleRefinementCard({
  persona,
  onComplete,
  onSkip,
}: LifestyleRefinementCardProps) {
  const [answers, setAnswers] = useState<Record<string, any>>({});
  const [currentQuestionIndex, setCurrentQuestionIndex] = useState(0);

  if (!persona) {
    return null;
  }

  // Generate questions based on persona's lifestyle tags
  const questions = generateQuestionsForPersona(persona);

  if (questions.length === 0) {
    // No questions for this persona, skip
    return null;
  }

  const currentQuestion = questions[currentQuestionIndex];
  const isLastQuestion = currentQuestionIndex === questions.length - 1;

  const handleAnswer = (value: any) => {
    const newAnswers = {
      ...answers,
      [currentQuestion.id]: value,
    };
    setAnswers(newAnswers);

    if (isLastQuestion) {
      // All questions answered
      setTimeout(() => {
        onComplete(newAnswers);
      }, 300);
    } else {
      // Move to next question
      setTimeout(() => {
        setCurrentQuestionIndex(currentQuestionIndex + 1);
      }, 300);
    }
  };

  const handleSkip = () => {
    if (onSkip) {
      onSkip();
    } else {
      onComplete(answers);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="bg-white rounded-2xl border-2 border-gray-200 p-8 shadow-xl max-w-2xl mx-auto"
      style={{
        borderColor: persona.themeColor,
      }}
      dir="rtl"
    >
      {/* Persona Header */}
      <div className="flex items-center gap-4 mb-6">
        {persona.imageUrl && (
          <div className="w-16 h-16 rounded-full overflow-hidden border-2 border-gray-200 flex-shrink-0">
            <img
              src={persona.imageUrl}
              alt={getLocalizedText(persona.name, 'he')}
              className="w-full h-full object-cover"
            />
          </div>
        )}
        <div>
          <h3 className="text-xl font-black text-gray-900">
            {getLocalizedText(persona.name, 'he')}
          </h3>
          <p className="text-sm text-gray-600">
            שאלה {currentQuestionIndex + 1} מתוך {questions.length}
          </p>
        </div>
      </div>

      {/* Question */}
      <div className="space-y-6">
        <h4 className="text-lg font-bold text-gray-900">
          {currentQuestion.question}
        </h4>

        {/* Options */}
        <div className="space-y-3">
          {currentQuestion.options.map((option) => {
            const isSelected = answers[currentQuestion.id] === option.value;
            return (
              <button
                key={option.value}
                onClick={() => handleAnswer(option.value)}
                className={`w-full p-4 rounded-xl border-2 text-right transition-all ${
                  isSelected
                    ? 'border-cyan-500 bg-cyan-50'
                    : 'border-gray-200 hover:border-gray-300'
                }`}
                style={{
                  borderColor: isSelected ? persona.themeColor : undefined,
                  backgroundColor: isSelected ? `${persona.themeColor}10` : undefined,
                }}
              >
                <div className="flex items-center justify-between">
                  <span className="font-bold text-gray-900">{option.label}</span>
                  {isSelected && (
                    <Check
                      size={20}
                      className="text-cyan-600"
                      style={{ color: persona.themeColor }}
                    />
                  )}
                </div>
              </button>
            );
          })}
        </div>

        {/* Progress Bar */}
        <div className="pt-4">
          <div className="w-full bg-gray-200 rounded-full h-2">
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${((currentQuestionIndex + 1) / questions.length) * 100}%` }}
              transition={{ duration: 0.3 }}
              className="h-2 rounded-full"
              style={{ backgroundColor: persona.themeColor }}
            />
          </div>
        </div>

        {/* Skip Button */}
        {onSkip && (
          <div className="flex justify-center pt-4">
            <button
              onClick={handleSkip}
              className="text-sm text-gray-500 hover:text-gray-700 font-medium"
            >
              דלג
            </button>
          </div>
        )}
      </div>
    </motion.div>
  );
}

/**
 * Generate questions based on persona's lifestyle tags
 */
function generateQuestionsForPersona(persona: Persona): Array<{
  id: string;
  question: string;
  options: Array<{ value: any; label: string }>;
}> {
  const questions: Array<{
    id: string;
    question: string;
    options: Array<{ value: any; label: string }>;
  }> = [];

  // Office Worker Questions
  if (persona.linkedLifestyleTags.includes('office_worker')) {
    questions.push({
      id: 'commute_style',
      question: 'איך אתה מגיע לעבודה?',
      options: [
        { value: 'car', label: 'רכב פרטי' },
        { value: 'bus', label: 'אוטובוס/רכבת' },
        { value: 'bike', label: 'אופניים' },
        { value: 'walk', label: 'הליכה' },
      ],
    });

    questions.push({
      id: 'workout_time_preference',
      question: 'מתי אתה מעדיף להתאמן?',
      options: [
        { value: 'morning', label: 'בוקר (לפני העבודה)' },
        { value: 'lunch', label: 'צהריים (בהפסקת צהריים)' },
        { value: 'evening', label: 'ערב (אחרי העבודה)' },
      ],
    });
  }

  // Student Questions
  if (persona.linkedLifestyleTags.includes('student')) {
    questions.push({
      id: 'study_schedule',
      question: 'כמה ימים בשבוע אתה לומד?',
      options: [
        { value: '1-2', label: '1-2 ימים' },
        { value: '3-4', label: '3-4 ימים' },
        { value: '5+', label: '5+ ימים' },
      ],
    });
  }

  // Parent Questions
  if (persona.linkedLifestyleTags.includes('parent')) {
    questions.push({
      id: 'kids_activity',
      question: 'האם הילדים שלך פעילים?',
      options: [
        { value: 'very_active', label: 'כן, מאוד פעילים' },
        { value: 'moderate', label: 'פעילות בינונית' },
        { value: 'not_active', label: 'לא מאוד פעילים' },
      ],
    });
  }

  // Remote Worker Questions
  if (persona.linkedLifestyleTags.includes('remote_worker')) {
    questions.push({
      id: 'home_workout_space',
      question: 'יש לך מקום בבית לאימונים?',
      options: [
        { value: 'dedicated_room', label: 'חדר ייעודי' },
        { value: 'living_room', label: 'סלון/חדר מגורים' },
        { value: 'small_space', label: 'מקום קטן בלבד' },
      ],
    });
  }

  return questions;
}
