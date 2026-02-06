"use client";

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import { QuestionnaireNode, OnboardingAnswers } from '../types';
import { getTranslation, DictionaryKey } from '@/lib/i18n/dictionaries';
import { useAppStore } from '@/store/useAppStore';
import ChoiceCard from './ChoiceCard';
import DatePicker from './DatePicker';
import MultiDaySelector from './MultiDaySelector';
import SimpleSelection from './SimpleSelection';
import TextInput from './TextInput';
import EquipmentSelector from './EquipmentSelector';
import TermsOfUse from './TermsOfUse';
import HealthDeclaration from './HealthDeclaration';
import BlockingErrorModal from './BlockingErrorModal';
import LoaderScreen from './LoaderScreen';
import HealthDeclarationStep from './HealthDeclarationStep';
import SaveProgressStep from './SaveProgressStep';

interface QuestionRendererProps {
  node: QuestionnaireNode;
  answers: OnboardingAnswers;
  onAnswer: (questionId: string, value: any, optionId?: string) => void;
  onNext: () => void; // פונקציה למעבר לשלב הבא בתוך השאלון
  currentStep?: number;
  totalSteps?: number;
  onComplete?: () => void; // פונקציה לסיום סופי ומעבר לדף הבית
}

export default function QuestionRenderer({
  node,
  answers,
  onAnswer,
  onNext,
  currentStep = 0,
  totalSteps = 1,
  onComplete,
}: QuestionRendererProps) {
  const router = useRouter();
  const { language } = useAppStore();

  const title = getTranslation(node.titleKey as DictionaryKey, language);
  const subtitle = node.subtitleKey
    ? getTranslation(node.subtitleKey as DictionaryKey, language)
    : null;
  const description = node.descriptionKey
    ? getTranslation(node.descriptionKey as DictionaryKey, language)
    : null;

  const currentValue = answers[node.id];

  const handleAnswer = (value: any, optionId?: string) => {
    onAnswer(node.id, value, optionId);
  };

  const handleMultiDayChange = (days: string[]) => {
    onAnswer(node.id, days);
  };

  const [signatureData, setSignatureData] = useState<string | null>(null);
  const [showBlockingModal, setShowBlockingModal] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // ==========================================
  // Render לפי סוג התצוגה
  // ==========================================
  switch (node.viewType) {
    case 'info_screen':
      return (
        <div className="w-full text-center space-y-4">
          <h1 className="text-3xl font-bold text-gray-900">{title}</h1>
          {subtitle && (
            <p className="text-lg text-gray-600 leading-relaxed">{subtitle}</p>
          )}
        </div>
      );

    case 'text_input':
      return (
        <div className="w-full space-y-4">
          {subtitle && (
            <h2 className="text-xl font-semibold text-gray-900">{subtitle}</h2>
          )}
          <TextInput
            value={currentValue || ''}
            onChange={handleAnswer}
            placeholderKey={node.subtitleKey as DictionaryKey}
            type={node.id === 'phone' ? 'tel' : 'text'}
            maxLength={node.validation?.maxLength}
          />
        </div>
      );

    case 'date_picker':
      return (
        <div className="w-full space-y-4">
          <h2 className="text-xl font-semibold text-gray-900 text-center">{title}</h2>
          <DatePicker
            value={currentValue}
            onChange={handleAnswer}
            minAge={node.validation?.minAge}
            descriptionKey={node.descriptionKey as DictionaryKey}
          />
        </div>
      );

    case 'simple_selection':
      if (!node.options) return null;
      return (
        <div className="w-full space-y-4">
          <h2 className="text-xl font-semibold text-gray-900 text-center">{title}</h2>
          {subtitle && (
            <p className="text-sm text-gray-600 text-center">{subtitle}</p>
          )}
          <SimpleSelection
            options={node.options}
            value={currentValue}
            onChange={handleAnswer}
            columns={node.id === 'schedule_frequency' ? 7 : 1}
          />
        </div>
      );

    case 'cards_with_image':
      if (!node.options) return null;
      return (
        <div className="w-full space-y-4">
          <h2 className="text-2xl font-bold text-gray-900 text-center">{title}</h2>
          {subtitle && (
            <p className="text-base text-gray-600 text-center mb-2">{subtitle}</p>
          )}
          <div className="grid grid-cols-1 gap-4">
            {node.options.map((option) => {
              const optionLabel = getTranslation(option.labelKey as DictionaryKey, language);
              const optionDescription = option.labelKey.includes('description')
                ? getTranslation(option.labelKey.replace('.title', '.description') as DictionaryKey, language)
                : undefined;

              return (
                <ChoiceCard
                  key={option.id}
                  id={option.id}
                  labelKey={option.labelKey as DictionaryKey}
                  imageRes={option.imageRes}
                  isSelected={currentValue === option.value}
                  onClick={() => handleAnswer(option.value, option.id)}
                  descriptionKey={optionDescription as DictionaryKey | undefined}
                />
              );
            })}
          </div>
        </div>
      );

    case 'multi_day_selector':
      return (
        <div className="w-full space-y-4">
          <h2 className="text-xl font-semibold text-gray-900 text-center">{title}</h2>
          {description && (
            <p className="text-sm text-gray-600 text-center mb-2">{description}</p>
          )}
          <MultiDaySelector
            value={currentValue || []}
            onChange={handleMultiDayChange}
            maxSelections={answers.schedule_frequency}
          />
        </div>
      );

    case 'time_picker':
      const timeOptions = [
        { id: 'morning', labelKey: 'Morning (06:00 - 12:00)', value: 'morning', nextStepId: '' },
        { id: 'afternoon', labelKey: 'Afternoon (12:00 - 17:00)', value: 'afternoon', nextStepId: '' },
        { id: 'evening', labelKey: 'Evening (17:00 - 23:00)', value: 'evening', nextStepId: '' },
      ];

      return (
        <div className="w-full space-y-4">
          <h2 className="text-xl font-semibold text-gray-900 text-center">{title}</h2>
          {subtitle && <p className="text-sm text-gray-600 text-center mb-4">{subtitle}</p>}
          <SimpleSelection
            options={timeOptions}
            value={currentValue}
            onChange={handleAnswer}
            columns={1}
          />
        </div>
      );

    case 'equipment_selector':
      const handleEquipmentChange = (equipmentValue: { category: 'none' | 'home' | 'gym'; items?: string[] }) => {
        onAnswer(node.id, equipmentValue);
      };

      return (
        <div className="w-full space-y-4">
          <div className="flex items-center justify-center gap-2">
            <h2 className="text-xl font-semibold text-gray-900">{title}</h2>
          </div>
          <EquipmentSelector
            value={currentValue}
            onChange={handleEquipmentChange}
          />
        </div>
      );

    case 'terms_of_use':
      return (
        <TermsOfUse
          onApprove={() => handleAnswer(true)}
          onBack={() => { }}
          currentStep={currentStep}
          totalSteps={totalSteps}
        />
      );

    case 'boolean_toggle':
      const handleHealthChange = (newAnswers: Record<string, boolean>) => {
        onAnswer(node.id, newAnswers);
      };

      const onApprove = () => {
        const currentAnswers = answers[node.id] as Record<string, boolean> || {};
        const hasMedicalIssue = Object.values(currentAnswers).some(val => val === true);

        if (hasMedicalIssue) {
          setShowBlockingModal(true);
          return;
        }

        if (!signatureData) {
          alert("חובה לחתום בכתב יד בתחתית המסך");
          return;
        }

        setIsSubmitting(true);
      };

      if (isSubmitting) {
        // LoaderScreen כאן יעבור לשלב הבא (Summary)
        return <LoaderScreen onComplete={() => onNext()} />;
      }

      return (
        <div className="w-full h-full flex flex-col relative">
          <div className="shrink-0 mb-4 px-1 text-center">
            <h2 className="text-xl font-bold text-gray-900">{title}</h2>
            {subtitle && <p className="text-gray-500 text-sm mt-1">{subtitle}</p>}
          </div>

          <HealthDeclaration
            value={answers[node.id] as Record<string, boolean>}
            onChange={handleHealthChange}
            isSigned={!!signatureData}
            onSignatureChange={setSignatureData}
          />

          <div className="mt-4 shrink-0">
            <button
              onClick={onApprove}
              className="w-full bg-[#4FB4F7] hover:bg-blue-400 text-white font-bold py-4 rounded-2xl shadow-sm text-lg transition-colors"
            >
              מאשר.ת
            </button>
          </div>

          <BlockingErrorModal isOpen={showBlockingModal} onBack={() => setShowBlockingModal(false)} />
        </div>
      );

    case 'health_declaration_strict':
      return (
        <HealthDeclarationStep
          title={title}
          description={description || undefined}
          onContinue={handleAnswer}
        />
      );

    // --- שלבים חדשים שהוספנו לזרימה ---
    case 'summary_reveal':
      return (
        <div className="w-full text-center space-y-6 py-10">
          <div className="text-6xl mb-4">🏆</div>
          <h1 className="text-3xl font-black text-gray-900">{title}</h1>
          <p className="text-lg text-gray-600 leading-relaxed px-4">{subtitle}</p>
          <div className="bg-blue-50 p-8 rounded-2xl border border-blue-100/80">
            <span className="text-blue-500 font-bold text-sm uppercase">הרמה ההתחלתית שלך</span>
            <h2 className="text-5xl font-black text-gray-900 mt-2">רמה 5</h2>
          </div>
          <button
            onClick={() => onNext()}
            className="w-full bg-[#4FB4F7] text-white font-bold py-4 rounded-2xl shadow-lg mt-6"
          >
            מדהים, בואו נמשיך
          </button>
        </div>
      );

    case 'save_progress':
      return (
        <SaveProgressStep
          title={title}
          subtitle={subtitle || undefined}
          onSave={() => onNext()}
        />
      );

    case 'phone_input':
      return (
        <div className="w-full space-y-6">
          <div className="text-center">
            <h2 className="text-2xl font-bold text-gray-900">{title}</h2>
            {subtitle && <p className="text-gray-600 mt-2">{subtitle}</p>}
          </div>
          <TextInput
            value={currentValue || ''}
            onChange={handleAnswer}
            type="tel"
            placeholderKey={"הכנס מספר טלפון" as any}
            maxLength={10}
          />
          <p className="text-[11px] text-gray-400 text-center px-4">
            לצורך אבטחה, נשלח אליך קוד אימות ב-SMS
          </p>
        </div>
      );

    case 'otp_input':
      return (
        <div className="w-full space-y-6">
          <h2 className="text-2xl font-bold text-gray-900 text-center">{title}</h2>
          <TextInput
            value={currentValue || ''}
            onChange={handleAnswer}
            type="tel"
            placeholderKey={"4 ספרות שקיבלת" as any}
            maxLength={4}
          />
        </div>
      );

    case 'loader':
      return (
        <LoaderScreen
          onComplete={() => {
            handleAnswer(true);
            setTimeout(() => onNext(), 150);
          }}
        />
      );

    default:
      return (
        <div className="w-full text-center">
          <p className="text-gray-500">סוג תצוגה לא נתמך: {node.viewType}</p>
        </div>
      );
  }
}