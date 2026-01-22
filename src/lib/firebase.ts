// Firebase configuration and initialization
import { initializeApp, getApps, FirebaseApp } from "firebase/app";
import { getAnalytics, Analytics } from "firebase/analytics";
import { getAuth, Auth } from "firebase/auth";
import { getFirestore, Firestore, initializeFirestore } from "firebase/firestore";
import { getStorage, FirebaseStorage } from "firebase/storage";

// Your web app's Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyCezG55zVQEZWCEs-lHzx_yQldg-Ej2X60",
  authDomain: "appout-1.firebaseapp.com",
  projectId: "appout-1",
  storageBucket: "appout-1.firebasestorage.app",
  messagingSenderId: "371293978848",
  appId: "1:371293978848:web:c5281b7834ecd5398b1085",
  measurementId: "G-DVL9P34LK4"
};

// Initialize Firebase (only if not already initialized)
// This is safe for SSR - Firebase SDK handles server-side initialization
let app: FirebaseApp;
if (getApps().length === 0) {
  app = initializeApp(firebaseConfig);
} else {
  app = getApps()[0];
}

// Initialize services - all are SSR-safe
// Analytics only works in browser, so we guard it
let analytics: Analytics | null = null;
if (typeof window !== 'undefined') {
  try {
    analytics = getAnalytics(app);
  } catch (error) {
    // Analytics initialization can fail in some environments
    console.warn('Analytics initialization failed:', error);
  }
}

// Auth and Firestore are SSR-safe - Firebase SDK handles server-side initialization
// They can be initialized on server but will only work when called from client components
export const auth = getAuth(app);

// Initialize Firestore with experimentalAutoDetectLongPolling to fix BloomFilter errors
let db: Firestore;
if (typeof window !== 'undefined') {
  try {
    // Try to initialize with persistent cache and long polling detection (browser only)
    db = initializeFirestore(app, {
      experimentalAutoDetectLongPolling: true,
    });
  } catch (error) {
    // Fallback to default initialization if experimental features fail
    console.warn('Failed to initialize Firestore with experimental features, using default:', error);
    db = getFirestore(app);
  }
} else {
  // Server-side: use default initialization (SSR-safe)
  db = getFirestore(app);
}

export { db };

// Storage is SSR-safe - Firebase SDK handles server-side initialization
// It will only work when called from client components
export const storage = getStorage(app);

export { app, analytics };
