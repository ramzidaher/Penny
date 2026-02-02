import { initializeApp, getApps, FirebaseApp } from 'firebase/app';
import { addDays } from 'date-fns';
import { getFirestore, Firestore, enableNetwork, disableNetwork, doc, setDoc, updateDoc, getDoc, collection, query, where, getDocs, Timestamp } from 'firebase/firestore';
import { getFunctions, Functions, httpsCallable, connectFunctionsEmulator } from 'firebase/functions';
import {
  getAuth as getFirebaseAuth,
  initializeAuth,
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
  browserSessionPersistence,
  reauthenticateWithCredential,
  EmailAuthProvider,
  fetchSignInMethodsForEmail
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
let functionsEmulatorConfigured = false;

const getReactNativePersistenceCompat = () => {
  const moduleId = 'firebase/auth/react-native';
  try {
    const reactNativeModule = require(moduleId);
    if (reactNativeModule?.getReactNativePersistence) {
      return reactNativeModule.getReactNativePersistence as (storage: unknown) => any;
    }
  } catch (_error) {
    // Module not available in this build; fall back to auth module if exposed.
  }

  try {
    const authModule = require('firebase/auth');
    if (authModule?.getReactNativePersistence) {
      return authModule.getReactNativePersistence as (storage: unknown) => any;
    }
  } catch (_error) {
    // Ignore and return null.
  }

  return null;
};

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
          const getPersistence = getReactNativePersistenceCompat();
          if (getPersistence) {
            auth = initializeAuth(app, {
              persistence: getPersistence(AsyncStorage)
            });
            console.log('Initialized Firebase Auth with AsyncStorage persistence');
          } else {
            auth = initializeAuth(app);
            console.warn('React Native persistence not available; using default auth initialization.');
          }
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

      const functionsRegion = (process.env.EXPO_PUBLIC_FIREBASE_FUNCTIONS_REGION || '').trim();
      functions = functionsRegion ? getFunctions(app, functionsRegion) : getFunctions(app);

      if (functions && !functionsEmulatorConfigured) {
        const emulatorOrigin = (process.env.EXPO_PUBLIC_FIREBASE_FUNCTIONS_ORIGIN || '').trim();
        const emulatorHost = (process.env.EXPO_PUBLIC_FIREBASE_FUNCTIONS_EMULATOR_HOST || '').trim();
        const emulatorPortRaw = (process.env.EXPO_PUBLIC_FIREBASE_FUNCTIONS_EMULATOR_PORT || '').trim();
        const emulatorPort = emulatorPortRaw ? Number(emulatorPortRaw) : NaN;

        if (emulatorOrigin) {
          const normalized = emulatorOrigin.replace(/^https?:\/\//, '');
          const [host, portRaw] = normalized.split(':');
          const port = portRaw ? Number(portRaw) : 5001;
          if (host && Number.isFinite(port)) {
            connectFunctionsEmulator(functions, host, port);
            functionsEmulatorConfigured = true;
            console.log(`[firebase] Functions emulator connected at ${host}:${port}`);
          }
        } else if (emulatorHost && Number.isFinite(emulatorPort)) {
          connectFunctionsEmulator(functions, emulatorHost, emulatorPort);
          functionsEmulatorConfigured = true;
          console.log(`[firebase] Functions emulator connected at ${emulatorHost}:${emulatorPort}`);
        }
      }

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
const DEFAULT_DELETION_GRACE_DAYS = 7;

export type AccountDeletionStatus = {
  status: 'active' | 'deletion_pending' | 'deleted';
  requestedAt?: string;
  scheduledDeletionAt?: string;
  gracePeriodDays?: number;
};

let accountDeletionStatus: AccountDeletionStatus = { status: 'active' };

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
  return db !== null && currentUser !== null && accountDeletionStatus.status === 'active';
};

export const getAccountDeletionStatus = (): AccountDeletionStatus => accountDeletionStatus;

export const refreshAccountDeletionStatus = async (): Promise<AccountDeletionStatus> => {
  if (!db || !currentUser) {
    accountDeletionStatus = { status: 'active' };
    return accountDeletionStatus;
  }

  try {
    const userDoc = await getDoc(doc(db, `users/${currentUser.uid}`));
    if (!userDoc.exists()) {
      accountDeletionStatus = { status: 'active' };
      return accountDeletionStatus;
    }

    const data = userDoc.data() as {
      accountStatus?: 'active' | 'deletion_pending' | 'deleted';
      deletionRequestedAt?: string;
      scheduledDeletionAt?: string;
      deletionGraceDays?: number;
    };

    const status = data.accountStatus || (data.deletionRequestedAt ? 'deletion_pending' : 'active');
    accountDeletionStatus = {
      status,
      requestedAt: data.deletionRequestedAt,
      scheduledDeletionAt: data.scheduledDeletionAt,
      gracePeriodDays: data.deletionGraceDays,
    };
    return accountDeletionStatus;
  } catch (error) {
    console.warn('[firebase] Failed to refresh account deletion status:', error);
    accountDeletionStatus = { status: 'active' };
    return accountDeletionStatus;
  }
};

export const requestAccountDeletion = async (reason?: string): Promise<AccountDeletionStatus> => {
  if (!db || !currentUser) {
    throw new Error('Firebase not initialized');
  }

  const requestedAt = new Date().toISOString();
  const scheduledDeletionAt = addDays(new Date(), DEFAULT_DELETION_GRACE_DAYS).toISOString();

  await setDoc(
    doc(db, `users/${currentUser.uid}`),
    {
      accountStatus: 'deletion_pending',
      deletionRequestedAt: requestedAt,
      scheduledDeletionAt,
      deletionGraceDays: DEFAULT_DELETION_GRACE_DAYS,
      deletionReason: reason || null,
    },
    { merge: true }
  );

  accountDeletionStatus = {
    status: 'deletion_pending',
    requestedAt,
    scheduledDeletionAt,
    gracePeriodDays: DEFAULT_DELETION_GRACE_DAYS,
  };

  return accountDeletionStatus;
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

// Validate username format (security: prevent injection)
const validateUsernameFormat = (username: string): boolean => {
  // Alphanumeric and underscores only, 3-20 characters
  const usernameRegex = /^[a-zA-Z0-9_]{3,20}$/;
  return usernameRegex.test(username);
};

// Check if email is already registered
export const isEmailAvailable = async (email: string): Promise<boolean> => {
  // Ensure Firebase is initialized
  if (!functions) {
    await initFirebase();
  }
  if (!functions) {
    throw new Error('Firebase not initialized');
  }
  
  // Validate email format first (client-side)
  const sanitized = email.toLowerCase().trim();
  const emailRegex = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;
  if (!emailRegex.test(sanitized)) {
    throw new Error('Invalid email format');
  }
  
  try {
    // Use Cloud Function for secure email checking (with rate limiting)
    const checkEmailFunction = httpsCallable(functions, 'checkEmail');
    const result = await checkEmailFunction({ email: sanitized });
    const data = result.data as { available: boolean };
    console.log('[isEmailAvailable] Email:', sanitized, 'Available:', data.available);
    return data.available;
  } catch (error: any) {
    console.error('[isEmailAvailable] Error checking email availability:', error);
    
    // Handle rate limiting errors
    if (error.code === 'functions/resource-exhausted' || error.message?.includes('Too many email checks')) {
      throw new Error('Too many email checks. Please wait a moment and try again.');
    }
    
    // Handle invalid argument errors
    if (error.code === 'functions/invalid-argument') {
      throw new Error(error.message || 'Invalid email format');
    }
    
    // For other errors, don't reveal specific error details (security: prevent information leakage)
    throw new Error('Unable to check email availability');
  }
};

// Check if username is available via Cloud Function (secure with rate limiting)
export const isUsernameAvailable = async (username: string): Promise<boolean> => {
  // Ensure Firebase is initialized
  if (!app) {
    await initFirebase();
  }
  
  if (!functions) {
    // Initialize functions if not already done
    if (!app) {
      throw new Error('Firebase not initialized');
    }
    functions = getFunctions(app);
  }
  
  // Validate username format first (client-side validation)
  const sanitized = username.toLowerCase().trim();
  if (!validateUsernameFormat(sanitized)) {
    throw new Error('Invalid username format');
  }
  
  try {
    // Call Cloud Function for secure username checking with rate limiting
    const checkUsernameFunction = httpsCallable<{ username: string }, { available: boolean; message?: string }>(
      functions,
      'checkUsername'
    );
    
    const result = await checkUsernameFunction({ username: sanitized });
    
    if (!result.data.available && result.data.message) {
      // If username is taken or invalid, throw error with message
      throw new Error(result.data.message);
    }
    
    return result.data.available;
  } catch (error: any) {
    // Handle Firebase Functions errors
    if (error.code === 'functions/resource-exhausted' || error.code === 'resource-exhausted') {
      throw new Error('Too many requests. Please try again later.');
    }
    if (error.code === 'functions/invalid-argument' || error.code === 'invalid-argument') {
      throw new Error('Invalid username format');
    }
    if (error.message && !error.message.includes('Firebase')) {
      throw error; // Re-throw with original message if it's user-friendly
    }
    // Don't reveal specific error details (security: prevent information leakage)
    throw new Error('Unable to check username availability');
  }
};

// Authentication functions
export interface RegisterUserData {
  email: string;
  password: string;
  displayName?: string;
  username?: string;
  dateOfBirth?: Date;
}

export const registerUser = async (
  email: string, 
  password: string, 
  displayName?: string,
  username?: string,
  dateOfBirth?: Date
): Promise<User> => {
  if (!auth) {
    throw new Error('Firebase not initialized');
  }
  
  if (!db) {
    await waitForFirebase();
  }
  if (!db) {
    throw new Error('Firebase not initialized');
  }
  
  // Security: Input validation and sanitization
  const sanitizedEmail = email.toLowerCase().trim();
  if (!sanitizedEmail || sanitizedEmail.length > 254) {
    throw new Error('Invalid email address');
  }
  
  // Validate email format
  const emailRegex = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;
  if (!emailRegex.test(sanitizedEmail)) {
    throw new Error('Invalid email address');
  }
  
  // Validate password length (Firebase has min 6, we enforce 8+)
  if (!password || password.length < 8 || password.length > 128) {
    throw new Error('Password must be between 8 and 128 characters');
  }
  
  // Sanitize display name
  const sanitizedDisplayName = displayName ? displayName.trim().slice(0, 100) : '';
  
  // Validate and sanitize username if provided
  let sanitizedUsername: string | undefined;
  if (username) {
    sanitizedUsername = username.toLowerCase().trim();
    if (!validateUsernameFormat(sanitizedUsername)) {
      throw new Error('Invalid username format');
    }
    
    // Check username availability (with format validation)
    const available = await isUsernameAvailable(sanitizedUsername);
    if (!available) {
      throw new Error('Username is already taken');
    }
  }
  
  // Validate date of birth (security: age verification)
  if (dateOfBirth) {
    const today = new Date();
    const age = today.getFullYear() - dateOfBirth.getFullYear();
    const monthDiff = today.getMonth() - dateOfBirth.getMonth();
    const dayDiff = today.getDate() - dateOfBirth.getDate();
    const actualAge = monthDiff < 0 || (monthDiff === 0 && dayDiff < 0) ? age - 1 : age;
    
    if (actualAge < 18) {
      throw new Error('You must be at least 18 years old');
    }
    if (dateOfBirth > today) {
      throw new Error('Invalid date of birth');
    }
  }
  
  // Create user account
  const userCredential = await createUserWithEmailAndPassword(auth, sanitizedEmail, password);
  
  // Update display name if provided
  if (sanitizedDisplayName && userCredential.user) {
    await updateProfile(userCredential.user, { displayName: sanitizedDisplayName });
  }
  
  // Create user profile document in Firestore
  const userId = userCredential.user.uid;
  const userProfileRef = doc(db, 'users', userId);
  
  const profileData: any = {
    email: sanitizedEmail,
    displayName: sanitizedDisplayName,
    createdAt: Timestamp.now(),
    updatedAt: Timestamp.now(),
  };
  
  if (dateOfBirth) {
    profileData.dateOfBirth = Timestamp.fromDate(dateOfBirth);
  }
  
  // Write user profile first
  await setDoc(userProfileRef, profileData);
  
  // Store username mapping for uniqueness checking (after profile is written)
  // This ensures auth state is fully propagated
  if (sanitizedUsername) {
    profileData.username = sanitizedUsername;
    // Update profile with username
    await updateDoc(userProfileRef, { username: sanitizedUsername });
    
    // Store username mapping with retry logic
    const usernameRef = doc(db, 'usernames', sanitizedUsername);
    let retries = 3;
    let lastError: any = null;
    
    while (retries > 0) {
      try {
        await setDoc(usernameRef, {
          userId: userId,
          createdAt: Timestamp.now(),
        });
        // Success - break out of retry loop
        break;
      } catch (error: any) {
        lastError = error;
        retries--;
        
        // If it's a permissions error and we have retries left, wait a bit and retry
        if (error.code === 'permission-denied' && retries > 0) {
          // Wait 200ms before retrying (auth state propagation delay)
          await new Promise(resolve => setTimeout(resolve, 200));
          continue;
        }
        
        // If it's not a permissions error or we're out of retries, log and break
        console.error('Failed to store username mapping:', error);
        break;
      }
    }
    
    // If all retries failed, log the error but don't throw
    // Username is stored in profile, can be checked there
    if (retries === 0 && lastError) {
      console.error('Failed to store username mapping after retries:', lastError);
    }
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
  
  // Sync PIN from Firestore after successful login
  try {
    const { hasPIN } = await import('./pinService');
    // This will automatically sync PIN from Firestore if not in local storage
    await hasPIN();
    console.log('[firebase] PIN synced after login');
  } catch (error) {
    console.error('[firebase] Error syncing PIN after login:', error);
    // Don't block login if PIN sync fails
  }

  const deletionStatus = await refreshAccountDeletionStatus();
  if (deletionStatus.status !== 'active') {
    await logoutUser();
    throw new Error(
      'This account is pending deletion. Contact support if this was a mistake.'
    );
  }
  
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
  
  // Clear local PIN before signing out (for security)
  try {
    const { deletePIN } = await import('./pinService');
    await deletePIN();
    console.log('[firebase] Cleared local PIN on logout');
  } catch (error) {
    console.error('[firebase] Error clearing PIN on logout:', error);
    // Don't block logout if PIN clearing fails
  }
  
  // Sign out from Firebase
  await signOut(auth);
  
  // Clear the currentUser immediately
  currentUser = null;
  accountDeletionStatus = { status: 'active' };
  
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

// Verify user password by attempting to reauthenticate
export const verifyPassword = async (password: string): Promise<boolean> => {
  if (!auth || !currentUser || !currentUser.email) {
    throw new Error('User not authenticated');
  }
  
  try {
    const credential = EmailAuthProvider.credential(currentUser.email, password);
    await reauthenticateWithCredential(currentUser, credential);
    return true;
  } catch (error: any) {
    if (error.code === 'auth/wrong-password' || error.code === 'auth/invalid-credential') {
      return false;
    }
    throw error;
  }
};

