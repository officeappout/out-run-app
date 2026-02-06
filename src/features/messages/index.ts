/**
 * Messages Feature Module
 * 
 * Smart contextual messaging system for the app.
 * 
 * Usage (Admin):
 *   import { messageService } from '@/features/messages';
 *   await messageService.createMessage({ type: 'post_workout', text: '...', ... });
 * 
 * Usage (App - React):
 *   import { useSmartGreeting, SmartGreeting } from '@/features/messages';
 *   const { message, isLoading } = useSmartGreeting();
 *   // or
 *   <SmartGreeting userName="יוסי" variant="hero" context={{ streak: 5 }} />
 * 
 * Dynamic Variables in text:
 *   {name} - User's display name
 *   {streak} - Current workout streak
 *   {level} - User's current level
 *   {program} - Active program name
 */

// Service
export {
  messageService,
  MESSAGE_TYPE_LABELS,
  DEFAULT_MESSAGES,
  type MessageType,
  type SmartMessage,
  type SmartMessageInput,
  type MessageContext,
} from './services/MessageService';

// Hooks
export { 
  useSmartGreeting,
  useSmartMessage,
  type GreetingContext,
  type SmartGreetingResult,
} from './hooks/useSmartGreeting';

// Components
export { 
  SmartGreeting,
  SmartGreetingText,
} from './components/SmartGreeting';

// Re-export core constants for convenience
export { 
  USER_LIFESTYLES,
  MESSAGE_VARIABLES,
  replaceMessageVariables,
  type LifestyleId,
} from '@/core/constants';
