// Firebase Authentication service
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  User,
  updateProfile,
  GoogleAuthProvider,
  signInWithPopup,
  signInWithRedirect,
  signInAnonymously,
  linkWithPopup,
  getRedirectResult,
  sendSignInLinkToEmail,
  isSignInWithEmailLink,
  signInWithEmailLink,
  ActionCodeSettings,
} from 'firebase/auth';
import { auth } from './firebase';

/**
 * Sign up a new user
 * Creates user profile with isApproved: false (pending approval)
 */
export async function signUp(email: string, password: string, displayName?: string) {
  try {
    const userCredential = await createUserWithEmailAndPassword(auth, email, password);

    // Update display name if provided
    if (displayName && userCredential.user) {
      await updateProfile(userCredential.user, { displayName });
    }

    // Create user profile in Firestore with pending approval
    if (userCredential.user) {
      try {
        const { doc, setDoc, serverTimestamp } = await import('firebase/firestore');
        const { db } = await import('./firebase');
        const userDocRef = doc(db, 'users', userCredential.user.uid);
        
        await setDoc(userDocRef, {
          id: userCredential.user.uid,
          core: {
            name: displayName || userCredential.user.displayName || email.split('@')[0],
            email: email,
            initialFitnessTier: 1,
            trackingMode: 'wellness',
            mainGoal: 'healthy_lifestyle',
            gender: 'other',
            weight: 70,
            isApproved: false, // Pending approval by Super Admin
            isSuperAdmin: false,
          },
          progression: {
            globalLevel: 1,
            globalXP: 0,
            coins: 0,
            totalCaloriesBurned: 0,
            hasUnlockedAdvancedStats: false,
          },
          equipment: {
            home: [],
            office: [],
            outdoor: [],
          },
          lifestyle: {
            hasDog: false,
            commute: { method: 'walk', enableChallenges: false },
          },
          health: { injuries: [], connectedWatch: 'none' },
          running: {
            weeklyMileageGoal: 0,
            runFrequency: 1,
            activeProgram: null,
            paceProfile: { easyPace: 0, thresholdPace: 0, vo2MaxPace: 0, qualityWorkoutsHistory: [] },
          },
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      } catch (firestoreError) {
        console.error('Error creating user profile:', firestoreError);
        // Don't fail sign up if Firestore write fails
      }
    }

    return { user: userCredential.user, error: null };
  } catch (error: any) {
    return { user: null, error: error.message };
  }
}

/**
 * Sign in existing user
 */
export async function signIn(email: string, password: string) {
  try {
    const userCredential = await signInWithEmailAndPassword(auth, email, password);
    return { user: userCredential.user, error: null };
  } catch (error: any) {
    return { user: null, error: error.message };
  }
}



/**
 * Sign in with Google (Redirect)
 */
export async function signInWithGoogle() {
  try {
    const provider = new GoogleAuthProvider();
    await signInWithRedirect(auth, provider);
    // Redirect happens immediately.
    return { user: null, error: null };
  } catch (error: any) {
    return { user: null, error: error.message };
  }
}

/**
 * Sign in with Google (Popup) - Better for dedicated login pages
 */
export async function signInWithGooglePopup() {
  try {
    const provider = new GoogleAuthProvider();
    const result = await signInWithPopup(auth, provider);
    return { user: result.user, error: null };
  } catch (error: any) {
    return { user: null, error: error.message };
  }
}

/**
 * Handle Google Redirect Result
 */
export async function getGoogleRedirectResult() {
  try {
    const result = await getRedirectResult(auth);
    return { user: result?.user || null, error: null };
  } catch (error: any) {
    return { user: null, error: error.message };
  }
}

/**
 * Sign in as Guest (Anonymous)
 */
export async function signInGuest() {
  try {
    const result = await signInAnonymously(auth);
    return { user: result.user, error: null };
  } catch (error: any) {
    return { user: null, error: error.message };
  }
}

/**
 * Link current anonymous account with Google
 */
export async function linkGoogleAccount() {
  try {
    if (!auth.currentUser) throw new Error('No user is currently signed in');

    const provider = new GoogleAuthProvider();
    const result = await linkWithPopup(auth.currentUser, provider);
    return { user: result.user, error: null };
  } catch (error: any) {
    console.error("Link Error:", error);
    // If credential already exists, we might need to sign in with credential instead
    // But for MVP, we return the error
    return { user: null, error: error.message };
  }
}

/**
 * Sign out current user
 */
export async function signOutUser() {
  try {
    await signOut(auth);
    return { error: null };
  } catch (error: any) {
    return { error: error.message };
  }
}

/**
 * Subscribe to auth state changes
 */
/**
 * Auth state change listener with retry logic for network errors
 */
export function onAuthStateChange(callback: (user: User | null) => void) {
  let retryCount = 0;
  const maxRetries = 3;
  const retryDelay = 1000; // 1 second

  const wrappedCallback = async (user: User | null) => {
    try {
      await callback(user);
      retryCount = 0; // Reset on success
    } catch (error: any) {
      // Check for network/Firestore errors
      const isNetworkError = 
        error?.code === 'ERR_QUIC_PROTOCOL_ERROR' ||
        error?.code === 'unavailable' ||
        error?.message?.includes('network') ||
        error?.message?.includes('quic') ||
        error?.message?.includes('Failed to fetch');

      if (isNetworkError && retryCount < maxRetries) {
        retryCount++;
        console.warn(`[Auth Service] Network error detected, retrying (${retryCount}/${maxRetries})...`, error);
        
        setTimeout(() => {
          wrappedCallback(user);
        }, retryDelay * retryCount); // Exponential backoff
      } else {
        console.error('[Auth Service] Error in auth state callback:', error);
        // Still call callback with user to prevent UI blocking
        callback(user);
      }
    }
  };

  return onAuthStateChanged(auth, wrappedCallback);
}

/**
 * Send passwordless sign-in link via email (Magic Link)
 */
export async function sendMagicLink(email: string, continueUrl?: string): Promise<{ error: string | null }> {
  try {
    const actionCodeSettings: ActionCodeSettings = {
      url: continueUrl || `${typeof window !== 'undefined' ? window.location.origin : ''}/admin/auth/callback`,
      handleCodeInApp: true,
    };

    await sendSignInLinkToEmail(auth, email, actionCodeSettings);
    
    // Store email in localStorage for later use
    if (typeof window !== 'undefined') {
      window.localStorage.setItem('emailForSignIn', email);
    }
    
    return { error: null };
  } catch (error: any) {
    console.error('Error sending magic link:', error);
    return { error: error.message };
  }
}

/**
 * Check if the current URL is a magic link callback
 */
export function isMagicLinkCallback(): boolean {
  if (typeof window === 'undefined') return false;
  return isSignInWithEmailLink(auth, window.location.href);
}

/**
 * Sign in with magic link from email
 */
export async function signInWithMagicLink(email: string): Promise<{ user: User | null; error: string | null }> {
  try {
    const url = typeof window !== 'undefined' ? window.location.href : '';
    
    if (!isSignInWithEmailLink(auth, url)) {
      return { user: null, error: 'Invalid magic link' };
    }

    // Get the email from localStorage if not provided
    let emailToUse = email;
    if (!emailToUse && typeof window !== 'undefined') {
      emailToUse = window.localStorage.getItem('emailForSignIn') || '';
    }

    if (!emailToUse) {
      return { user: null, error: 'Email is required' };
    }

    const userCredential = await signInWithEmailLink(auth, emailToUse, url);
    
    // Clear email from localStorage
    if (typeof window !== 'undefined') {
      window.localStorage.removeItem('emailForSignIn');
    }

    return { user: userCredential.user, error: null };
  } catch (error: any) {
    console.error('Error signing in with magic link:', error);
    return { user: null, error: error.message };
  }
}
