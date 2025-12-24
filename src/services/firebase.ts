import { initializeApp, getApps, FirebaseApp } from 'firebase/app';
import { getFirestore, Firestore, enableNetwork, disableNetwork } from 'firebase/firestore';
import { getAuth, Auth, signInAnonymously, onAuthStateChanged, User } from 'firebase/auth';
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
let auth: Auth | null = null;
let currentUser: User | null = null;
let isInitializing = false;
let initializationPromise: Promise<boolean> | null = null;

// Initialize Firebase
export const initFirebase = async (): Promise<boolean> => {
  // If already initialized, return immediately
  if (db && currentUser) {
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

      auth = getAuth(app);
      db = getFirestore(app);

      // Enable offline persistence
      if (Platform.OS !== 'web') {
        // Firestore offline persistence is enabled by default on native
        // For web, we'll use a different approach
      }

      // Sign in anonymously for now (can upgrade to email/password later)
      try {
        const userCredential = await signInAnonymously(auth);
        currentUser = userCredential.user;
        console.log('Firebase initialized and user authenticated:', currentUser.uid);
        isInitializing = false;
        return true;
      } catch (error: any) {
        console.error('Firebase auth error:', error);
        isInitializing = false;
        return false;
      }
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

// Get Auth instance
export const getFirebaseAuth = (): Auth | null => {
  return auth;
};

// Get current user
export const getCurrentUser = (): User | null => {
  return currentUser;
};

// Get user ID for data storage
export const getUserId = (): string => {
  return currentUser?.uid || 'anonymous';
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

