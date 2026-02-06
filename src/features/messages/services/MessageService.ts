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
  | 'default';

export interface SmartMessage {
  id: string;
  type: MessageType;
  /** The main heading text (Hebrew) */
  text: string;
  /** The smaller subtitle text (Hebrew) */
  subText?: string;
  /** Priority for selection (1-10, higher = more likely) */
  priority: number;
  /** Whether this message is currently active */
  isActive: boolean;
  /** Optional: specific persona this message targets */
  targetPersona?: string;
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
  subText?: string;
  priority: number;
  isActive: boolean;
  targetPersona?: string;
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
}

// ============================================================================
// CONSTANTS
// ============================================================================

const COLLECTION_NAME = 'smart_messages';

/** Message type labels in Hebrew */
export const MESSAGE_TYPE_LABELS: Record<MessageType, string> = {
  post_workout: 'אחרי אימון',
  partial_workout: 'אימון חלקי',
  re_engagement: 'חזרה לפעילות',
  pr_record: 'שיא אישי',
  streak_milestone: 'אבן דרך ברצף',
  level_up: 'עליית רמה',
  first_workout: 'אימון ראשון',
  default: 'ברירת מחדל',
};

/** Default messages for each type (fallback when no messages in DB) */
export const DEFAULT_MESSAGES: Record<MessageType, SmartMessage[]> = {
  post_workout: [
    { id: 'default-pw-1', type: 'post_workout', text: 'כל הכבוד!', subText: 'סיימת את האימון בהצלחה', priority: 5, isActive: true },
    { id: 'default-pw-2', type: 'post_workout', text: 'מדהים!', subText: 'עוד אימון בכיס', priority: 5, isActive: true },
    { id: 'default-pw-3', type: 'post_workout', text: 'איזה חיה!', subText: 'המשך כך', priority: 5, isActive: true },
    { id: 'default-pw-4', type: 'post_workout', text: 'סיימת!', subText: 'הגוף שלך מודה לך', priority: 5, isActive: true },
    { id: 'default-pw-5', type: 'post_workout', text: 'אלוף!', subText: 'עוד צעד קדימה', priority: 5, isActive: true },
  ],
  partial_workout: [
    { id: 'default-part-1', type: 'partial_workout', text: 'גם זה משהו!', subText: 'כל תנועה חשובה', priority: 5, isActive: true },
    { id: 'default-part-2', type: 'partial_workout', text: 'התחלה טובה!', subText: 'בפעם הבאה נשלים', priority: 5, isActive: true },
    { id: 'default-part-3', type: 'partial_workout', text: 'לא נורא!', subText: 'העיקר שזז', priority: 4, isActive: true },
  ],
  re_engagement: [
    { id: 'default-re-1', type: 're_engagement', text: 'כיף לראות אותך!', subText: 'בוא נחזור לעניינים', priority: 5, isActive: true },
    { id: 'default-re-2', type: 're_engagement', text: 'התגעגענו!', subText: 'מוכן לאימון?', priority: 5, isActive: true },
    { id: 'default-re-3', type: 're_engagement', text: 'חזרת!', subText: 'הגוף שלך מחכה', priority: 6, isActive: true },
    { id: 'default-re-4', type: 're_engagement', text: 'איפה היית?', subText: 'הגיע הזמן לזוז', priority: 4, isActive: true },
  ],
  pr_record: [
    { id: 'default-pr-1', type: 'pr_record', text: 'שיא חדש! 🏆', subText: 'שברת את עצמך', priority: 10, isActive: true },
    { id: 'default-pr-2', type: 'pr_record', text: 'וואו!', subText: 'שיא אישי חדש!', priority: 10, isActive: true },
    { id: 'default-pr-3', type: 'pr_record', text: 'מטורף!', subText: 'הרמת את הרף', priority: 10, isActive: true },
  ],
  streak_milestone: [
    { id: 'default-sm-1', type: 'streak_milestone', text: 'רצף מדהים!', subText: 'ההתמדה משתלמת', priority: 8, isActive: true },
    { id: 'default-sm-2', type: 'streak_milestone', text: 'על גל!', subText: 'תמשיך ככה', priority: 8, isActive: true },
  ],
  level_up: [
    { id: 'default-lu-1', type: 'level_up', text: 'עלית רמה! 🎉', subText: 'ההתקדמות ניכרת', priority: 10, isActive: true },
    { id: 'default-lu-2', type: 'level_up', text: 'כבוד!', subText: 'רמה חדשה נפתחה', priority: 10, isActive: true },
  ],
  first_workout: [
    { id: 'default-fw-1', type: 'first_workout', text: 'צעד ראשון!', subText: 'ברוכים הבאים למסע', priority: 10, isActive: true },
    { id: 'default-fw-2', type: 'first_workout', text: 'מתחילים!', subText: 'האימון הראשון הוא הכי חשוב', priority: 10, isActive: true },
  ],
  default: [
    { id: 'default-def-1', type: 'default', text: 'היי!', subText: 'מוכן להתאמן?', priority: 5, isActive: true },
    { id: 'default-def-2', type: 'default', text: 'מה קורה?', subText: 'בוא נזוז', priority: 5, isActive: true },
    { id: 'default-def-3', type: 'default', text: 'שלום!', subText: 'הגוף מחכה לך', priority: 4, isActive: true },
  ],
};

// ============================================================================
// INITIAL SEED DATA (Hebrew)
// ============================================================================

const INITIAL_SEED_DATA: SmartMessage[] = [
  // Post Workout
  { id: 'seed-pw-1', type: 'post_workout', text: 'סחטיין!', subText: 'אימון מעולה', priority: 8, isActive: true },
  { id: 'seed-pw-2', type: 'post_workout', text: 'איזה מכונה!', subText: 'עכשיו מגיע לך מנוחה', priority: 7, isActive: true },
  { id: 'seed-pw-3', type: 'post_workout', text: 'עבודה טובה!', subText: 'כל אימון מקרב אותך למטרה', priority: 6, isActive: true },
  
  // Partial Workout
  { id: 'seed-part-1', type: 'partial_workout', text: 'לפחות התחלת!', subText: 'זה יותר מרוב האנשים', priority: 6, isActive: true },
  { id: 'seed-part-2', type: 'partial_workout', text: 'חצי אימון', subText: 'עדיף מאפס אימונים', priority: 5, isActive: true },
  
  // Re-engagement
  { id: 'seed-re-1', type: 're_engagement', text: 'איפה נעלמת?', subText: 'השרירים שואלים', priority: 7, isActive: true },
  { id: 'seed-re-2', type: 're_engagement', text: 'הופה!', subText: 'הגיע הזמן לחזור לעניינים', priority: 6, isActive: true },
  
  // PR Record
  { id: 'seed-pr-1', type: 'pr_record', text: 'מפלצת!', subText: 'שבירת שיאים זה הדבר שלך', priority: 10, isActive: true },
  
  // Default
  { id: 'seed-def-1', type: 'default', text: 'יאללה!', subText: 'בוא נתחיל', priority: 5, isActive: true },
  { id: 'seed-def-2', type: 'default', text: 'מה נשמע?', subText: 'מוכן לעוד יום טוב?', priority: 4, isActive: true },
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
      return JSON.parse(stored) as SmartMessage[];
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
          callback(JSON.parse(e.newValue));
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
      const untargeted = messages.filter(m => !m.targetPersona);
      if (untargeted.length > 0) {
        return this.selectByPriority(untargeted);
      }
      
      // Final fallback: default messages
      const defaults = DEFAULT_MESSAGES[context.type] || DEFAULT_MESSAGES.default;
      return defaults[Math.floor(Math.random() * defaults.length)];
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
      return snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
      } as SmartMessage));
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
      const messages = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
      } as SmartMessage));
      
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
      
      return {
        id: snapshot.id,
        ...snapshot.data(),
      } as SmartMessage;
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
      const defaults = DEFAULT_MESSAGES[context.type] || DEFAULT_MESSAGES.default;
      return defaults[Math.floor(Math.random() * defaults.length)];
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
      const docData = {
        ...input,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };
      
      const docRef = await addDoc(this.collectionRef, docData);
      
      const newMessage: SmartMessage = {
        id: docRef.id,
        ...input,
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
      // Update Firestore
      const docRef = doc(this.collectionRef, id);
      await updateDoc(docRef, {
        ...updates,
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
      const messages = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
      } as SmartMessage));
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
      const messages = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data(),
      } as SmartMessage));
      
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
