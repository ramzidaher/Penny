import { getFirestoreDb, getUserId, waitForFirebase, isFirebaseAvailable } from './firebase';
import { doc, getDoc, setDoc, deleteDoc, Timestamp } from 'firebase/firestore';

// Lazy load expo-crypto to handle cases where native module isn't available
let Crypto: typeof import('expo-crypto') | null = null;

const getCrypto = async (): Promise<typeof import('expo-crypto')> => {
  if (Crypto) {
    // Verify functions are still available
    if (typeof Crypto.getRandomBytesAsync === 'function' && typeof Crypto.digestStringAsync === 'function') {
      return Crypto;
    }
    // Functions not available, reset and try again
    Crypto = null;
  }
  
  try {
    const cryptoModule = await import('expo-crypto');
    
    // Verify the required functions are available
    if (typeof cryptoModule.getRandomBytesAsync !== 'function') {
      throw new Error('getRandomBytesAsync is not available in expo-crypto module');
    }
    if (typeof cryptoModule.digestStringAsync !== 'function') {
      throw new Error('digestStringAsync is not available in expo-crypto module');
    }
    if (!cryptoModule.CryptoDigestAlgorithm) {
      throw new Error('CryptoDigestAlgorithm is not available in expo-crypto module');
    }
    
    Crypto = cryptoModule;
    return Crypto;
  } catch (error: any) {
    console.error('[pinService] Failed to load expo-crypto:', error);
    const errorMessage = error?.message || 'Unknown error';
    throw new Error(`Crypto module not available: ${errorMessage}. This requires a development build or production build with expo-crypto properly linked. Please rebuild your app.`);
  }
};

/**
 * Hash a PIN using SHA-256 with salt
 */
const hashPIN = async (pin: string, salt: string): Promise<string> => {
  const crypto = await getCrypto();
  const combined = `${pin}${salt}`;
  return await crypto.digestStringAsync(
    crypto.CryptoDigestAlgorithm.SHA256,
    combined
  );
};

/**
 * Generate a random salt
 */
const generateSalt = async (): Promise<string> => {
  const crypto = await getCrypto();
  const bytes = await crypto.getRandomBytesAsync(32);
  return Array.from(bytes)
    .map(b => b.toString(16).padStart(2, '0'))
    .join('');
};

const FETCH_PIN_RETRY_DELAY_MS = 1500;
const FETCH_PIN_MAX_ATTEMPTS = 2;

const fetchPinFromFirestore = async (attempt = 1): Promise<{ pinHash: string; salt: string } | null> => {
  try {
    await waitForFirebase();
    if (!isFirebaseAvailable()) {
      return null;
    }

    const db = getFirestoreDb();
    const userId = getUserId();

    if (!db || !userId) {
      return null;
    }

    const pinRef = doc(db, `users/${userId}/security`, 'pin');
    const pinSnap = await getDoc(pinRef);

    if (pinSnap.exists()) {
      const data = pinSnap.data();
      if (data.pinHash && data.salt) {
        return { pinHash: data.pinHash, salt: data.salt };
      }
    }
    return null;
  } catch (error) {
    console.error('[pinService] Error fetching PIN from Firestore (attempt ' + attempt + '):', error);
    // Retry once after delay (e.g. Firestore/network not ready on new device or cold start)
    if (attempt < FETCH_PIN_MAX_ATTEMPTS) {
      await new Promise((r) => setTimeout(r, FETCH_PIN_RETRY_DELAY_MS));
      return fetchPinFromFirestore(attempt + 1);
    }
    return null;
  }
};

/**
 * Check if PIN is set (Firestore only)
 */
export const hasPIN = async (): Promise<boolean> => {
  try {
    const pinData = await fetchPinFromFirestore();
    return !!pinData;
  } catch (error) {
    console.error('[pinService] Error checking PIN:', error);
    return false;
  }
};

/**
 * Set or update PIN (Firestore only)
 * @param pin - Exactly 6 digit PIN
 */
export const setPIN = async (pin: string): Promise<void> => {
  try {
    // Validate PIN format - must be exactly 6 digits
    if (!/^\d{6}$/.test(pin)) {
      throw new Error('PIN must be exactly 6 digits');
    }

    // Generate salt
    const salt = await generateSalt();
    
    // Hash PIN
    const pinHash = await hashPIN(pin, salt);

    await waitForFirebase();
    if (!isFirebaseAvailable()) {
      throw new Error('Firebase is not available');
    }

    const db = getFirestoreDb();
    const userId = getUserId();
    
    if (!db || !userId) {
      throw new Error('Missing Firebase user context');
    }

    const pinRef = doc(db, `users/${userId}/security`, 'pin');
    await setDoc(pinRef, {
      pinHash,
      salt,
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now(),
    });
  } catch (error) {
    console.error('[pinService] Error setting PIN:', error);
    throw new Error('Failed to set PIN');
  }
};

/**
 * Validate PIN
 * @param pin - PIN to validate
 * @returns true if PIN is correct
 */
export const validatePIN = async (pin: string): Promise<boolean> => {
  try {
    const pinData = await fetchPinFromFirestore();
    if (!pinData) {
      return false;
    }

    // Hash the provided PIN with stored salt
    const providedHash = await hashPIN(pin, pinData.salt);
    const isValid = providedHash === pinData.pinHash;

    // Compare hashes
    return isValid;
  } catch (error) {
    console.error('[pinService] Error validating PIN:', error);
    return false;
  }
};

/**
 * Delete PIN
 */
export const deletePIN = async (): Promise<void> => {
  try {
    await waitForFirebase();
    if (!isFirebaseAvailable()) {
      throw new Error('Firebase is not available');
    }

    const db = getFirestoreDb();
    const userId = getUserId();

    if (!db || !userId) {
      throw new Error('Missing Firebase user context');
    }

    const pinRef = doc(db, `users/${userId}/security`, 'pin');
    await deleteDoc(pinRef);
  } catch (error) {
    console.error('[pinService] Error deleting PIN:', error);
  }
};

