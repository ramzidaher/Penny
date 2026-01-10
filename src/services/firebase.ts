import { initializeApp, getApps, FirebaseApp } from 'firebase/app';
import { getFirestore, Firestore, enableNetwork, disableNetwork } from 'firebase/firestore';
import { getFunctions, Functions, httpsCallable } from 'firebase/functions';
import { 
  getAuth as getFirebaseAuth,
  initializeAuth,
  getReactNativePersistence,
  Auth, 
  signInAnonymously, 
  onAuthStateChanged as onFirebaseAuthStateChanged, 
  User,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  sendPasswordResetEmail,
  updateProfile,
  setPersistence,
  browserLocalPersistence,
  browserSessionPersistence
} from 'firebase/auth';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

// Firebase configuration - these should be in .env
const firebaseConfig = {
  apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY || '',
  authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN || '',
  projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID || '',
  storageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET || '',
  messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID || '',
  appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID || '',
};

let app: FirebaseApp | null = null;
let db: Firestore | null = null;
let functions: Functions | null = null;
let auth: Auth | null = null;
let currentUser: User | null = null;
let isInitializing = false;
let initializationPromise: Promise<boolean> | null = null;

// Initialize Firebase (without auto-login)
export const initFirebase = async (): Promise<boolean> => {
  // If already initialized, return immediately
  if (app && db) {
    return true;
  }

  // If already initializing, wait for that promise
  if (isInitializing && initializationPromise) {
    return await initializationPromise;
  }

  // Start initialization
  isInitializing = true;
  initializationPromise = (async () => {
    try {
      // Check if Firebase is already initialized
      if (getApps().length === 0) {
        if (!firebaseConfig.apiKey || !firebaseConfig.projectId) {
          console.warn('Firebase config not found. Using local storage only.');
          isInitializing = false;
          return false;
        }
        app = initializeApp(firebaseConfig);
      } else {
        app = getApps()[0];
      }

      // Initialize auth with proper persistence for React Native
      if (Platform.OS !== 'web') {
        // For React Native, use initializeAuth with AsyncStorage persistence
        try {
          auth = initializeAuth(app, {
            persistence: getReactNativePersistence(AsyncStorage)
          });
          console.log('Initialized Firebase Auth with AsyncStorage persistence');
        } catch (error: any) {
          // If auth is already initialized, get the existing instance
          if (error.code === 'auth/already-initialized') {
            auth = getFirebaseAuth(app);
            console.log('Firebase Auth already initialized, using existing instance');
          } else {
            console.error('Error initializing Firebase Auth:', error);
            throw error;
          }
        }
      } else {
        // For web, use getAuth and set persistence
        auth = getFirebaseAuth(app);
        try {
          await setPersistence(auth, browserSessionPersistence);
          console.log('Set Firebase auth persistence to session-only');
        } catch (error) {
          console.warn('Could not set auth persistence:', error);
        }
      }

      db = getFirestore(app);
      functions = getFunctions(app);

      // Update currentUser from auth state (but don't set up listener here - App.tsx handles it)
      if (auth.currentUser) {
        currentUser = auth.currentUser;
        console.log('User session restored:', currentUser.uid);
      }

      isInitializing = false;
      return true;
    } catch (error) {
      console.error('Firebase initialization error:', error);
      isInitializing = false;
      return false;
    }
  })();

  return await initializationPromise;
};

// Wait for Firebase to be ready
export const waitForFirebase = async (maxWait = 5000): Promise<boolean> => {
  if (isFirebaseAvailable()) {
    return true;
  }

  const startTime = Date.now();
  while (Date.now() - startTime < maxWait) {
    if (isFirebaseAvailable()) {
      return true;
    }
    // Wait a bit before checking again
    await new Promise(resolve => setTimeout(resolve, 100));
  }

  return isFirebaseAvailable();
};

// Get Firestore instance
export const getFirestoreDb = (): Firestore | null => {
  return db;
};

// Get Functions instance
export const getFirebaseFunctions = (): Functions | null => {
  return functions;
};

// Get Auth instance
export const getAuth = (): Auth | null => {
  return auth;
};

// Export onAuthStateChanged for App.tsx
export { onFirebaseAuthStateChanged as onAuthStateChanged };

// Callback to notify App.tsx of auth state changes (set by App.tsx)
let authStateCallback: ((user: User | null) => void) | null = null;
let isSigningOut = false; // Flag to prevent auto-restore after sign out

export const setAuthStateCallback = (callback: (user: User | null) => void) => {
  authStateCallback = callback;
};

export const getIsSigningOut = (): boolean => {
  return isSigningOut;
};

// Get current user
export const getCurrentUser = (): User | null => {
  return currentUser;
};

// Get user ID for data storage
export const getUserId = (): string | null => {
  return currentUser?.uid || null;
};

// Update current user (used by App.tsx auth listener)
export const setCurrentUser = (user: User | null): void => {
  currentUser = user;
};

// Check if Firebase is available
export const isFirebaseAvailable = (): boolean => {
  return db !== null && currentUser !== null;
};

// Enable/disable network (for offline mode)
export const setFirebaseNetworkEnabled = async (enabled: boolean): Promise<void> => {
  if (!db) return;
  try {
    if (enabled) {
      await enableNetwork(db);
    } else {
      await disableNetwork(db);
    }
  } catch (error) {
    console.error('Error toggling network:', error);
  }
};

// Authentication functions
export const registerUser = async (email: string, password: string, displayName?: string): Promise<User> => {
  if (!auth) {
    throw new Error('Firebase not initialized');
  }
  
  const userCredential = await createUserWithEmailAndPassword(auth, email, password);
  
  // Update display name if provided
  if (displayName && userCredential.user) {
    await updateProfile(userCredential.user, { displayName });
  }
  
  currentUser = userCredential.user;
  return userCredential.user;
};

export const loginUser = async (email: string, password: string): Promise<User> => {
  if (!auth) {
    throw new Error('Firebase not initialized');
  }
  
  const userCredential = await signInWithEmailAndPassword(auth, email, password);
  currentUser = userCredential.user;
  return userCredential.user;
};

export const logoutUser = async (): Promise<void> => {
  if (!auth) {
    throw new Error('Firebase not initialized');
  }
  
  console.log('Calling signOut...');
  console.log('Current user before signOut:', auth.currentUser?.email || 'null');
  
  // Set flag to prevent auto-restore
  isSigningOut = true;
  
  // Sign out from Firebase
  await signOut(auth);
  
  // Clear the currentUser immediately
  currentUser = null;
  
  // On web, clear sessionStorage and localStorage to prevent auto-restore
  if (typeof window !== 'undefined') {
    try {
      // Clear all Firebase-related storage
      const allKeys = Object.keys(localStorage);
      allKeys.forEach(key => {
        if (key.includes('firebase') || key.includes('auth')) {
          localStorage.removeItem(key);
        }
      });
      
      const sessionKeys = Object.keys(sessionStorage);
      sessionKeys.forEach(key => {
        if (key.includes('firebase') || key.includes('auth')) {
          sessionStorage.removeItem(key);
        }
      });
      
      console.log('Cleared Firebase auth from storage');
    } catch (error) {
      console.warn('Could not clear storage:', error);
    }
  }
  
  // Wait a moment for Firebase to process the sign out
  await new Promise(resolve => setTimeout(resolve, 100));
  
  // Verify sign out worked
  const userAfterSignOut = auth.currentUser;
  console.log('User after signOut:', userAfterSignOut?.email || 'null');
  
  // Manually trigger auth state callback to ensure UI updates
  // This should happen before any automatic restore
  if (authStateCallback) {
    console.log('Manually triggering auth state callback with null');
    // Call immediately to update state before any restore happens
    authStateCallback(null);
  } else {
    console.warn('Auth state callback not set - UI may not update');
  }
  
  // Keep the flag set for a bit to prevent immediate restore
  setTimeout(() => {
    isSigningOut = false;
    console.log('Sign out flag cleared');
  }, 2000);
  
  console.log('Sign out complete');
};

export const resetPassword = async (email: string): Promise<void> => {
  if (!auth) {
    throw new Error('Firebase not initialized');
  }
  
  await sendPasswordResetEmail(auth, email);
};

// Check if user is authenticated
export const isAuthenticated = (): boolean => {
  return currentUser !== null && auth?.currentUser !== null;
};

// Get user email
export const getUserEmail = (): string | null => {
  return currentUser?.email || null;
};

