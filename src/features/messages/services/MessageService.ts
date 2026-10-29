/**
 * MessageService - Smart Messaging Data Service
 * 
 * Provides CRUD operations for Smart Messages with dual storage:
 * - localStorage for instant app-wide sync (primary for app reading)
 * - Firestore for persistence and admin panel (secondary)
 * 
 * Message Types:
 * - post_workout: Shown after completing a workout
 * - partial_workout: Shown when user quits early
 * - re_engagement: Shown when user returns after inactivity
 * - pr_record: Shown when user sets a personal record
 * - default: Fallback messages
 */

import { 
  collection, 
  doc, 
  getDocs, 
  getDoc,
  addDoc, 
  updateDoc, 
  deleteDoc, 
  query, 
  where, 
  orderBy,
  onSnapshot,
  Timestamp,
  serverTimestamp,
} from 'firebase/firestore';
import { db } from '@/lib/firebase';
import type { NamespaceKey } from '@/lib/i18n/catalogs';
import { SOURCE_LOCALE } from '@/lib/i18n/locales';
import { makeT, type TFunction } from '@/lib/i18n/t';
import { social } from '@/messages/ns/social';
import type { LocalizedText } from '@/features/content/shared/localized-text.types';
import {
  foldLocalizedFieldsForWrite,
  normalizeStoredTextFields,
  type LocalizedFieldPair,
} from '@/features/content/shared/stored-text-fields';

type SocialT = TFunction<NamespaceKey<typeof social>>;

// ============================================================================
// LOCAL STORAGE CONFIG
// ============================================================================

const STORAGE_KEY = 'out_smart_messages';

/** Check if we're in browser environment */
const isBrowser = typeof window !== 'undefined';

// ============================================================================
// TYPES
// ============================================================================

export type MessageType = 
  | 'post_workout' 
  | 'partial_workout' 
  | 're_engagement' 
  | 'pr_record' 
  | 'streak_milestone'
  | 'level_up'
  | 'first_workout'
  | 'community_session'
  | 'missed_workout'
  | 'default';

export interface SmartMessage {
  id: string;
  type: MessageType;
  /** The main heading text (Hebrew). Firestore may hold {he,en}: reads normalize it to the Hebrew string, the pair rides in textLocalized. */
  text: string;
  textLocalized?: LocalizedText;
  /** The smaller subtitle text (Hebrew); English in subTextLocalized. */
  subText?: string;
  subTextLocalized?: LocalizedText;
  /** Priority for selection (1-10, higher = more likely) */
  priority: number;
  /** Whether this message is currently active */
  isActive: boolean;
  /** Optional: specific persona this message targets */
  targetPersona?: string;
  /** Optional: grammatical gender of the copy (male/female variants instead of slashes).
   *  Unset = neutral, shown to everyone. A user of unknown / "other" gender sees only
   *  neutral rows (owner decision 21.10.2026: other = neutral, never the male form). */
  targetGender?: 'male' | 'female';
  /** Optional: minimum streak to show this message */
  minStreak?: number;
  /** Optional: maximum streak to show this message */
  maxStreak?: number;
  /** Timestamp when created */
  createdAt?: Timestamp;
  /** Timestamp when last updated */
  updatedAt?: Timestamp;
}

export interface SmartMessageInput {
  type: MessageType;
  text: string;
  textLocalized?: LocalizedText;
  subText?: string;
  subTextLocalized?: LocalizedText;
  priority: number;
  isActive: boolean;
  targetPersona?: string;
  targetGender?: 'male' | 'female';
  minStreak?: number;
  maxStreak?: number;
}

export interface MessageContext {
  type: MessageType;
  /** User's primary persona (single) */
  persona?: string;
  /** User's lifestyle tags (multiple) - messages matching ANY of these OR 'general' will be shown */
  lifestyles?: string[];
  streak?: number;
  isPersonalRecord?: boolean;
  daysInactive?: number;
  /** User's current level */
  level?: number;
  /** User's active program name */
  program?: string;
  /** User's gender — picks the male/female variant of gendered copy. */
  gender?: 'male' | 'female' | 'other';
}

/** Gendered copy: neutral rows fit everyone; a male / female row only that gender.
 *  Unknown / 'other' gender → neutral rows only (decision 21.10.2026, src/lib/i18n/gender-copy.ts). */
export function messageMatchesGender(msg: Pick<SmartMessage, 'targetGender'>, gender?: MessageContext['gender']): boolean {
  if (!msg.targetGender) return true;
  return msg.targetGender === gender;
}

function pickDefault(type: MessageType, gender?: MessageContext['gender']): SmartMessage {
  const all = DEFAULT_MESSAGES[type] || DEFAULT_MESSAGES.default;
  const defaults = all.filter((m) => messageMatchesGender(m, gender));
  const pool = defaults.length > 0 ? defaults : all;
  return pool[Math.floor(Math.random() * pool.length)];
}

// ============================================================================
// CONSTANTS
// ============================================================================

const COLLECTION_NAME = 'smart_messages';

const MESSAGE_TEXT_FIELDS: LocalizedFieldPair[] = [
  { key: 'text', localizedKey: 'textLocalized' },
  { key: 'subText', localizedKey: 'subTextLocalized' },
];

/** Firestore doc -> app message: `text` / `subText` stay Hebrew strings even when the doc holds {he,en}. */
export function normalizeSmartMessage<T extends object>(data: T): T {
  return normalizeStoredTextFields(data, MESSAGE_TEXT_FIELDS);
}

/** Message type labels in Hebrew */
export const MESSAGE_TYPE_LABELS: Record<MessageType, string> = {
  post_workout: 'אחרי אימון', // i18n-allow-hebrew: admin screen label (Hebrew only)
  partial_workout: 'אימון חלקי', // i18n-allow-hebrew: admin screen label (Hebrew only)
  re_engagement: 'חזרה לפעילות', // i18n-allow-hebrew: admin screen label (Hebrew only)
  pr_record: 'שיא אישי', // i18n-allow-hebrew: admin screen label (Hebrew only)
  streak_milestone: 'אבן דרך ברצף', // i18n-allow-hebrew: admin screen label (Hebrew only)
  level_up: 'עליית רמה', // i18n-allow-hebrew: admin screen label (Hebrew only)
  first_workout: 'אימון ראשון', // i18n-allow-hebrew: admin screen label (Hebrew only)
  community_session: 'מפגשים', // i18n-allow-hebrew: admin screen label (Hebrew only)
  missed_workout: 'פספוס אימון', // i18n-allow-hebrew: admin screen label (Hebrew only)
  default: 'ברירת מחדל', // i18n-allow-hebrew: admin screen label (Hebrew only)
};

/**
 * Default messages for each type (fallback when no messages in DB), from the `social` catalog (`defaults.<id>.text|sub`).
 * `t` defaults to Hebrew; `seedDefaultMessages` writes whatever this returns, so it stays Hebrew.
 */
export function buildDefaultMessages(t: SocialT = makeT(SOURCE_LOCALE, social)): Record<MessageType, SmartMessage[]> {
  return {
    post_workout: [
      { id: 'default-pw-1', type: 'post_workout', text: t('defaults.default-pw-1.text'), subText: t('defaults.default-pw-1.sub'), priority: 5, isActive: true },
      { id: 'default-pw-2', type: 'post_workout', text: t('defaults.default-pw-2.text'), subText: t('defaults.default-pw-2.sub'), priority: 5, isActive: true },
      // Personal praise stays gendered; no "חיה" (owner decisions 6 + 9, 21.10.2026).
      { id: 'default-pw-3', type: 'post_workout', text: t('defaults.default-pw-3.text'), subText: t('defaults.default-pw-3.sub'), priority: 5, isActive: true, targetGender: 'male' },
      { id: 'default-pw-3f', type: 'post_workout', text: t('defaults.default-pw-3f.text'), subText: t('defaults.default-pw-3f.sub'), priority: 5, isActive: true, targetGender: 'female' },
      { id: 'default-pw-4', type: 'post_workout', text: t('defaults.default-pw-4.text'), subText: t('defaults.default-pw-4.sub'), priority: 5, isActive: true },
      { id: 'default-pw-5', type: 'post_workout', text: t('defaults.default-pw-5.text'), subText: t('defaults.default-pw-5.sub'), priority: 5, isActive: true, targetGender: 'male' },
      { id: 'default-pw-5f', type: 'post_workout', text: t('defaults.default-pw-5f.text'), subText: t('defaults.default-pw-5f.sub'), priority: 5, isActive: true, targetGender: 'female' },
    ],
    partial_workout: [
      { id: 'default-part-1', type: 'partial_workout', text: t('defaults.default-part-1.text'), subText: t('defaults.default-part-1.sub'), priority: 5, isActive: true },
      { id: 'default-part-2', type: 'partial_workout', text: t('defaults.default-part-2.text'), subText: t('defaults.default-part-2.sub'), priority: 5, isActive: true },
      { id: 'default-part-3', type: 'partial_workout', text: t('defaults.default-part-3.text'), subText: t('defaults.default-part-3.sub'), priority: 4, isActive: true },
    ],
    // Calm return copy (18.10.2026): warm and short, no day counts, no "where were you".
    re_engagement: [
      { id: 'default-re-1', type: 're_engagement', text: t('defaults.default-re-1.text'), subText: t('defaults.default-re-1.sub'), priority: 5, isActive: true, targetGender: 'male' },
      { id: 'default-re-1f', type: 're_engagement', text: t('defaults.default-re-1f.text'), subText: t('defaults.default-re-1f.sub'), priority: 5, isActive: true, targetGender: 'female' },
      { id: 'default-re-2', type: 're_engagement', text: t('defaults.default-re-2.text'), subText: t('defaults.default-re-2.sub'), priority: 5, isActive: true, targetGender: 'male' },
      { id: 'default-re-2f', type: 're_engagement', text: t('defaults.default-re-2f.text'), subText: t('defaults.default-re-2f.sub'), priority: 5, isActive: true, targetGender: 'female' },
      { id: 'default-re-3', type: 're_engagement', text: t('defaults.default-re-3.text'), subText: t('defaults.default-re-3.sub'), priority: 6, isActive: true },
      { id: 'default-re-4', type: 're_engagement', text: t('defaults.default-re-4.text'), subText: t('defaults.default-re-4.sub'), priority: 4, isActive: true },
    ],
    pr_record: [
      { id: 'default-pr-1', type: 'pr_record', text: t('defaults.default-pr-1.text'), subText: t('defaults.default-pr-1.sub'), priority: 10, isActive: true },
      { id: 'default-pr-2', type: 'pr_record', text: t('defaults.default-pr-2.text'), subText: t('defaults.default-pr-2.sub'), priority: 10, isActive: true },
      { id: 'default-pr-3', type: 'pr_record', text: t('defaults.default-pr-3.text'), subText: t('defaults.default-pr-3.sub'), priority: 10, isActive: true },
    ],
    streak_milestone: [
      { id: 'default-sm-1', type: 'streak_milestone', text: t('defaults.default-sm-1.text'), subText: t('defaults.default-sm-1.sub'), priority: 8, isActive: true },
      { id: 'default-sm-2', type: 'streak_milestone', text: t('defaults.default-sm-2.text'), subText: t('defaults.default-sm-2.sub'), priority: 8, isActive: true },
    ],
    level_up: [
      { id: 'default-lu-1', type: 'level_up', text: t('defaults.default-lu-1.text'), subText: t('defaults.default-lu-1.sub'), priority: 10, isActive: true },
      { id: 'default-lu-2', type: 'level_up', text: t('defaults.default-lu-2.text'), subText: t('defaults.default-lu-2.sub'), priority: 10, isActive: true },
    ],
    first_workout: [
      { id: 'default-fw-1', type: 'first_workout', text: t('defaults.default-fw-1.text'), subText: t('defaults.default-fw-1.sub'), priority: 10, isActive: true },
      { id: 'default-fw-2', type: 'first_workout', text: t('defaults.default-fw-2.text'), subText: t('defaults.default-fw-2.sub'), priority: 10, isActive: true },
    ],
    community_session: [
      { id: 'default-cs-1', type: 'community_session', text: t('defaults.default-cs-1.text'), subText: t('defaults.default-cs-1.sub'), priority: 8, isActive: true },
      { id: 'default-cs-2', type: 'community_session', text: t('defaults.default-cs-2.text'), subText: t('defaults.default-cs-2.sub'), priority: 7, isActive: true },
      { id: 'default-cs-3', type: 'community_session', text: t('defaults.default-cs-3.text'), subText: t('defaults.default-cs-3.sub'), priority: 6, isActive: true },
    ],
    missed_workout: [
      { id: 'default-mw-1', type: 'missed_workout', text: t('defaults.default-mw-1.text'), subText: t('defaults.default-mw-1.sub'), priority: 7, isActive: true },
      { id: 'default-mw-2', type: 'missed_workout', text: t('defaults.default-mw-2.text'), subText: t('defaults.default-mw-2.sub'), priority: 6, isActive: true },
    ],
    default: [
      { id: 'default-def-1', type: 'default', text: t('defaults.default-def-1.text'), subText: t('defaults.default-def-1.sub'), priority: 5, isActive: true },
      { id: 'default-def-2', type: 'default', text: t('defaults.default-def-2.text'), subText: t('defaults.default-def-2.sub'), priority: 5, isActive: true },
      { id: 'default-def-3', type: 'default', text: t('defaults.default-def-3.text'), subText: t('defaults.default-def-3.sub'), priority: 4, isActive: true },
    ],
  };
}

export const DEFAULT_MESSAGES: Record<MessageType, SmartMessage[]> = buildDefaultMessages();

// ============================================================================
// INITIAL SEED DATA (Hebrew)
// ============================================================================

const INITIAL_SEED_DATA: SmartMessage[] = [
  // Post Workout
  { id: 'seed-pw-1', type: 'post_workout', text: 'סחטיין!', subText: 'אימון מעולה', priority: 8, isActive: true }, // i18n-allow-hebrew: seed data written to Firestore / localStorage
  { id: 'seed-pw-2', type: 'post_workout', text: 'איזה מכונה!', subText: 'עכשיו מגיע לך מנוחה', priority: 7, isActive: true }, // i18n-allow-hebrew: seed data written to Firestore / localStorage
  { id: 'seed-pw-3', type: 'post_workout', text: 'עבודה טובה!', subText: 'כל אימון מקרב אותך למטרה', priority: 6, isActive: true }, // i18n-allow-hebrew: seed data written to Firestore / localStorage
  
  // Partial Workout
  { id: 'seed-part-1', type: 'partial_workout', text: 'לפחות התחלת!', subText: 'זה יותר מרוב האנשים', priority: 6, isActive: true }, // i18n-allow-hebrew: seed data written to Firestore / localStorage
  { id: 'seed-part-2', type: 'partial_workout', text: 'חצי אימון', subText: 'עדיף מאפס אימונים', priority: 5, isActive: true }, // i18n-allow-hebrew: seed data written to Firestore / localStorage
  
  // Re-engagement
  { id: 'seed-re-1', type: 're_engagement', text: 'טוב לראות אותך', subText: 'בוא נזוז קצת', priority: 7, isActive: true, targetGender: 'male' }, // i18n-allow-hebrew: seed data written to Firestore / localStorage
  { id: 'seed-re-1f', type: 're_engagement', text: 'טוב לראות אותך', subText: 'בואי נזוז קצת', priority: 7, isActive: true, targetGender: 'female' }, // i18n-allow-hebrew: seed data written to Firestore / localStorage
  { id: 'seed-re-2', type: 're_engagement', text: 'הופה!', subText: 'אימון קליל להיום?', priority: 6, isActive: true }, // i18n-allow-hebrew: seed data written to Firestore / localStorage
  
  // PR Record
  { id: 'seed-pr-1', type: 'pr_record', text: 'שיא חדש!', subText: 'עוד שיא אישי. ככה בונים כוח', priority: 10, isActive: true }, // i18n-allow-hebrew: seed data written to Firestore / localStorage
  
  // Default
  { id: 'seed-def-1', type: 'default', text: 'יאללה!', subText: 'בוא נתחיל', priority: 5, isActive: true }, // i18n-allow-hebrew: seed data written to Firestore / localStorage
  { id: 'seed-def-2', type: 'default', text: 'מה נשמע?', subText: 'מוכן לעוד יום טוב?', priority: 4, isActive: true }, // i18n-allow-hebrew: seed data written to Firestore / localStorage
];

// ============================================================================
// SERVICE CLASS
// ============================================================================

class MessageService {
  private collectionRef = collection(db, COLLECTION_NAME);
  private localListeners: Set<(messages: SmartMessage[]) => void> = new Set();

  // --------------------------------------------------------------------------
  // LOCAL STORAGE OPERATIONS (Primary for App Reading)
  // --------------------------------------------------------------------------

  /**
   * Get messages from localStorage (for app-side reading)
   */
  getMessagesFromLocal(): SmartMessage[] {
    if (!isBrowser) return [];
    
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (!stored) {
        // Seed with initial data
        this.saveMessagesToLocal(INITIAL_SEED_DATA);
        return INITIAL_SEED_DATA;
      }
      return (JSON.parse(stored) as SmartMessage[]).map((m) => normalizeSmartMessage(m));
    } catch (error) {
      console.error('[MessageService] Error reading from localStorage:', error);
      return [];
    }
  }

  /**
   * Save messages to localStorage (syncs admin changes to app)
   */
  private saveMessagesToLocal(messages: SmartMessage[]): void {
    if (!isBrowser) return;
    
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(messages));
      // Notify all local listeners
      this.localListeners.forEach(cb => cb(messages));
    } catch (error) {
      console.error('[MessageService] Error writing to localStorage:', error);
    }
  }

  /**
   * Subscribe to local storage changes (for app components)
   */
  subscribeToLocalMessages(callback: (messages: SmartMessage[]) => void): () => void {
    this.localListeners.add(callback);
    
    // Immediately call with current data
    callback(this.getMessagesFromLocal());
    
    // Also listen to storage events from other tabs
    const storageHandler = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY && e.newValue) {
        try {
          callback((JSON.parse(e.newValue) as SmartMessage[]).map((m) => normalizeSmartMessage(m)));
        } catch { /* ignore parse errors */ }
      }
    };
    
    if (isBrowser) {
      window.addEventListener('storage', storageHandler);
    }
    
    return () => {
      this.localListeners.delete(callback);
      if (isBrowser) {
        window.removeEventListener('storage', storageHandler);
      }
    };
  }

  /**
   * Get messages by type from localStorage (for app)
   */
  getLocalMessagesByType(type: MessageType): SmartMessage[] {
    const all = this.getMessagesFromLocal();
    const filtered = all.filter(m => m.type === type && m.isActive);
    
    if (filtered.length === 0) {
      return DEFAULT_MESSAGES[type] || DEFAULT_MESSAGES.default;
    }
    
    return filtered.sort((a, b) => b.priority - a.priority);
  }

  /**
   * Get best message from local storage based on context
   * 
   * Filtering logic:
   * 1. If message has targetPersona, check if user's persona or lifestyles match
   * 2. Messages with 'general' targetPersona always match
   * 3. Messages without targetPersona match everyone
   * 4. Filter by streak range
   * 5. Select highest priority message (or weighted random)
   */
  getLocalBestMessage(context: MessageContext): SmartMessage {
    const messages = this.getLocalMessagesByType(context.type);
    
    // Build user's lifestyle list (combine persona + lifestyles)
    const userLifestyles = new Set<string>();
    if (context.persona) userLifestyles.add(context.persona);
    if (context.lifestyles) context.lifestyles.forEach(l => userLifestyles.add(l));
    
    // Filter by context constraints
    const filtered = messages.filter(msg => {
      if (!messageMatchesGender(msg, context.gender)) return false;
      // Lifestyle/Persona filtering
      if (msg.targetPersona) {
        // 'general' always matches
        if (msg.targetPersona === 'general') {
          // passes
        }
        // Check if user has matching lifestyle
        else if (userLifestyles.size > 0) {
          if (!userLifestyles.has(msg.targetPersona)) {
            return false;
          }
        }
        // No user lifestyles set - skip targeted messages
        else {
          return false;
        }
      }
      
      // Streak range filtering
      if (context.streak !== undefined) {
        if (msg.minStreak && context.streak < msg.minStreak) return false;
        if (msg.maxStreak && context.streak > msg.maxStreak) return false;
      }
      
      return true;
    });
    
    if (filtered.length === 0) {
      // Fallback: try messages without targetPersona
      const untargeted = messages.filter(m => !m.targetPersona && messageMatchesGender(m, context.gender));
      if (untargeted.length > 0) {
        return this.selectByPriority(untargeted);
      }
      
      // Final fallback: default messages
      return pickDefault(context.type, context.gender);
    }
    
    return this.selectByPriority(filtered);
  }

  /**
   * Select message by priority (weighted random or highest)
   */
  private selectByPriority(messages: SmartMessage[]): SmartMessage {
    // Sort by priority descending
    const sorted = [...messages].sort((a, b) => b.priority - a.priority);
    
    // If highest priority is 10, always use it
    if (sorted[0].priority === 10) {
      return sorted[0];
    }
    
    // Weighted random selection
    const totalWeight = sorted.reduce((sum, msg) => sum + msg.priority, 0);
    let random = Math.random() * totalWeight;
    
    for (const msg of sorted) {
      random -= msg.priority;
      if (random <= 0) return msg;
    }
    
    return sorted[0];
  }

  /**
   * Sync localStorage with Firestore (admin uses this)
   */
  private syncToLocal(): void {
    this.getAllMessages().then(messages => {
      if (messages.length > 0) {
        this.saveMessagesToLocal(messages);
      }
    });
  }

  // --------------------------------------------------------------------------
  // READ OPERATIONS
  // --------------------------------------------------------------------------

  /**
   * Get all messages (for admin panel)
   */
  async getAllMessages(): Promise<SmartMessage[]> {
    try {
      const q = query(this.collectionRef, orderBy('type'), orderBy('priority', 'desc'));
      const snapshot = await getDocs(q);
      return snapshot.docs.map(doc => normalizeSmartMessage({
        id: doc.id,
        ...doc.data(),
      }) as SmartMessage);
    } catch (error) {
      console.error('[MessageService] Error fetching all messages:', error);
      return [];
    }
  }

  /**
   * Get messages by type
   */
  async getMessagesByType(type: MessageType): Promise<SmartMessage[]> {
    try {
      const q = query(
        this.collectionRef, 
        where('type', '==', type),
        where('isActive', '==', true),
        orderBy('priority', 'desc')
      );
      const snapshot = await getDocs(q);
      const messages = snapshot.docs.map(doc => normalizeSmartMessage({
        id: doc.id,
        ...doc.data(),
      }) as SmartMessage);
      
      // Return defaults if no messages found
      if (messages.length === 0) {
        return DEFAULT_MESSAGES[type] || DEFAULT_MESSAGES.default;
      }
      
      return messages;
    } catch (error) {
      console.error('[MessageService] Error fetching messages by type:', error);
      return DEFAULT_MESSAGES[type] || DEFAULT_MESSAGES.default;
    }
  }

  /**
   * Get a single message by ID
   */
  async getMessageById(id: string): Promise<SmartMessage | null> {
    try {
      const docRef = doc(this.collectionRef, id);
      const snapshot = await getDoc(docRef);
      
      if (!snapshot.exists()) {
        return null;
      }
      
      return normalizeSmartMessage({
        id: snapshot.id,
        ...snapshot.data(),
      }) as SmartMessage;
    } catch (error) {
      console.error('[MessageService] Error fetching message by ID:', error);
      return null;
    }
  }

  /**
   * Get the best message for a given context
   * Uses priority and context matching to select
   */
  async getBestMessage(context: MessageContext): Promise<SmartMessage> {
    const messages = await this.getMessagesByType(context.type);
    
    // Filter by context constraints
    const filtered = messages.filter(msg => {
      if (!messageMatchesGender(msg, context.gender)) return false;
      // Check persona match
      if (msg.targetPersona && context.persona && msg.targetPersona !== context.persona) {
        return false;
      }
      
      // Check streak range
      if (context.streak !== undefined) {
        if (msg.minStreak && context.streak < msg.minStreak) return false;
        if (msg.maxStreak && context.streak > msg.maxStreak) return false;
      }
      
      return true;
    });
    
    // Select randomly weighted by priority
    if (filtered.length === 0) {
      return pickDefault(context.type, context.gender);
    }
    
    // Weighted random selection based on priority
    const totalWeight = filtered.reduce((sum, msg) => sum + msg.priority, 0);
    let random = Math.random() * totalWeight;
    
    for (const msg of filtered) {
      random -= msg.priority;
      if (random <= 0) {
        return msg;
      }
    }
    
    return filtered[0];
  }

  // --------------------------------------------------------------------------
  // WRITE OPERATIONS
  // --------------------------------------------------------------------------

  /**
   * Create a new message (saves to both Firestore and localStorage)
   */
  async createMessage(input: SmartMessageInput): Promise<SmartMessage | null> {
    try {
      // Strip every key whose value is undefined or empty string before
      // reaching Firestore — addDoc rejects undefined field values.
      const sanitized = Object.fromEntries(
        Object.entries({ ...input }).filter(([, v]) => v !== undefined && v !== ''),
      ) as unknown as SmartMessageInput;
      // English entered -> text/subText stored as {he,en}; otherwise exactly as before.
      const stored = foldLocalizedFieldsForWrite(sanitized, MESSAGE_TEXT_FIELDS);

      const docData = {
        ...stored,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };
      
      const docRef = await addDoc(this.collectionRef, docData);
      
      const newMessage: SmartMessage = {
        id: docRef.id,
        ...sanitized,
      };
      
      // Sync to localStorage
      const local = this.getMessagesFromLocal();
      local.push(newMessage);
      this.saveMessagesToLocal(local);
      
      return newMessage;
    } catch (error) {
      console.error('[MessageService] Error creating message:', error);
      
      // Fallback: save only to localStorage
      const localId = `local-${Date.now()}`;
      const newMessage: SmartMessage = { id: localId, ...input };
      const local = this.getMessagesFromLocal();
      local.push(newMessage);
      this.saveMessagesToLocal(local);
      
      return newMessage;
    }
  }

  /**
   * Update an existing message (updates both Firestore and localStorage)
   */
  async updateMessage(id: string, updates: Partial<SmartMessageInput>): Promise<boolean> {
    try {
      // Strip undefined / empty-string values — updateDoc rejects them.
      const sanitized = Object.fromEntries(
        Object.entries(updates).filter(([, v]) => v !== undefined && v !== ''),
      ) as unknown as Partial<SmartMessageInput>;

      // Update Firestore (English entered -> {he,en}; otherwise exactly as before)
      const docRef = doc(this.collectionRef, id);
      await updateDoc(docRef, {
        ...foldLocalizedFieldsForWrite(sanitized, MESSAGE_TEXT_FIELDS),
        updatedAt: serverTimestamp(),
      });
      
      // Update localStorage
      const local = this.getMessagesFromLocal();
      const index = local.findIndex(m => m.id === id);
      if (index !== -1) {
        local[index] = { ...local[index], ...updates };
        this.saveMessagesToLocal(local);
      }
      
      return true;
    } catch (error) {
      console.error('[MessageService] Error updating message:', error);
      
      // Fallback: update only localStorage
      const local = this.getMessagesFromLocal();
      const index = local.findIndex(m => m.id === id);
      if (index !== -1) {
        local[index] = { ...local[index], ...updates };
        this.saveMessagesToLocal(local);
        return true;
      }
      
      return false;
    }
  }

  /**
   * Delete a message (removes from both Firestore and localStorage)
   */
  async deleteMessage(id: string): Promise<boolean> {
    try {
      // Delete from Firestore
      const docRef = doc(this.collectionRef, id);
      await deleteDoc(docRef);
      
      // Delete from localStorage
      const local = this.getMessagesFromLocal();
      const filtered = local.filter(m => m.id !== id);
      this.saveMessagesToLocal(filtered);
      
      return true;
    } catch (error) {
      console.error('[MessageService] Error deleting message:', error);
      
      // Fallback: delete only from localStorage
      const local = this.getMessagesFromLocal();
      const filtered = local.filter(m => m.id !== id);
      this.saveMessagesToLocal(filtered);
      
      return filtered.length < local.length;
    }
  }

  /**
   * Toggle message active status
   */
  async toggleMessageActive(id: string): Promise<boolean> {
    try {
      // Get from localStorage first (faster)
      const local = this.getMessagesFromLocal();
      const message = local.find(m => m.id === id);
      
      if (!message) {
        // Try Firestore
        const fbMessage = await this.getMessageById(id);
        if (!fbMessage) return false;
        return this.updateMessage(id, { isActive: !fbMessage.isActive });
      }
      
      return this.updateMessage(id, { isActive: !message.isActive });
    } catch (error) {
      console.error('[MessageService] Error toggling message:', error);
      return false;
    }
  }

  // --------------------------------------------------------------------------
  // REAL-TIME LISTENERS
  // --------------------------------------------------------------------------

  /**
   * Subscribe to all messages (for admin panel)
   */
  subscribeToAllMessages(callback: (messages: SmartMessage[]) => void): () => void {
    const q = query(this.collectionRef, orderBy('type'), orderBy('priority', 'desc'));
    
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const messages = snapshot.docs.map(doc => normalizeSmartMessage({
        id: doc.id,
        ...doc.data(),
      }) as SmartMessage);
      callback(messages);
    }, (error) => {
      console.error('[MessageService] Subscription error:', error);
    });
    
    return unsubscribe;
  }

  /**
   * Subscribe to messages by type (for app components)
   */
  subscribeToMessagesByType(type: MessageType, callback: (messages: SmartMessage[]) => void): () => void {
    const q = query(
      this.collectionRef, 
      where('type', '==', type),
      where('isActive', '==', true),
      orderBy('priority', 'desc')
    );
    
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const messages = snapshot.docs.map(doc => normalizeSmartMessage({
        id: doc.id,
        ...doc.data(),
      }) as SmartMessage);
      
      // Use defaults if empty
      if (messages.length === 0) {
        callback(DEFAULT_MESSAGES[type] || DEFAULT_MESSAGES.default);
      } else {
        callback(messages);
      }
    }, (error) => {
      console.error('[MessageService] Subscription error:', error);
      callback(DEFAULT_MESSAGES[type] || DEFAULT_MESSAGES.default);
    });
    
    return unsubscribe;
  }

  // --------------------------------------------------------------------------
  // BULK OPERATIONS
  // --------------------------------------------------------------------------

  /**
   * Seed default messages to Firestore
   */
  async seedDefaultMessages(): Promise<number> {
    let count = 0;
    
    for (const [type, messages] of Object.entries(DEFAULT_MESSAGES)) {
      for (const msg of messages) {
        const existing = await this.getMessagesByType(type as MessageType);
        if (existing.length === 0 || existing.every(e => e.id.startsWith('default-'))) {
          await this.createMessage({
            type: msg.type,
            text: msg.text,
            subText: msg.subText,
            priority: msg.priority,
            isActive: msg.isActive,
            ...(msg.targetGender ? { targetGender: msg.targetGender } : {}),
          });
          count++;
        }
      }
    }
    
    return count;
  }
}

// ============================================================================
// SINGLETON EXPORT
// ============================================================================

export const messageService = new MessageService();

// Export types and constants
export { MESSAGE_TYPE_LABELS as MESSAGE_TYPES };
