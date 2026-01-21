/**
 * Schema Initializer Service
 * Creates dummy documents with all required fields to initialize Firebase schema
 */
import { 
  collection, 
  addDoc, 
  serverTimestamp 
} from 'firebase/firestore';
import { db } from '@/lib/firebase';

const AUTHORITIES_COLLECTION = 'authorities';
const EXERCISES_COLLECTION = 'exercises';
const USERS_COLLECTION = 'users';

/**
 * Initialize Authorities collection schema
 * Creates a dummy authority document with all required fields
 */
export async function initializeAuthoritiesSchema(): Promise<string> {
  try {
    const docRef = await addDoc(collection(db, AUTHORITIES_COLLECTION), {
      name: '__SCHEMA_INIT__',
      logoUrl: null,
      managerIds: [],
      userCount: 0,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    
    console.log('[Schema Initializer] Authorities schema initialized with document ID:', docRef.id);
    return docRef.id;
  } catch (error) {
    console.error('[Schema Initializer] Error initializing authorities schema:', error);
    throw error;
  }
}

/**
 * Initialize Exercises collection schema
 * Creates a dummy exercise document with all required fields
 */
export async function initializeExercisesSchema(): Promise<string> {
  try {
    const docRef = await addDoc(collection(db, EXERCISES_COLLECTION), {
      name: {
        he: '__SCHEMA_INIT__',
        en: '__SCHEMA_INIT__',
        es: '__SCHEMA_INIT__',
      },
      type: 'reps',
      loggingMode: 'reps',
      equipment: [],
      muscleGroups: [],
      programIds: [],
      media: {},
      content: {
        description: {
          he: '',
          en: '',
          es: '',
        },
        highlights: [],
      },
      stats: {
        views: 0,
      },
      base_movement_id: null,
      movementGroup: null,
      execution_methods: [],
      targetPrograms: [],
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    
    console.log('[Schema Initializer] Exercises schema initialized with document ID:', docRef.id);
    return docRef.id;
  } catch (error) {
    console.error('[Schema Initializer] Error initializing exercises schema:', error);
    throw error;
  }
}

/**
 * Initialize Users collection schema
 * Creates a dummy user document with all required fields (including authorityId)
 */
export async function initializeUsersSchema(): Promise<string> {
  try {
    const docRef = await addDoc(collection(db, USERS_COLLECTION), {
      id: '__SCHEMA_INIT__',
      core: {
        name: '__SCHEMA_INIT__',
        initialFitnessTier: 1,
        trackingMode: 'wellness',
        mainGoal: 'healthy_lifestyle',
        gender: 'other',
        weight: 70,
        authorityId: null,
      },
      progression: {
        globalLevel: 1,
        globalXP: 0,
        avatarId: 'default',
        unlockedBadges: [],
        coins: 0,
        totalCaloriesBurned: 0,
        hasUnlockedAdvancedStats: false,
        domains: {},
        activePrograms: [],
        unlockedBonusExercises: [],
      },
      equipment: {
        home: [],
        office: [],
        outdoor: [],
      },
      lifestyle: {
        hasDog: false,
        commute: {
          method: 'walk',
          enableChallenges: true,
        },
      },
      health: {
        injuries: [],
        connectedWatch: 'none',
      },
      running: {
        level: 1,
        totalDistance: 0,
        totalTime: 0,
        longestRun: 0,
        personalRecords: {},
      },
      updatedAt: serverTimestamp(),
    });
    
    console.log('[Schema Initializer] Users schema initialized with document ID:', docRef.id);
    return docRef.id;
  } catch (error) {
    console.error('[Schema Initializer] Error initializing users schema:', error);
    throw error;
  }
}

/**
 * Initialize all schemas at once
 */
export async function initializeAllSchemas(): Promise<{
  authorities: string;
  exercises: string;
  users: string;
}> {
  try {
    const [authoritiesId, exercisesId, usersId] = await Promise.all([
      initializeAuthoritiesSchema(),
      initializeExercisesSchema(),
      initializeUsersSchema(),
    ]);
    
    return {
      authorities: authoritiesId,
      exercises: exercisesId,
      users: usersId,
    };
  } catch (error) {
    console.error('[Schema Initializer] Error initializing all schemas:', error);
    throw error;
  }
}
